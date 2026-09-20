export const dynamic = 'force-dynamic';

import { uploadBuffer } from '@/lib/s3';
import { prisma } from '@/lib/db';

interface SubInput {
  index: number;
  startTimeMs: number;
  endTimeMs: number;
  frText: string;
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* stream closed */ }
      };

      try {
        const body = await request.json();
        const subtitles: SubInput[] = body?.subtitles ?? [];
        const voice: string = body?.voice ?? 'fr-FR-DeniseNeural';
        const projectName: string = body?.projectName ?? 'transapp';
        const srtContent: string = body?.srtContent ?? '';

        if (!subtitles.length) {
          send({ type: 'error', message: 'Aucun sous-titre fourni' });
          controller.close();
          return;
        }

        send({ type: 'progress', step: 'tts', current: 0, total: subtitles.length, message: 'Initialisation de la synthèse vocale...' });

        // Dynamically import msedge-tts
        const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');

        const clipUrls: { index: number; url: string; startTimeMs: number; endTimeMs: number; estimatedDurationMs: number }[] = [];

        // Generate TTS for each subtitle
        for (let i = 0; i < subtitles.length; i++) {
          const sub = subtitles[i];
          const text = (sub?.frText ?? '').trim();

          if (!text) {
            send({ type: 'progress', step: 'tts', current: i + 1, total: subtitles.length, message: `Sous-titre ${i + 1}/${subtitles.length} (vide, ignoré)` });
            continue;
          }

          try {
            const tts = new MsEdgeTTS();
            await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

            const { audioStream } = tts.toStream(text);
            const chunks: Buffer[] = [];

            await new Promise<void>((resolve, reject) => {
              audioStream.on('data', (chunk: any) => chunks.push(Buffer.from(chunk)));
              audioStream.on('end', () => resolve());
              audioStream.on('error', (err: any) => reject(err));
            });

            const buffer = Buffer.concat(chunks);
            if (buffer.length < 100) {
              send({ type: 'progress', step: 'tts', current: i + 1, total: subtitles.length, message: `Sous-titre ${i + 1} - audio trop court, ignoré` });
              continue;
            }

            // Estimate duration: 96kbps = 12000 bytes/sec
            const estimatedDurationMs = Math.round((buffer.length / 12000) * 1000);

            // Upload to S3
            const url = await uploadBuffer(buffer, `clip_${sub?.index ?? i}.mp3`, 'audio/mpeg');

            clipUrls.push({
              index: sub?.index ?? i,
              url,
              startTimeMs: sub?.startTimeMs ?? 0,
              endTimeMs: sub?.endTimeMs ?? 0,
              estimatedDurationMs,
            });

            tts.close();
          } catch (ttsErr: any) {
            console.error(`TTS error for subtitle ${i}:`, ttsErr?.message);
            send({ type: 'progress', step: 'tts', current: i + 1, total: subtitles.length, message: `Erreur TTS sous-titre ${i + 1}: ${ttsErr?.message ?? 'inconnu'}` });
          }

          send({ type: 'progress', step: 'tts', current: i + 1, total: subtitles.length, message: `Synthèse vocale ${i + 1}/${subtitles.length}` });
        }

        if (!clipUrls.length) {
          send({ type: 'error', message: 'Aucun clip audio généré' });
          controller.close();
          return;
        }

        send({ type: 'progress', step: 'assembly', current: 0, total: 1, message: `Assemblage de ${clipUrls.length} clips audio...` });

        // Calculate total duration
        const lastSub = subtitles[subtitles.length - 1];
        const totalDurationMs = (lastSub?.endTimeMs ?? 0) + 3000;

        // Build FFmpeg command
        const inputFiles: Record<string, string> = {};
        const filterParts: string[] = [];
        const streamLabels: string[] = [];

        clipUrls.forEach((clip: any, idx: number) => {
          const inputKey = `in_${idx + 1}`;
          inputFiles[inputKey] = clip?.url ?? '';

          const windowMs = (clip?.endTimeMs ?? 0) - (clip?.startTimeMs ?? 0);
          const estimatedMs = clip?.estimatedDurationMs ?? 0;
          const delayMs = clip?.startTimeMs ?? 0;

          let filterChain = `[${idx}:a]`;

          // Apply atempo if clip is too long for its window
          if (windowMs > 0 && estimatedMs > windowMs * 1.15) {
            let factor = estimatedMs / windowMs;
            factor = Math.min(factor, 3.0);

            if (factor <= 2.0) {
              filterChain += `atempo=${factor.toFixed(2)},`;
            } else {
              const f1 = 2.0;
              const f2 = factor / 2.0;
              filterChain += `atempo=${f1.toFixed(2)},atempo=${f2.toFixed(2)},`;
            }
          }

          filterChain += `adelay=${delayMs}|${delayMs},apad=whole_dur=0[a${idx}]`;
          filterParts.push(filterChain);
          streamLabels.push(`[a${idx}]`);
        });

        const mixInputs = streamLabels.join('');
        const filterComplex = filterParts.join(';') +
          `;${mixInputs}amix=inputs=${clipUrls.length}:duration=longest:normalize=0[out]`;

        // Build the full command
        const inputArgs = Object.keys(inputFiles)
          .map((key: string) => `-i {{${key}}}`)
          .join(' ');

        const ffmpegCommand = `${inputArgs} -filter_complex "${filterComplex}" -map "[out]" -ar 44100 -ac 2 -t ${(totalDurationMs / 1000).toFixed(1)} {{out_1}}`;

        const outputFiles = { out_1: 'master_audio.wav' };

        // Call FFmpeg API
        const apiKey = process.env.ABACUSAI_API_KEY;
        if (!apiKey) {
          send({ type: 'error', message: 'Clé API manquante pour le traitement audio' });
          controller.close();
          return;
        }

        const createResponse = await fetch('https://apps.abacus.ai/api/createRunFfmpegCommandRequest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            input_files: inputFiles,
            output_files: outputFiles,
            ffmpeg_command: ffmpegCommand,
            max_command_run_seconds: 600,
          }),
        });

        if (!createResponse.ok) {
          const errText = await createResponse.text().catch(() => 'Erreur FFmpeg');
          send({ type: 'error', message: `Erreur FFmpeg: ${errText}` });
          controller.close();
          return;
        }

        const { request_id } = await createResponse.json();
        if (!request_id) {
          send({ type: 'error', message: 'Pas d\'ID de requête FFmpeg' });
          controller.close();
          return;
        }

        // Poll for completion
        let attempts = 0;
        const maxAttempts = 300;

        while (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 2000));

          const statusResponse = await fetch('https://apps.abacus.ai/api/getRunFfmpegCommandStatus', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ request_id }),
          });

          const statusResult = await statusResponse.json();
          const status = statusResult?.status ?? 'FAILED';

          if (status === 'SUCCESS') {
            const outputUrl = statusResult?.result?.result?.out_1 ?? '';
            if (!outputUrl) {
              send({ type: 'error', message: 'Fichier audio de sortie manquant' });
              controller.close();
              return;
            }

            // Save to database
            try {
              await prisma.generatedAudio.create({
                data: {
                  projectName,
                  voice,
                  subtitleCount: subtitles.length,
                  durationMs: totalDurationMs,
                  audioUrl: outputUrl,
                  srtContent: srtContent || null,
                },
              });
            } catch (dbErr: any) {
              console.error('DB save error:', dbErr?.message);
            }

            send({
              type: 'complete',
              audioUrl: outputUrl,
              durationMs: totalDurationMs,
              message: `Audio master généré ! ${clipUrls.length} clips assemblés.`,
            });
            controller.close();
            return;
          } else if (status === 'FAILED') {
            const errorMsg = statusResult?.result?.error ?? 'Échec du traitement audio';
            send({ type: 'error', message: errorMsg });
            controller.close();
            return;
          }

          // Still processing
          send({ type: 'heartbeat', message: `Traitement audio en cours... (${attempts * 2}s)` });
          attempts++;
        }

        send({ type: 'error', message: 'Délai d\'attente dépassé pour le traitement audio' });
        controller.close();
      } catch (err: any) {
        console.error('Generate master error:', err);
        send({ type: 'error', message: err?.message ?? 'Erreur interne' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
