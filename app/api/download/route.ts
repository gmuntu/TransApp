import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const file = searchParams.get('file');
    let customName = searchParams.get('name') || 'doublage_master.wav';
    const requestedFormat = (searchParams.get('format') || '').toLowerCase();
    const mode = (searchParams.get('mode') || '').toLowerCase(); // 'direct' or 'synced'

    if (!file) {
      return NextResponse.json({ error: 'Fichier non spécifié' }, { status: 400 });
    }

    // Sanitize path
    let cleanPath = file.split('?')[0].replace(/^\/+/, '');
    if (cleanPath.startsWith('public/')) {
      cleanPath = cleanPath.slice(7);
    }

    let baseName = path.basename(cleanPath).replace(/\.(wav|mp3)$/i, '');
    const audioDir = path.join(process.cwd(), 'public', 'audio');

    // Handle direct mode vs synced mode
    const isDirectRequested = mode === 'direct' || baseName.endsWith('_direct');
    if (isDirectRequested && !baseName.endsWith('_direct')) {
      const candidateDirectWav = path.join(audioDir, `${baseName}_direct.wav`);
      const candidateDirectMp3 = path.join(audioDir, `${baseName}_direct.mp3`);

      if (!fs.existsSync(candidateDirectWav) && !fs.existsSync(candidateDirectMp3)) {
        // Try to generate direct version on-the-fly by trimming initial silence
        try {
          const recordsFile = path.join(audioDir, 'records.json');
          let startSec = 0;
          if (fs.existsSync(recordsFile)) {
            const records = JSON.parse(fs.readFileSync(recordsFile, 'utf-8'));
            const rec = records.find((r: any) => (r.audioUrl || '').includes(baseName) || r.id === baseName);
            if (rec && rec.srtContent) {
              const match = rec.srtContent.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->/);
              if (match) {
                const [, h, m, s, ms] = match;
                const totalMs = parseInt(h) * 3600000 + parseInt(m) * 60000 + parseInt(s) * 1000 + parseInt(ms);
                if (totalMs > 1500) {
                  startSec = totalMs / 1000;
                }
              }
            }
          }

          const srcWav = path.join(audioDir, `${baseName}.wav`);
          const srcMp3 = path.join(audioDir, `${baseName}.mp3`);
          const inputAudio = fs.existsSync(srcWav) ? srcWav : srcMp3;

          if (inputAudio && fs.existsSync(inputAudio) && startSec > 0) {
            const ffmpegBin = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';
            await execFileAsync(
              ffmpegBin,
              ['-ss', startSec.toString(), '-i', inputAudio, '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', '-y', candidateDirectWav],
              { timeout: 60000 }
            );
            await execFileAsync(
              ffmpegBin,
              ['-i', candidateDirectWav, '-b:a', '192k', '-y', candidateDirectMp3],
              { timeout: 60000 }
            );
            baseName = `${baseName}_direct`;
          }
        } catch (e: any) {
          console.warn('Direct audio auto-creation skipped:', e?.message);
        }
      } else {
        baseName = `${baseName}_direct`;
      }
    }

    const wavPath = path.join(audioDir, `${baseName}.wav`);
    const mp3Path = path.join(audioDir, `${baseName}.mp3`);

    const ffmpegBin = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';

    // Target format: prioritize explicit format param, then customName extension, default to wav for master audio
    let targetExt = 'wav';
    if (requestedFormat === 'mp3' || customName.toLowerCase().endsWith('.mp3')) {
      targetExt = 'mp3';
    } else if (requestedFormat === 'wav' || customName.toLowerCase().endsWith('.wav')) {
      targetExt = 'wav';
    } else if (cleanPath.toLowerCase().endsWith('.srt')) {
      targetExt = 'srt';
    }

    let targetFilePath = '';

    if (targetExt === 'srt') {
      targetFilePath = path.join(process.cwd(), 'public', cleanPath);
      if (!fs.existsSync(targetFilePath)) {
        return NextResponse.json({ error: 'Fichier SRT introuvable' }, { status: 404 });
      }
    } else if (targetExt === 'wav') {
      if (fs.existsSync(wavPath)) {
        targetFilePath = wavPath;
      } else if (fs.existsSync(mp3Path)) {
        // Convert mp3 to high-quality PCM 16-bit stereo WAV on-the-fly for video editors
        try {
          await execFileAsync(
            ffmpegBin,
            ['-i', mp3Path, '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', '-y', wavPath],
            { timeout: 60000 }
          );
          targetFilePath = wavPath;
        } catch (convErr: any) {
          console.error('WAV conversion failed:', convErr?.message);
          targetFilePath = mp3Path;
          targetExt = 'mp3';
        }
      }
    } else if (targetExt === 'mp3') {
      if (fs.existsSync(mp3Path)) {
        targetFilePath = mp3Path;
      } else if (fs.existsSync(wavPath)) {
        // Convert wav to 192k mp3
        try {
          await execFileAsync(
            ffmpegBin,
            ['-i', wavPath, '-b:a', '192k', '-y', mp3Path],
            { timeout: 60000 }
          );
          targetFilePath = mp3Path;
        } catch (convErr: any) {
          console.error('MP3 conversion failed:', convErr?.message);
          targetFilePath = wavPath;
          targetExt = 'wav';
        }
      }
    }

    if (!targetFilePath || !fs.existsSync(targetFilePath)) {
      return NextResponse.json({ error: 'Fichier introuvable sur le serveur' }, { status: 404 });
    }

    const stat = await fs.promises.stat(targetFilePath);
    const fileSize = stat.size;

    // Ensure filename extension matches target format
    let finalDownloadName = customName;
    if (targetExt === 'wav' && !finalDownloadName.toLowerCase().endsWith('.wav')) {
      finalDownloadName = `${finalDownloadName.replace(/\.[^.]+$/, '')}.wav`;
    } else if (targetExt === 'mp3' && !finalDownloadName.toLowerCase().endsWith('.mp3')) {
      finalDownloadName = `${finalDownloadName.replace(/\.[^.]+$/, '')}.mp3`;
    }

    const safeName = finalDownloadName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const contentType =
      targetExt === 'wav'
        ? 'audio/wav'
        : targetExt === 'mp3'
        ? 'audio/mpeg'
        : targetExt === 'srt'
        ? 'text/plain; charset=utf-8'
        : 'application/octet-stream';

    const fileStream = fs.createReadStream(targetFilePath);
    const webStream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => controller.enqueue(chunk));
        fileStream.on('end', () => controller.close());
        fileStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        fileStream.destroy();
      },
    });

    return new NextResponse(webStream as any, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileSize.toString(),
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('Download error:', error);
    return NextResponse.json({ error: error?.message || 'Erreur de téléchargement' }, { status: 500 });
  }
}
