import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  FileText, 
  Search, 
  Sparkles, 
  CheckCircle, 
  Play, 
  Pause,
  RefreshCw, 
  BookOpen, 
  Download,
  AlertTriangle,
  Loader2,
  Wand2,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  Save,
  Check,
  RotateCcw,
  Volume2,
  Sliders,
  ExternalLink,
  Edit3,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { SubtitleItem } from '../types';
import { countWords, calculateTargetRate, formatSrt, parseSrt } from '../utils/timecode';
import { CS_GLOSSARY } from '../data/csGlossary';
import { playBrowserTtsPreview, stopBrowserTts } from '../utils/audioSynthesizer';
import { translateSingleSegment } from '../utils/translator';

export interface LocalSrtFile {
  name: string;
  filename: string;
  location: 'sauvegarder' | 'projet' | 'parent';
  size: number;
  sizeFormatted: string;
  modifiedAt: string;
}

interface SubtitleReviewTableProps {
  subtitles: SubtitleItem[];
  setSubtitles: React.Dispatch<React.SetStateAction<SubtitleItem[]>>;
  currentFileName: string;
  setCurrentFileName: (name: string) => void;
  projectName?: string;
  setProjectName?: (name: string) => void;
  onProceedToDubbing?: () => void;
  onNavigateToImport?: () => void;
  onOpenNaturalVoicesModal?: () => void;
}

export const SubtitleReviewTable: React.FC<SubtitleReviewTableProps> = ({
  subtitles,
  setSubtitles,
  currentFileName,
  setCurrentFileName,
  projectName,
  setProjectName,
  onProceedToDubbing,
  onNavigateToImport,
  onOpenNaturalVoicesModal
}) => {
  // Search and Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPacing, setFilterPacing] = useState<'all' | 'optimal' | 'accelerated' | 'critical' | 'untranslated' | 'edited'>('all');
  const [activeView, setActiveView] = useState<'grid' | 'raw'>('grid');
  const [rawSrtText, setRawSrtText] = useState('');

  // Local files on disk
  const [availableFiles, setAvailableFiles] = useState<LocalSrtFile[]>([]);
  const [isLoadingFilesList, setIsLoadingFilesList] = useState(false);
  const [isLoadingFileContent, setIsLoadingFileContent] = useState(false);

  // Real-time Save status
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
  const saveDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDirtyRef = useRef(false);

  // Audio preview & translation states
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [rowTranslatingId, setRowTranslatingId] = useState<number | null>(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'info' | 'success' | 'warning' } | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(100);
  const [pageInput, setPageInput] = useState<string>('1');

  const showToast = (text: string, type: 'info' | 'success' | 'warning' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Fetch available .SRT files from backend on mount
  const fetchAvailableFiles = useCallback(async () => {
    setIsLoadingFilesList(true);
    try {
      const res = await fetch('/api/subtitles/list');
      if (res.ok) {
        const data = await res.json();
        const files: LocalSrtFile[] = data.files || [];
        setAvailableFiles(files);

        // Auto-select latest file if currentFileName is empty or default
        if (files.length > 0 && (!currentFileName || currentFileName === 'nouveau_cours.srt')) {
          const defaultCandidate = files[0];
          setCurrentFileName(defaultCandidate.name);
        }
      }
    } catch (err) {
      console.error('Erreur lors de la récupération des fichiers .srt:', err);
    } finally {
      setIsLoadingFilesList(false);
    }
  }, [currentFileName, setCurrentFileName]);

  useEffect(() => {
    fetchAvailableFiles();
  }, [fetchAvailableFiles]);

  // 2. Load a specific file from disk
  const handleLoadFile = async (filename: string) => {
    if (!filename) return;
    setIsLoadingFileContent(true);
    try {
      const res = await fetch(`/api/subtitles/load/${encodeURIComponent(filename)}`);
      if (res.ok) {
        const data = await res.json();
        const rawContent = data.content || '';
        const parsed = parseSrt(rawContent);

        if (parsed.length > 0) {
          setSubtitles(parsed);
          setCurrentFileName(data.filename);
          if (setProjectName) {
            setProjectName(data.filename.replace(/\.srt$/i, ''));
          }
          setLastSavedTime(new Date().toLocaleTimeString('fr-FR'));
          setSavedFilePath(`sauvegarder/${data.filename}`);
          setSaveStatus('saved');
          showToast(`Fichier "${data.filename}" chargé (${parsed.length} répliques).`);
        } else {
          showToast('Le fichier sélectionné est vide ou non valide.', 'warning');
        }
      } else {
        const err = await res.json();
        showToast(err?.error || 'Erreur lors du chargement', 'warning');
      }
    } catch (err) {
      showToast('Impossible de lire le fichier sur le serveur.', 'warning');
    } finally {
      setIsLoadingFileContent(false);
    }
  };

  // 3. Real-time auto-save implementation (debounced)
  const performSaveToDisk = useCallback(async (currentSubs: SubtitleItem[], targetName: string) => {
    if (currentSubs.length === 0) return;

    setSaveStatus('saving');
    try {
      const srtContent = formatSrt(currentSubs, true);
      const safeName = targetName.endsWith('.srt') ? targetName : `${targetName}.srt`;

      const res = await fetch('/api/subtitles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: safeName,
          content: srtContent
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSaveStatus('saved');
        setLastSavedTime(data.savedAt || new Date().toLocaleTimeString('fr-FR'));
        setSavedFilePath(`sauvegarder/${data.filename}`);
        isDirtyRef.current = false;
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('Erreur sauvegarde temps réel .srt:', err);
      setSaveStatus('error');
    }
  }, []);

  // Trigger debounced save
  const scheduleDebouncedSave = useCallback((newSubs: SubtitleItem[]) => {
    isDirtyRef.current = true;
    setSaveStatus('saving');
    if (saveDebounceTimerRef.current) {
      clearTimeout(saveDebounceTimerRef.current);
    }
    const targetFile = currentFileName || `${(projectName || 'cours').replace(/[^a-zA-Z0-9_-]/g, '_')}_fr.srt`;
    saveDebounceTimerRef.current = setTimeout(() => {
      performSaveToDisk(newSubs, targetFile);
    }, 500);
  }, [currentFileName, projectName, performSaveToDisk]);

  // Immediate save trigger (e.g. on blur or manual click)
  const handleImmediateSave = () => {
    if (saveDebounceTimerRef.current) {
      clearTimeout(saveDebounceTimerRef.current);
    }
    const targetFile = currentFileName || `${(projectName || 'cours').replace(/[^a-zA-Z0-9_-]/g, '_')}_fr.srt`;
    performSaveToDisk(subtitles, targetFile);
    showToast(`Sauvegardé dans sauvegarder/${targetFile} !`);
  };

  // Handle cell text change with live pace & autosave
  const handleFrenchTextChange = (id: number, newText: string) => {
    setSubtitles(prev => {
      const updated = prev.map(item => {
        if (item.id === id) {
          const words = countWords(newText);
          const rateInfo = calculateTargetRate(words, item.durationMs, 175);
          return {
            ...item,
            frText: newText,
            wordCountFr: words,
            calculatedRateWpm: rateInfo.targetRateWpm,
            rateMultiplier: rateInfo.rateMultiplier,
            pacingCategory: rateInfo.pacingCategory,
            isEdited: true
          };
        }
        return item;
      });

      scheduleDebouncedSave(updated);
      return updated;
    });
  };

  // Translate a single row on demand
  const handleTranslateSingleRow = async (id: number) => {
    const item = subtitles.find(s => s.id === id);
    if (!item || rowTranslatingId !== null) return;

    setRowTranslatingId(id);
    try {
      const fr = await translateSingleSegment(item.enText);
      handleFrenchTextChange(id, fr);
      showToast(`Ligne #${item.index} traduite et synchronisée.`);
    } catch (err) {
      console.error(`Erreur traduction ligne ${id}:`, err);
    } finally {
      setRowTranslatingId(null);
    }
  };

  // Audio TTS Preview
  const handlePreviewTts = (item: SubtitleItem) => {
    if (playingId === item.id) {
      stopBrowserTts();
      setPlayingId(null);
      return;
    }
    setPlayingId(item.id);
    playBrowserTtsPreview(item.frText, item.calculatedRateWpm, () => {
      setPlayingId(null);
    });
  };

  // Apply glossary replacement
  const applyGlossaryReplacement = (enTerm: string, frTerm: string) => {
    setSubtitles(prev => {
      let replacedCount = 0;
      const updated = prev.map(item => {
        const regex = new RegExp(`\\b${enTerm}\\b`, 'gi');
        if (regex.test(item.frText)) {
          replacedCount++;
          const newFr = item.frText.replace(regex, frTerm);
          const words = countWords(newFr);
          const rateInfo = calculateTargetRate(words, item.durationMs, 175);
          return {
            ...item,
            frText: newFr,
            wordCountFr: words,
            calculatedRateWpm: rateInfo.targetRateWpm,
            rateMultiplier: rateInfo.rateMultiplier,
            pacingCategory: rateInfo.pacingCategory,
            isEdited: true
          };
        }
        return item;
      });

      if (replacedCount > 0) {
        scheduleDebouncedSave(updated);
        showToast(`${replacedCount} occurrence(s) de "${enTerm}" remplacée(s) par "${frTerm}".`);
      } else {
        showToast(`Aucune occurrence de "${enTerm}" trouvée.`, 'info');
      }
      return updated;
    });
  };

  // Load sample subtitles
  const handleLoadSample = () => {
    const sample: SubtitleItem[] = [
      { id: 1, index: 1, startTimeMs: 1000, endTimeMs: 4500, startTimeStr: '00:00:01,000', endTimeStr: '00:00:04,500', durationMs: 3500, enText: 'Welcome back everyone to our advanced computer science lecture on operating systems.', frText: "Bienvenue à tous à notre cours avancé d'informatique sur les systèmes d'exploitation.", wordCountFr: 12, calculatedRateWpm: 154, rateMultiplier: 0.88, pacingCategory: 'optimal' },
      { id: 2, index: 2, startTimeMs: 5200, endTimeMs: 9000, startTimeStr: '00:00:05,200', endTimeStr: '00:00:09,000', durationMs: 3800, enText: 'Today, we are diving deep into multithreading, mutex locks, and memory hierarchy.', frText: "Aujourd'hui, nous plongeons au cœur du multithreading, des verrous mutex et de la hiérarchie de mémoire.", wordCountFr: 15, calculatedRateWpm: 180, rateMultiplier: 1.03, pacingCategory: 'optimal' },
      { id: 3, index: 3, startTimeMs: 9800, endTimeMs: 13600, startTimeStr: '00:00:09,800', endTimeStr: '00:00:13,600', durationMs: 3800, enText: 'Notice how the garbage collector traverses the heap to reclaim unused objects.', frText: "Remarquez comment le garbage collector parcourt le tas (heap) pour récupérer les objets inutilisés.", wordCountFr: 14, calculatedRateWpm: 175, rateMultiplier: 1.00, pacingCategory: 'optimal' },
      { id: 4, index: 4, startTimeMs: 14200, endTimeMs: 17500, startTimeStr: '00:00:14,200', endTimeStr: '00:00:17,500', durationMs: 3300, enText: 'Always avoid race conditions when multiple threads share mutable state.', frText: "Évitez toujours les situations de compétition (race conditions) quand plusieurs threads partagent un état modifiable.", wordCountFr: 14, calculatedRateWpm: 210, rateMultiplier: 1.20, pacingCategory: 'accelerated' },
      { id: 5, index: 5, startTimeMs: 18100, endTimeMs: 21500, startTimeStr: '00:00:18,100', endTimeStr: '00:00:21,500', durationMs: 3400, enText: 'In next week session, we will optimize our asynchronous pipeline throughput.', frText: "Dans la session de la semaine prochaine, nous optimiserons le débit de notre pipeline asynchrone.", wordCountFr: 14, calculatedRateWpm: 195, rateMultiplier: 1.11, pacingCategory: 'accelerated' }
    ];
    setSubtitles(sample);
    const sampleName = 'cours_informatique_sample_fr.srt';
    setCurrentFileName(sampleName);
    if (setProjectName) setProjectName('cours_informatique_sample');
    scheduleDebouncedSave(sample);
    showToast('Exemple de cours chargé et sauvegardé.');
  };

  // Export SRT download
  const handleDownloadSrt = () => {
    const srtContent = formatSrt(subtitles, true);
    const safeName = currentFileName || `${projectName || 'cours'}_fr.srt`;
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Téléchargement de "${safeName}" démarré.`);
  };

  // Raw SRT sync
  useEffect(() => {
    if (activeView === 'raw') {
      setRawSrtText(formatSrt(subtitles, true));
    }
  }, [activeView, subtitles]);

  const handleRawSrtApply = () => {
    try {
      const parsed = parseSrt(rawSrtText);
      if (parsed.length > 0) {
        setSubtitles(parsed);
        scheduleDebouncedSave(parsed);
        setActiveView('grid');
        showToast(`${parsed.length} sous-titres actualisés depuis le texte brut.`);
      } else {
        showToast('Format SRT non reconnu.', 'warning');
      }
    } catch {
      showToast('Erreur lors de l\'analyse du texte SRT.', 'warning');
    }
  };

  // Filtered Subtitles
  const filteredSubtitles = useMemo(() => {
    return subtitles.filter(item => {
      const isUntranslated = item.frText.trim().toLowerCase() === item.enText.trim().toLowerCase();
      const matchesSearch = 
        !searchQuery || 
        item.enText.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.frText.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.index.toString().includes(searchQuery);

      let matchesFilter = true;
      if (filterPacing === 'optimal') matchesFilter = item.pacingCategory === 'optimal' || item.pacingCategory === 'relaxed';
      else if (filterPacing === 'accelerated') matchesFilter = item.pacingCategory === 'accelerated';
      else if (filterPacing === 'critical') matchesFilter = item.pacingCategory === 'critical';
      else if (filterPacing === 'untranslated') matchesFilter = isUntranslated;
      else if (filterPacing === 'edited') matchesFilter = Boolean(item.isEdited);

      return matchesSearch && matchesFilter;
    });
  }, [subtitles, searchQuery, filterPacing]);

  // Reset page when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
    setPageInput('1');
  }, [searchQuery, filterPacing]);

  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filteredSubtitles.length / (pageSize as number)));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedSubtitles = useMemo(() => {
    if (pageSize === 'all') return filteredSubtitles;
    const start = (validCurrentPage - 1) * (pageSize as number);
    return filteredSubtitles.slice(start, start + (pageSize as number));
  }, [filteredSubtitles, validCurrentPage, pageSize]);

  const handlePageChange = (newPage: number) => {
    const clamped = Math.min(Math.max(1, newPage), totalPages);
    setCurrentPage(clamped);
    setPageInput(clamped.toString());
  };

  const handlePageInputSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!isNaN(parsed)) handlePageChange(parsed);
    else setPageInput(validCurrentPage.toString());
  };

  // Pacing statistics
  const stats = useMemo(() => {
    const total = subtitles.length;
    const untranslated = subtitles.filter(s => s.frText.trim().toLowerCase() === s.enText.trim().toLowerCase()).length;
    const accelerated = subtitles.filter(s => s.pacingCategory === 'accelerated').length;
    const critical = subtitles.filter(s => s.pacingCategory === 'critical').length;
    const edited = subtitles.filter(s => s.isEdited).length;
    return { total, untranslated, accelerated, critical, edited };
  }, [subtitles]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* 1. BARRE SUPÉRIEURE : SÉLECTEUR DE FICHIER LOCAL & SYNCHRO TEMPS RÉEL */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          {/* Sélection du fichier actif */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <FileText className="w-5 h-5" />
              </span>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                  Fichier SRT Actif (Local)
                </span>
                <div className="flex items-center gap-2">
                  <select
                    id="srt-file-selector"
                    value={currentFileName || ''}
                    onChange={(e) => handleLoadFile(e.target.value)}
                    disabled={isLoadingFileContent}
                    className="bg-slate-950 border border-slate-700/80 text-white font-mono text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-cyan-500 font-bold max-w-xs sm:max-w-md truncate"
                  >
                    {availableFiles.length === 0 ? (
                      <option value="">(Aucun fichier détecté)</option>
                    ) : (
                      availableFiles.map((file) => (
                        <option key={file.filename} value={file.filename}>
                          {file.name} ({file.sizeFormatted}) — [{file.location}]
                        </option>
                      ))
                    )}
                  </select>

                  <button
                    type="button"
                    onClick={fetchAvailableFiles}
                    disabled={isLoadingFilesList}
                    title="Actualiser la liste des fichiers sur le disque"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFilesList ? 'animate-spin text-cyan-400' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Boutons d'action rapides Fichier */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
              <button
                type="button"
                onClick={handleImmediateSave}
                disabled={subtitles.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer shadow-sm"
                title="Forcer la sauvegarde sur le disque local"
              >
                <Save className="w-3.5 h-3.5 text-cyan-400" />
                <span>Enregistrer</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadSrt}
                disabled={subtitles.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer shadow-sm"
                title="Télécharger sur votre machine (Downloads)"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Télécharger .SRT</span>
              </button>

              {onNavigateToImport && (
                <button
                  type="button"
                  onClick={onNavigateToImport}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs border border-slate-800 transition-colors cursor-pointer"
                  title="Téléverser un nouveau cours"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Importer autre</span>
                </button>
              )}
            </div>
          </div>

          {/* Indicateur de Sauvegarde en Temps Réel & Passer à l'Étape 2 */}
          <div className="flex items-center gap-3 self-end lg:self-auto">
            {/* Statut de synchronisation locale */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 font-mono text-[11px]">
              {saveStatus === 'saving' && (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  <span className="text-amber-300 font-semibold">Sauvegarde temps réel...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">
                    Synchronisé {lastSavedTime && `(${lastSavedTime})`}
                  </span>
                  {savedFilePath && (
                    <span className="hidden xl:inline text-slate-500 text-[10px]">
                      • {savedFilePath}
                    </span>
                  )}
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-rose-300 font-semibold">Erreur synchronisation</span>
                </>
              )}
              {saveStatus === 'idle' && (
                <span className="text-slate-400">
                  {subtitles.length > 0 ? `${subtitles.length} répliques en mémoire` : 'Prêt'}
                </span>
              )}
            </div>

            {/* Bouton Doublage direct */}
            {onProceedToDubbing && subtitles.length > 0 && (
              <button
                type="button"
                id="table-proceed-to-dubbing-btn"
                onClick={onProceedToDubbing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 text-xs font-black uppercase tracking-wide transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
              >
                <span>Doublage VibeVoice</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toast Feedback */}
      {toastMessage && (
        <div className={`p-2.5 rounded-xl text-xs font-medium border flex items-center gap-2 animate-in fade-in slide-in-from-top-1 ${
          toastMessage.type === 'success' 
            ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200' 
            : toastMessage.type === 'warning'
            ? 'bg-amber-950/80 border-amber-800 text-amber-200'
            : 'bg-cyan-950/80 border-cyan-800 text-cyan-200'
        }`}>
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* 2. ÉTAT VIERGE : AUCUN SOUS-TITRE EN MÉMOIRE */}
      {subtitles.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-cyan-950/80 border border-cyan-800/60 text-cyan-400 mx-auto flex items-center justify-center shadow-lg shadow-cyan-950/50">
            <Edit3 className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-bold text-white">Tableau de Correction Manuelle</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Modifiez chaque réplique avec recalcul instantané de la vitesse de parole (WPM) et sauvegarde automatique sur vos fichiers locaux.
            </p>
          </div>

          {/* Fichiers locaux prêts à être ouverts */}
          {availableFiles.length > 0 ? (
            <div className="max-w-xl mx-auto bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-left space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span>📂 Fichiers locaux trouvés sur votre machine :</span>
                <span className="text-[10px] text-cyan-400 font-mono">{availableFiles.length} fichier(s)</span>
              </div>
              <div className="divide-y divide-slate-800/60 max-h-48 overflow-y-auto">
                {availableFiles.map((file) => (
                  <div key={file.filename} className="py-2 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-mono text-slate-200 font-semibold truncate">{file.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {file.sizeFormatted} • {file.location} • {new Date(file.modifiedAt).toLocaleTimeString('fr-FR')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLoadFile(file.filename)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/80 text-xs font-semibold shrink-0 cursor-pointer transition-colors"
                    >
                      Ouvrir & Corriger
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleLoadSample}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              Charger l'Exemple de Cours (12 répliques)
            </button>
            {onNavigateToImport && (
              <button
                type="button"
                onClick={onNavigateToImport}
                className="px-4 py-2 rounded-xl bg-cyan-950/80 hover:bg-cyan-900/80 text-cyan-300 text-xs font-semibold border border-cyan-700/80 transition-colors cursor-pointer"
              >
                Importer un fichier .SRT
              </button>
            )}
          </div>
        </div>
      ) : (
        /* 3. TABLEAU PRINCIPAL DES RÉPLIQUES AVEC ACTIONS */
        <div className="space-y-4">
          {/* Barre de Recherche, Filtres de Rythme, Vue et Pagination */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Champ Recherche */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="search-table-subtitles"
                  type="text"
                  placeholder="Rechercher par numéro, texte anglais ou texte français..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              {/* Filtres de rythme & vue */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setFilterPacing('all')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      filterPacing === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Tous ({stats.total})
                  </button>
                  {stats.untranslated > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterPacing('untranslated')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        filterPacing === 'untranslated' ? 'bg-amber-950 text-amber-300 border border-amber-800 font-bold' : 'text-amber-400 hover:text-amber-300'
                      }`}
                    >
                      Non traduits ({stats.untranslated})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFilterPacing('accelerated')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      filterPacing === 'accelerated' ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Accélérés ({stats.accelerated})
                  </button>
                  {stats.critical > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterPacing('critical')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        filterPacing === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800 font-bold' : 'text-rose-400 hover:text-rose-300'
                      }`}
                    >
                      Critiques ({stats.critical})
                    </button>
                  )}
                  {stats.edited > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterPacing('edited')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        filterPacing === 'edited' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold' : 'text-cyan-400 hover:text-cyan-300'
                      }`}
                    >
                      Modifiés ({stats.edited})
                    </button>
                  )}
                </div>

                {/* Bascule Grille / Texte Brut */}
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveView('grid')}
                    className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                      activeView === 'grid' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400'
                    }`}
                  >
                    Tableau
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('raw')}
                    className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                      activeView === 'raw' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400'
                    }`}
                  >
                    SRT Brut
                  </button>
                </div>

                {/* Bouton Glossaire Info */}
                <button
                  type="button"
                  onClick={() => setShowGlossary(!showGlossary)}
                  className={`p-2 rounded-xl border text-xs font-semibold transition-colors ${
                    showGlossary ? 'bg-cyan-950 border-cyan-600 text-cyan-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Afficher le dictionnaire des termes informatiques pour remplacement rapide"
                >
                  <BookOpen className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Glossaire informatique rapide si ouvert */}
            {showGlossary && (
              <div className="pt-3 border-t border-slate-800/80 animate-in fade-in duration-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Remplacement Automatique de Jargon Informatique (Cliquez pour appliquer) :</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-950 rounded-xl border border-slate-800">
                  {CS_GLOSSARY.slice(0, 20).map((term, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => applyGlossaryReplacement(term.en, term.fr)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 hover:text-white font-mono cursor-pointer transition-all"
                    >
                      <span className="text-slate-400">{term.en}</span>
                      <span className="text-cyan-400">→</span>
                      <span className="text-emerald-400 font-medium">{term.fr}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Barre de Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span>Lignes par page :</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPageSize(v === 'all' ? 'all' : parseInt(v, 10));
                    setCurrentPage(1);
                  }}
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2 py-1 outline-none"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value="all">Tout afficher</option>
                </select>
                <span className="font-mono text-[11px] text-slate-500">
                  Affichage {filteredSubtitles.length === 0 ? 0 : (validCurrentPage - 1) * (pageSize === 'all' ? filteredSubtitles.length : (pageSize as number)) + 1} à {Math.min(validCurrentPage * (pageSize === 'all' ? filteredSubtitles.length : (pageSize as number)), filteredSubtitles.length)} sur {filteredSubtitles.length}
                </span>
              </div>

              {totalPages > 1 && pageSize !== 'all' && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handlePageChange(1)}
                    disabled={validCurrentPage <= 1}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-25"
                    title="Première page"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePageChange(validCurrentPage - 1)}
                    disabled={validCurrentPage <= 1}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-25"
                    title="Page précédente"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1">
                    <span className="font-mono text-[11px]">Page</span>
                    <input
                      type="text"
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value)}
                      onBlur={() => handlePageInputSubmit()}
                      className="w-12 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-center font-mono text-xs text-cyan-400 focus:outline-none focus:border-cyan-500"
                    />
                    <span className="font-mono text-[11px]">/ {totalPages}</span>
                  </form>

                  <button
                    type="button"
                    onClick={() => handlePageChange(validCurrentPage + 1)}
                    disabled={validCurrentPage >= totalPages}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-25"
                    title="Page suivante"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={validCurrentPage >= totalPages}
                    className="p-1 rounded hover:bg-slate-800 text-slate-400 disabled:opacity-25"
                    title="Dernière page"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* TABLEAU INTERACTIF OU VUE SRT BRUTE */}
          {activeView === 'grid' ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="max-h-[640px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800 text-slate-400 font-mono">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">#</th>
                      <th className="py-2.5 px-3 w-32">TIMECODE</th>
                      <th className="py-2.5 px-3 w-5/12">TEXTE ORIGINAL (ANGLAIS)</th>
                      <th className="py-2.5 px-3 w-6/12">
                        <div className="flex items-center justify-between">
                          <span>CORRECTION FRANÇAISE (ÉDITABLE)</span>
                          <span className="text-[10px] text-cyan-400 font-normal">Sauvegarde auto en direct</span>
                        </div>
                      </th>
                      <th className="py-2.5 px-3 w-28 text-center">DÉBIT (WPM)</th>
                      <th className="py-2.5 px-3 w-14 text-center">ÉCOUTER</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {filteredSubtitles.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                          Aucune réplique ne correspond au filtre ou à la recherche "{searchQuery}".
                        </td>
                      </tr>
                    ) : (
                      paginatedSubtitles.map((item) => {
                        const isUntranslated = item.frText.trim().toLowerCase() === item.enText.trim().toLowerCase();
                        const isTranslatingThisRow = rowTranslatingId === item.id;
                        const isPlaying = playingId === item.id;

                        return (
                          <tr
                            key={item.id}
                            className={`hover:bg-slate-800/40 transition-colors ${
                              isUntranslated 
                                ? 'bg-amber-950/15' 
                                : item.pacingCategory === 'critical'
                                ? 'bg-rose-950/15'
                                : item.pacingCategory === 'accelerated'
                                ? 'bg-amber-950/5'
                                : ''
                            }`}
                          >
                            {/* Numéro */}
                            <td className="py-2.5 px-3 font-mono text-center text-slate-500 font-semibold">
                              {item.index}
                            </td>

                            {/* Timecode & Durée */}
                            <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                              <div className="text-slate-300 font-medium">{item.startTimeStr}</div>
                              <div className="text-[10px] text-slate-500">{(item.durationMs / 1000).toFixed(2)}s</div>
                            </td>

                            {/* Anglais Original */}
                            <td className="py-2.5 px-3 text-slate-300 leading-relaxed font-sans">
                              {item.enText}
                            </td>

                            {/* Français Éditable */}
                            <td className="py-2.5 px-3">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[10px]">
                                  {isUntranslated ? (
                                    <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                      <span>Non traduit</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-emerald-400 font-medium font-mono">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                      <span>{item.wordCountFr} mots ({item.frText.length} car.)</span>
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleTranslateSingleRow(item.id)}
                                    disabled={isTranslatingThisRow}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700 text-[10px] cursor-pointer transition-colors"
                                    title="Traduire cette réplique via Google Traduction"
                                  >
                                    {isTranslatingThisRow ? (
                                      <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                                    ) : (
                                      <Wand2 className="w-3 h-3 text-cyan-400" />
                                    )}
                                    <span>{isUntranslated ? 'Traduire' : 'Retraduire'}</span>
                                  </button>
                                </div>

                                <div className="relative">
                                  <textarea
                                    id={`fr-text-${item.id}`}
                                    value={item.frText}
                                    rows={2}
                                    onChange={(e) => handleFrenchTextChange(item.id, e.target.value)}
                                    onBlur={() => handleImmediateSave()}
                                    className={`w-full p-2 rounded-lg bg-slate-950 border text-white text-xs focus:outline-none resize-none transition-all ${
                                      isUntranslated 
                                        ? 'border-amber-700/70 focus:border-amber-500' 
                                        : item.isEdited
                                        ? 'border-cyan-600/70 focus:border-cyan-400'
                                        : 'border-slate-800 focus:border-cyan-500'
                                    }`}
                                    placeholder="Traduction française..."
                                  />
                                  {item.isEdited && (
                                    <span 
                                      className="absolute right-2 top-2 px-1.5 py-0.2 rounded bg-cyan-950/80 border border-cyan-700 text-[9px] font-mono text-cyan-300 font-bold" 
                                      title="Cette réplique a été modifiée et synchronisée"
                                    >
                                      Édité
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Débit / Pacing Badge */}
                            <td className="py-2.5 px-3 text-center">
                              <div className="inline-flex flex-col items-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                                  item.pacingCategory === 'critical'
                                    ? 'bg-rose-950 text-rose-300 border-rose-800'
                                    : item.pacingCategory === 'accelerated'
                                    ? 'bg-amber-950 text-amber-300 border-amber-800'
                                    : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                }`}>
                                  {item.calculatedRateWpm} WPM
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                                  {item.rateMultiplier.toFixed(2)}x
                                </span>
                              </div>
                            </td>

                            {/* Écouter TTS */}
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handlePreviewTts(item)}
                                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                  isPlaying
                                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/30'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:text-cyan-300'
                                }`}
                                title="Écouter la prosodie française"
                              >
                                {isPlaying ? (
                                  <Pause className="w-3.5 h-3.5 fill-current" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Vue SRT Brute */
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Éditeur de texte brut standard (.SRT) :</span>
                <button
                  type="button"
                  onClick={handleRawSrtApply}
                  className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
                >
                  Appliquer les modifications
                </button>
              </div>
              <textarea
                value={rawSrtText}
                onChange={(e) => setRawSrtText(e.target.value)}
                rows={20}
                className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500 resize-y"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
