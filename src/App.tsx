import { useState, useMemo } from 'react';
import { Navbar, AppNavTab } from './components/Navbar';
import { Step1TranslationReview } from './components/Step1TranslationReview';
import { SubtitleReviewTable } from './components/SubtitleReviewTable';
import { Step2StitchAndPad } from './components/Step2StitchAndPad';
import { Step3FilmoraIntegration } from './components/Step3FilmoraIntegration';
import { Step4PythonScriptHub } from './components/Step4PythonScriptHub';
import { Step5VideoMuxing } from './components/Step5VideoMuxing';
import { SavedFilesManager } from './components/SavedFilesManager';
import { ResetProjectModal } from './components/ResetProjectModal';
import { NaturalVoicesModal } from './components/NaturalVoicesModal';
import { SubtitleItem } from './types';
import { msToSrtTime, parseSrt } from './utils/timecode';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppNavTab>('step1');
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [projectName, setProjectName] = useState<string>('nouveau_cours');
  const [currentFileName, setCurrentFileName] = useState<string>('nouveau_cours_fr.srt');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [hasAudioStitched, setHasAudioStitched] = useState<boolean>(false);

  // Modals state
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [isVoicesModalOpen, setIsVoicesModalOpen] = useState<boolean>(false);

  // Computed total duration formatted
  const totalDurationFormatted = useMemo(() => {
    if (subtitles.length === 0) return '00:00:00,000';
    const lastSub = subtitles[subtitles.length - 1];
    return msToSrtTime(lastSub.endTimeMs + 2000);
  }, [subtitles]);

  const handleAudioGenerated = (blob: Blob, url: string) => {
    setAudioBlob(blob);
    setAudioUrl(url);
    setHasAudioStitched(true);
  };

  const handleConfirmReset = (options: { mode: 'empty' | 'sample'; newProjectName?: string }) => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setHasAudioStitched(false);
    setSubtitles([]);
    setProjectName(options.newProjectName || 'nouveau_cours');
    setCurrentFileName(`${options.newProjectName || 'nouveau_cours'}_fr.srt`);
    setActiveTab('step1');
  };

  const handleOpenSubtitleInTable = async (filename: string) => {
    try {
      const res = await fetch(`/api/subtitles/load/${encodeURIComponent(filename)}`);
      if (res.ok) {
        const data = await res.json();
        const parsed = parseSrt(data.content || '');
        if (parsed.length > 0) {
          setSubtitles(parsed);
          setCurrentFileName(data.filename);
          setProjectName(data.filename.replace(/\.srt$/i, ''));
          setActiveTab('table');
        }
      }
    } catch (err) {
      console.error('Erreur lors du chargement du fichier sous-titre:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        totalSubtitles={subtitles.length}
        totalDurationFormatted={totalDurationFormatted}
        hasAudioStitched={hasAudioStitched}
        onOpenResetModal={() => setIsResetModalOpen(true)}
        onOpenNaturalVoicesModal={() => setIsVoicesModalOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* GUIDE PAS-À-PAS — Version simplifiée et intuitive */}
        {activeTab !== 'saved' && (
          <div className="animate-fade-in-up">
            {/* En-tête du guide */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <h2 className="text-sm font-bold text-slate-200 tracking-wide uppercase">
                  Votre progression
                </h2>
              </div>
              <div className="text-[11px] font-medium text-emerald-400 bg-emerald-950/60 px-3 py-1.5 rounded-full border border-emerald-800/60">
                🎯 Objectif : Créer le doublage audio de votre vidéo
              </div>
            </div>

            {/* Cartes des 4 étapes principales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Étape 1 — Importer */}
              <button
                type="button"
                onClick={() => setActiveTab('step1')}
                className={`group relative p-4 rounded-2xl border-2 text-left transition-all duration-300 cursor-pointer ${
                  activeTab === 'step1'
                    ? 'bg-cyan-950/40 border-cyan-400 shadow-lg shadow-cyan-500/10 scale-[1.02]'
                    : subtitles.length > 0
                    ? 'bg-emerald-950/20 border-emerald-600/40 hover:border-emerald-400 hover:shadow-md'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-600 hover:shadow-md'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                    subtitles.length > 0 && activeTab !== 'step1'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : activeTab === 'step1'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-slate-700 text-slate-300'
                  }`}>
                    {subtitles.length > 0 && activeTab !== 'step1' ? '✓' : '1'}
                  </span>
                  <span className={`text-sm font-bold ${
                    activeTab === 'step1' ? 'text-cyan-200' : 'text-slate-200'
                  }`}>
                    Importer le fichier
                  </span>
                </div>
                <p className="text-[12px] text-slate-400 leading-relaxed">
                  Déposez votre fichier de sous-titres (.SRT) ici pour commencer.
                </p>
                {subtitles.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="badge-success badge text-[10px]">✓ {subtitles.length} sous-titres chargés</span>
                  </div>
                )}
              </button>

              {/* Étape 2 — Corriger */}
              <button
                type="button"
                onClick={() => setActiveTab('table')}
                className={`group relative p-4 rounded-2xl border-2 text-left transition-all duration-300 cursor-pointer ${
                  activeTab === 'table'
                    ? 'bg-cyan-950/40 border-cyan-400 shadow-lg shadow-cyan-500/10 scale-[1.02]'
                    : subtitles.length > 0
                    ? 'bg-slate-900/60 border-cyan-700/40 hover:border-cyan-400 hover:shadow-md'
                    : 'bg-slate-900/40 border-slate-800/60 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                    activeTab === 'table'
                      ? 'bg-cyan-500 text-white'
                      : subtitles.length > 0
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'bg-slate-700 text-slate-400'
                  }`}>
                    2
                  </span>
                  <span className={`text-sm font-bold ${
                    activeTab === 'table' ? 'text-cyan-200' : 'text-slate-200'
                  }`}>
                    Corriger le texte
                  </span>
                </div>
                <p className="text-[12px] text-slate-400 leading-relaxed">
                  Vérifiez et corrigez la traduction dans un tableau simple.
                </p>
                {subtitles.length > 0 && (
                  <div className="mt-2">
                    <span className="badge-info badge text-[10px]">{subtitles.length} répliques</span>
                  </div>
                )}
              </button>

              {/* Étape 3 — Créer la voix */}
              <button
                type="button"
                onClick={() => subtitles.length > 0 && setActiveTab('step2')}
                disabled={subtitles.length === 0}
                className={`group relative p-4 rounded-2xl border-2 text-left transition-all duration-300 ${
                  subtitles.length === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  activeTab === 'step2'
                    ? 'bg-cyan-950/40 border-cyan-400 shadow-lg shadow-cyan-500/10 scale-[1.02]'
                    : hasAudioStitched
                    ? 'bg-emerald-950/20 border-emerald-600/40 hover:border-emerald-400 hover:shadow-md'
                    : 'bg-slate-900/40 border-slate-800/60 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                    hasAudioStitched && activeTab !== 'step2'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : activeTab === 'step2'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-slate-700 text-slate-400'
                  }`}>
                    {hasAudioStitched && activeTab !== 'step2' ? '✓' : '3'}
                  </span>
                  <span className={`text-sm font-bold ${
                    activeTab === 'step2' ? 'text-cyan-200' : 'text-slate-200'
                  }`}>
                    Créer la voix
                  </span>
                </div>
                <p className="text-[12px] text-slate-400 leading-relaxed">
                  Générez automatiquement une voix française naturelle.
                </p>
                {hasAudioStitched && (
                  <div className="mt-2">
                    <span className="badge-success badge text-[10px]">✓ Audio prêt</span>
                  </div>
                )}
              </button>

              {/* Étape 4 — Télécharger */}
              <button
                type="button"
                onClick={() => (hasAudioStitched || subtitles.length > 0) && setActiveTab('step3')}
                disabled={subtitles.length === 0}
                className={`group relative p-4 rounded-2xl border-2 text-left transition-all duration-300 ${
                  subtitles.length === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  activeTab === 'step3'
                    ? 'bg-emerald-950/40 border-emerald-400 shadow-lg shadow-emerald-500/10 scale-[1.02]'
                    : hasAudioStitched
                    ? 'bg-emerald-950/20 border-emerald-500/40 hover:border-emerald-400 hover:shadow-md'
                    : 'bg-slate-900/40 border-slate-800/60 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                    activeTab === 'step3'
                      ? 'bg-emerald-500 text-white'
                      : hasAudioStitched
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-slate-700 text-slate-400'
                  }`}>
                    4
                  </span>
                  <span className={`text-sm font-bold ${
                    activeTab === 'step3' ? 'text-emerald-200' : 'text-slate-200'
                  }`}>
                    Télécharger l'audio
                  </span>
                </div>
                <p className="text-[12px] text-slate-400 leading-relaxed">
                  Récupérez votre fichier audio pour l'utiliser dans Filmora.
                </p>
                {hasAudioStitched && (
                  <div className="mt-2">
                    <span className="badge-success badge text-[10px] font-black">🎉 PRÊT À TÉLÉCHARGER</span>
                  </div>
                )}
              </button>
            </div>

            {/* Étape bonus — Vidéo finale */}
            <button
              type="button"
              onClick={() => setActiveTab('step5')}
              className={`mt-3 w-full p-4 rounded-2xl border-2 text-left transition-all duration-300 cursor-pointer ${
                activeTab === 'step5'
                  ? 'bg-indigo-950/40 border-indigo-400 shadow-lg shadow-indigo-500/10'
                  : 'bg-slate-900/40 border-slate-800/60 hover:border-indigo-500/40 hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                  activeTab === 'step5' ? 'bg-indigo-500 text-white' : 'bg-indigo-500/20 text-indigo-300'
                }`}>
                  5
                </span>
                <span className={`text-sm font-bold ${
                  activeTab === 'step5' ? 'text-indigo-200' : 'text-slate-200'
                }`}>
                  🎬 Assembler la vidéo finale
                </span>
                <span className="badge-purple badge text-[10px] ml-auto">Optionnel</span>
              </div>
              <p className="text-[12px] text-slate-400 leading-relaxed mt-1.5 ml-10">
                Combinez vidéo + audio doublé + sous-titres en un seul fichier MP4. Pas besoin de Filmora.
              </p>
            </button>
          </div>
        )}

        {activeTab === 'step1' && (
          <Step1TranslationReview
            subtitles={subtitles}
            setSubtitles={setSubtitles}
            projectName={projectName}
            setProjectName={setProjectName}
            onProceedToStep2={() => setActiveTab('step2')}
            onOpenTable={() => setActiveTab('table')}
            onOpenResetModal={() => setIsResetModalOpen(true)}
            onOpenNaturalVoicesModal={() => setIsVoicesModalOpen(true)}
          />
        )}

        {activeTab === 'table' && (
          <SubtitleReviewTable
            subtitles={subtitles}
            setSubtitles={setSubtitles}
            currentFileName={currentFileName}
            setCurrentFileName={setCurrentFileName}
            projectName={projectName}
            setProjectName={setProjectName}
            onProceedToDubbing={() => setActiveTab('step2')}
            onNavigateToImport={() => setActiveTab('step1')}
            onOpenNaturalVoicesModal={() => setIsVoicesModalOpen(true)}
          />
        )}

        {activeTab === 'step2' && (
          <Step2StitchAndPad
            subtitles={subtitles}
            projectName={projectName}
            onProceedToStep3={() => setActiveTab('step3')}
            onAudioGenerated={handleAudioGenerated}
            hasAudioStitched={hasAudioStitched}
            audioUrl={audioUrl}
            onOpenNaturalVoicesModal={() => setIsVoicesModalOpen(true)}
            onNavigateToSaved={() => setActiveTab('saved')}
          />
        )}

        {activeTab === 'step3' && (
          <Step3FilmoraIntegration
            subtitles={subtitles}
            projectName={projectName}
            hasAudioStitched={hasAudioStitched}
            audioUrl={audioUrl}
            onProceedToStep4={() => setActiveTab('saved')}
            onNavigateToStep2={() => setActiveTab('step2')}
            onNavigateToStep1={() => setActiveTab('step1')}
          />
        )}

        {activeTab === 'saved' && (
          <SavedFilesManager 
            onOpenSubtitleInTable={handleOpenSubtitleInTable}
          />
        )}

        {activeTab === 'step5' && (
          <Step5VideoMuxing
            projectName={projectName}
            onNavigateToSaved={() => setActiveTab('saved')}
          />
        )}

        {activeTab === 'step4' && (
          <Step4PythonScriptHub />
        )}
      </main>

      {/* Modale de réinitialisation de projet (Reset) */}
      <ResetProjectModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirmReset={handleConfirmReset}
        onConfirmResetEmpty={() => handleConfirmReset({ mode: 'empty' })}
        onConfirmResetSample={() => handleConfirmReset({ mode: 'empty' })}
        currentSubtitlesCount={subtitles.length}
        currentProjectName={projectName}
      />

      {/* Modale de téléchargement et activation des voix naturelles françaises */}
      <NaturalVoicesModal
        isOpen={isVoicesModalOpen}
        onClose={() => setIsVoicesModalOpen(false)}
      />

      <footer className="border-t border-slate-800/50 bg-slate-950 py-5 mt-12 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <span className="font-bold text-slate-300">TransApp</span>
            <span className="text-slate-700">·</span>
            <span>par <span className="text-cyan-400 font-semibold">Ghislain Muntu</span></span>
          </div>
          <div className="text-[11px] text-slate-500">
            Doublage vidéo intelligent · Voix françaises naturelles
          </div>
        </div>
      </footer>
    </div>
  );
}
