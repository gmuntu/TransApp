export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

interface TranslateItem {
  index: number;
  text: string;
}

async function translateBatch(texts: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const text of texts) {
    if (!(text ?? '').trim()) {
      results.push('');
      continue;
    }
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=fr&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const translated = (data?.[0] ?? [])
        .map((seg: any) => seg?.[0] ?? '')
        .join('');
      results.push(translated || text);
    } catch (err: any) {
      console.error('Google Translate error:', err?.message);
      results.push(text);
    }
  }
  return results;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items: TranslateItem[] = body?.items ?? [];

    if (!items.length) {
      return NextResponse.json({ error: 'Aucun texte à traduire' }, { status: 400 });
    }

    const BATCH_SIZE = 6;
    const results: { index: number; frText: string }[] = [];

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const texts = batch.map((item: TranslateItem) => item?.text ?? '');
      const translated = await translateBatch(texts);

      batch.forEach((item: TranslateItem, j: number) => {
        results.push({ index: item?.index ?? 0, frText: translated[j] ?? '' });
      });

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < items.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('Translation error:', err);
    return NextResponse.json({ error: err?.message ?? 'Erreur de traduction' }, { status: 500 });
  }
}
