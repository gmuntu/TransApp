import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  Sparkles, 
  BookOpen, 
  FolderOpen,
  ArrowRight,
  RefreshCw,
  X,
  RotateCcw,
  Volume2,
  Zap
} from 'lucide-react';
import { SubtitleItem } from '../types';
import { parseSrt } from '../utils/timecode';

interface SrtUploadZoneProps {
  projectName: string;
  setProjectName: (name: string) => void;
  subtitlesCount: number;
  totalDurationFormatted: string;
  onSubtitlesLoaded: (items: SubtitleItem[], fileName: string) => void;
  onOpenResetModal?: () => void;
  onOpenNaturalVoicesModal?: () => void;
}

export const SrtUploadZone: React.FC<SrtUploadZoneProps> = ({
  projectName,
  setProjectName,
  subtitlesCount,
  totalDurationFormatted,
  onSubtitlesLoaded,
  onOpenResetModal,
  onOpenNaturalVoicesModal
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setUploadErrorMsg(null);
    if (!file.name.toLowerCase().endsWith('.srt')) {
      setUploadErrorMsg('Veuillez sélectionner un fichier au format .srt valide.');
      setTimeout(() => setUploadErrorMsg(null), 4000);
      return;
    }

    const cleanProjectName = file.name.replace(/\.srt$/i, '');
    setProjectName(cleanProjectName);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const parsed = parseSrt(content);
        if (parsed.length > 0) {
          onSubtitlesLoaded(parsed, cleanProjectName);
          setUploadSuccessMsg(`Fichier "${file.name}" chargé (${parsed.length} sous-titres). Traduction automatique prête.`);
          setTimeout(() => setUploadSuccessMsg(null), 4000);
        } else {
          setUploadErrorMsg('Le fichier .srt semble vide ou corrompu.');
          setTimeout(() => setUploadErrorMsg(null), 4000);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      processFile(file);
    }
  };

  const triggerBrowse = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-3">
      {/* Primary Dropzone - Minimalist & Immediately Obvious */}
      <div
        id="srt-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerBrowse}
        className={`relative group cursor-pointer rounded-2xl border-2 border-dashed p-6 sm:p-8 transition-all duration-200 text-center ${
          isDragging
            ? 'border-cyan-400 bg-cyan-950/40 shadow-xl shadow-cyan-950/60 scale-[1.008]'
            : 'border-slate-700/80 bg-slate-900/60 hover:border-cyan-500/80 hover:bg-slate-900/90'
        }`}
      >
        <input
          ref={fileInputRef}
          id="srt-file-input"
          type="file"
          accept=".srt"
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center max-w-xl mx-auto space-y-3">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${
            isDragging 
              ? 'bg-cyan-500 text-slate-950' 
              : 'bg-slate-800 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-slate-950'
          }`}>
            <UploadCloud className="w-7 h-7" />
          </div>

          <div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
              {isDragging ? 'Déposez votre fichier .SRT ici' : 'Téléverser votre fichier .SRT de cours'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Glissez et déposez votre fichier <span className="text-cyan-400 font-mono">.srt</span> ici, ou <span className="text-cyan-400 underline font-semibold">parcourez vos dossiers</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] font-mono text-slate-400">
            <span className="px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-300">
              Format .SRT UTF-8
            </span>
            <span>•</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Zéro décalage temporel
            </span>
            <span>•</span>
            <span>MacBook Pro M1 (16GB) optimisé</span>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {uploadSuccessMsg && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-950/80 border border-emerald-800/80 text-emerald-200 text-xs font-medium animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{uploadSuccessMsg}</span>
          </div>
          <button 
            onClick={() => setUploadSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-100 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Notification Banner */}
      {uploadErrorMsg && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-200 text-xs font-medium animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <X className="w-4 h-4 text-rose-400" />
            <span>{uploadErrorMsg}</span>
          </div>
          <button 
            onClick={() => setUploadErrorMsg(null)}
            className="text-rose-400 hover:text-rose-100 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Current File Status Pill & Quick Switchers */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800/60 flex items-center justify-center text-cyan-400 font-bold">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white font-mono">
                {subtitlesCount === 0 ? 'Projet Vierge' : `${projectName}.srt`}
              </span>
              {subtitlesCount === 0 ? (
                <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 text-[10px] font-mono font-bold">
                  En attente de .SRT
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-mono font-bold">
                  Actif
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              {subtitlesCount === 0 
                ? '0 sous-titre • Déposez votre fichier .srt ci-dessus pour démarrer' 
                : `${subtitlesCount.toLocaleString()} lignes de sous-titres • Durée totale : ${totalDurationFormatted}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            id="browse-alt-btn"
            onClick={triggerBrowse}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold transition-colors cursor-pointer shadow-sm"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>{subtitlesCount === 0 ? 'Sélectionner un fichier .SRT' : 'Changer de fichier .SRT'}</span>
          </button>

          {subtitlesCount > 0 && onOpenResetModal && (
            <button
              id="open-reset-project-btn"
              onClick={onOpenResetModal}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 text-xs font-medium border border-slate-700 hover:border-rose-800/60 transition-colors cursor-pointer"
              title="Effacer le projet actuel pour commencer un nouveau cours"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>Nouveau Projet</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
