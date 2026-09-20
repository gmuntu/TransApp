import { SubtitleItem } from '../types';
import { countWords, calculateTargetRate } from '../utils/timecode';

export interface SampleLecture {
  id: string;
  title: string;
  course: string;
  professor: string;
  durationFormatted: string;
  totalDurationMs: number;
  subtitles: SubtitleItem[];
}

export const SAMPLE_CS_LECTURE_SUBTITLES: SubtitleItem[] = [
  {
    id: 1,
    index: 1,
    startTimeStr: '00:00:01,200',
    endTimeStr: '00:00:05,800',
    startTimeMs: 1200,
    endTimeMs: 5800,
    durationMs: 4600,
    enText: 'Welcome everyone to Lecture 4. Today we tackle concurrency, cache coherence, and memory models.',
    frText: 'Bienvenue à tous au cours 4. Aujourd\'hui nous abordons la concurrence, la cohérence de cache et les modèles de mémoire.',
    wordCountFr: 19,
    calculatedRateWpm: 175,
    rateMultiplier: 1.0,
    pacingCategory: 'optimal'
  },
  {
    id: 2,
    index: 2,
    startTimeStr: '00:00:06,100',
    endTimeStr: '00:00:10,950',
    startTimeMs: 6100,
    endTimeMs: 10950,
    durationMs: 4850,
    enText: 'When multiple threads execute concurrently across CPU cores, shared mutable state becomes extremely dangerous.',
    frText: 'Lorsque plusieurs threads s\'exécutent simultanément sur les cœurs du processeur, l\'état partagé mutable devient extrêmement dangereux.',
    wordCountFr: 18,
    calculatedRateWpm: 175,
    rateMultiplier: 1.0,
    pacingCategory: 'optimal'
  },
  {
    id: 3,
    index: 3,
    startTimeStr: '00:00:11,200',
    endTimeStr: '00:00:15,000',
    startTimeMs: 11200,
    endTimeMs: 15000,
    durationMs: 3800,
    enText: 'Without proper synchronization primitives, you will experience race conditions and silent data corruption.',
    frText: 'Sans primitives de synchronisation appropriées, vous subirez des conditions de concurrence et une corruption silencieuse des données.',
    wordCountFr: 17,
    calculatedRateWpm: 195,
    rateMultiplier: 1.11,
    pacingCategory: 'accelerated'
  },
  {
    id: 4,
    index: 4,
    startTimeStr: '00:00:15,400',
    endTimeStr: '00:00:19,800',
    startTimeMs: 15400,
    endTimeMs: 19800,
    durationMs: 4400,
    enText: 'Notice how the French translation often expands in word count compared to concise English phrasing.',
    frText: 'Remarquez à quel point la traduction française s\'étoffe souvent en nombre de mots par rapport à la formulation concise en anglais.',
    wordCountFr: 22,
    calculatedRateWpm: 215,
    rateMultiplier: 1.23,
    pacingCategory: 'accelerated'
  },
  {
    id: 5,
    index: 5,
    startTimeStr: '00:00:20,200',
    endTimeStr: '00:00:24,600',
    startTimeMs: 20200,
    endTimeMs: 24600,
    durationMs: 4400,
    enText: 'If you clip this audio or apply naive time speedups, the technical syllables get truncated and sound garbled.',
    frText: 'Si vous coupez cet audio ou appliquez des accélérations naïves, les syllabes techniques sont tronquées et inaudibles.',
    wordCountFr: 18,
    calculatedRateWpm: 182,
    rateMultiplier: 1.04,
    pacingCategory: 'optimal'
  },
  {
    id: 6,
    index: 6,
    startTimeStr: '00:00:25,000',
    endTimeStr: '00:00:28,400',
    startTimeMs: 25000,
    endTimeMs: 28400,
    durationMs: 3400,
    enText: 'That is why our Stitch and Pad engine dynamically calculates the exact speech rate in words per minute.',
    frText: 'C\'est pourquoi notre moteur de raccordement et remplissage calcule dynamiquement le débit exact de parole en mots par minute.',
    wordCountFr: 20,
    calculatedRateWpm: 220,
    rateMultiplier: 1.26,
    pacingCategory: 'accelerated'
  },
  {
    id: 7,
    index: 7,
    startTimeStr: '00:00:29,100',
    endTimeStr: '00:00:33,800',
    startTimeMs: 29100,
    endTimeMs: 33800,
    durationMs: 4700,
    enText: 'Let\'s examine the compare-and-swap instruction: CAS is an atomic operation supported by modern x86 and ARM hardware.',
    frText: 'Examinons l\'instruction comparer-et-échanger : le CAS est une opération atomique prise en charge par les matériels x86 et ARM modernes.',
    wordCountFr: 21,
    calculatedRateWpm: 180,
    rateMultiplier: 1.03,
    pacingCategory: 'optimal'
  },
  {
    id: 8,
    index: 8,
    startTimeStr: '00:00:34,200',
    endTimeStr: '00:00:37,500',
    startTimeMs: 34200,
    endTimeMs: 37500,
    durationMs: 3300,
    enText: 'It compares the contents of a memory location with a given value, and modifies it only if they match.',
    frText: 'Elle compare le contenu d\'un emplacement mémoire avec une valeur donnée, et ne le modifie que s\'ils correspondent.',
    wordCountFr: 18,
    calculatedRateWpm: 205,
    rateMultiplier: 1.17,
    pacingCategory: 'accelerated'
  },
  {
    id: 9,
    index: 9,
    startTimeStr: '00:00:38,000',
    endTimeStr: '00:00:43,200',
    startTimeMs: 38000,
    endTimeMs: 43200,
    durationMs: 5200,
    enText: 'If two threads attempt to acquire the lock simultaneously, one succeeds and the other falls back to a spinloop.',
    frText: 'Si deux threads tentent d\'acquérir le verrou simultanément, l\'un réussit et l\'autre se replie sur une boucle d\'attente active.',
    wordCountFr: 20,
    calculatedRateWpm: 175,
    rateMultiplier: 1.0,
    pacingCategory: 'optimal'
  },
  {
    id: 10,
    index: 10,
    startTimeStr: '00:00:43,800',
    endTimeStr: '00:00:46,900',
    startTimeMs: 43800,
    endTimeMs: 46900,
    durationMs: 3100,
    enText: 'Now, what happens when we scale to sixty-four cores?',
    frText: 'Maintenant, que se passe-t-il lorsque nous passons à l\'échelle de soixante-quatre cœurs ?',
    wordCountFr: 14,
    calculatedRateWpm: 180,
    rateMultiplier: 1.03,
    pacingCategory: 'optimal'
  },
  {
    id: 11,
    index: 11,
    startTimeStr: '00:00:47,300',
    endTimeStr: '00:00:52,400',
    startTimeMs: 47300,
    endTimeMs: 52400,
    durationMs: 5100,
    enText: 'Cache lines bounce between L1 and L2 caches, causing massive bus contention and degrading overall throughput.',
    frText: 'Les lignes de cache rebondissent entre les caches L1 et L2, provoquant une congestion massive du bus et dégradant le débit global.',
    wordCountFr: 21,
    calculatedRateWpm: 175,
    rateMultiplier: 1.0,
    pacingCategory: 'optimal'
  },
  {
    id: 12,
    index: 12,
    startTimeStr: '00:00:53,000',
    endTimeStr: '00:00:57,800',
    startTimeMs: 53000,
    endTimeMs: 57800,
    durationMs: 4800,
    enText: 'This phenomenon is termed false sharing, and it is a nightmare for lock-free data structure design.',
    frText: 'Ce phénomène est appelé faux partage, et c\'est un véritable cauchemar pour la conception de structures de données sans verrou.',
    wordCountFr: 20,
    calculatedRateWpm: 175,
    rateMultiplier: 1.0,
    pacingCategory: 'optimal'
  },
  {
    id: 13,
    index: 13,
    startTimeStr: '00:00:58,200',
    endTimeStr: '00:01:03,100',
    startTimeMs: 58200,
    endTimeMs: 63100,
    durationMs: 4900,
    enText: 'In Go and Java runtimes, the garbage collector must also traverse the object graph without triggering deadlock.',
    frText: 'Dans les environnements d\'exécution Go et Java, le ramasse-miettes doit également parcourir le graphe d\'objets sans déclencher d\'interblocage.',
    wordCountFr: 20,
    calculatedRateWpm: 175,
    rateMultiplier: 1.0,
    pacingCategory: 'optimal'
  },
  {
    id: 14,
    index: 14,
    startTimeStr: '00:01:03,500',
    endTimeStr: '00:01:08,200',
    startTimeMs: 63500,
    endTimeMs: 68200,
    durationMs: 4700,
    enText: 'Notice that during pauses between phrases, the timeline retains exact silence padding.',
    frText: 'Remarquez que pendant les pauses entre les phrases, la ligne temporelle conserve un remplissage de silence exact.',
    wordCountFr: 17,
    calculatedRateWpm: 175,
    rateMultiplier: 1.0,
    pacingCategory: 'optimal'
  },
  {
    id: 15,
    index: 15,
    startTimeStr: '00:01:08,800',
    endTimeStr: '00:01:13,900',
    startTimeMs: 68800,
    endTimeMs: 73900,
    durationMs: 5100,
    enText: 'This guarantees that when imported into Wondershare Filmora at 00:00:00:00, there is zero cumulative sync drift.',
    frText: 'Cela garantit que lors de l\'importation dans Wondershare Filmora à 00:00:00:00, il n\'y a absolument aucune dérive de synchronisation cumulée.',
    wordCountFr: 20,
    calculatedRateWpm: 175,
    rateMultiplier: 1.0,
    pacingCategory: 'optimal'
  },
  {
    id: 16,
    index: 16,
    startTimeStr: '00:01:14,400',
    endTimeStr: '00:01:19,200',
    startTimeMs: 74400,
    endTimeMs: 79200,
    durationMs: 4800,
    enText: 'Every audio segment starts at the exact millisecond prescribed by the original subtitle timestamps.',
    frText: 'Chaque segment audio commence à la milliseconde exacte prescrite par les horodatages des sous-titres d\'origine.',
    wordCountFr: 16,
    calculatedRateWpm: 175,
    rateMultiplier: 1.0,
    pacingCategory: 'optimal'
  },
  {
    id: 17,
    index: 17,
    startTimeStr: '00:01:19,800',
    endTimeStr: '00:01:23,500',
    startTimeMs: 79800,
    endTimeMs: 83500,
    durationMs: 3700,
    enText: 'Even after two and a half hours, audio line 3529 lands precisely on time.',
    frText: 'Même après deux heures et demie, la ligne audio numéro 3529 atterrit avec une précision absolue.',
    wordCountFr: 16,
    calculatedRateWpm: 185,
    rateMultiplier: 1.06,
    pacingCategory: 'optimal'
  }
];

/**
 * Creates an extended benchmark subtitle set (e.g. 100, 500, or 3,500 rows)
 * for testing long-form 2.5 hour lecture timeline processing.
 */
export function generateBenchmarkSubtitles(count: number = 3529): SubtitleItem[] {
  const items: SubtitleItem[] = [];
  const basePatterns = SAMPLE_CS_LECTURE_SUBTITLES;
  let currentMs = 1200;

  for (let i = 1; i <= count; i++) {
    const pattern = basePatterns[(i - 1) % basePatterns.length];
    const durationMs = 2800 + ((i * 137) % 2900); // 2.8s to 5.7s
    const gapMs = 300 + ((i * 73) % 1200); // 0.3s to 1.5s natural pause
    
    const startMs = currentMs;
    const endMs = startMs + durationMs;
    currentMs = endMs + gapMs;

    const enText = `[Row #${i}] ${pattern.enText}`;
    const frText = `[Ligne #${i}] ${pattern.frText}`;
    const words = countWords(frText);
    const rateInfo = calculateTargetRate(words, durationMs, 175);

    // Format timecodes
    const pad = (n: number, z = 2) => String(n).padStart(z, '0');
    const fmt = (ms: number) => {
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      const milli = Math.floor(ms % 1000);
      return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
    };

    items.push({
      id: i,
      index: i,
      startTimeStr: fmt(startMs),
      endTimeStr: fmt(endMs),
      startTimeMs: startMs,
      endTimeMs: endMs,
      durationMs,
      enText,
      frText,
      wordCountFr: words,
      calculatedRateWpm: rateInfo.targetRateWpm,
      rateMultiplier: rateInfo.rateMultiplier,
      pacingCategory: rateInfo.pacingCategory,
    });
  }

  return items;
}
