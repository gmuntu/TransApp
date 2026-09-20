'use client';

import { useState, useCallback, useRef } from 'react';
import { Volume2, Play, Loader2, Mic, User } from 'lucide-react';
import { SubtitleItem, VoiceOption, FRENCH_VOICES, GenerationProgress } from '@/types/transapp';
import { generateSrt } from '@/lib/srt-parser';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';

interface AudioGeneratorProps {
  subtitles: SubtitleItem[];
  onAudioGenerated: (audioUrl: string, durationMs: number) => void;
}

export function AudioGenerator({ subtitles, onAudioGenerated }: AudioGeneratorProps) {
  const [selectedVoice, setSelectedVoice] = useState<string>('fr-FR-DeniseNeural');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setStatusMsg('Démarrage de la génération...');

    abortRef.current = new AbortController();

    try {
      const subData = (subtitles ?? []).map((s: SubtitleItem) => ({
        index: s?.index ?? 0,
        startTimeMs: s?.startTimeMs ?? 0,
        endTimeMs: s?.endTimeMs ?? 0,
        frText: s?.frText ?? '',
      }));

      const srtContent = generateSrt(subtitles, true);

      const response = await fetch('/api/generate-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtitles: subData,
          voice: selectedVoice,
          projectName: 'transapp_project',
          srtContent,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Erreur serveur: ${response.status}`);
      }

      const reader = response?.body?.getReader();
      if (!reader) throw new Error('Impossible de lire la réponse');

      const decoder = new TextDecoder();
      let partialRead = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        partialRead += decoder.decode(value, { stream: true });
        const lines = partialRead.split('\n');
        partialRead = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data: GenerationProgress = JSON.parse(dataStr);

              if (data?.type === 'progress') {
                const current = data?.current ?? 0;
                const total = data?.total ?? 1;
                const pct = data?.step === 'tts'
                  ? Math.round((current / total) * 80)
                  : 80 + Math.round((current / total) * 15);
                setProgress(Math.min(pct, 95));
                setStatusMsg(data?.message ?? 'Traitement...');
              } else if (data?.type === 'heartbeat') {
                setStatusMsg(data?.message ?? 'Traitement en cours...');
              } else if (data?.type === 'complete') {
                setProgress(100);
                setStatusMsg(data?.message ?? 'Terminé !');
                onAudioGenerated(data?.audioUrl ?? '', data?.durationMs ?? 0);
                return;
              } else if (data?.type === 'error') {
                throw new Error(data?.message ?? 'Erreur de génération');
              }
            } catch (parseErr: any) {
              if (parseErr?.message && !parseErr.message.includes('JSON')) {
                throw parseErr;
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Generation error:', err);
        setError(err?.message ?? 'Erreur de génération audio');
      }
    } finally {
      setIsGenerating(false);
    }
  }, [subtitles, selectedVoice, onAudioGenerated]);

  const handleCancel = () => {
    abortRef?.current?.abort?.();
    setIsGenerating(false);
    setStatusMsg('Annulé');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-display font-bold tracking-tight text-foreground">
          Génération du doublage audio
        </h2>
        <p className="text-muted-foreground">
          Choisissez une voix française et générez l'audio master
        </p>
      </div>

      {/* Voice selection */}
      <div className="grid grid-cols-2 gap-3">
        {FRENCH_VOICES.map((voice: VoiceOption) => (
          <button
            key={voice.id}
            type="button"
            onClick={() => setSelectedVoice(voice.id)}
            disabled={isGenerating}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              selectedVoice === voice.id
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/30 bg-card'
            } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                voice.gender === 'Femme' ? 'bg-pink-500/15 text-pink-400' : 'bg-blue-500/15 text-blue-400'
              }`}>
                {voice.gender === 'Femme' ? <Mic className="w-5 h-5" /> : <User className="w-5 h-5" />}
              </div>
              <div>
                <p className="font-semibold text-foreground">{voice.name}</p>
                <p className="text-xs text-muted-foreground">{voice.gender} • Neural FR</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Generate / Cancel */}
      <div className="flex justify-center gap-4">
        {isGenerating ? (
          <Button onClick={handleCancel} variant="destructive" size="lg" className="gap-2 px-8">
            Annuler
          </Button>
        ) : (
          <Button onClick={handleGenerate} size="lg" className="gap-2 px-8">
            <Volume2 className="w-5 h-5" />
            Générer l'audio master
          </Button>
        )}
      </div>

      {/* Progress */}
      {isGenerating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-3"
        >
          <Progress value={progress} className="h-3" />
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{statusMsg}</p>
          </div>
          <p className="text-center text-xs text-muted-foreground/60">
            La génération peut prendre quelques minutes selon le nombre de sous-titres
          </p>
        </motion.div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl p-4 text-sm text-center">
          {error}
        </div>
      )}

      {/* Info */}
      <div className="bg-card rounded-xl border border-border/50 p-4 space-y-2">
        <p className="text-xs text-muted-foreground font-semibold">Paramètres de sortie :</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <p className="text-muted-foreground">Format</p>
            <p className="font-mono font-semibold text-foreground">WAV</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <p className="text-muted-foreground">Échantillonnage</p>
            <p className="font-mono font-semibold text-foreground">44100 Hz</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <p className="text-muted-foreground">Canaux</p>
            <p className="font-mono font-semibold text-foreground">Stéréo</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
