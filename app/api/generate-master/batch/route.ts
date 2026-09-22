export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { findClonedVoice, applyVibeVoiceAcoustics } from '@/lib/vibevoice';

interface BatchItem {
  index: number;
  startTimeMs: number;
  endTimeMs: number;
  frText: string;
}

function cleanForTts(text: string): string {
  return text
    .replace(/&/g, ' et ')
    .replace(/[<>{}[\]\\]/g, ' ')
    .replace(/["«»]/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawVoice: string = body?.voice ?? 'fr-FR-RemyMultilingualNeural';
    const voice = rawVoice === 'fr-FR-YvesNeural' ? 'fr-FR-RemyMultilingualNeural' : rawVoice;
    const items: BatchItem[] = body?.items ?? [];
    const checkOnly: boolean = Boolean(body?.checkOnly);
    const speechRate: number =
      typeof body?.speechRate === 'number' && body.speechRate >= 0.8 && body.speechRate <= 1.5
        ? Number(body.speechRate.toFixed(2))
        : 1.0;

    const ratePercent =
      speechRate !== 1.0
        ? `${speechRate > 1.0 ? '+' : ''}${Math.round((speechRate - 1.0) * 100)}%`
        : '+0%';

    if (!items.length) {
      return Response.json({ results: [], cachedCount: 0 });
    }

    const cacheDir = path.join(process.cwd(), 'public', 'audio', 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const isCloned = voice.startsWith('vibevoice_');
    let cloneProfile = null;
    let ttsVoice = voice;

    if (isCloned) {
      cloneProfile = await findClonedVoice(voice);
      if (cloneProfile?.baseVoice) {
        ttsVoice = cloneProfile.baseVoice;
      }
    }

    let activeTts: MsEdgeTTS | null = null;
    const getOrCreateTts = async (): Promise<MsEdgeTTS> => {
      if (!activeTts) {
        activeTts = new MsEdgeTTS();
        await activeTts.setMetadata(ttsVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      }
      return activeTts;
    };

    const resetTts = () => {
      if (activeTts) {
        try {
          activeTts.close();
        } catch {
          /* noop */
        }
        activeTts = null;
      }
    };

    const results: Array<{
      index: number;
      startTimeMs: number;
      endTimeMs: number;
      cacheKey: string;
      cached: boolean;
      isEmpty?: boolean;
      clipUrl?: string;
      localPath?: string;
      estimatedDurationMs: number;
      error?: string;
    }> = [];

    let cachedCount = 0;

    for (const item of items) {
      const rawText = (item.frText ?? '').trim();
      const cleanText = cleanForTts(rawText);

      if (!cleanText) {
        results.push({
          index: item.index,
          startTimeMs: item.startTimeMs,
          endTimeMs: item.endTimeMs,
          cacheKey: 'empty',
          cached: true,
          isEmpty: true,
          estimatedDurationMs: 0,
        });
        cachedCount++;
        continue;
      }

      // Unique hash based on voice, speech rate, and sanitized text
      const cacheKey = crypto
        .createHash('sha256')
        .update(`${voice}:::rate=${ratePercent}:::${cleanText}`)
        .digest('hex');

      const cacheFileName = `${cacheKey}.mp3`;
      const cacheFilePath = path.join(cacheDir, cacheFileName);

      // Check if file already exists in cache
      if (fs.existsSync(cacheFilePath)) {
        try {
          const stat = fs.statSync(cacheFilePath);
          if (stat.size >= 100) {
            const estimatedDurationMs = Math.round((stat.size / 12000) * 1000);
            results.push({
              index: item.index,
              startTimeMs: item.startTimeMs,
              endTimeMs: item.endTimeMs,
              cacheKey,
              cached: true,
              clipUrl: `/audio/cache/${cacheFileName}`,
              localPath: cacheFilePath,
              estimatedDurationMs,
            });
            cachedCount++;
            continue;
          }
        } catch {
          // Fall through to regeneration if corrupted
        }
      }

      // If client only requested cache check, mark as not cached
      if (checkOnly) {
        results.push({
          index: item.index,
          startTimeMs: item.startTimeMs,
          endTimeMs: item.endTimeMs,
          cacheKey,
          cached: false,
          estimatedDurationMs: 0,
        });
        continue;
      }

      // Synthesize missing audio with automatic retry
      let buffer: Buffer | null = null;
      let lastErr: any = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const currentTts = await getOrCreateTts();
          const { audioStream } = currentTts.toStream(cleanText, { rate: ratePercent });
          const chunks: Buffer[] = [];

          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              resetTts();
              reject(new Error("Délai d'attente TTS dépassé"));
            }, 10000);

            audioStream.on('data', (chunk: any) => chunks.push(Buffer.from(chunk)));
            audioStream.on('end', () => {
              clearTimeout(timer);
              resolve();
            });
            audioStream.on('error', (err: any) => {
              clearTimeout(timer);
              resetTts();
              reject(err);
            });
          });

          const combined = Buffer.concat(chunks);
          if (combined.length >= 100) {
            buffer = combined;
            break;
          } else {
            throw new Error('Audio généré trop court');
          }
        } catch (err: any) {
          lastErr = err;
          resetTts();
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 400 * attempt));
          }
        }
      }

      if (buffer && buffer.length >= 100) {
        if (isCloned && cloneProfile) {
          const tempRawPath = path.join(cacheDir, `raw_${cacheFileName}`);
          await fs.promises.writeFile(tempRawPath, buffer);
          await applyVibeVoiceAcoustics(tempRawPath, cacheFilePath, cloneProfile);
          try {
            if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath);
          } catch {
            /* noop */
          }
        } else {
          await fs.promises.writeFile(cacheFilePath, buffer);
        }
        const finalStat = fs.statSync(cacheFilePath);
        const estimatedDurationMs = Math.round((finalStat.size / 12000) * 1000);

        results.push({
          index: item.index,
          startTimeMs: item.startTimeMs,
          endTimeMs: item.endTimeMs,
          cacheKey,
          cached: false,
          clipUrl: `/audio/cache/${cacheFileName}`,
          localPath: cacheFilePath,
          estimatedDurationMs,
        });
      } else {
        console.error(`TTS failed permanently for sub ${item.index}:`, lastErr?.message);
        results.push({
          index: item.index,
          startTimeMs: item.startTimeMs,
          endTimeMs: item.endTimeMs,
          cacheKey: 'error',
          cached: false,
          estimatedDurationMs: 0,
          error: lastErr?.message || 'Erreur synthèse audio',
        });
      }
    }

    resetTts();

    return Response.json({
      results,
      cachedCount,
      total: items.length,
    });
  } catch (err: any) {
    console.error('Batch route error:', err);
    return Response.json({ error: err?.message || 'Erreur serveur lot' }, { status: 500 });
  }
}
