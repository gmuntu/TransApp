import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const file = searchParams.get('file');
    const customName = searchParams.get('name') || 'doublage_master.wav';

    if (!file) {
      return NextResponse.json({ error: 'Fichier non spécifié' }, { status: 400 });
    }

    // Sanitize path to prevent directory traversal
    let cleanPath = file.replace(/^\/+/, '');
    if (cleanPath.startsWith('public/')) {
      cleanPath = cleanPath.slice(7);
    }

    const absolutePath = path.join(process.cwd(), 'public', cleanPath);

    if (!fs.existsSync(absolutePath)) {
      return NextResponse.json({ error: 'Fichier introuvable sur le serveur' }, { status: 404 });
    }

    const fileBuffer = await fs.promises.readFile(absolutePath);
    const contentType = cleanPath.endsWith('.wav')
      ? 'audio/wav'
      : cleanPath.endsWith('.mp3')
      ? 'audio/mpeg'
      : cleanPath.endsWith('.srt')
      ? 'text/plain; charset=utf-8'
      : 'application/octet-stream';

    const safeName = customName.replace(/[^a-zA-Z0-9._-]/g, '_');

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('Download error:', error);
    return NextResponse.json({ error: error?.message || 'Erreur de téléchargement' }, { status: 500 });
  }
}
