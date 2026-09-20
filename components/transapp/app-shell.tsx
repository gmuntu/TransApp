'use client';

import { useState, useCallback, useMemo } from 'react';
import { Headphones, RotateCcw } from 'lucide-react';
import { SubtitleItem, AppStep } from '@/types/transapp';
import { StepIndicator } from './step-indicator';
import { SrtUpload } from './srt-upload';
import { TranslationPanel } from './translation-panel';
import { ReviewTable } from './review-table';
import { AudioGenerator } from './audio-generator';
import { ExportPanel } from './export-panel';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export function AppShell() {
  const [currentStep, setCurrentStep] = useState<AppStep>(1);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [audioDurationMs, setAudioDurationMs] = useState<number>(0);

  const completedSteps = useMemo(() => {
    const set = new Set<AppStep>();
    if (subtitles.length > 0) set.add(1);
    const hasTranslations = subtitles.some((s: SubtitleItem) => (s?.frText ?? '').trim());
    if (hasTranslations) {
      set.add(2);
      set.add(3);
    }
    if (audioUrl) {
      set.add(4);
      set.add(5);
    }
    return set;
  }, [subtitles, audioUrl]);

  const canNavigate = useCallback((step: AppStep): boolean => {
    if (step === 1) return true;
    if (step === 2) return subtitles.length > 0;
    if (step === 3) return subtitles.some((s: SubtitleItem) => (s?.frText ?? '').trim());
    if (step === 4) return subtitles.some((s: SubtitleItem) => (s?.frText ?? '').trim());
    if (step === 5) return Boolean(audioUrl);
    return false;
  }, [subtitles, audioUrl]);

  const handleSubtitlesLoaded = useCallback((items: SubtitleItem[], name: string) => {
    setSubtitles(items);
    setFileName(name);
    setCurrentStep(2);
  }, []);

  const handleTranslationComplete = useCallback((items: SubtitleItem[]) => {
    setSubtitles(items);
    setCurrentStep(3);
  }, []);

  const handleSubtitlesUpdate = useCallback((items: SubtitleItem[]) => {
    setSubtitles(items);
  }, []);

  const handleAudioGenerated = useCallback((url: string, durationMs: number) => {
    setAudioUrl(url);
    setAudioDurationMs(durationMs);
    setCurrentStep(5);
  }, []);

  const handleReset = useCallback(() => {
    setSubtitles([]);
    setFileName('');
    setAudioUrl('');
    setAudioDurationMs(0);
    setCurrentStep(1);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Headphones className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-display font-bold tracking-tight text-foreground">
                  TransApp
                </h1>
                <p className="text-[10px] text-muted-foreground -mt-0.5">Studio de Doublage SRT</p>
              </div>
            </div>

            {subtitles.length > 0 && (
              <Button onClick={handleReset} variant="ghost" size="sm" className="gap-1.5 text-xs">
                <RotateCcw className="w-3.5 h-3.5" />
                Nouveau projet
              </Button>
            )}
          </div>

          <StepIndicator
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepClick={setCurrentStep}
            canNavigate={canNavigate}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-8">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
        >
          {currentStep === 1 && (
            <SrtUpload onSubtitlesLoaded={handleSubtitlesLoaded} />
          )}
          {currentStep === 2 && (
            <TranslationPanel
              subtitles={subtitles}
              onTranslationComplete={handleTranslationComplete}
              fileName={fileName}
            />
          )}
          {currentStep === 3 && (
            <ReviewTable
              subtitles={subtitles}
              onSubtitlesUpdate={handleSubtitlesUpdate}
            />
          )}
          {currentStep === 4 && (
            <AudioGenerator
              subtitles={subtitles}
              onAudioGenerated={handleAudioGenerated}
            />
          )}
          {currentStep === 5 && (
            <ExportPanel
              subtitles={subtitles}
              audioUrl={audioUrl}
              durationMs={audioDurationMs}
            />
          )}
        </motion.div>

        {/* Navigation buttons */}
        {currentStep > 1 && currentStep < 5 && (
          <div className="max-w-2xl mx-auto flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={() => setCurrentStep((currentStep - 1) as AppStep)}
              className="gap-2"
            >
              ← Étape précédente
            </Button>
            {canNavigate((currentStep + 1) as AppStep) && (
              <Button
                onClick={() => setCurrentStep((currentStep + 1) as AppStep)}
                className="gap-2"
              >
                Étape suivante →
              </Button>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-4">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs text-muted-foreground/50">
            TransApp — Studio de Doublage SRT • Traduction EN→FR + Synthèse vocale neurale
          </p>
        </div>
      </footer>
    </div>
  );
}
