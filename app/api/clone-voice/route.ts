export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import {
  ensureDirectories,
  extractReferenceAudio,
  analyzeAcoustics,
  applyVibeVoiceAcoustics,
  saveClonedVoice,
  getStoredClonedVoices,
} from '@/lib/vibevoice';
import { ClonedVoiceProfile } from '@/types/transapp';

export async function GET() {
  try {
    const clones = await getStoredClonedVoices();
    return NextResponse.json({ success: true, clones });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const tempFilesToClean: string[] = [];
  try {
    ensureDirectories();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const rawStartTime = formData.get('startTime')?.toString() || '0';
    const rawDuration = formData.get('duration')?.toString() || '15';
    const speakerName = formData.get('speakerName')?.toString() || 'Voix Originale Vidéo';

    if (!file) {
      return NextResponse.json(
        { error: 'Aucun fichier vidéo ou audio fourni pour le clonage.' },
        { status: 400 }
      );
    }

    // Parse start time (can be seconds number or hh:mm:ss format)
    let startTimeSec = 0;
    if (rawStartTime.includes(':')) {
      const parts = rawStartTime.split(':').map((p) => parseFloat(p) || 0);
      if (parts.length === 3) {
        startTimeSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        startTimeSec = parts[0] * 60 + parts[1];
      }
    } else {
      startTimeSec = parseFloat(rawStartTime) || 0;
    }

    const durationSec = Math.max(5, Math.min(30, parseFloat(rawDuration) || 15));

    // Save uploaded input file to disk
    const originalExt = path.extname(file.name) || '.mp4';
    const uniqueId = `vibevoice_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const uploadTempPath = path.join(process.cwd(), 'public', 'uploads', `temp_${uniqueId}${originalExt}`);
    tempFilesToClean.push(uploadTempPath);

    const arrayBuffer = await file.arrayBuffer();
    await fs.promises.writeFile(uploadTempPath, Buffer.from(arrayBuffer));

    // Step 1: Extract reference audio clip
    const clonesDir = path.join(process.cwd(), 'public', 'uploads', 'clones');
    const refAudioFileName = `ref_${uniqueId}.mp3`;
    const refAudioPath = path.join(clonesDir, refAudioFileName);
    const refAudioPublicUrl = `/uploads/clones/${refAudioFileName}`;

    await extractReferenceAudio(uploadTempPath, startTimeSec, durationSec, refAudioPath);

    // Step 2: VibeVoice acoustic profiling
    const acoustic = await analyzeAcoustics(refAudioPath);

    // Step 3: Synthesize French greeting sample and apply VibeVoice acoustics
    const sampleTtsPath = path.join(clonesDir, `raw_preview_${uniqueId}.mp3`);
    const previewFileName = `preview_${uniqueId}.mp3`;
    const previewFilePath = path.join(clonesDir, previewFileName);
    const previewPublicUrl = `/uploads/clones/${previewFileName}`;
    tempFilesToClean.push(sampleTtsPath);

    const greetingText = `Bonjour ! Ma voix a été clonée depuis votre vidéo originale grâce aux capacités VibeVoice. Je suis prête pour le doublage complet de vos sous-titres en français.`;

    const tts = new MsEdgeTTS();
    await tts.setMetadata(acoustic.baseVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(greetingText);
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        try { tts.close(); } catch { /* noop */ }
        reject(new Error('Délai d\'attente TTS'));
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

    await fs.promises.writeFile(sampleTtsPath, Buffer.concat(chunks));

    // Create preliminary profile
    const profile: ClonedVoiceProfile = {
      id: uniqueId,
      name: speakerName.trim() || 'Voix Clonnée (Vidéo)',
      gender: acoustic.gender,
      isCloned: true,
      model: 'vibevoice',
      referenceAudioUrl: refAudioPublicUrl,
      referenceDurationSec: durationSec,
      pitchScale: acoustic.pitchScale,
      tempoScale: acoustic.tempoScale,
      baseVoice: acoustic.baseVoice,
      acousticFeatures: {
        estimatedPitchHz: acoustic.estimatedPitchHz,
        brightness: acoustic.brightness,
        timbreStyle: acoustic.timbreStyle,
        energy: acoustic.energy,
      },
      samplePreviewUrl: previewPublicUrl,
      createdAt: new Date().toISOString(),
    };

    // Apply VibeVoice acoustics filter
    await applyVibeVoiceAcoustics(sampleTtsPath, previewFilePath, profile);

    // Save profile persistently
    await saveClonedVoice(profile);

    // Clean temp input
    for (const f of tempFilesToClean) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }

    return NextResponse.json({
      success: true,
      profile,
      message: 'Voix clonée avec succès depuis la vidéo avec VibeVoice AI !',
    });
  } catch (error: any) {
    console.error('Clone voice error:', error);
    for (const f of tempFilesToClean) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Erreur lors du clonage de la voix VibeVoice',
      },
      { status: 500 }
    );
  }
}
