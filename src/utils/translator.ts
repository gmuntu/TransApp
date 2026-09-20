import { SubtitleItem } from '../types';
import { countWords, calculateTargetRate } from './timecode';
import { CS_GLOSSARY } from '../data/csGlossary';

// Conversational and Lecture Discourse markers frequently used by university professors
const CONVERSATIONAL_MAP: Record<string, string> = {
  'all': 'Tous',
  'all right': 'Très bien',
  'all right,': 'Très bien,',
  'all right.': 'Très bien.',
  'right': 'D\'accord',
  'right,': 'd\'accord,',
  'right.': 'd\'accord.',
  'this is': 'voici',
  'this is.': 'voici.',
  'this is,': 'voici,',
  'ok': 'D\'accord',
  'ok.': 'D\'accord.',
  'ok,': 'D\'accord,',
  'okay': 'D\'accord',
  'okay.': 'D\'accord.',
  'okay,': 'D\'accord,',
  'so': 'Donc',
  'so,': 'donc,',
  'so.': 'Donc.',
  'now': 'Maintenant',
  'now,': 'maintenant,',
  'now.': 'Maintenant.',
  'welcome': 'Bienvenue',
  'welcome everyone': 'Bienvenue à tous',
  'welcome back': 'Bon retour à tous',
  'let\'s begin': 'Commençons',
  'let\'s get started': 'Commençons',
  'let\'s start': 'Démarrons',
  'today': 'Aujourd\'hui',
  'today we will': 'Aujourd\'hui nous allons',
  'today we tackle': 'Aujourd\'hui nous abordons',
  'in this lecture': 'Dans ce cours',
  'in this video': 'Dans cette vidéo',
  'for example': 'Par exemple',
  'for instance': 'Par exemple',
  'as you can see': 'Comme vous pouvez le constater',
  'as we saw': 'Comme nous l\'avons vu',
  'take a look at': 'Regardons',
  'notice that': 'Remarquez que',
  'here': 'Ici',
  'here,': 'ici,',
  'there': 'Là',
  'yes': 'Oui',
  'no': 'Non',
  'first': 'Premièrement',
  'second': 'Deuxièmement',
  'finally': 'Enfin',
  'next': 'Ensuite',
  'thank you': 'Merci',
  'any questions?': 'Des questions ?',
  'does that make sense?': 'Est-ce que c\'est clair ?',
  'let\'s dive in': 'Plongeons dans le vif du sujet',
  'let\'s dive into': 'Plongeons dans',
  'under the hood': 'Sous le capot (en interne)',
  'rule of thumb': 'Règle générale',
  'sanity check': 'Vérification de cohérence',
  'at the end of the day': 'En fin de compte',
  'out of the box': 'Clé en main (par défaut)',
  'trade-off': 'Compromis (trade-off)',
  'trade-offs': 'Compromis (trade-offs)',
  'key takeaway': 'Point essentiel à retenir',
  'takeaways': 'Points clés à retenir'
};

// Common American English academic lecture idioms & Computer Science patterns
const WORD_REPLACEMENTS: [RegExp, string][] = [
  // American Lecture Idioms
  [/\blet's dive into\b/gi, 'plongeons dans'],
  [/\blet's dive in\b/gi, 'plongeons dans le vif du sujet'],
  [/\bunder the hood\b/gi, 'sous le capot (en coulisses)'],
  [/\brule of thumb\b/gi, 'règle générale'],
  [/\bsanity checks?\b/gi, 'vérification de cohérence'],
  [/\bout of the box\b/gi, 'clé en main'],
  [/\btrade-?offs?\b/gi, 'compromis'],
  [/\bkey takeaways?\b/gi, 'points clés à retenir'],
  [/\bat the end of the day\b/gi, 'en fin de compte'],
  [/\bbottlenecks?\b/gi, 'goulots d\'étranglement'],
  [/\bboilerplate( code)?\b/gi, 'code réutilisable (boilerplate)'],
  [/\bspin up\b/gi, 'instancier'],
  [/\bbare metal\b/gi, 'au plus près du matériel (bare-metal)'],
  [/\bhands-on\b/gi, 'pratique'],
  [/\bdeep dive\b/gi, 'analyse approfondie'],
  [/\bwelcome everyone to\b/gi, 'bienvenue à tous au'],
  [/\bwelcome to\b/gi, 'bienvenue au'],
  [/\btoday we tackle\b/gi, 'aujourd\'hui nous abordons'],
  [/\btoday we will\b/gi, 'aujourd\'hui nous allons'],
  [/\bwhen multiple\b/gi, 'lorsque plusieurs'],
  [/\bwithout proper\b/gi, 'sans approprié'],
  [/\byou will experience\b/gi, 'vous subirez'],
  [/\blet's take a look\b/gi, 'regardons'],
  [/\bas you can see\b/gi, 'comme vous pouvez le constater'],
  [/\bin this case\b/gi, 'dans ce cas'],
  [/\bon the other hand\b/gi, 'd\'autre part'],
  [/\bfor example\b/gi, 'par exemple'],
  [/\bin order to\b/gi, 'afin de'],
  [/\bwe can see that\b/gi, 'nous constatons que'],
  [/\bthis means that\b/gi, 'cela signifie que'],
  
  // Computer Science & Concurrency Terminology
  [/\bshared mutable state\b/gi, 'l\'état partagé mutable'],
  [/\brace conditions?\b/gi, 'condition de concurrence (race condition)'],
  [/\bthread-safe\b/gi, 'sûr au niveau des threads (thread-safe)'],
  [/\block-free\b/gi, 'sans verrou (lock-free)'],
  [/\bdata corruption\b/gi, 'corruption de données'],
  [/\bdeadlocks?\b/gi, 'interblocages (deadlocks)'],
  [/\blivelocks?\b/gi, 'verrouillages actifs (livelocks)'],
  [/\bthreads?\b/gi, 'threads'],
  [/\bcontext switch(ing)?\b/gi, 'changement de contexte'],
  [/\batomic operations?\b/gi, 'opérations atomiques'],
  [/\bcompare-and-swap\b/gi, 'comparer-et-échanger (CAS)'],
  [/\bcache coherence\b/gi, 'cohérence de cache'],
  [/\bmemory models?\b/gi, 'modèles de mémoire'],
  [/\bvirtual memory\b/gi, 'mémoire virtuelle'],
  [/\boperating systems?\b/gi, 'systèmes d\'exploitation'],
  [/\bfile systems?\b/gi, 'systèmes de fichiers'],
  [/\bgarbage collectors?\b/gi, 'ramasse-miettes (garbage collector)'],
  [/\bgarbage collection\b/gi, 'ramasse-miettes (garbage collection)'],
  [/\bhash tables?\b/gi, 'tables de hachage'],
  [/\bhash maps?\b/gi, 'tables de hachage'],
  [/\bbinary search trees?\b/gi, 'arbres binaires de recherche (BST)'],
  [/\bbinary search\b/gi, 'recherche binaire'],
  [/\blinked lists?\b/gi, 'listes chaînées'],
  [/\bqueues?\b/gi, 'files d\'attente'],
  [/\bstacks?\b/gi, 'piles d\'exécution (stack)'],
  [/\bheaps?\b/gi, 'tas (heap)'],
  [/\btime complexity\b/gi, 'complexité temporelle'],
  [/\bspace complexity\b/gi, 'complexité spatiale'],
  [/\bBig-O notation\b/gi, 'notation Grand O'],
  [/\bdynamic programming\b/gi, 'programmation dynamique'],
  [/\binstruction pipelines?\b/gi, 'pipelines d\'instructions'],
  [/\bbranch prediction\b/gi, 'prédiction de branchement'],
  [/\bout-of-order execution\b/gi, 'exécution dans le désordre'],
  [/\bsystem calls?\b/gi, 'appels système (syscalls)'],
  [/\bkernel space\b/gi, 'espace noyau'],
  [/\buser space\b/gi, 'espace utilisateur'],
  [/\bmemory footprint\b/gi, 'empreinte mémoire'],
  [/\bbuffer overflow\b/gi, 'dépassement de tampon (buffer overflow)'],
  [/\bmemory leaks?\b/gi, 'fuites de mémoire']
];

/**
 * Decode HTML entities returned by some translation APIs (e.g. &#39; -> ')
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/**
 * Clean up translated text (spacing, capitalization, punctuation)
 */
function cleanTranslatedText(text: string, originalText: string): string {
  let cleaned = decodeHtmlEntities(text).trim();

  // If translation came back with multiple slash-separated options (dictionary entry from MyMemory)
  if (cleaned.includes('/') && cleaned.split('/').length > 2) {
    const firstChoice = cleaned.split('/')[0].trim();
    cleaned = firstChoice || cleaned;
  }

  // Preserve trailing punctuation from original text
  if (originalText.endsWith('.') && !cleaned.endsWith('.')) cleaned += '.';
  if (originalText.endsWith(',') && !cleaned.endsWith(',')) cleaned += ',';
  if (originalText.endsWith('?') && !cleaned.endsWith('?')) cleaned += '?';
  if (originalText.endsWith('!') && !cleaned.endsWith('!')) cleaned += '!';

  // Capitalize first letter if original is capitalized
  if (/^[A-Z]/.test(originalText) && /^[a-z]/.test(cleaned)) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Translates a single text string from English to French using a fast multi-tier approach:
 * 0. Server-side Gemini AI API (highest quality, requires GEMINI_API_KEY)
 * 1. Direct conversational & lecture phrase dictionary
 * 2. Public neural translation API (MyMemory)
 * 3. CS terminology & pattern substitution engine
 */
export async function translateSingleSegment(enText: string): Promise<string> {
  const trimmed = enText.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();

  // 1. Direct exact dictionary match (instant, 0ms)
  if (CONVERSATIONAL_MAP[lower]) {
    const match = CONVERSATIONAL_MAP[lower];
    return cleanTranslatedText(match, trimmed);
  }

  // Strip trailing punctuation for dictionary check
  const stripped = lower.replace(/[.,?!]+$/, '');
  if (CONVERSATIONAL_MAP[stripped]) {
    const match = CONVERSATIONAL_MAP[stripped];
    return cleanTranslatedText(match, trimmed);
  }

  // 2. Try server-side Google Translate (highest quality, 5s timeout)
  try {
    const serverController = new AbortController();
    const serverTimeout = setTimeout(() => serverController.abort(), 5000);

    const serverResponse = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed, sourceLang: 'en', targetLang: 'fr' }),
      signal: serverController.signal
    });
    clearTimeout(serverTimeout);

    if (serverResponse.ok) {
      const serverData = await serverResponse.json();
      if (serverData?.translatedText && typeof serverData.translatedText === 'string') {
        return cleanTranslatedText(serverData.translatedText, trimmed);
      }
    }
  } catch (_serverErr) {
    // Server unavailable or no API key — fall through to MyMemory
  }

  // 3. Try Google Translate API directly (fast & reliable)
  try {
    const gUrl = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=fr&dt=t&q=${encodeURIComponent(trimmed)}`;
    const gController = new AbortController();
    const gTimeout = setTimeout(() => gController.abort(), 3500);

    const gResponse = await fetch(gUrl, { signal: gController.signal });
    clearTimeout(gTimeout);

    if (gResponse.ok) {
      const gData = await gResponse.json();
      if (Array.isArray(gData) && Array.isArray(gData[0])) {
        const trans = gData[0].map((c: any) => c[0]).filter(Boolean).join('');
        if (trans && trans.toLowerCase() !== lower) {
          return cleanTranslatedText(trans, trimmed);
        }
      }
    }
  } catch (_gErr) {
    // Fall back to MyMemory
  }

  // 4. Try MyMemory Neural API with quota check
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=en|fr`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const rawTranslated = data?.responseData?.translatedText;
      if (
        rawTranslated &&
        typeof rawTranslated === 'string' &&
        rawTranslated.toLowerCase() !== lower &&
        !rawTranslated.toUpperCase().includes('MYMEMORY WARNING')
      ) {
        return cleanTranslatedText(rawTranslated, trimmed);
      }
    }
  } catch (_netErr) {
    // Fall back smoothly to local dictionary
  }

  // 3. Fallback: Rule-based & CS glossary replacement engine
  let result = trimmed;

  // Apply CS glossary terms
  for (const term of CS_GLOSSARY) {
    const regex = new RegExp(`\\b${term.en}\\b`, 'gi');
    if (regex.test(result)) {
      result = result.replace(regex, term.fr);
    }
  }

  // Apply word patterns
  for (const [regex, replacement] of WORD_REPLACEMENTS) {
    result = result.replace(regex, replacement);
  }

  return cleanTranslatedText(result, trimmed);
}

// Client-side translation cache to avoid duplicate API requests
const TRANSLATION_MEMORY_CACHE = new Map<string, string>();

/**
 * High-performance batch translation pipeline for an array of subtitles.
 * Uses 25-item chunked requests to Google Translate via /api/translate with caching.
 */
export async function translateSubtitlesBatch(
  subtitles: SubtitleItem[],
  onProgress?: (current: number, total: number) => void
): Promise<SubtitleItem[]> {
  const total = subtitles.length;
  if (total === 0) return [];

  const results: SubtitleItem[] = [...subtitles];
  let completed = 0;

  // Step 1: Resolve items that are already in memory cache or dictionary (instant 0ms)
  const pendingIndices: number[] = [];
  for (let i = 0; i < total; i++) {
    const item = results[i];
    const trimmed = item.enText.trim();
    const lower = trimmed.toLowerCase();

    if (TRANSLATION_MEMORY_CACHE.has(lower)) {
      const frText = TRANSLATION_MEMORY_CACHE.get(lower)!;
      const words = countWords(frText);
      const rateInfo = calculateTargetRate(words, item.durationMs, 175);
      results[i] = {
        ...item,
        frText,
        wordCountFr: words,
        calculatedRateWpm: rateInfo.targetRateWpm,
        rateMultiplier: rateInfo.rateMultiplier,
        pacingCategory: rateInfo.pacingCategory,
        isEdited: true
      };
      completed++;
    } else if (CONVERSATIONAL_MAP[lower]) {
      const frText = cleanTranslatedText(CONVERSATIONAL_MAP[lower], trimmed);
      TRANSLATION_MEMORY_CACHE.set(lower, frText);
      const words = countWords(frText);
      const rateInfo = calculateTargetRate(words, item.durationMs, 175);
      results[i] = {
        ...item,
        frText,
        wordCountFr: words,
        calculatedRateWpm: rateInfo.targetRateWpm,
        rateMultiplier: rateInfo.rateMultiplier,
        pacingCategory: rateInfo.pacingCategory,
        isEdited: true
      };
      completed++;
    } else {
      pendingIndices.push(i);
    }
  }

  if (onProgress) {
    onProgress(completed, total);
  }

  // Step 2: Process remaining items in batches of 25
  const BATCH_SIZE = 25;
  for (let b = 0; b < pendingIndices.length; b += BATCH_SIZE) {
    const batchIndices = pendingIndices.slice(b, b + BATCH_SIZE);
    const batchItems = batchIndices.map(idx => ({
      id: results[idx].id,
      text: results[idx].enText
    }));

    try {
      const resp = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: batchItems }),
        signal: AbortSignal.timeout(15000)
      });

      if (resp.ok) {
        const data = await resp.json();
        const translations: { id: number; frText: string }[] = data.translations || [];
        const transMap = new Map<number, string>();
        for (const t of translations) {
          transMap.set(t.id, t.frText);
        }

        for (const idx of batchIndices) {
          const item = results[idx];
          const rawFr = transMap.get(item.id);
          const frText = rawFr && rawFr.trim().length > 0
            ? cleanTranslatedText(rawFr, item.enText)
            : item.enText;

          TRANSLATION_MEMORY_CACHE.set(item.enText.trim().toLowerCase(), frText);
          const words = countWords(frText);
          const rateInfo = calculateTargetRate(words, item.durationMs, 175);

          results[idx] = {
            ...item,
            frText,
            wordCountFr: words,
            calculatedRateWpm: rateInfo.targetRateWpm,
            rateMultiplier: rateInfo.rateMultiplier,
            pacingCategory: rateInfo.pacingCategory,
            isEdited: true
          };
          completed++;
        }
      } else {
        // Fallback: translate single segments for this batch
        for (const idx of batchIndices) {
          const item = results[idx];
          try {
            const frText = await translateSingleSegment(item.enText);
            const words = countWords(frText);
            const rateInfo = calculateTargetRate(words, item.durationMs, 175);
            results[idx] = {
              ...item,
              frText: frText || item.enText,
              wordCountFr: words,
              calculatedRateWpm: rateInfo.targetRateWpm,
              rateMultiplier: rateInfo.rateMultiplier,
              pacingCategory: rateInfo.pacingCategory,
              isEdited: true
            };
          } catch {
            // Keep existing
          }
          completed++;
        }
      }
    } catch (err) {
      console.warn('Batch translation request error, falling back to single items:', err);
      for (const idx of batchIndices) {
        const item = results[idx];
        try {
          const frText = await translateSingleSegment(item.enText);
          const words = countWords(frText);
          const rateInfo = calculateTargetRate(words, item.durationMs, 175);
          results[idx] = {
            ...item,
            frText: frText || item.enText,
            wordCountFr: words,
            calculatedRateWpm: rateInfo.targetRateWpm,
            rateMultiplier: rateInfo.rateMultiplier,
            pacingCategory: rateInfo.pacingCategory,
            isEdited: true
          };
        } catch {
          // Keep existing
        }
        completed++;
      }
    }

    if (onProgress) {
      onProgress(completed, total);
    }

    // Small courteous pause between batches to protect against network rate limits
    if (b + BATCH_SIZE < pendingIndices.length) {
      await new Promise(r => setTimeout(r, 25));
    }
  }

  return results;
}

/**
 * Detects if a subtitle list still contains untranslated English text in the French column
 */
export function hasUntranslatedSubtitles(subtitles: SubtitleItem[]): boolean {
  if (subtitles.length === 0) return false;
  // If more than 50% of the subtitles have frText identical to enText
  let identicalCount = 0;
  for (const sub of subtitles) {
    if (sub.frText.trim().toLowerCase() === sub.enText.trim().toLowerCase()) {
      identicalCount++;
    }
  }
  return identicalCount / subtitles.length > 0.4;
}
