import React from 'react';
import { RotateCcw, AlertTriangle, FilePlus2, Sparkles, X } from 'lucide-react';

interface ResetProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmReset?: (options: { mode: 'empty' | 'sample'; newProjectName?: string }) => void;
  onConfirmResetEmpty?: () => void;
  onConfirmResetSample?: () => void;
  currentSubtitlesCount: number;
  currentProjectName?: string;
}

export const ResetProjectModal: React.FC<ResetProjectModalProps> = ({
  isOpen,
  onClose,
  onConfirmReset,
  onConfirmResetEmpty,
  onConfirmResetSample,
  currentSubtitlesCount,
  currentProjectName = 'projet_en_cours'
}) => {
  if (!isOpen) return null;

  const handleResetEmpty = () => {
    if (typeof onConfirmResetEmpty === 'function') {
      onConfirmResetEmpty();
    } else if (typeof onConfirmReset === 'function') {
      onConfirmReset({ mode: 'empty', newProjectName: 'nouveau_cours_filmora' });
    }
    onClose();
  };

  const handleResetSample = () => {
    if (typeof onConfirmResetSample === 'function') {
      onConfirmResetSample();
    } else if (typeof onConfirmReset === 'function') {
      onConfirmReset({ mode: 'sample', newProjectName: 'week4_cs_concurrency' });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          id="close-reset-modal-btn"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Remettre à zéro & Commencer un nouveau projet
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Projet actuel : <span className="font-mono text-cyan-400 font-semibold">{currentProjectName}</span> ({currentSubtitlesCount} sous-titres).
            </p>
          </div>
        </div>

        {/* Informative Note */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-300 space-y-1.5">
          <p className="font-semibold text-slate-200 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Que souhaitez-vous faire ?</span>
          </p>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            La réinitialisation effacera les sous-titres chargés et la piste audio générée en mémoire afin de repartir sur une base propre pour un nouveau cours.
          </p>
        </div>

        {/* Actions Choice */}
        <div className="space-y-2.5">
          {/* Option 1: Empty New Project */}
          <button
            id="confirm-reset-empty-btn"
            onClick={handleResetEmpty}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-rose-950/40 via-slate-950 to-slate-950 hover:from-rose-900/50 hover:to-slate-900 border border-rose-800/50 hover:border-rose-600 text-left transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover:scale-105 transition-transform">
                <FilePlus2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white group-hover:text-rose-200">
                  Nouveau Projet Vierge (0 sous-titre)
                </div>
                <div className="text-[11px] text-slate-400">
                  Efface tout et ouvre la zone de dépôt pour votre propre fichier .SRT
                </div>
              </div>
            </div>
            <span className="text-xs font-bold text-rose-400 shrink-0">Remettre à zéro →</span>
          </button>

          {/* Option 2: Reset with Demo Sample */}
          <button
            id="confirm-reset-sample-btn"
            onClick={handleResetSample}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/60 text-left transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white group-hover:text-cyan-200">
                  Recharger l'exemple Concurrency (12 sous-titres)
                </div>
                <div className="text-[11px] text-slate-400">
                  Restaure les sous-titres d'exemple de cours d'informatique
                </div>
              </div>
            </div>
            <span className="text-xs font-semibold text-cyan-400 shrink-0">Recharger →</span>
          </button>
        </div>

        {/* Footer Cancel */}
        <div className="flex justify-end pt-2">
          <button
            id="cancel-reset-modal-btn"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
          >
            Annuler (Conserver mon projet)
          </button>
        </div>
      </div>
    </div>
  );
};
