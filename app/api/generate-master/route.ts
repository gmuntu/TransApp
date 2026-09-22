export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { uploadBuffer } from '@/lib/s3';
import { prisma } from '@/lib/db';
import { buildCollisionFreeTimeline } from '@/lib/timeline-scheduler';

const execFileAsync = promisify(execFile);

interface SubInput {
  index: number;
  startTimeMs: number;
  endTimeMs: number;
  frText: string;
}

/**
 * Sanitize text to avoid crashing Microsoft Edge TTS's SSML XML parser.
 * Unescaped '&', '<', '>', or control characters cause abrupt WebSocket closures
 * with "no turn.end received".
 */
function cleanForTts(text: string): string {
  return text
    // Replace ampersands with natural French word 'et' to avoid invalid XML
    .replace(/&/g, ' et ')
    // Strip XML/HTML tags and brackets
    .replace(/[<>{}[\]\\]/g, ' ')
    // Normalize quotes
    .replace(/["«»]/g, ' ')
    // Remove control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const send = (data: any) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          isClosed = true;
        }
      };

      // Continuous heartbeat to keep connection alive through reverse proxies and Cloud Run
      const heartbeatInterval = setInterval(() => {
        if (!isClosed) {
          send({ type: 'heartbeat', message: 'Traitement en cours...' });
        }
      }, 2500);

      const finish = () => {
        clearInterval(heartbeatInterval);
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch {
            /* noop */
          }
        }
      };

      let activeTts: MsEdgeTTS | null = null;
      const getOrCreateTts = async (voiceName: string): Promise<MsEdgeTTS> => {
        if (!activeTts) {
          activeTts = new MsEdgeTTS();
          await activeTts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
        }
        return activeTts;
      };

      const resetTts = () => {
        if (activeTts) {
          try {
            activeTts.close();
          } catch {
            /* noop */
          }
          activeTts = null;
        }
      };

      try {
        const body = await request.json();
        const subtitles: SubInput[] = body?.subtitles ?? [];
        const rawVoice: string = body?.voice ?? 'fr-FR-DeniseNeural';
        const voice = rawVoice === 'fr-FR-YvesNeural' ? 'fr-FR-RemyMultilingualNeural' : rawVoice;
        const projectName: string = body?.projectName ?? 'transapp';
        const srtContent: string = body?.srtContent ?? '';
        const syncMode: 'video-synced' | 'direct-start' = body?.syncMode === 'direct-start' ? 'direct-start' : 'video-synced';
        const paceMode: 'stable' | 'gentle' | 'strict' = body?.paceMode === 'gentle' || body?.paceMode === 'strict' ? body.paceMode : 'stable';
        const speechRate: number = typeof body?.speechRate === 'number' && body.speechRate >= 0.8 && body.speechRate <= 1.3 ? Number(body.speechRate.toFixed(2)) : 1.0;
        const antiCollision: boolean = body?.antiCollision !== false;
        const minGapMs: number = typeof body?.minGapMs === 'number' && body.minGapMs >= 50 && body.minGapMs <= 500 ? body.minGapMs : 140;

        console.log(`[generate-master] Starting for ${subtitles.length} subtitles, voice: ${voice}, antiCollision: ${antiCollision}, minGap: ${minGapMs}ms, pace: ${paceMode}`);

        if (!subtitles.length) {
          send({ type: 'error', message: 'Aucun sous-titre fourni' });
          finish();
          return;
        }

        send({
          type: 'progress',
          step: 'tts',
          current: 0,
          total: subtitles.length,
          message: 'Initialisation de la synthèse vocale...',
        });

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

        // Generate TTS for each subtitle with persistent connection & automatic retries
        for (let i = 0; i < subtitles.length; i++) {
          if (isClosed) break;

          const sub = subtitles[i];
          const rawText = (sub?.frText ?? '').trim();

          if (!rawText) {
            send({
              type: 'progress',
              step: 'tts',
              current: i + 1,
              total: subtitles.length,
              message: `Sous-titre ${i + 1}/${subtitles.length} (vide, ignoré)`,
            });
            continue;
          }

          const cleanText = cleanForTts(rawText);
          if (!cleanText) {
            send({
              type: 'progress',
              step: 'tts',
              current: i + 1,
              total: subtitles.length,
              message: `Sous-titre ${i + 1}/${subtitles.length} (ignoré)`,
            });
            continue;
          }

          let buffer: Buffer | null = null;
          let lastTtsError: any = null;

          // Attempt synthesis up to 3 times
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const currentTts = await getOrCreateTts(voice);
              const { audioStream } = currentTts.toStream(cleanText);
              const chunks: Buffer[] = [];

              await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => {
                  resetTts();
                  reject(new Error('Délai d\'attente TTS dépassé'));
                }, 12000);

                audioStream.on('data', (chunk: any) => chunks.push(Buffer.from(chunk)));
                audioStream.on('end', () => {
                  clearTimeout(timer);
                  resolve();
                });
                audioStream.on('error', (err: any) => {
                  clearTimeout(timer);
                  resetTts();
                  reject(err);
                });
              });

              const combined = Buffer.concat(chunks);
              if (combined.length >= 100) {
                buffer = combined;
                break; // Success!
              } else {
                throw new Error('Audio généré trop court');
              }
            } catch (err: any) {
              lastTtsError = err;
              resetTts();
              console.warn(
                `TTS attempt ${attempt}/3 failed for subtitle ${sub.index || i + 1}:`,
                err?.message
              );
              if (attempt < 3) {
                await new Promise((r) => setTimeout(r, 400 * attempt));
              }
            }
          }

          if (buffer && buffer.length >= 100) {
            // Estimate duration: 96kbps = 12000 bytes/sec
            const estimatedDurationMs = Math.round((buffer.length / 12000) * 1000);

            // Save clip locally
            const clipFileName = `clip_${Date.now()}_${sub?.index ?? i}.mp3`;
            const clipLocalPath = path.join(publicUploadsDir, clipFileName);
            await fs.promises.writeFile(clipLocalPath, buffer);

            // Also cache with hash key for instant future reuse and re-assembly
            try {
              const cacheKey = crypto
                .createHash('sha256')
                .update(`${voice}:::${cleanText}`)
                .digest('hex');
              const cacheDir = path.join(process.cwd(), 'public', 'audio', 'cache');
              if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
              await fs.promises.writeFile(path.join(cacheDir, `${cacheKey}.mp3`), buffer);
            } catch {
              /* noop */
            }

            const url = await uploadBuffer(buffer, `clip_${sub?.index ?? i}.mp3`, 'audio/mpeg');

            clipUrls.push({
              index: sub?.index ?? i,
              url,
              localPath: clipLocalPath,
              startTimeMs: sub?.startTimeMs ?? 0,
              endTimeMs: sub?.endTimeMs ?? 0,
              estimatedDurationMs,
            });

            send({
              type: 'clip_generated',
              clip: {
                index: sub?.index ?? i,
                url,
                durationMs: estimatedDurationMs,
              },
              current: i + 1,
              total: subtitles.length,
              message: `Clip ${sub?.index ?? i} généré (${(estimatedDurationMs / 1000).toFixed(1)}s)`,
            });
          } else {
            console.error(
              `TTS failed permanently for subtitle ${sub.index || i + 1}:`,
              lastTtsError?.message
            );
            send({
              type: 'progress',
              step: 'tts',
              current: i + 1,
              total: subtitles.length,
              message: `Sous-titre ${i + 1}: ignoré suite à une erreur réseau TTS`,
            });
          }

          send({
            type: 'progress',
            step: 'tts',
            current: i + 1,
            total: subtitles.length,
            message: `Synthèse vocale ${i + 1}/${subtitles.length}`,
          });
        }

        // Clean up active TTS websocket connection
        resetTts();

        if (!clipUrls.length) {
          send({ type: 'error', message: 'Aucun clip audio généré' });
          finish();
          return;
        }

        send({
          type: 'progress',
          step: 'assembly',
          current: 0,
          total: 1,
          message: `Assemblage synchronisé de ${clipUrls.length} clips audio...`,
        });

        // Format clips for collision-free timeline scheduling
        const inputClips = clipUrls.map((c) => ({
          index: c.index,
          startTimeMs: c.startTimeMs,
          endTimeMs: c.endTimeMs,
          filePath: c.localPath && fs.existsSync(c.localPath) ? c.localPath : c.url,
          url: c.url,
          estimatedDurationMs: c.estimatedDurationMs,
        }));

        const firstSubtitleTimeMs = inputClips[0]?.startTimeMs ?? 0;
        const timeOffsetMs = syncMode === 'direct-start' ? firstSubtitleTimeMs : 0;

        // Anti-Collision Timeline Engine: guarantees 0 overlaps between consecutive voices
        const { scheduledClips, totalDurationMs, collisionCount, maxShiftMs } = buildCollisionFreeTimeline(
          inputClips,
          {
            timeOffsetMs,
            minGapMs,
            speechRate,
            paceMode,
            antiCollision,
          }
        );

        console.log(`[GenerateMaster] Scheduled ${scheduledClips.length} clips. Collisions prevented: ${collisionCount}, Max shift: ${maxShiftMs}ms, Total duration: ${totalDurationMs}ms`);

        let outputUrl = '';
        const cleanProjectSlug = (projectName || 'master')
          .trim()
          .replace(/[/\\?%*:|"<>]/g, '_')
          .replace(/\s+/g, '_')
          .toLowerCase();
        const outputWavName = `${cleanProjectSlug}_${Date.now()}.wav`;
        const outputWavPath = path.join(publicAudioDir, outputWavName);

        // Path to FFmpeg binary
        const ffmpegBin = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';

        try {
          const ffmpegArgs: string[] = [];
          const filterParts: string[] = [];
          const streamLabels: string[] = [];

          scheduledClips.forEach((clip, idx) => {
            ffmpegArgs.push('-i', clip.filePath);

            const delayMs = clip.scheduledDelayMs;
            let filterChain = `[${idx}:a]`;
            if (Math.abs(clip.tempo - 1.0) > 0.02) {
              if (clip.tempo <= 2.0 && clip.tempo >= 0.5) {
                filterChain += `atempo=${clip.tempo.toFixed(2)},`;
              }
            }
            filterChain += `adelay=${delayMs}|${delayMs}[a${idx}]`;
            filterParts.push(filterChain);
            streamLabels.push(`[a${idx}]`);
          });

          const mixInputs = streamLabels.join('');
          const filterComplex =
            filterParts.join(';') +
            `;${mixInputs}amix=inputs=${scheduledClips.length}:duration=longest:normalize=0,volume=1.8,alimiter=limit=0.98[out]`;

          ffmpegArgs.push(
            '-filter_complex',
            filterComplex,
            '-map',
            '[out]',
            '-ar',
            '44100',
            '-ac',
            '2',
            '-t',
            (totalDurationMs / 1000).toFixed(1),
            '-y',
            outputWavPath
          );

          await execFileAsync(ffmpegBin, ffmpegArgs, {
            maxBuffer: 20 * 1024 * 1024,
            timeout: 180000,
          });

          // Also generate fast-loading MP3 with identical base name
          const outputMp3Name = outputWavName.replace(/\.wav$/i, '.mp3');
          const outputMp3Path = path.join(publicAudioDir, outputMp3Name);
          try {
            await execFileAsync(ffmpegBin, ['-i', outputWavPath, '-b:a', '192k', '-y', outputMp3Path], {
              timeout: 60000,
            });
            outputUrl = `/audio/${outputMp3Name}`;
          } catch {
            outputUrl = `/audio/${outputWavName}`;
          }
        } catch (localFfmpegErr: any) {
          console.warn('Local FFmpeg assembly failed:', localFfmpegErr?.message);

          const apiKey = process.env.ABACUSAI_API_KEY;
          if (apiKey) {
            const inputFiles: Record<string, string> = {};
            const filterParts: string[] = [];
            const streamLabels: string[] = [];

            clipUrls.forEach((clip: any, idx: number) => {
              const inputKey = `in_${idx + 1}`;
              inputFiles[inputKey] = clip?.url ?? '';

              const windowMs = (clip?.endTimeMs ?? 0) - (clip?.startTimeMs ?? 0);
              const estimatedMs = clip?.estimatedDurationMs ?? 0;
              const delayMs = Math.max(0, clip?.startTimeMs ?? 0);

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

              filterChain += `adelay=${delayMs}|${delayMs}[a${idx}]`;
              filterParts.push(filterChain);
              streamLabels.push(`[a${idx}]`);
            });

            const mixInputs = streamLabels.join('');
            const filterComplex =
              filterParts.join(';') +
              `;${mixInputs}amix=inputs=${clipUrls.length}:duration=longest:normalize=0[out]`;

            const inputArgs = Object.keys(inputFiles)
              .map((key: string) => `-i {{${key}}}`)
              .join(' ');

            const ffmpegCommand = `${inputArgs} -filter_complex "${filterComplex}" -map "[out]" -ar 44100 -ac 2 -t ${(totalDurationMs / 1000).toFixed(1)} {{out_1}}`;
            const outputFiles = { out_1: 'master_audio.wav' };

            const createResponse = await fetch(
              'https://apps.abacus.ai/api/createRunFfmpegCommandRequest',
              {
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
              }
            );

            if (createResponse.ok) {
              const { request_id } = await createResponse.json();
              if (request_id) {
                let attempts = 0;
                while (attempts < 120 && !isClosed) {
                  await new Promise((r) => setTimeout(r, 2000));
                  const statusResponse = await fetch(
                    'https://apps.abacus.ai/api/getRunFfmpegCommandStatus',
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${apiKey}`,
                      },
                      body: JSON.stringify({ request_id }),
                    }
                  );
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
          send({ type: 'error', message: "Échec de l'assemblage du fichier audio master" });
          finish();
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
          clips: clipUrls.map((c) => ({
            index: c.index,
            url: c.url,
            durationMs: c.estimatedDurationMs,
          })),
          message: `Audio master généré avec succès ! ${clipUrls.length} clips assemblés.`,
        });
        finish();
      } catch (err: any) {
        console.error('Generate master error:', err);
        resetTts();
        send({ type: 'error', message: err?.message ?? 'Erreur interne' });
        finish();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
