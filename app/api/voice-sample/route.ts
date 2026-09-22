export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { findClonedVoice, applyVibeVoiceAcoustics } from '@/lib/vibevoice';

const execFileAsync = promisify(execFile);
const ffmpegBin = fs.existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';

function sanitizeTtsText(text: string): string {
  return text
    .replace(/&/g, ' et ')
    .replace(/[<>{}[\]\\]/g, ' ')
    .replace(/["«»]/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawVoice = body?.voice || 'fr-FR-DeniseNeural';
    const voice = rawVoice === 'fr-FR-YvesNeural' ? 'fr-FR-RemyMultilingualNeural' : rawVoice;
    const rawText = body?.text || '';
    const subtitleIndex = body?.subtitleIndex ?? 1;
    const customCloneProfile = body?.cloneProfile || null;

    const cleanText = sanitizeTtsText(rawText);
    if (!cleanText) {
      return NextResponse.json(
        { error: 'Texte du sous-titre vide pour le test audio' },
        { status: 400 }
      );
    }

    const samplesDir = path.join(process.cwd(), 'public', 'uploads', 'samples');
    if (!fs.existsSync(samplesDir)) {
      fs.mkdirSync(samplesDir, { recursive: true });
    }

    // Determine if this voice is a cloned voice
    const isCloned = voice.startsWith('vibevoice_') || voice.startsWith('vibevoice-') || !!customCloneProfile;
    let cloneProfile = customCloneProfile;
    if (isCloned && !cloneProfile) {
      cloneProfile = await findClonedVoice(voice);
    }

    const effectiveTtsVoice = isCloned && cloneProfile?.baseVoice ? cloneProfile.baseVoice : voice;

    // Cache key based on voice, cloned status, and text
    const cacheHash = crypto
      .createHash('md5')
      .update(`sample5s_${voice}_${cleanText}_${cloneProfile?.pitchScale || 1.0}`)
      .digest('hex')
      .slice(0, 14);

    const outputFileName = `sample_${cacheHash}.mp3`;
    const outputFilePath = path.join(samplesDir, outputFileName);
    const publicAudioUrl = `/uploads/samples/${outputFileName}`;

    // If already generated and cached, return immediately
    if (fs.existsSync(outputFilePath)) {
      const stats = fs.statSync(outputFilePath);
      if (stats.size > 500) {
        return NextResponse.json({
          success: true,
          audioUrl: publicAudioUrl,
          cached: true,
          subtitleIndex,
          voice,
          durationMs: 5000,
        });
      }
    }

    // Step 1: Synthesize initial audio via Edge TTS
    const tempRawPath = path.join(samplesDir, `temp_raw_${cacheHash}.mp3`);
    const tts = new MsEdgeTTS();
    await tts.setMetadata(effectiveTtsVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(cleanText);
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        try { tts.close(); } catch { /* noop */ }
        reject(new Error('Délai d\'attente TTS dépassé'));
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

    const rawBuffer = Buffer.concat(chunks);
    if (rawBuffer.length < 200) {
      throw new Error('Synthèse audio échouée (audio vide)');
    }

    await fs.promises.writeFile(tempRawPath, rawBuffer);

    // Step 2: If cloned voice, apply VibeVoice acoustic profile
    let processedInputPath = tempRawPath;
    const tempVibePath = path.join(samplesDir, `temp_vibe_${cacheHash}.mp3`);

    if (isCloned && cloneProfile) {
      await applyVibeVoiceAcoustics(tempRawPath, tempVibePath, cloneProfile);
      processedInputPath = tempVibePath;
    }

    // Step 3: Trim to max 5s, apply clear volume boost and limiter for optimal audibility
    const trimArgs = [
      '-i',
      processedInputPath,
      '-t',
      '5.0',
      '-af',
      'volume=1.4,alimiter=limit=0.98,afade=t=out:st=4.6:d=0.4',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      '-y',
      outputFilePath,
    ];

    await execFileAsync(ffmpegBin, trimArgs, { timeout: 20000 });

    // Cleanup temp files
    try {
      if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath);
      if (fs.existsSync(tempVibePath)) fs.unlinkSync(tempVibePath);
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      audioUrl: publicAudioUrl,
      cached: false,
      subtitleIndex,
      voice,
      text: cleanText,
      durationMs: 5000,
    });
  } catch (error: any) {
    console.error('Voice sample 5s generation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Erreur lors de la génération de l\'échantillon audio de 5 secondes',
      },
      { status: 500 }
    );
  }
}
