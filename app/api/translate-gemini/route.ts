export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

interface TranslateItem {
  index: number;
  text: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items: TranslateItem[] = body?.items ?? [];

    if (!items.length) {
      return NextResponse.json({ error: 'Aucun texte à traduire' }, { status: 400 });
    }

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Clé API non configurée' }, { status: 500 });
    }

    const BATCH_SIZE = 20;
    const allResults: { index: number; frText: string }[] = [];

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const subtitleList = batch
        .map((item: TranslateItem) => `${item?.index ?? 0}|${item?.text ?? ''}`)
        .join('\n');

      const systemPrompt = `Tu es un traducteur professionnel spécialisé dans le doublage vidéo anglais vers français.
Règles :
- Traduis chaque ligne de manière naturelle et fluide pour le doublage vocal
- Adapte les expressions idiomatiques au français naturel
- Garde les traductions concises (même durée approximative que l'original)
- Conserve le registre de langue original
- Ne traduis PAS les noms propres, marques ou termes techniques universels

Format d'entrée : index|texte anglais (un par ligne)
Format de sortie JSON : { "translations": [ { "index": number, "fr": "texte français" } ] }

Réponds UNIQUEMENT avec le JSON, sans markdown ni explication.`;

      const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gemini-3.8-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: subtitleList },
          ],
          temperature: 0.3,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? '{}';

      try {
        const parsed = JSON.parse(content);
        const translations = parsed?.translations ?? [];
        for (const t of translations) {
          allResults.push({ index: t?.index ?? 0, frText: t?.fr ?? '' });
        }
      } catch {
        // Fallback: return original text
        batch.forEach((item: TranslateItem) => {
          allResults.push({ index: item?.index ?? 0, frText: item?.text ?? '' });
        });
      }
    }

    return NextResponse.json({ results: allResults });
  } catch (err: any) {
    console.error('Gemini translation error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Erreur de traduction Gemini' },
      { status: 500 }
    );
  }
}
