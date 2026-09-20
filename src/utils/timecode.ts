import { SubtitleItem } from '../types';

/**
 * Converts an SRT timecode string (HH:MM:SS,mmm or HH:MM:SS.mmm) to milliseconds.
 */
export function srtTimeToMs(timeStr: string): number {
  if (!timeStr) return 0;
  const cleaned = timeStr.trim().replace('.', ',');
  const parts = cleaned.split(':');
  if (parts.length !== 3) return 0;

  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const secMilli = parts[2].split(',');
  const seconds = parseInt(secMilli[0], 10) || 0;
  const millis = parseInt((secMilli[1] || '0').padEnd(3, '0').slice(0, 3), 10) || 0;

  return hours * 3600000 + minutes * 60000 + seconds * 1000 + millis;
}

/**
 * Converts milliseconds to standard SRT timecode (HH:MM:SS,mmm).
 */
export function msToSrtTime(ms: number): string {
  if (ms < 0) ms = 0;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/**
 * Converts milliseconds to Filmora NLE display timecode (HH:MM:SS:FF at specified fps).
 */
export function msToFilmoraTimecode(ms: number, fps: number = 30): string {
  if (ms < 0) ms = 0;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  const frame = Math.floor((millis / 1000) * fps);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frame)}`;
}

/**
 * Counts words accurately in French or English text (handling apostrophes, elisions like d'accord, l'arbre).
 */
export function countWords(text: string): number {
  if (!text) return 0;
  // Normalize French elisions (l'architecture -> 2 words, d'un -> 2 words)
  const normalized = text
    .replace(/['’]/g, ' ')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"«»—–]/g, ' ')
    .trim();
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

/**
 * Calculate the exact required speech rate (WPM) to fit into allowed_duration_ms.
 * Base standard reading rate for French voice Thomas is 175 WPM.
 * 
 * Target Rate Formula:
 * If natural reading time = (word_count / 175) * 60 * 1000 ms
 * If natural reading time <= allowed_duration_ms - safetyPaddingMs:
 *    Rate = 175 (natural pacing)
 * Else:
 *    usable_window_ms = max(500, allowed_duration_ms - safetyPaddingMs)
 *    required_rate = (word_count / (usable_window_ms / 60000))
 * 
 * Rate multiplier = required_rate / 175
 */
export function calculateTargetRate(
  wordCount: number,
  allowedDurationMs: number,
  baseWpm: number = 175,
  safetyPaddingMs: number = 80
): {
  targetRateWpm: number;
  rateMultiplier: number;
  pacingCategory: 'relaxed' | 'optimal' | 'accelerated' | 'critical';
} {
  if (wordCount <= 0 || allowedDurationMs <= 0) {
    return {
      targetRateWpm: baseWpm,
      rateMultiplier: 1.0,
      pacingCategory: 'optimal',
    };
  }

  const usableMs = Math.max(400, allowedDurationMs - safetyPaddingMs);
  const naturalDurationMs = (wordCount / baseWpm) * 60 * 1000;

  if (naturalDurationMs <= usableMs) {
    // Fits comfortably at standard pace
    const ratio = naturalDurationMs / usableMs;
    const category = ratio < 0.65 ? 'relaxed' : 'optimal';
    return {
      targetRateWpm: baseWpm,
      rateMultiplier: 1.0,
      pacingCategory: category,
    };
  }

  // Need acceleration
  const calculatedWpm = Math.round((wordCount / usableMs) * 60000);
  const targetRateWpm = Math.min(320, Math.max(baseWpm, calculatedWpm));
  const rateMultiplier = Number((targetRateWpm / baseWpm).toFixed(2));

  let pacingCategory: 'optimal' | 'accelerated' | 'critical' = 'optimal';
  if (targetRateWpm > 245) {
    pacingCategory = 'critical';
  } else if (targetRateWpm > 185) {
    pacingCategory = 'accelerated';
  }

  return {
    targetRateWpm,
    rateMultiplier,
    pacingCategory,
  };
}

/**
 * Parses raw SRT string into an array of SubtitleItem
 */
export function parseSrt(rawContent: string, baseWpm: number = 175): SubtitleItem[] {
  const normalized = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);
  const items: SubtitleItem[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;

    const lines = block.split('\n');
    if (lines.length < 2) continue;

    let index = i + 1;
    let timeIndex = 0;

    if (/^\d+$/.test(lines[0].trim())) {
      index = parseInt(lines[0].trim(), 10);
      timeIndex = 1;
    }

    const timeLine = lines[timeIndex];
    if (!timeLine || !timeLine.includes('-->')) continue;

    const timeParts = timeLine.split('-->');
    const startStr = timeParts[0].trim();
    const endStr = timeParts[1].trim();
    const startMs = srtTimeToMs(startStr);
    const endMs = srtTimeToMs(endStr);
    const durationMs = Math.max(0, endMs - startMs);

    const text = lines.slice(timeIndex + 1).join(' ').trim();
    const words = countWords(text);
    const rateInfo = calculateTargetRate(words, durationMs, baseWpm);

    items.push({
      id: index,
      index,
      startTimeStr: startStr,
      endTimeStr: endStr,
      startTimeMs: startMs,
      endTimeMs: endMs,
      durationMs,
      enText: text,
      frText: text, // Initial value before translation
      wordCountFr: words,
      calculatedRateWpm: rateInfo.targetRateWpm,
      rateMultiplier: rateInfo.rateMultiplier,
      pacingCategory: rateInfo.pacingCategory,
    });
  }

  return items;
}

/**
 * Formats subtitle items back into clean SRT content.
 */
export function formatSrt(items: SubtitleItem[], useFrench: boolean = true): string {
  return items
    .map((item, idx) => {
      const text = useFrench ? (item.frText || item.enText) : item.enText;
      return `${idx + 1}\n${item.startTimeStr} --> ${item.endTimeStr}\n${text}\n`;
    })
    .join('\n');
}
