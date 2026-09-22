export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@/lib/db';
import { buildCollisionFreeTimeline, InputClip } from '@/lib/timeline-scheduler';

const execFileAsync = promisify(execFile);

interface AssembleClip {
  index: number;
  startTimeMs: number;
  endTimeMs: number;
  cacheKey: string;
  estimatedDurationMs?: number;
}

export async function POST(request: Request) {
  const tmpDir = path.join(process.cwd(), 'tmp_segments_' + Date.now());
  try {
    const body = await request.json();
    const rawVoice: string = body?.voice ?? 'fr-FR-RemyMultilingualNeural';
    const voice = rawVoice === 'fr-FR-YvesNeural' ? 'fr-FR-RemyMultilingualNeural' : rawVoice;
    const rawProjectName: string = body?.projectName ? String(body.projectName).trim() : 'Doublage_Francais';
    const projectName = rawProjectName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'Doublage_Francais';
    const srtContent: string = body?.srtContent ?? '';
    const items: AssembleClip[] = body?.items ?? [];
    const syncMode: 'video-synced' | 'direct-start' = body?.syncMode === 'direct-start' ? 'direct-start' : 'video-synced';
    const paceMode: 'smart' | 'gentle' | 'strict' | 'stable' = body?.paceMode ?? 'smart';
    const speechRate: number = typeof body?.speechRate === 'number' && body.speechRate >= 0.8 && body.speechRate <= 1.5 ? Number(body.speechRate.toFixed(2)) : 1.05;

    if (!items.length) {
      return Response.json({ error: 'Aucun sous-titre fourni pour l\'assemblage' }, { status: 400 });
    }

    const cacheDir = path.join(process.cwd(), 'public', 'audio', 'cache');
    const publicAudioDir = path.join(process.cwd(), 'public', 'audio');
    if (!fs.existsSync(publicAudioDir)) {
      fs.mkdirSync(publicAudioDir, { recursive: true });
    }

    // Filter valid clips that exist in cache
    const validClips: Array<{
      index: number;
      startTimeMs: number;
      endTimeMs: number;
      filePath: string;
      estimatedDurationMs: number;
    }> = [];

    for (const item of items) {
      let resolvedPath = '';
      if (item.filePath && fs.existsSync(item.filePath)) {
        resolvedPath = item.filePath;
      } else if (item.clipUrl) {
        const cleanUrl = item.clipUrl.split('?')[0];
        const rel = cleanUrl.startsWith('/') ? cleanUrl.slice(1) : cleanUrl;
        const p = path.join(process.cwd(), 'public', rel);
        if (fs.existsSync(p)) {
          resolvedPath = p;
        }
      } else if (item.cacheKey && item.cacheKey !== 'empty' && item.cacheKey !== 'error') {
        const p = path.join(cacheDir, `${item.cacheKey}.mp3`);
        if (fs.existsSync(p)) {
          resolvedPath = p;
        }
      }

      if (resolvedPath && fs.existsSync(resolvedPath)) {
        try {
          const stat = fs.statSync(resolvedPath);
          if (stat.size >= 100) {
            const estimatedDurationMs =
              item.estimatedDurationMs ?? Math.round((stat.size / 12000) * 1000);
            validClips.push({
              index: item.index,
              startTimeMs: item.startTimeMs,
              endTimeMs: item.endTimeMs,
              filePath: resolvedPath,
              estimatedDurationMs,
            });
          }
        } catch {
          // Skip unreadable
        }
      }
    }

    if (!validClips.length) {
      return Response.json(
        { error: 'Aucun clip audio valide trouvé dans le cache' },
        { status: 400 }
      );
    }

    // Sort chronologically
    validClips.sort((a, b) => a.startTimeMs - b.startTimeMs);

    const firstSubtitleTimeMs = validClips[0]?.startTimeMs ?? 0;
    // If direct-start mode is selected, remove the initial silent preamble
    const timeOffsetMs = syncMode === 'direct-start' ? firstSubtitleTimeMs : 0;
    const antiCollision = body?.antiCollision !== false;
    const minGapMs = typeof body?.minGapMs === 'number' && body.minGapMs >= 50 && body.minGapMs <= 500 ? body.minGapMs : 140;

    // Build collision-free timeline: prevents any voice from speaking over another
    const { scheduledClips, totalDurationMs, collisionCount, maxShiftMs } = buildCollisionFreeTimeline(
      validClips,
      {
        timeOffsetMs,
        minGapMs,
        speechRate,
        paceMode,
        antiCollision,
      }
    );

    console.log(`[Assemble] Scheduled ${scheduledClips.length} clips. Collisions prevented: ${collisionCount}, Max shift: ${maxShiftMs}ms, Duration: ${totalDurationMs}ms`);

    const outputWavName = `${projectName}_${syncMode === 'direct-start' ? 'direct' : 'synchro'}_${Date.now()}.wav`;
    const outputWavPath = path.join(publicAudioDir, outputWavName);

    const ffmpegBin = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';

    // Segment size: max 40 clips per sub-mix to stay well below OS and FFmpeg limits
    const SEGMENT_SIZE = 40;

    if (scheduledClips.length <= SEGMENT_SIZE) {
      // Direct single-pass mix
      const ffmpegArgs: string[] = [];
      const filterParts: string[] = [];
      const streamLabels: string[] = [];

      scheduledClips.forEach((clip, idx) => {
        ffmpegArgs.push('-i', clip.filePath);

        const delayMs = clip.scheduledDelayMs;
        let filterChain = `[${idx}:a]`;

        const tempo = clip.tempo;
        if (Math.abs(tempo - 1.0) > 0.02) {
          if (tempo <= 2.0 && tempo >= 0.5) {
            filterChain += `atempo=${tempo.toFixed(2)},`;
          } else if (tempo > 2.0) {
            filterChain += `atempo=2.00,atempo=${(tempo / 2.0).toFixed(2)},`;
          }
        }

        filterChain += `adelay=${delayMs}|${delayMs}[a${idx}]`;
        filterParts.push(filterChain);
        streamLabels.push(`[a${idx}]`);
      });

      const mixInputs = streamLabels.join('');
      // Volume boost + limiter to prevent digital clipping while ensuring punchy, loud audio
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

      // Also generate optimized MP3 sibling
      try {
        const outputMp3Path = outputWavPath.replace(/\.wav$/, '.mp3');
        await execFileAsync(ffmpegBin, ['-i', outputWavPath, '-b:a', '192k', '-y', outputMp3Path], {
          timeout: 60000,
        });
      } catch (mp3Err) {
        console.warn('Could not generate MP3 sibling for direct mix:', mp3Err);
      }
    } else {
      // Hierarchical segment mixing for large datasets (e.g. 500 to 3,500+ clips)
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      const segmentFiles: string[] = [];
      const totalSegments = Math.ceil(scheduledClips.length / SEGMENT_SIZE);

      for (let s = 0; s < totalSegments; s++) {
        const chunk = scheduledClips.slice(s * SEGMENT_SIZE, (s + 1) * SEGMENT_SIZE);
        const segPath = path.join(tmpDir, `seg_${s}.wav`);

        const ffmpegArgs: string[] = [];
        const filterParts: string[] = [];
        const streamLabels: string[] = [];

        chunk.forEach((clip, idx) => {
          ffmpegArgs.push('-i', clip.filePath);

          const delayMs = clip.scheduledDelayMs;
          let filterChain = `[${idx}:a]`;

          const tempo = clip.tempo;
          if (Math.abs(tempo - 1.0) > 0.02) {
            if (tempo <= 2.0 && tempo >= 0.5) {
              filterChain += `atempo=${tempo.toFixed(2)},`;
            } else if (tempo > 2.0) {
              filterChain += `atempo=2.00,atempo=${(tempo / 2.0).toFixed(2)},`;
            }
          }

          filterChain += `adelay=${delayMs}|${delayMs}[a${idx}]`;
          filterParts.push(filterChain);
          streamLabels.push(`[a${idx}]`);
        });

        const mixInputs = streamLabels.join('');
        const filterComplex =
          filterParts.join(';') +
          `;${mixInputs}amix=inputs=${chunk.length}:duration=longest:normalize=0[out]`;

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
          segPath
        );

        await execFileAsync(ffmpegBin, ffmpegArgs, {
          maxBuffer: 20 * 1024 * 1024,
          timeout: 120000,
        });

        segmentFiles.push(segPath);
      }

      // Mix all segment files together into the master output with loudness boost
      const finalArgs: string[] = [];
      const segLabels: string[] = [];

      segmentFiles.forEach((sf, idx) => {
        finalArgs.push('-i', sf);
        segLabels.push(`[${idx}:a]`);
      });

      const finalFilter = `${segLabels.join('')}amix=inputs=${segmentFiles.length}:duration=longest:normalize=0,volume=2.2,alimiter=limit=0.98[out]`;
      finalArgs.push(
        '-filter_complex',
        finalFilter,
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

      await execFileAsync(ffmpegBin, finalArgs, {
        maxBuffer: 20 * 1024 * 1024,
        timeout: 180000,
      });

      // Also generate an optimized MP3 sibling for seamless, fast browser streaming
      try {
        const outputMp3Path = outputWavPath.replace(/\.wav$/, '.mp3');
        await execFileAsync(ffmpegBin, ['-i', outputWavPath, '-b:a', '192k', '-y', outputMp3Path], {
          timeout: 60000,
        });
      } catch (mp3Err) {
        console.warn('Could not generate MP3 sibling:', mp3Err);
      }

      // Cleanup segment files
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }

    const outputUrl = `/audio/${outputWavName}`;

    // Save record to DB
    try {
      await prisma.generatedAudio.create({
        data: {
          projectName,
          voice,
          subtitleCount: validClips.length,
          durationMs: totalDurationMs,
          audioUrl: outputUrl,
          srtContent: srtContent || null,
          firstSubtitleTimeMs: syncMode === 'direct-start' ? 0 : firstSubtitleTimeMs,
        },
      });
    } catch (dbErr: any) {
      console.error('DB save error:', dbErr?.message);
    }

    return Response.json({
      audioUrl: outputUrl,
      durationMs: totalDurationMs,
      firstSubtitleTimeMs: syncMode === 'direct-start' ? 0 : firstSubtitleTimeMs,
      clipCount: validClips.length,
      message: `Audio master généré avec succès ! ${validClips.length} clips assemblés.`,
    });
  } catch (err: any) {
    console.error('Assemble route error:', err);
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
    return Response.json(
      { error: err?.message || "Erreur lors de l'assemblage audio FFmpeg" },
      { status: 500 }
    );
  }
}
