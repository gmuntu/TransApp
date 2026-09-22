import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const fileParts = resolvedParams.file || [];
    const relativePath = fileParts.map(decodeURIComponent).join('/');

    // Prevent path traversal
    const safeRel = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const audioDir = path.join(process.cwd(), 'public', 'audio');
    let targetPath = path.join(audioDir, safeRel);

    // If file doesn't exist, check fallback extensions
    if (!fs.existsSync(targetPath)) {
      if (targetPath.endsWith('.wav')) {
        const mp3Candidate = targetPath.replace(/\.wav$/i, '.mp3');
        if (fs.existsSync(mp3Candidate)) {
          targetPath = mp3Candidate;
        }
      } else if (targetPath.endsWith('.mp3')) {
        const wavCandidate = targetPath.replace(/\.mp3$/i, '.wav');
        if (fs.existsSync(wavCandidate)) {
          targetPath = wavCandidate;
        }
      }
    }

    if (!fs.existsSync(targetPath)) {
      return NextResponse.json({ error: 'Fichier audio non trouvé' }, { status: 404 });
    }

    const stat = await fs.promises.stat(targetPath);
    const fileSize = stat.size;
    const contentType = targetPath.endsWith('.mp3')
      ? 'audio/mpeg'
      : targetPath.endsWith('.wav')
      ? 'audio/wav'
      : 'audio/octet-stream';

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
      const fileStream = fs.createReadStream(targetPath, { start, end });

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
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Full file stream
    const fileStream = fs.createReadStream(targetPath);
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
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err: any) {
    console.error('Audio stream route error:', err?.message);
    return NextResponse.json({ error: 'Erreur lecture audio' }, { status: 500 });
  }
}
