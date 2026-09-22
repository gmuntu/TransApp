export interface SubtitleItem {
  id: number;
  index: number;
  startTimeStr: string;
  endTimeStr: string;
  startTimeMs: number;
  endTimeMs: number;
  enText: string;
  frText: string;
  audioUrl?: string;
  audioDurationMs?: number;
  audioStatus?: 'idle' | 'generating' | 'ready' | 'error';
  audioError?: string;
}

export interface TranslationProgress {
  current: number;
  total: number;
  status: 'idle' | 'translating' | 'done' | 'error';
  message: string;
}

export interface GenerationProgress {
  type: 'progress' | 'complete' | 'error' | 'heartbeat' | 'clip_generated';
  step?: 'tts' | 'assembly' | 'processing';
  current?: number;
  total?: number;
  message?: string;
  audioUrl?: string;
  durationMs?: number;
  clip?: {
    index: number;
    url: string;
    durationMs: number;
  };
  clips?: Array<{
    index: number;
    url: string;
    durationMs: number;
  }>;
}

export interface ClonedVoiceProfile {
  id: string;
  name: string;
  gender: 'Femme' | 'Homme';
  isCloned: boolean;
  model: 'vibevoice';
  referenceAudioUrl: string;
  referenceDurationSec: number;
  pitchScale: number;
  tempoScale: number;
  baseVoice: string;
  acousticFeatures: {
    estimatedPitchHz: number;
    brightness: string;
    timbreStyle: string;
    energy: string;
  };
  samplePreviewUrl?: string;
  createdAt: string;
}

export type VoiceOption = {
  id: string;
  name: string;
  gender: 'Femme' | 'Homme';
  shortName: string;
  description?: string;
  tag?: string;
  previewText?: string;
  isCloned?: boolean;
  cloneProfile?: ClonedVoiceProfile;
};

export const FRENCH_VOICES: VoiceOption[] = [
  {
    id: 'fr-FR-DeniseNeural',
    name: 'Denise',
    gender: 'Femme',
    shortName: 'Denise',
    description: 'Chaleureuse, naturelle et très expressive. Idéale pour récits et vidéos YouTube.',
    tag: 'Recommandée',
    previewText: "Bonjour ! Je suis Denise. Ma voix est naturelle et expressive, parfaite pour vos vidéos.",
  },
  {
    id: 'fr-FR-HenriNeural',
    name: 'Henri',
    gender: 'Homme',
    shortName: 'Henri',
    description: 'Posé, clair et rassurant. Recommandé pour tutoriels, documentaires et cours.',
    tag: 'Populaire',
    previewText: "Bonjour ! Je suis Henri. Une voix masculine posée et claire pour tous vos tutoriels.",
  },
  {
    id: 'fr-FR-EloiseNeural',
    name: 'Éloïse',
    gender: 'Femme',
    shortName: 'Éloïse',
    description: 'Dynamique, jeune et lumineuse. Parfaite pour vlogs et contenus engageants.',
    tag: 'Dynamique',
    previewText: "Bonjour ! Je suis Éloïse. Mon timbre dynamique donnera beaucoup d'énergie à votre projet.",
  },
  {
    id: 'fr-FR-RemyMultilingualNeural',
    name: 'Rémy',
    gender: 'Homme',
    shortName: 'Rémy',
    description: 'Moderne, direct et rythmé. Excellent pour présentations percutantes.',
    tag: 'Moderne',
    previewText: "Bonjour ! Je suis Rémy. Une voix moderne et vivante qui capte immédiatement l'attention.",
  },
  {
    id: 'fr-FR-VivienneMultilingualNeural',
    name: 'Vivienne',
    gender: 'Femme',
    shortName: 'Vivienne',
    description: 'Élégante, fluide et polyvalente. Idéale pour narrations calmes et podcasts.',
    tag: 'Élégante',
    previewText: "Bonjour ! Je suis Vivienne. Une voix raffinée et fluide conçue pour des narrations soignées.",
  },
];

export type AppStep = 1 | 2 | 3 | 4 | 5;

export interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  url: string;
}
