export interface SubtitleItem {
  id: number;
  index: number;
  startTimeStr: string;
  endTimeStr: string;
  startTimeMs: number;
  endTimeMs: number;
  enText: string;
  frText: string;
}

export interface TranslationProgress {
  current: number;
  total: number;
  status: 'idle' | 'translating' | 'done' | 'error';
  message: string;
}

export interface GenerationProgress {
  type: 'progress' | 'complete' | 'error' | 'heartbeat';
  step?: 'tts' | 'assembly' | 'processing';
  current?: number;
  total?: number;
  message?: string;
  audioUrl?: string;
  durationMs?: number;
}

export type VoiceOption = {
  id: string;
  name: string;
  gender: 'Femme' | 'Homme';
  shortName: string;
};

export const FRENCH_VOICES: VoiceOption[] = [
  { id: 'fr-FR-DeniseNeural', name: 'Denise', gender: 'Femme', shortName: 'Denise' },
  { id: 'fr-FR-HenriNeural', name: 'Henri', gender: 'Homme', shortName: 'Henri' },
  { id: 'fr-FR-EloiseNeural', name: 'Éloïse', gender: 'Femme', shortName: 'Éloïse' },
  { id: 'fr-FR-YvesNeural', name: 'Yves', gender: 'Homme', shortName: 'Yves' },
];

export type AppStep = 1 | 2 | 3 | 4 | 5;
