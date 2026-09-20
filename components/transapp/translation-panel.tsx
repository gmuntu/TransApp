'use client';

import { useState, useCallback } from 'react';
import { Languages, Zap, Play, Loader2, CheckCircle2 } from 'lucide-react';
import { SubtitleItem } from '@/types/transapp';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';

interface TranslationPanelProps {
  subtitles: SubtitleItem[];
  onTranslationComplete: (items: SubtitleItem[]) => void;
  fileName: string;
}

export function TranslationPanel({ subtitles, onTranslationComplete, fileName }: TranslationPanelProps) {
  const [method, setMethod] = useState<'google' | 'gemini'>('google');
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleTranslate = useCallback(async () => {
    setIsTranslating(true);
    setError(null);
    setProgress(0);
    setStatusMsg('Préparation de la traduction...');

    try {
      const items = (subtitles ?? []).map((s: SubtitleItem) => ({
        index: s?.index ?? 0,
        text: s?.enText ?? '',
      }));

      const endpoint = method === 'gemini' ? '/api/translate-gemini' : '/api/translate';
      
      // Split into visual progress chunks
      const CHUNK_SIZE = method === 'gemini' ? 20 : 6;
      const totalChunks = Math.ceil(items.length / CHUNK_SIZE);
      const allResults: { index: number; frText: string }[] = [];

      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
        setStatusMsg(`Traduction en cours... (lot ${chunkNum}/${totalChunks})`);
        setProgress(Math.round((i / items.length) * 100));

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: chunk }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error ?? `Erreur HTTP ${res.status}`);
        }

        const data = await res.json();
        const results = data?.results ?? [];
        allResults.push(...results);
      }

      // Merge translations
      const resultMap = new Map<number, string>();
      for (const r of allResults) {
        resultMap.set(r?.index ?? 0, r?.frText ?? '');
      }

      const updated = subtitles.map((s: SubtitleItem) => ({
        ...(s ?? {}),
        frText: resultMap.get(s?.index ?? 0) ?? s?.enText ?? '',
      }));

      setProgress(100);
      setStatusMsg('Traduction terminée !');
      onTranslationComplete(updated as SubtitleItem[]);
    } catch (err: any) {
      console.error('Translation error:', err);
      setError(err?.message ?? 'Erreur de traduction');
    } finally {
      setIsTranslating(false);
    }
  }, [subtitles, method, onTranslationComplete]);

  const translatedCount = (subtitles ?? []).filter((s: SubtitleItem) => (s?.frText ?? '').trim()).length;
  const isAlreadyTranslated = translatedCount === subtitles.length && subtitles.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-display font-bold tracking-tight text-foreground">
          Traduction EN → FR
        </h2>
        <p className="text-muted-foreground">
          {subtitles.length} sous-titres à traduire depuis <span className="text-foreground font-mono text-sm">{fileName}</span>
        </p>
      </div>

      {/* Method selection */}
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setMethod('google')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            method === 'google'
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-primary/30 bg-card'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <Languages className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Google Translate</span>
          </div>
          <p className="text-xs text-muted-foreground">Traduction rapide et gratuite. Bonne qualité générale.</p>
        </button>

        <button
          type="button"
          onClick={() => setMethod('gemini')}
          className={`p-4 rounded-xl border-2 text-left transition-all ${
            method === 'gemini'
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-primary/30 bg-card'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-5 h-5 text-accent" />
            <span className="font-semibold text-foreground">Gemini IA</span>
          </div>
          <p className="text-xs text-muted-foreground">Traduction contextuelle optimisée pour le doublage vidéo.</p>
        </button>
      </div>

      {/* Translate button */}
      <div className="text-center">
        <Button
          onClick={handleTranslate}
          disabled={isTranslating}
          size="lg"
          className="gap-2 px-8"
        >
          {isTranslating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Traduction en cours...
            </>
          ) : isAlreadyTranslated ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              Retraduire
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              Lancer la traduction
            </>
          )}
        </Button>
      </div>

      {/* Progress */}
      {isTranslating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-3"
        >
          <Progress value={progress} className="h-2" />
          <p className="text-center text-sm text-muted-foreground">{statusMsg}</p>
        </motion.div>
      )}

      {/* Already translated notice */}
      {isAlreadyTranslated && !isTranslating && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 text-center">
          <CheckCircle2 className="w-6 h-6 text-accent mx-auto mb-2" />
          <p className="text-sm text-accent">
            {translatedCount} sous-titres traduits. Passez à l'étape suivante pour réviser.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl p-4 text-sm text-center">
          {error}
        </div>
      )}
    </motion.div>
  );
}
