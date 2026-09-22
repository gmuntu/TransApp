import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|live\/|.+[?&]v=))([\w-]{11})/;
  const match = url.trim().match(regExp);
  return match ? match[1] : null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('url');

    if (!rawUrl) {
      return NextResponse.json({ error: 'URL YouTube manquante' }, { status: 400 });
    }

    const videoId = extractYouTubeId(rawUrl);
    if (!videoId) {
      return NextResponse.json(
        { error: 'Format de lien YouTube invalide. Exemples : https://www.youtube.com/watch?v=... ou https://youtu.be/...' },
        { status: 400 }
      );
    }

    // Call YouTube official oEmbed API
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TransApp/1.0)',
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      // Fallback if oEmbed is not accessible
      return NextResponse.json({
        videoId,
        title: `Vidéo YouTube (${videoId})`,
        author: 'YouTube',
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      });
    }

    const data = await res.json();
    return NextResponse.json({
      videoId,
      title: data.title || `Vidéo YouTube (${videoId})`,
      author: data.author_name || 'YouTube',
      thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error fetching YouTube info:', err);
    return NextResponse.json(
      { error: err.message || 'Impossible de récupérer les informations de la vidéo YouTube' },
      { status: 500 }
    );
  }
}
