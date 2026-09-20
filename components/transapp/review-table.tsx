'use client';

import { useState, useMemo } from 'react';
import { Edit3, Save, Download, Hash, Clock, Activity } from 'lucide-react';
import { SubtitleItem } from '@/types/transapp';
import { generateSrt, formatDuration } from '@/lib/srt-parser';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface ReviewTableProps {
  subtitles: SubtitleItem[];
  onSubtitlesUpdate: (items: SubtitleItem[]) => void;
}

export function ReviewTable({ subtitles, onSubtitlesUpdate }: ReviewTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const stats = useMemo(() => {
    const items = subtitles ?? [];
    const count = items.length;
    const lastItem = items[items.length - 1];
    const totalMs = lastItem?.endTimeMs ?? 0;
    const totalWords = items.reduce((sum: number, s: SubtitleItem) => {
      return sum + ((s?.frText ?? '').split(/\s+/).filter(Boolean).length);
    }, 0);
    const totalMinutes = totalMs / 60000;
    const wpm = totalMinutes > 0 ? Math.round(totalWords / totalMinutes) : 0;
    return { count, totalMs, totalWords, wpm };
  }, [subtitles]);

  const startEdit = (item: SubtitleItem) => {
    setEditingId(item?.id ?? null);
    setEditText(item?.frText ?? '');
  };

  const saveEdit = (id: number) => {
    const updated = (subtitles ?? []).map((s: SubtitleItem) =>
      s?.id === id ? { ...(s ?? {}), frText: editText } : s
    );
    onSubtitlesUpdate(updated as SubtitleItem[]);
    setEditingId(null);
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
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight text-foreground">
            Révision des traductions
          </h2>
          <p className="text-muted-foreground text-sm">
            Vérifiez et corrigez les traductions avant la génération audio
          </p>
        </div>
        <Button onClick={downloadSrt} variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Télécharger SRT FR
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: Hash, label: 'Sous-titres', value: stats.count },
          { icon: Clock, label: 'Durée totale', value: formatDuration(stats.totalMs) },
          { icon: Edit3, label: 'Mots FR', value: stats.totalWords },
          { icon: Activity, label: 'Débit moyen', value: `${stats.wpm} mots/min` },
        ].map((stat: any, i: number) => (
          <div key={i} className="bg-card rounded-xl p-3 border border-border/50 text-center">
            <stat.icon className="w-4 h-4 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-sm font-mono font-semibold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground w-12">#</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground w-32">Timecode</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Texte anglais</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Texte français</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground w-20">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {(subtitles ?? []).map((item: SubtitleItem, idx: number) => (
                <tr key={item?.id ?? idx} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item?.index ?? 0}</td>
                  <td className="px-3 py-2 font-mono text-xs text-primary/80">
                    {item?.startTimeStr ?? ''}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{item?.enText ?? ''}</td>
                  <td className="px-3 py-2">
                    {editingId === item?.id ? (
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e?.target?.value ?? '')}
                        className="w-full bg-muted/50 border border-primary/40 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                        rows={2}
                        autoFocus
                      />
                    ) : (
                      <span className="text-xs text-foreground">{item?.frText ?? ''}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {editingId === item?.id ? (
                      <Button size="sm" variant="ghost" onClick={() => saveEdit(item?.id ?? 0)} className="h-7 w-7 p-0">
                        <Save className="w-3.5 h-3.5 text-accent" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => startEdit(item)} className="h-7 w-7 p-0">
                        <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
