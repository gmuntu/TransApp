import fs from 'fs';
import path from 'path';

export interface GeneratedAudioRecord {
  id: string;
  projectName: string;
  voice: string;
  subtitleCount: number;
  durationMs: number;
  audioUrl: string;
  srtContent: string | null;
  createdAt: Date;
  firstSubtitleTimeMs?: number;
}

const audioDir = path.join(process.cwd(), 'public', 'audio');
const recordsFile = path.join(audioDir, 'records.json');

function loadRecords(): GeneratedAudioRecord[] {
  try {
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    let records: GeneratedAudioRecord[] = [];

    if (fs.existsSync(recordsFile)) {
      const data = fs.readFileSync(recordsFile, 'utf-8');
      const parsed = JSON.parse(data);
      records = (parsed || []).map((r: any) => ({
        ...r,
        createdAt: new Date(r.createdAt),
      }));
    }

    // Deduplicate records by canonical base audio name
    const deduplicated: GeneratedAudioRecord[] = [];
    const seenBaseNames = new Set<string>();

    // Prioritize records that have richer metadata (higher subtitle count or srtContent)
    records.sort((a, b) => {
      const countA = a.subtitleCount || 0;
      const countB = b.subtitleCount || 0;
      if (countB !== countA) return countB - countA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    for (const r of records) {
      const cleanUrl = (r.audioUrl || '').split('?')[0];
      const baseName = cleanUrl ? path.basename(cleanUrl).replace(/\.(wav|mp3)$/i, '') : r.id;
      if (baseName && !seenBaseNames.has(baseName)) {
        seenBaseNames.add(baseName);
        deduplicated.push(r);
      }
    }
    records = deduplicated;

    // Sort newest first
    records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return records;
  } catch (err) {
    console.error('Failed to load audio records:', err);
    return [];
  }
}

function saveRecords(records: GeneratedAudioRecord[]) {
  try {
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    fs.writeFileSync(recordsFile, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save audio records:', err);
  }
}

let inMemoryAudioStore: GeneratedAudioRecord[] = loadRecords();

const mockGeneratedAudio = {
  findMany: async (args?: { orderBy?: { createdAt?: 'asc' | 'desc' }; take?: number }) => {
    // Reload to ensure fresh sync with disk
    inMemoryAudioStore = loadRecords();
    let list = [...inMemoryAudioStore];
    if (args?.orderBy?.createdAt === 'asc') {
      list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    } else {
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    if (args?.take) {
      list = list.slice(0, args.take);
    }
    return list;
  },
  findFirst: async () => {
    inMemoryAudioStore = loadRecords();
    return inMemoryAudioStore[0] ?? null;
  },
  findUnique: async (args?: { where: { id: string } }) => {
    inMemoryAudioStore = loadRecords();
    const targetId = args?.where?.id;
    return (
      inMemoryAudioStore.find(
        (r) => r.id === targetId || r.audioUrl === targetId || (targetId && r.audioUrl?.includes(targetId))
      ) ?? null
    );
  },
  create: async (args: { data: Omit<GeneratedAudioRecord, 'id' | 'createdAt'> }) => {
    inMemoryAudioStore = loadRecords();
    const record: GeneratedAudioRecord = {
      id: `audio_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date(),
      ...args.data,
    };
    inMemoryAudioStore.unshift(record);
    saveRecords(inMemoryAudioStore);
    return record;
  },
  update: async (args: { where: { id: string }; data: Partial<GeneratedAudioRecord> }) => {
    inMemoryAudioStore = loadRecords();
    const targetId = args.where.id;
    const idx = inMemoryAudioStore.findIndex(
      (r) => r.id === targetId || r.audioUrl === targetId || (targetId && r.audioUrl?.includes(targetId))
    );
    if (idx !== -1) {
      inMemoryAudioStore[idx] = { ...inMemoryAudioStore[idx], ...args.data };
      saveRecords(inMemoryAudioStore);
      return inMemoryAudioStore[idx];
    }
    return null;
  },
  delete: async (args: { where: { id: string } }) => {
    inMemoryAudioStore = loadRecords();
    const targetId = args.where.id;
    const targetRecord = inMemoryAudioStore.find((r) => r.id === targetId || r.audioUrl === targetId);

    if (targetRecord) {
      const cleanUrl = (targetRecord.audioUrl || '').split('?')[0];
      const baseName = cleanUrl ? path.basename(cleanUrl).replace(/\.(wav|mp3)$/i, '') : null;

      // Remove any record matching id or audioUrl or baseName
      inMemoryAudioStore = inMemoryAudioStore.filter((r) => {
        if (r.id === targetId || r.audioUrl === targetId) return false;
        if (baseName && r.audioUrl) {
          const rBase = path.basename(r.audioUrl.split('?')[0]).replace(/\.(wav|mp3)$/i, '');
          if (rBase === baseName) return false;
        }
        return true;
      });
      saveRecords(inMemoryAudioStore);

      // Clean up both .wav and .mp3 physical files on disk
      if (baseName) {
        const candidates = [
          path.join(audioDir, `${baseName}.wav`),
          path.join(audioDir, `${baseName}.mp3`),
        ];
        for (const p of candidates) {
          if (fs.existsSync(p)) {
            try {
              fs.unlinkSync(p);
            } catch (fErr) {
              console.warn('Could not delete audio file from disk:', p, fErr);
            }
          }
        }
      }

      return targetRecord;
    }
    return null;
  },
  deleteMany: async (args?: { where?: any }) => {
    inMemoryAudioStore = loadRecords();
    const count = inMemoryAudioStore.length;

    // Delete all master .wav and .mp3 files on disk
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
      } catch (err) {
        console.warn('Could not clean audio directory:', err);
      }
    }

    inMemoryAudioStore = [];
    saveRecords(inMemoryAudioStore);
    return { count };
  },
};

const genericNoOp = {
  findMany: async () => [],
  findFirst: async () => null,
  findUnique: async () => null,
  create: async (d: any) => d?.data ?? {},
  update: async (d: any) => d?.data ?? {},
  delete: async () => ({}),
};

export const prisma = new Proxy(
  {
    generatedAudio: mockGeneratedAudio,
  } as any,
  {
    get: (target, prop: string) => {
      if (prop in target) {
        return (target as any)[prop];
      }
      return genericNoOp;
    },
  }
);
