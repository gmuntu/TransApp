export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

interface TranslateItem {
  index: number;
  text: string;
}

// Fallback translator if Gemini API is temporarily unavailable or rate-limited
async function translateFallback(texts: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const text of texts) {
    if (!(text ?? '').trim()) {
      results.push('');
      continue;
    }
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=fr&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const translated = (data?.[0] ?? [])
        .map((seg: any) => seg?.[0] ?? '')
        .join('');
      results.push(translated || text);
    } catch {
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

    const geminiKey = process.env.GEMINI_API_KEY;
    const abacusKey = process.env.ABACUSAI_API_KEY;

    const BATCH_SIZE = 20;
    const allResults: { index: number; frText: string }[] = [];

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

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const subtitleList = batch
        .map((item: TranslateItem) => `${item?.index ?? 0}|${item?.text ?? ''}`)
        .join('\n');

      let parsedSuccessfully = false;

      if (geminiKey) {
        const candidateModels = ['gemini-2.5-flash-lite', 'gemini-flash-latest'];
        for (const model of candidateModels) {
          try {
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const response = await ai.models.generateContent({
              model,
              contents: subtitleList,
              config: {
                systemInstruction: systemPrompt,
                responseMimeType: 'application/json',
                temperature: 0.3,
              },
            });
            const content = response.text ?? '{}';
            const parsed = JSON.parse(content);
            const translations = parsed?.translations ?? [];
            if (Array.isArray(translations) && translations.length > 0) {
              for (const t of translations) {
                allResults.push({ index: t?.index ?? 0, frText: t?.fr ?? '' });
              }
              parsedSuccessfully = true;
              break;
            }
          } catch (modelErr: any) {
            console.warn(`Model ${model} attempt failed:`, modelErr?.message);
          }
        }
      }

      if (!parsedSuccessfully && abacusKey) {
        try {
          const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${abacusKey}`,
            },
            body: JSON.stringify({
              model: 'gemini-2.5-flash',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: subtitleList },
              ],
              temperature: 0.3,
              max_tokens: 4000,
              response_format: { type: 'json_object' },
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content ?? '{}';
            const parsed = JSON.parse(content);
            const translations = parsed?.translations ?? [];
            if (Array.isArray(translations) && translations.length > 0) {
              for (const t of translations) {
                allResults.push({ index: t?.index ?? 0, frText: t?.fr ?? '' });
              }
              parsedSuccessfully = true;
            }
          }
        } catch (abacusErr: any) {
          console.warn('Abacus translation failed:', abacusErr?.message);
        }
      }

      // Robust fallback if AI models hit quota/spikes
      if (!parsedSuccessfully) {
        const texts = batch.map((item) => item.text);
        const translatedTexts = await translateFallback(texts);
        batch.forEach((item, idx) => {
          allResults.push({ index: item.index, frText: translatedTexts[idx] || item.text });
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
