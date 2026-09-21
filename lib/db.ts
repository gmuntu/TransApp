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

    // Also scan filesystem for any .wav files that might not be in records.json yet
    if (fs.existsSync(audioDir)) {
      const files = fs.readdirSync(audioDir).filter((f) => f.endsWith('.wav'));
      for (const file of files) {
        const url = `/audio/${file}`;
        const alreadyExists = records.some((r) => r.audioUrl === url);
        if (!alreadyExists) {
          const stats = fs.statSync(path.join(audioDir, file));
          records.push({
            id: `audio_file_${file.replace(/[^a-zA-Z0-9]/g, '_')}`,
            projectName: file.replace('.wav', '').replace(/master_\d+_?/, '') || 'Projet SRT',
            voice: 'fr-FR-DeniseNeural',
            subtitleCount: 1,
            durationMs: Math.round((stats.size / 176400) * 1000), // 44.1kHz * 16bit stereo = 176,400 bytes/sec
            audioUrl: url,
            srtContent: null,
            createdAt: stats.mtime,
          });
        }
      }
    }

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
    return inMemoryAudioStore.find((r) => r.id === args?.where?.id) ?? null;
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
    const idx = inMemoryAudioStore.findIndex((r) => r.id === args.where.id);
    if (idx !== -1) {
      inMemoryAudioStore[idx] = { ...inMemoryAudioStore[idx], ...args.data };
      saveRecords(inMemoryAudioStore);
      return inMemoryAudioStore[idx];
    }
    return null;
  },
  delete: async (args: { where: { id: string } }) => {
    inMemoryAudioStore = loadRecords();
    const idx = inMemoryAudioStore.findIndex((r) => r.id === args.where.id);
    if (idx !== -1) {
      const removed = inMemoryAudioStore.splice(idx, 1)[0];
      saveRecords(inMemoryAudioStore);
      return removed;
    }
    return null;
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
