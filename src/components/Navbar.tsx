import {
  Upload,
  Table2,
  Mic,
  Download,
  Clapperboard,
  FolderOpen,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import type { FC } from 'react';

export type AppNavTab = 'step1' | 'table' | 'step2' | 'step3' | 'saved' | 'step4' | 'step5';

interface NavbarProps {
  activeTab: AppNavTab;
  setActiveTab: (tab: AppNavTab) => void;
  totalSubtitles: number;
  totalDurationFormatted: string;
  hasAudioStitched: boolean;
  onOpenResetModal: () => void;
  onOpenNaturalVoicesModal: () => void;
  onOpenTutorModal?: () => void;
}

interface NavStep {
  id: AppNavTab;
  label: string;
  shortLabel: string;
  icon: typeof Upload;
  num: number;
}

const NAV_STEPS: NavStep[] = [
  { id: 'step1', label: 'Importer le fichier', shortLabel: 'Importer', icon: Upload,        num: 1 },
  { id: 'table', label: 'Corriger le texte',   shortLabel: 'Corriger', icon: Table2,         num: 2 },
  { id: 'step2', label: 'Créer la voix',       shortLabel: 'Voix',     icon: Mic,            num: 3 },
  { id: 'step3', label: 'Télécharger l\'audio', shortLabel: 'Audio',   icon: Download,       num: 4 },
  { id: 'step5', label: 'Vidéo finale',        shortLabel: 'Vidéo',    icon: Clapperboard,   num: 5 },
];

export const Navbar: FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  totalSubtitles,
  totalDurationFormatted,
  hasAudioStitched,
  onOpenResetModal,
  onOpenNaturalVoicesModal,
}) => {

  const getStepStatus = (step: NavStep): 'done' | 'active' | 'pending' => {
    if (activeTab === step.id) return 'active';
    switch (step.id) {
      case 'step1': return totalSubtitles > 0 ? 'done' : 'pending';
      case 'table': return totalSubtitles > 0 ? 'done' : 'pending';
      case 'step2': return hasAudioStitched ? 'done' : 'pending';
      case 'step3': return hasAudioStitched ? 'done' : 'pending';
      default: return 'pending';
    }
  };

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-xl sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">

          {/* Logo — simple et propre */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Mic className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-extrabold text-gradient-cyan leading-tight">TransApp</div>
              <div className="text-[10px] text-slate-500 leading-tight">Doublage vidéo simplifié</div>
            </div>
          </div>

          {/* Navigation — étapes numérotées claires */}
          <nav className="flex items-center gap-0.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800/80">
            {NAV_STEPS.map((step) => {
              const status = getStepStatus(step);
              const Icon = step.icon;
              const isActive = status === 'active';
              const isDone = status === 'done';

              return (
                <button
                  key={step.id}
                  id={`nav-${step.id}-btn`}
                  onClick={() => setActiveTab(step.id)}
                  className={`
                    relative flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold
                    transition-all duration-200 cursor-pointer group
                    ${isActive
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                      : isDone
                        ? 'text-emerald-400 hover:bg-emerald-950/40'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }
                  `}
                  title={step.label}
                >
                  {/* Numéro d'étape */}
                  <span className={`
                    w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0
                    ${isActive
                      ? 'bg-slate-950/20 text-white'
                      : isDone
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-700/50 text-slate-400'
                    }
                  `}>
                    {isDone && !isActive ? '✓' : step.num}
                  </span>

                  {/* Icône */}
                  <Icon className="w-3.5 h-3.5 shrink-0" />

                  {/* Libellé — masqué sur mobile */}
                  <span className="hidden lg:inline">{step.shortLabel}</span>

                  {/* Badge de compteur pour "Corriger" */}
                  {step.id === 'table' && totalSubtitles > 0 && (
                    <span className={`
                      px-1.5 rounded-full text-[9px] font-bold
                      ${isActive ? 'bg-slate-950/30 text-white' : 'bg-cyan-950 text-cyan-300 border border-cyan-800/50'}
                    `}>
                      {totalSubtitles}
                    </span>
                  )}

                  {/* Dot "audio prêt" pour Voix */}
                  {step.id === 'step2' && hasAudioStitched && !isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>
              );
            })}

            {/* Séparateur + Sauvegardes */}
            <div className="w-px h-5 bg-slate-700 mx-1" />
            <button
              id="nav-saved-btn"
              onClick={() => setActiveTab('saved')}
              className={`
                flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold
                transition-all cursor-pointer
                ${activeTab === 'saved'
                  ? 'bg-purple-500 text-white shadow-md shadow-purple-500/30'
                  : 'text-purple-300 hover:text-white hover:bg-purple-950/40'
                }
              `}
              title="Mes fichiers sauvegardés"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Mes fichiers</span>
            </button>
          </nav>

          {/* Actions à droite */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              id="nav-natural-voices-btn"
              onClick={onOpenNaturalVoicesModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-300 hover:text-cyan-100 border border-cyan-800/50 transition-all text-xs font-semibold cursor-pointer"
              title="Configurer les voix naturelles"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Voix</span>
            </button>

            <button
              id="nav-reset-project-btn"
              onClick={onOpenResetModal}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 hover:text-rose-100 border border-rose-800/40 transition-all text-xs font-medium cursor-pointer"
              title="Recommencer un nouveau projet"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Nouveau</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barre de progression globale en bas de la navbar */}
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{
            width: `${
              totalSubtitles === 0 ? 5
              : hasAudioStitched ? 90
              : totalSubtitles > 0 && activeTab === 'step2' ? 60
              : totalSubtitles > 0 ? 35
              : 5
            }%`
          }}
        />
      </div>
    </header>
  );
};
