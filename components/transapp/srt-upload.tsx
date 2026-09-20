'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, Clock, Hash, Trash2, Sparkles } from 'lucide-react';
import { SubtitleItem } from '@/types/transapp';
import { parseSrt, formatDuration } from '@/lib/srt-parser';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:04,500
Welcome to this introduction to computer science.

2
00:00:05,000 --> 00:00:09,200
Today we're going to talk about how computers work.

3
00:00:10,000 --> 00:00:14,800
A computer is essentially a machine that processes information.

4
00:00:15,500 --> 00:00:20,000
It takes input, processes it, and produces output.

5
00:00:21,000 --> 00:00:26,500
The central processing unit, or CPU, is the brain of the computer.

6
00:00:27,000 --> 00:00:32,000
It executes instructions stored in memory at incredible speeds.

7
00:00:33,000 --> 00:00:38,500
Random Access Memory, or RAM, is your computer's short-term memory.

8
00:00:39,000 --> 00:00:44,000
It stores data that the CPU needs to access quickly.

9
00:00:45,000 --> 00:00:50,500
The hard drive or SSD provides long-term storage for your files.

10
00:00:51,000 --> 00:00:56,000
Unlike RAM, this storage persists even when the computer is off.
`;

interface SrtUploadProps {
  onSubtitlesLoaded: (items: SubtitleItem[], fileName: string) => void;
}

export function SrtUpload({ onSubtitlesLoaded }: SrtUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    if (!file?.name?.toLowerCase()?.endsWith('.srt')) {
      setError('Veuillez sélectionner un fichier .SRT');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = (e?.target?.result as string) ?? '';
      const items = parseSrt(content);
      if (!items.length) {
        setError('Aucun sous-titre valide trouvé dans le fichier');
        return;
      }
      onSubtitlesLoaded(items, file.name);
    };
    reader.onerror = () => setError('Erreur de lecture du fichier');
    reader.readAsText(file);
  }, [onSubtitlesLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e?.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleSample = useCallback(() => {
    const items = parseSrt(SAMPLE_SRT);
    onSubtitlesLoaded(items, 'exemple_demo.srt');
  }, [onSubtitlesLoaded]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-display font-bold tracking-tight text-foreground">
          Importez votre fichier SRT
        </h2>
        <p className="text-muted-foreground">
          Déposez un fichier de sous-titres en anglais pour commencer le doublage
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef?.current?.click?.()}
        className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? 'border-primary bg-primary/10 scale-[1.02]'
            : 'border-border hover:border-primary/50 hover:bg-muted/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".srt"
          className="hidden"
          onChange={(e) => {
            const file = e?.target?.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <div className="flex flex-col items-center gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
            isDragging ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
          }`}>
            <Upload className="w-8 h-8" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">
              {isDragging ? 'Relâchez pour importer' : 'Glissez-déposez votre fichier .SRT ici'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              ou cliquez pour parcourir vos fichiers
            </p>
          </div>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl p-4 text-sm text-center"
        >
          {error}
        </motion.div>
      )}

      {/* Sample button */}
      <div className="text-center">
        <Button
          variant="outline"
          onClick={handleSample}
          className="gap-2"
        >
          <Sparkles className="w-4 h-4" />
          Charger un exemple de SRT
        </Button>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: FileText, label: 'Format', value: '.SRT (SubRip)' },
          { icon: Hash, label: 'Langue source', value: 'Anglais (EN)' },
          { icon: Clock, label: 'Langue cible', value: 'Français (FR)' },
        ].map((info: any, i: number) => (
          <div key={i} className="bg-card rounded-xl p-4 border border-border/50 text-center">
            <info.icon className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{info.label}</p>
            <p className="text-sm font-semibold text-foreground">{info.value}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
