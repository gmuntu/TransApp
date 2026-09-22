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

    const safeRel = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const targetPath = path.join(uploadsDir, safeRel);

    if (!fs.existsSync(targetPath)) {
      return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 });
    }

    const stat = await fs.promises.stat(targetPath);
    const fileSize = stat.size;
    const contentType = targetPath.endsWith('.mp3')
      ? 'audio/mpeg'
      : targetPath.endsWith('.wav')
      ? 'audio/wav'
      : 'audio/octet-stream';

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
    return NextResponse.json({ error: 'Erreur lecture upload' }, { status: 500 });
  }
}
