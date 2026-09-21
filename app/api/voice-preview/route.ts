import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

    if (request.method === 'POST') {
      try {
        const body = await request.json();
        if (body?.voice) voice = body.voice;
        if (body?.text) text = body.text;
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

    // If no custom text provided or empty, return pre-generated preview immediately
    if (!trimmedText && STATIC_PREVIEWS[voice]) {
      const staticPath = path.join(process.cwd(), 'public', STATIC_PREVIEWS[voice]);
      if (fs.existsSync(staticPath)) {
        return NextResponse.json({
          success: true,
          audioUrl: STATIC_PREVIEWS[voice],
          cached: true,
        });
      }
    }

    const cleanText = trimmedText.slice(0, 200);

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
      return NextResponse.json({
        success: true,
        audioUrl: publicUrl,
        cached: true,
      });
    }

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(cleanText);
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        try { tts.close(); } catch { /* noop */ }
        reject(new Error('Délai d\'attente dépassé pour la synthèse vocale'));
      }, 12000);

      audioStream.on('data', (c: any) => chunks.push(Buffer.from(c)));
      audioStream.on('end', () => {
        clearTimeout(timer);
        resolve();
      });
      audioStream.on('error', (err: any) => {
        clearTimeout(timer);
        try { tts.close(); } catch { /* noop */ }
        reject(err);
      });
    });

    try { tts.close(); } catch { /* noop */ }

    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) {
      throw new Error('Aucun son généré');
    }

    await fs.promises.writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      audioUrl: publicUrl,
      cached: false,
    });
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
