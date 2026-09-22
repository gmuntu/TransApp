import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function resolveAudioFile(rawFile: string, preferMp3: boolean = false) {
  let cleanPath = rawFile.replace(/^\/+/, '').replace(/\.\./g, '');
  if (cleanPath.startsWith('public/')) {
    cleanPath = cleanPath.slice(7);
  }

  const baseDir = path.join(process.cwd(), 'public');

  // Check possible relative locations
  const candidatePaths = [
    path.join(baseDir, cleanPath),
    cleanPath.startsWith('audio/') ? null : path.join(baseDir, 'audio', cleanPath),
    cleanPath.startsWith('uploads/') ? null : path.join(baseDir, 'uploads', cleanPath),
  ].filter(Boolean) as string[];

  for (const targetPath of candidatePaths) {
    // If preferMp3 or if original is wav, check if mp3 equivalent exists
    if ((preferMp3 || true) && targetPath.endsWith('.wav')) {
      const mp3Path = targetPath.replace(/\.wav$/i, '.mp3');
      if (fs.existsSync(mp3Path)) {
        return { filePath: mp3Path, contentType: 'audio/mpeg' };
      }
    }

    if (fs.existsSync(targetPath)) {
      const contentType = targetPath.endsWith('.mp3')
        ? 'audio/mpeg'
        : targetPath.endsWith('.wav')
        ? 'audio/wav'
        : 'audio/octet-stream';
      return { filePath: targetPath, contentType };
    }

    // If mp3 was requested but only wav exists
    if (targetPath.endsWith('.mp3')) {
      const wavPath = targetPath.replace(/\.mp3$/i, '.wav');
      if (fs.existsSync(wavPath)) {
        return { filePath: wavPath, contentType: 'audio/wav' };
      }
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const file = searchParams.get('file');
    const preferMp3 = searchParams.get('mp3') === '1' || searchParams.get('prefer') === 'mp3';

    if (!file) {
      return new NextResponse('File parameter missing', { status: 400 });
    }

    const resolved = resolveAudioFile(file, preferMp3);
    if (!resolved) {
      return new NextResponse('Audio file not found', { status: 404 });
    }

    const { filePath, contentType } = resolved;
    const stat = await fs.promises.stat(filePath);
    const fileSize = stat.size;

    const rangeHeader = request.headers.get('range');

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          },
        });
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      // Convert Node stream to Web ReadableStream
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

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type',
          'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      });
    }

    // Full file stream
    const fileStream = fs.createReadStream(filePath);
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

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Length': fileSize.toString(),
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error: any) {
    console.error('Audio stream error:', error);
    return new NextResponse('Internal error streaming audio', { status: 500 });
  }
}

export async function HEAD(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const file = searchParams.get('file');
    const preferMp3 = searchParams.get('mp3') === '1' || searchParams.get('prefer') === 'mp3';

    if (!file) {
      return new NextResponse(null, { status: 400 });
    }

    const resolved = resolveAudioFile(file, preferMp3);
    if (!resolved) {
      return new NextResponse(null, { status: 404 });
    }

    const stat = await fs.promises.stat(resolved.filePath);

    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Length': stat.size.toString(),
        'Content-Type': resolved.contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  });
}
