export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { uploadBuffer } from '@/lib/s3';
import { prisma } from '@/lib/db';

const execFileAsync = promisify(execFile);

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
        const rawVoice: string = body?.voice ?? 'fr-FR-DeniseNeural';
        const voice = rawVoice === 'fr-FR-YvesNeural' ? 'fr-FR-RemyMultilingualNeural' : rawVoice;
        const projectName: string = body?.projectName ?? 'transapp';
        const srtContent: string = body?.srtContent ?? '';

        console.log(`[generate-master] Starting for ${subtitles.length} subtitles, voice: ${voice}`);

        if (!subtitles.length) {
          send({ type: 'error', message: 'Aucun sous-titre fourni' });
          controller.close();
          return;
        }

        send({ type: 'progress', step: 'tts', current: 0, total: subtitles.length, message: 'Initialisation de la synthèse vocale...' });

        const clipUrls: {
          index: number;
          url: string;
          localPath?: string;
          startTimeMs: number;
          endTimeMs: number;
          estimatedDurationMs: number;
        }[] = [];

        // Ensure directories exist
        const publicUploadsDir = path.join(process.cwd(), 'public', 'uploads');
        const publicAudioDir = path.join(process.cwd(), 'public', 'audio');
        if (!fs.existsSync(publicUploadsDir)) fs.mkdirSync(publicUploadsDir, { recursive: true });
        if (!fs.existsSync(publicAudioDir)) fs.mkdirSync(publicAudioDir, { recursive: true });

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
              const timer = setTimeout(() => {
                try { tts.close(); } catch { /* noop */ }
                reject(new Error('Délai d\'attente TTS dépassé'));
              }, 12000);

              audioStream.on('data', (chunk: any) => chunks.push(Buffer.from(chunk)));
              audioStream.on('end', () => {
                clearTimeout(timer);
                resolve();
              });
              audioStream.on('error', (err: any) => {
                clearTimeout(timer);
                reject(err);
              });
            });

            const buffer = Buffer.concat(chunks);
            if (buffer.length < 100) {
              send({ type: 'progress', step: 'tts', current: i + 1, total: subtitles.length, message: `Sous-titre ${i + 1} - audio trop court, ignoré` });
              continue;
            }

            // Estimate duration: 96kbps = 12000 bytes/sec
            const estimatedDurationMs = Math.round((buffer.length / 12000) * 1000);

            // Save clip locally
            const clipFileName = `clip_${Date.now()}_${sub?.index ?? i}.mp3`;
            const clipLocalPath = path.join(publicUploadsDir, clipFileName);
            await fs.promises.writeFile(clipLocalPath, buffer);

            const url = await uploadBuffer(buffer, `clip_${sub?.index ?? i}.mp3`, 'audio/mpeg');

            clipUrls.push({
              index: sub?.index ?? i,
              url,
              localPath: clipLocalPath,
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

        // Try local FFmpeg first (installed on system)
        let outputUrl = '';
        const outputWavName = `master_${Date.now()}.wav`;
        const outputWavPath = path.join(publicAudioDir, outputWavName);

        try {
          const ffmpegArgs: string[] = [];
          const filterParts: string[] = [];
          const streamLabels: string[] = [];

          clipUrls.forEach((clip, idx) => {
            const inputPath = clip.localPath && fs.existsSync(clip.localPath) ? clip.localPath : clip.url;
            ffmpegArgs.push('-i', inputPath);

            const windowMs = clip.endTimeMs - clip.startTimeMs;
            const estimatedMs = clip.estimatedDurationMs;
            const delayMs = clip.startTimeMs;

            let filterChain = `[${idx}:a]`;

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

          ffmpegArgs.push(
            '-filter_complex', filterComplex,
            '-map', '[out]',
            '-ar', '44100',
            '-ac', '2',
            '-t', (totalDurationMs / 1000).toFixed(1),
            '-y',
            outputWavPath
          );

          await execFileAsync('/usr/bin/ffmpeg', ffmpegArgs);
          outputUrl = `/audio/${outputWavName}`;
        } catch (localFfmpegErr: any) {
          console.warn('Local FFmpeg assembly failed, checking Abacus fallback:', localFfmpegErr?.message);

          const apiKey = process.env.ABACUSAI_API_KEY;
          if (apiKey) {
            // Build FFmpeg command for Abacus API
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
              if (windowMs > 0 && estimatedMs > windowMs * 1.15) {
                let factor = estimatedMs / windowMs;
                factor = Math.min(factor, 3.0);
                if (factor <= 2.0) {
                  filterChain += `atempo=${factor.toFixed(2)},`;
                } else {
                  filterChain += `atempo=2.00,atempo=${(factor / 2.0).toFixed(2)},`;
                }
              }

              filterChain += `adelay=${delayMs}|${delayMs},apad=whole_dur=0[a${idx}]`;
              filterParts.push(filterChain);
              streamLabels.push(`[a${idx}]`);
            });

            const mixInputs = streamLabels.join('');
            const filterComplex = filterParts.join(';') +
              `;${mixInputs}amix=inputs=${clipUrls.length}:duration=longest:normalize=0[out]`;

            const inputArgs = Object.keys(inputFiles)
              .map((key: string) => `-i {{${key}}}`)
              .join(' ');

            const ffmpegCommand = `${inputArgs} -filter_complex "${filterComplex}" -map "[out]" -ar 44100 -ac 2 -t ${(totalDurationMs / 1000).toFixed(1)} {{out_1}}`;
            const outputFiles = { out_1: 'master_audio.wav' };

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

            if (createResponse.ok) {
              const { request_id } = await createResponse.json();
              if (request_id) {
                let attempts = 0;
                while (attempts < 120) {
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
                  if (statusResult?.status === 'SUCCESS') {
                    outputUrl = statusResult?.result?.result?.out_1 ?? '';
                    break;
                  } else if (statusResult?.status === 'FAILED') {
                    break;
                  }
                  attempts++;
                }
              }
            }
          }
        }

        if (!outputUrl) {
          send({ type: 'error', message: 'Échec de l\'assemblage du fichier audio master' });
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
