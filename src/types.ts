export interface SubtitleItem {
  id: number;
  index: number;
  startTimeStr: string;
  endTimeStr: string;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  enText: string;
  frText: string;
  wordCountFr: number;
  calculatedRateWpm: number;
  rateMultiplier: number;
  pacingCategory: 'relaxed' | 'optimal' | 'accelerated' | 'critical';
  isEdited?: boolean;
  audioBlob?: Blob;
  audioUrl?: string;
  isStitched?: boolean;
}

export interface DubbingProjectSettings {
  filename: string;
  baseWpm: number; // default ~175
  maxWpm: number; // safe upper limit ~240
  voiceName: string; // 'Thomas'
  sampleRate: number; // 44100
  channels: number; // 2 (Stereo)
  safetyPaddingMs: number; // 60ms gap between subtitle chunks
}

export interface CSGlossaryTerm {
  en: string;
  fr: string;
  category: 'concurrency' | 'memory' | 'algorithms' | 'architecture' | 'systems' | 'general';
  notes?: string;
}

export interface TimelineLogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'rate_adjusted' | 'stitched' | 'warning' | 'error';
  rowIndex: number;
  message: string;
  rateWpm?: number;
  durationMs?: number;
}

export interface StitchProgressState {
  isProcessing: boolean;
  currentRow: number;
  totalRows: number;
  percentage: number;
  currentRateWpm: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  currentText: string;
  statusMessage: string;
}
