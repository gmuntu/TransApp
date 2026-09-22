import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const tempFiles: string[] = [];

  try {
    const formData = await request.formData();
    const videoFile = formData.get('video') as File | null;
    const audioUrlParam = (formData.get('audioUrl') as string | null) || '';
    const mode = (formData.get('mode') as string | null) || 'synced'; // 'direct' or 'synced'
    const keepOriginalStr = (formData.get('keepOriginal') as string | null) || 'false';
    const keepOriginal = keepOriginalStr === 'true';

    if (!videoFile) {
      return NextResponse.json({ error: 'Fichier vidéo manquant' }, { status: 400 });
    }

    if (!audioUrlParam) {
      return NextResponse.json({ error: 'Audio de doublage non spécifié' }, { status: 400 });
    }

    // Resolve audio file path
    let cleanAudio = audioUrlParam.split('?')[0].replace(/^\/+/, '');
    if (cleanAudio.startsWith('public/')) cleanAudio = cleanAudio.slice(7);

    const baseName = path.basename(cleanAudio).replace(/\.(wav|mp3)$/i, '');
    const audioDir = path.join(process.cwd(), 'public', 'audio');

    let chosenAudio = path.join(audioDir, `${baseName}.wav`);
    if (mode === 'direct') {
      const directWav = path.join(audioDir, `${baseName}_direct.wav`);
      const directMp3 = path.join(audioDir, `${baseName}_direct.mp3`);
      if (fs.existsSync(directWav)) {
        chosenAudio = directWav;
      } else if (fs.existsSync(directMp3)) {
        chosenAudio = directMp3;
      }
    }

    if (!fs.existsSync(chosenAudio)) {
      // Try mp3 fallback
      const mp3Fallback = path.join(audioDir, `${baseName}.mp3`);
      if (fs.existsSync(mp3Fallback)) {
        chosenAudio = mp3Fallback;
      } else {
        return NextResponse.json({ error: 'Fichier audio de doublage introuvable' }, { status: 404 });
      }
    }

    // Save uploaded video to temp
    const videoBuffer = Buffer.from(await videoFile.arrayBuffer());
    const tempVideoPath = path.join(os.tmpdir(), `upload_video_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp4`);
    tempFiles.push(tempVideoPath);
    await fs.promises.writeFile(tempVideoPath, videoBuffer);

    // Output merged video path
    const outVideoPath = path.join(os.tmpdir(), `merged_video_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp4`);
    tempFiles.push(outVideoPath);

    const ffmpegBin = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';

    // Build FFmpeg command
    // If keepOriginal is true: mix original audio at 10% volume, dub audio at 100%
    // If false: completely replace audio track with dubbed audio
    let ffmpegArgs: string[] = [];

    if (keepOriginal) {
      ffmpegArgs = [
        '-i', tempVideoPath,
        '-i', chosenAudio,
        '-filter_complex', '[0:a]volume=0.12[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=first[aout]',
        '-map', '0:v:0',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-y',
        outVideoPath
      ];
    } else {
      ffmpegArgs = [
        '-i', tempVideoPath,
        '-i', chosenAudio,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-y',
        outVideoPath
      ];
    }

    console.log('[merge-video] Running FFmpeg with args:', ffmpegArgs.join(' '));
    await execFileAsync(ffmpegBin, ffmpegArgs, { timeout: 120000 });

    if (!fs.existsSync(outVideoPath)) {
      throw new Error('La vidéo fusionnée n’a pas pu être générée.');
    }

    const stat = await fs.promises.stat(outVideoPath);
    const videoStream = fs.createReadStream(outVideoPath);

    const projectNameParam = (formData.get('projectName') as string | null) || '';
    const safeProjectName = projectNameParam
      ? projectNameParam.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_')
      : '';
    const cleanOriginalName = safeProjectName || (videoFile.name.replace(/\.[^.]+$/, '') || 'video');
    const finalDownloadName = `${cleanOriginalName}_doublee_fr.mp4`;

    const webStream = new ReadableStream({
      start(controller) {
        videoStream.on('data', (chunk) => controller.enqueue(chunk));
        videoStream.on('end', () => {
          controller.close();
          // Clean up temp files
          tempFiles.forEach((p) => {
            try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
          });
        });
        videoStream.on('error', (err) => {
          controller.error(err);
          tempFiles.forEach((p) => {
            try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
          });
        });
      },
      cancel() {
        videoStream.destroy();
        tempFiles.forEach((p) => {
          try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
        });
      },
    });

    return new NextResponse(webStream as any, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size.toString(),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(finalDownloadName)}"`,
      },
    });
  } catch (error: any) {
    console.error('Video merge error:', error);
    // Cleanup
    tempFiles.forEach((p) => {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
    });
    return NextResponse.json(
      { error: error?.message || 'Erreur lors de la fusion vidéo' },
      { status: 500 }
    );
  }
}
