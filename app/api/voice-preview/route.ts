import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { findClonedVoice, applyVibeVoiceAcoustics } from '@/lib/vibevoice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Map of pre-generated static preview files
const STATIC_PREVIEWS: Record<string, string> = {
  'fr-FR-DeniseNeural': '/uploads/previews/preview_denise.mp3',
  'fr-FR-HenriNeural': '/uploads/previews/preview_henri.mp3',
  'fr-FR-EloiseNeural': '/uploads/previews/preview_eloise.mp3',
  'fr-FR-RemyMultilingualNeural': '/uploads/previews/preview_remy.mp3',
  'fr-FR-VivienneMultilingualNeural': '/uploads/previews/preview_vivienne.mp3',
  'fr-FR-YvesNeural': '/uploads/previews/preview_remy.mp3',
};

export async function GET(request: NextRequest) {
  return handleVoicePreview(request);
}

export async function POST(request: NextRequest) {
  return handleVoicePreview(request);
}

async function handleVoicePreview(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let voice = searchParams.get('voice');
    let text = searchParams.get('text');
    let isDefault = searchParams.get('isDefault') === 'true';

    if (request.method === 'POST') {
      try {
        const body = await request.json();
        if (body?.voice) voice = body.voice;
        if (body?.text) text = body.text;
        if (body?.isDefault !== undefined) isDefault = Boolean(body.isDefault);
      } catch {
        // Fallback to query params
      }
    }

    voice = voice || 'fr-FR-DeniseNeural';

    // Map deprecated voice to modern neural voice
    if (voice === 'fr-FR-YvesNeural') {
      voice = 'fr-FR-RemyMultilingualNeural';
    }

    const trimmedText = (text || '').trim();

    // If default mode requested, or text is empty, or text matches common intro patterns:
    // Return pre-generated preview immediately for instant response and 100% reliability.
    if (isDefault || !trimmedText) {
      if (STATIC_PREVIEWS[voice]) {
        const staticPath = path.join(process.cwd(), 'public', STATIC_PREVIEWS[voice]);
        if (fs.existsSync(staticPath)) {
          return NextResponse.json({
            success: true,
            audioUrl: STATIC_PREVIEWS[voice],
            cached: true,
          });
        }
      }
    }

    // Sanitize text for Microsoft Edge TTS / SSML:
    // Ampersands must become 'et', XML tags removed, special quotes normalized
    const cleanText = trimmedText
      .replace(/&/g, ' et ')
      .replace(/[<>{}[\]\\]/g, ' ')
      .replace(/["«»]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);

    // Compute deterministic filename hash based on voice + text
    const hash = crypto.createHash('md5').update(`${voice}_${cleanText}`).digest('hex').slice(0, 12);
    const safeVoiceName = voice.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `custom_${safeVoiceName}_${hash}.mp3`;

    const previewsDir = path.join(process.cwd(), 'public', 'uploads', 'previews');
    if (!fs.existsSync(previewsDir)) {
      fs.mkdirSync(previewsDir, { recursive: true });
    }

    const filePath = path.join(previewsDir, fileName);
    const publicUrl = `/uploads/previews/${fileName}`;

    // If already generated on disk, return it immediately
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > 500) {
        return NextResponse.json({
          success: true,
          audioUrl: publicUrl,
          cached: true,
        });
      }
    }

    // Check if cloned voice
    const isCloned = voice.startsWith('vibevoice_');
    let cloneProfile = null;
    let ttsVoice = voice;

    if (isCloned) {
      cloneProfile = await findClonedVoice(voice);
      if (cloneProfile?.baseVoice) {
        ttsVoice = cloneProfile.baseVoice;
      }
      if (cloneProfile?.samplePreviewUrl && isDefault) {
        return NextResponse.json({
          success: true,
          audioUrl: cloneProfile.samplePreviewUrl,
          cached: true,
        });
      }
    }

    // Synthesize with retry
    let buffer: Buffer | null = null;
    let lastError: any = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      let tts: MsEdgeTTS | null = null;
      try {
        tts = new MsEdgeTTS();
        await tts.setMetadata(ttsVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

        const { audioStream } = tts.toStream(cleanText);
        const chunks: Buffer[] = [];

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            try { tts?.close(); } catch { /* noop */ }
            reject(new Error('Délai d\'attente dépassé'));
          }, 10000);

          audioStream.on('data', (c: any) => chunks.push(Buffer.from(c)));
          audioStream.on('end', () => {
            clearTimeout(timer);
            resolve();
          });
          audioStream.on('error', (err: any) => {
            clearTimeout(timer);
            try { tts?.close(); } catch { /* noop */ }
            reject(err);
          });
        });

        try { tts.close(); } catch { /* noop */ }

        const combined = Buffer.concat(chunks);
        if (combined.length > 500) {
          buffer = combined;
          break;
        }
      } catch (err: any) {
        lastError = err;
        try { tts?.close(); } catch { /* noop */ }
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }

    if (buffer && buffer.length > 0) {
      if (isCloned && cloneProfile) {
        const tempRaw = path.join(previewsDir, `raw_${fileName}`);
        await fs.promises.writeFile(tempRaw, buffer);
        await applyVibeVoiceAcoustics(tempRaw, filePath, cloneProfile);
        try { if (fs.existsSync(tempRaw)) fs.unlinkSync(tempRaw); } catch { /* noop */ }
      } else {
        await fs.promises.writeFile(filePath, buffer);
      }
      return NextResponse.json({
        success: true,
        audioUrl: publicUrl,
        cached: false,
      });
    }

    // Graceful fallback: If live synthesis failed for custom text, fallback to static preview
    if (STATIC_PREVIEWS[voice]) {
      console.warn(`[voice-preview] Fallback to static preview for ${voice} after error:`, lastError?.message);
      return NextResponse.json({
        success: true,
        audioUrl: STATIC_PREVIEWS[voice],
        cached: true,
        fallback: true,
      });
    }

    throw lastError || new Error('Impossible de générer l\'extrait audio');
  } catch (error: any) {
    console.error('[voice-preview error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Erreur lors de la génération de l\'aperçu audio',
      },
      { status: 500 }
    );
  }
}
