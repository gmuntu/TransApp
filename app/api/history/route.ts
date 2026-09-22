export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    let dbRecords: any[] = [];
    try {
      dbRecords = await prisma.generatedAudio.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    } catch (e: any) {
      console.warn('Prisma history fetch fallback:', e?.message);
    }

    // Also load from public/audio/records.json
    let fileRecords: any[] = [];
    const recordsPath = path.join(process.cwd(), 'public', 'audio', 'records.json');
    if (fs.existsSync(recordsPath)) {
      try {
        const raw = fs.readFileSync(recordsPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          fileRecords = parsed;
        }
      } catch {
        /* noop */
      }
    }

    // Merge and deduplicate by canonical audio base name
    const allRecords: any[] = [];
    const seenBaseNames = new Set<string>();
    const seenIds = new Set<string>();

    const combined = [...dbRecords, ...fileRecords];
    // Prioritize records with rich metadata
    combined.sort((a, b) => {
      const countA = a.subtitleCount || 0;
      const countB = b.subtitleCount || 0;
      if (countB !== countA) return countB - countA;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    for (const rec of combined) {
      if (!rec) continue;
      const id = rec.id;
      if (id && seenIds.has(id)) continue;

      const rawUrl = (rec.audioUrl || '').split('?')[0];
      const baseName = rawUrl ? path.basename(rawUrl).replace(/\.(wav|mp3)$/i, '') : id;

      if (baseName && seenBaseNames.has(baseName)) continue;

      // Verify physical file on disk
      const audioDir = path.join(process.cwd(), 'public', 'audio');
      const wavPath = path.join(audioDir, `${baseName}.wav`);
      const mp3Path = path.join(audioDir, `${baseName}.mp3`);

      const hasWav = fs.existsSync(wavPath);
      const hasMp3 = fs.existsSync(mp3Path);

      if (!hasWav && !hasMp3) {
        // File does not exist on disk, skip this dead record
        continue;
      }

      if (baseName) seenBaseNames.add(baseName);
      if (id) seenIds.add(id);

      // Prefer MP3 for browser streaming preview to avoid heavy buffer delays, but keep WAV for download
      const previewUrl = hasMp3 ? `/audio/${baseName}.mp3` : `/audio/${baseName}.wav`;
      const wavUrl = hasWav ? `/audio/${baseName}.wav` : (hasMp3 ? `/audio/${baseName}.mp3` : previewUrl);

      // Detect first subtitle timestamp
      let firstVoiceMs = rec.firstSubtitleTimeMs || 0;
      if (!firstVoiceMs && rec.srtContent) {
        const match = rec.srtContent.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->/);
        if (match) {
          const [, h, m, s, ms] = match;
          firstVoiceMs = parseInt(h) * 3600000 + parseInt(m) * 60000 + parseInt(s) * 1000 + parseInt(ms);
        }
      }

      const hasInitialSilence = firstVoiceMs > 2000;
      const totalSec = Math.floor(firstVoiceMs / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      const firstVoiceFormatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      const directWavExists = fs.existsSync(path.join(audioDir, `${baseName}_direct.wav`));
      const directMp3Exists = fs.existsSync(path.join(audioDir, `${baseName}_direct.mp3`));
      const directAudioUrl = directMp3Exists
        ? `/audio/${baseName}_direct.mp3`
        : directWavExists
        ? `/audio/${baseName}_direct.wav`
        : previewUrl;

      allRecords.push({
        ...rec,
        audioUrl: previewUrl,
        wavUrl: wavUrl,
        hasWav,
        hasMp3,
        firstVoiceTimeMs: firstVoiceMs,
        firstVoiceFormatted: firstVoiceFormatted,
        hasInitialSilence: hasInitialSilence,
        directAudioUrl: directAudioUrl,
        durationMsDirect: Math.max(0, (rec.durationMs || 0) - firstVoiceMs),
      });
    }

    allRecords.sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime();
      const tB = new Date(b.createdAt || 0).getTime();
      return tB - tA;
    });

    return NextResponse.json({ records: allRecords });
  } catch (err: any) {
    console.error('History fetch error:', err?.message);
    return NextResponse.json({ records: [] });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const all = searchParams.get('all') === 'true';
    const clearCache = searchParams.get('cache') === 'true';

    const audioDir = path.join(process.cwd(), 'public', 'audio');
    const recordsPath = path.join(audioDir, 'records.json');

    // Case 1: Delete ALL generated audios
    if (all) {
      let deletedDbCount = 0;
      try {
        const res = await prisma.generatedAudio.deleteMany({});
        deletedDbCount = res?.count ?? 0;
      } catch (e: any) {
        console.warn('Prisma deleteMany warning:', e?.message);
      }

      // Remove all master audio files in public/audio/
      if (fs.existsSync(audioDir)) {
        try {
          const files = fs.readdirSync(audioDir);
          for (const file of files) {
            if (file === 'records.json' || file === 'cache') continue;
            if (file.endsWith('.wav') || file.endsWith('.mp3')) {
              try {
                fs.unlinkSync(path.join(audioDir, file));
              } catch {
                /* noop */
              }
            }
          }
        } catch (e: any) {
          console.warn('Failed cleaning audio dir:', e?.message);
        }
      }

      // Optionally clear audio cache
      if (clearCache) {
        const cacheDir = path.join(audioDir, 'cache');
        if (fs.existsSync(cacheDir)) {
          try {
            const cacheFiles = fs.readdirSync(cacheDir);
            for (const cf of cacheFiles) {
              try {
                fs.unlinkSync(path.join(cacheDir, cf));
              } catch {
                /* noop */
              }
            }
          } catch {
            /* noop */
          }
        }
      }

      // Reset records.json to empty array
      try {
        fs.writeFileSync(recordsPath, JSON.stringify([], null, 2), 'utf8');
      } catch {
        /* noop */
      }

      return NextResponse.json({
        success: true,
        message: 'Tous les audios générés ont été effacés avec succès.',
        deletedCount: deletedDbCount,
      });
    }

    // Case 2: Delete single record by ID or URL
    if (id) {
      let baseName: string | null = null;
      const cleanId = id.split('?')[0];
      if (cleanId.includes('/audio/')) {
        baseName = path.basename(cleanId).replace(/\.(wav|mp3)$/i, '');
      }

      // Check and update records.json
      if (fs.existsSync(recordsPath)) {
        try {
          const raw = fs.readFileSync(recordsPath, 'utf8');
          const records: any[] = JSON.parse(raw);
          if (Array.isArray(records)) {
            // Find baseName if not already extracted
            const matched = records.find((r) => r.id === id || r.audioUrl === id);
            if (matched?.audioUrl && !baseName) {
              baseName = path.basename(matched.audioUrl.split('?')[0]).replace(/\.(wav|mp3)$/i, '');
            }

            // Remove all entries that match id or baseName
            const updated = records.filter((r) => {
              if (r.id === id || r.audioUrl === id) return false;
              if (baseName && r.audioUrl) {
                const rBase = path.basename(r.audioUrl.split('?')[0]).replace(/\.(wav|mp3)$/i, '');
                if (rBase === baseName) return false;
              }
              return true;
            });
            fs.writeFileSync(recordsPath, JSON.stringify(updated, null, 2), 'utf8');
          }
        } catch (e: any) {
          console.warn('records.json update warning:', e?.message);
        }
      }

      // Also delete from in-memory / Prisma store
      try {
        await prisma.generatedAudio.delete({
          where: { id },
        });
      } catch {
        // Handled
      }

      // Delete physical files (.wav and .mp3) from disk
      if (baseName) {
        const candidates = [
          path.join(audioDir, `${baseName}.wav`),
          path.join(audioDir, `${baseName}.mp3`),
        ];
        for (const p of candidates) {
          if (fs.existsSync(p)) {
            try {
              fs.unlinkSync(p);
            } catch {
              /* noop */
            }
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Audio effacé avec succès.',
      });
    }

    return NextResponse.json(
      { success: false, error: 'Identifiant requis pour la suppression' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('History delete error:', err?.message);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = body?.id;
    const newProjectName = (body?.projectName || body?.name || '').trim();

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Identifiant du fichier requis' },
        { status: 400 }
      );
    }

    if (!newProjectName) {
      return NextResponse.json(
        { success: false, error: 'Le nom du fichier ne peut pas être vide' },
        { status: 400 }
      );
    }

    const audioDir = path.join(process.cwd(), 'public', 'audio');
    const recordsPath = path.join(audioDir, 'records.json');
    let updatedRecord: any = null;

    // 1. Update in prisma mock / memory store
    try {
      updatedRecord = await prisma.generatedAudio.update({
        where: { id },
        data: { projectName: newProjectName },
      });
    } catch (e: any) {
      console.warn('Prisma history update warning:', e?.message);
    }

    // 2. Also directly update records.json if present
    if (fs.existsSync(recordsPath)) {
      try {
        const raw = fs.readFileSync(recordsPath, 'utf8');
        const records: any[] = JSON.parse(raw);
        if (Array.isArray(records)) {
          let found = false;
          for (let i = 0; i < records.length; i++) {
            if (
              records[i].id === id ||
              records[i].audioUrl === id ||
              (records[i].audioUrl && id && records[i].audioUrl.includes(id))
            ) {
              records[i].projectName = newProjectName;
              found = true;
              if (!updatedRecord) updatedRecord = records[i];
            }
          }
          if (found) {
            fs.writeFileSync(recordsPath, JSON.stringify(records, null, 2), 'utf8');
          }
        }
      } catch (err: any) {
        console.warn('records.json update error:', err?.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Nom du fichier mis à jour avec succès dans l\'historique',
      projectName: newProjectName,
      record: updatedRecord,
    });
  } catch (err: any) {
    console.error('History PATCH error:', err?.message);
    return NextResponse.json(
      { success: false, error: err?.message || 'Erreur lors de la mise à jour' },
      { status: 500 }
    );
  }
}

