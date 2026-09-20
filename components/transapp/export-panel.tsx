'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, FileAudio, FileText, Film, Play, Pause, CheckCircle2, Volume2 } from 'lucide-react';
import { SubtitleItem } from '@/types/transapp';
import { generateSrt, formatDuration } from '@/lib/srt-parser';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface ExportPanelProps {
  subtitles: SubtitleItem[];
  audioUrl: string;
  durationMs: number;
}

export function ExportPanel({ subtitles, audioUrl, durationMs }: ExportPanelProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioUrl) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    return () => {
      audioRef?.current?.pause?.();
      audioRef.current = null;
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  };

  const downloadAudio = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = 'doublage_master_fr.wav';
    a.click();
  };

  const downloadSrt = () => {
    const content = generateSrt(subtitles, true);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sous-titres_fr.srt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div className="text-center space-y-2">
        <CheckCircle2 className="w-12 h-12 text-accent mx-auto" />
        <h2 className="text-2xl font-display font-bold tracking-tight text-foreground">
          Doublage prêt !
        </h2>
        <p className="text-muted-foreground">
          Votre audio master est généré. Téléchargez-le et importez-le dans Filmora.
        </p>
      </div>

      {/* Audio preview */}
      <div className="bg-card rounded-xl border border-border/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Aperçu audio</p>
              <p className="text-xs text-muted-foreground font-mono">{formatDuration(durationMs)} • WAV 44100Hz Stéréo</p>
            </div>
          </div>
          <Button onClick={togglePlay} variant="outline" size="sm" className="gap-2">
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlaying ? 'Pause' : 'Écouter'}
          </Button>
        </div>

        {/* Native audio element fallback */}
        {audioUrl && (
          <audio controls src={audioUrl} className="w-full rounded-lg" preload="none">
            Votre navigateur ne supporte pas l'élément audio.
          </audio>
        )}
      </div>

      {/* Download buttons */}
      <div className="grid grid-cols-2 gap-4">
        <Button onClick={downloadAudio} size="lg" className="gap-2 h-14">
          <FileAudio className="w-5 h-5" />
          <div className="text-left">
            <p className="font-semibold">Audio Master WAV</p>
            <p className="text-xs opacity-70">44100Hz Stéréo</p>
          </div>
        </Button>

        <Button onClick={downloadSrt} variant="secondary" size="lg" className="gap-2 h-14">
          <FileText className="w-5 h-5" />
          <div className="text-left">
            <p className="font-semibold">Sous-titres FR</p>
            <p className="text-xs opacity-70">Format .SRT</p>
          </div>
        </Button>
      </div>

      {/* Filmora instructions */}
      <div className="bg-card rounded-xl border border-accent/30 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Film className="w-6 h-6 text-accent" />
          <h3 className="font-display font-bold text-foreground">Instructions pour Filmora</h3>
        </div>
        <ol className="space-y-3 text-sm text-muted-foreground">
          {[
            'Ouvrez votre projet dans Filmora et importez le fichier WAV comme nouveau média.',
            'Glissez le WAV sur une nouvelle piste audio dans la timeline.',
            'Désactivez ou supprimez la piste audio originale en anglais (clic droit → Désactiver).',
            'Calez le début du WAV exactement à 00:00:00 sur la timeline.',
            'Optionnel : importez le fichier SRT français pour ajouter les sous-titres.',
          ].map((instruction: string, i: number) => (
            <li key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-accent/15 text-accent flex items-center justify-center text-xs font-bold">
                {i + 1}
              </span>
              <span>{instruction}</span>
            </li>
          ))}
        </ol>
      </div>
    </motion.div>
  );
}
