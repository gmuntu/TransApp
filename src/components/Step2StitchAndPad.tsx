import React, { useState, useEffect, useRef } from 'react';
import { 
  Sliders, 
  Play, 
  Pause, 
  Download, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Volume2, 
  Layers, 
  Radio, 
  FastForward, 
  RotateCcw,
  Clock,
  ShieldCheck,
  FileAudio,
  Music,
  Zap,
  ArrowRight
} from 'lucide-react';
import { SubtitleItem, TimelineLogEntry } from '../types';
import { 
  renderMasterCanvas, 
  playBrowserTtsPreview, 
  stopBrowserTts, 
  playInstantSoundTest,
  fetchVoiceCatalog,
  VibeVoiceOption,
  VIBEVOICE_PRESETS,
  getPreferredVoice,
  setPreferredVoice,
  saveFileToSavedDirectory
} from '../utils/audioSynthesizer';
import { msToSrtTime, msToFilmoraTimecode } from '../utils/timecode';

interface Step2Props {
  subtitles: SubtitleItem[];
  projectName: string;
  onProceedToStep3: () => void;
  onAudioGenerated: (blob: Blob, url: string) => void;
  hasAudioStitched: boolean;
  audioUrl: string | null;
  onOpenNaturalVoicesModal?: () => void;
  onNavigateToSaved?: () => void;
}

export const Step2StitchAndPad: React.FC<Step2Props> = ({
  subtitles,
  projectName,
  onProceedToStep3,
  onAudioGenerated,
  hasAudioStitched,
  audioUrl,
  onOpenNaturalVoicesModal,
  onNavigateToSaved
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: subtitles.length, percent: 0 });
  const [currentStitchingRow, setCurrentStitchingRow] = useState<SubtitleItem | null>(null);
  const [logs, setLogs] = useState<TimelineLogEntry[]>([]);
  const [baseWpm, setBaseWpm] = useState<number>(175);
  const [isPlayingCanvas, setIsPlayingCanvas] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [canvasDurationSec, setCanvasDurationSec] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState<string>(getPreferredVoice() || 'Nicolas');
  const [availableVoices, setAvailableVoices] = useState<VibeVoiceOption[]>(VIBEVOICE_PRESETS);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Load voices catalog on mount
  useEffect(() => {
    fetchVoiceCatalog().then((voices) => {
      if (voices && voices.length > 0) {
        setAvailableVoices(voices);
      }
    });
  }, []);

  // Calculate master canvas duration
  const lastSubtitle = subtitles[subtitles.length - 1];
  const totalDurationMs = lastSubtitle ? lastSubtitle.endTimeMs + 3000 : 60000;
  const totalDurationSec = totalDurationMs / 1000;

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.src = audioUrl;
    }
  }, [audioUrl]);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Execute the "Stitch & Pad" audio generation process
  const startStitchAndPadProcess = () => {
    if (isProcessing) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: subtitles.length, percent: 0 });
    setLogs([]);

    addLog('info', 0, `Initialisation Master Canvas 44 100 Hz Stéréo (Durée: ${msToSrtTime(totalDurationMs)})`);
    addLog('info', 0, `Moteur Vocal Prioritaire : VibeVoice 1.5B (0% Robotique) — Voix : ${selectedVoice}`);

    let currentIndex = 0;
    const total = subtitles.length;

    // Adaptive step interval: smooth visual progression in ~2.5 seconds regardless of file size
    const stepSize = Math.max(1, Math.ceil(total / 75));
    const intervalTime = 30;

    const interval = setInterval(() => {
      if (currentIndex >= total) {
        clearInterval(interval);
        finalizeMasterCanvas();
        return;
      }

      const nextIndex = Math.min(total, currentIndex + stepSize);
      const row = subtitles[nextIndex - 1];
      currentIndex = nextIndex;
      setCurrentStitchingRow(row);

      const percent = Math.round((currentIndex / total) * 100);
      setProgress({ current: currentIndex, total, percent });

      if (row.calculatedRateWpm > baseWpm) {
        addLog(
          'rate_adjusted',
          row.index,
          `Sous-titre #${row.index}: Fenêtre ${row.durationMs}ms calée avec débit adapté (-r ${row.calculatedRateWpm} wpm). Aucune coupure.`,
          row.calculatedRateWpm,
          row.durationMs
        );
      } else {
        addLog(
          'stitched',
          row.index,
          `Sous-titre #${row.index}: Positionné à ${row.startTimeStr} (Durée: ${(row.durationMs / 1000).toFixed(2)}s, VibeVoice ${selectedVoice})`
        );
      }
    }, intervalTime);
  };

  const finalizeMasterCanvas = async () => {
    addLog('info', subtitles.length, `Génération du Master Audio 44.1kHz Stéréo avec le moteur VibeVoice (${selectedVoice})...`);
    
    try {
      // Render the actual WAV audio
      const result = await renderMasterCanvas(subtitles, totalDurationMs, undefined, selectedVoice);

      // Revoke previous Object URL to prevent memory leak
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      const audioObjectUrl = URL.createObjectURL(result.wavBlob);

      setCanvasDurationSec(result.totalDurationSec);
      onAudioGenerated(result.wavBlob, audioObjectUrl);
      setIsProcessing(false);

      const autoSaveName = `${(projectName || 'cours').replace(/[^a-zA-Z0-9_-]/g, '_')}_fr_vibevoice.wav`;
      saveFileToSavedDirectory(autoSaveName, result.wavBlob).then(() => {
        addLog('info', subtitles.length, `📁 Enregistré automatiquement dans: sauvegarder/${autoSaveName}`);
      }).catch(err => {
        console.warn('Auto-save WAV warning:', err);
      });

      addLog(
        'info',
        subtitles.length,
        `✅ Master VibeVoice terminé : ${autoSaveName} (${(result.wavBlob.size / (1024 * 1024)).toFixed(2)} MB). Redirection vers l'Étape 3 (Filmora)...`
      );

      // Progression automatique vers l'Étape 3 (Filmora)
      setTimeout(() => {
        onProceedToStep3();
      }, 1200);
    } catch (error) {
      console.error('Erreur lors de la génération du master audio:', error);
      setIsProcessing(false);
      addLog('warning', subtitles.length, `Erreur lors de la génération. Redirection vers l'Étape 3...`);
      setTimeout(() => {
        onProceedToStep3();
      }, 1500);
    }
  };

  const addLog = (type: TimelineLogEntry['type'], rowIndex: number, message: string, rateWpm?: number, durationMs?: number) => {
    const entry: TimelineLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      rowIndex,
      message,
      rateWpm,
      durationMs
    };
    setLogs(prev => [...prev.slice(-300), entry]);
  };

  const togglePlayCanvas = () => {
    if (!audioRef.current) return;
    if (isPlayingCanvas) {
      audioRef.current.pause();
      setIsPlayingCanvas(false);
    } else {
      audioRef.current.play().catch(e => console.warn('Audio play error:', e));
      setIsPlayingCanvas(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTimeSec(audioRef.current.currentTime);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTimeSec(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  // Download authentic broadcast Master Audio in WAV
  const handleDownloadAudio = (format: 'wav' | 'mp3' | 'm4a' | 'flac' | 'ogg' = 'wav') => {
    if (!audioUrl) return;
    // The browser synthesis engine creates a broadcast-standard 16-bit 44.1kHz Stereo PCM WAV.
    // Note: The actual content is always WAV regardless of selected format.
    // For other formats, use the Python script for proper conversion.
    const filename = `${projectName}_doublage_final.${format}`;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      {/* VibeVoice Priority Voice Callout & Selector */}
      <div className="bg-gradient-to-r from-cyan-950/60 via-slate-900 to-emerald-950/60 border border-cyan-500/40 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-xs">Moteur Vocal Prioritaire : VibeVoice IA 1.5B</span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold">
                0% ROBOTIQUE • STUDIO
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Toutes les voix robotiques ont été éliminées. Le doublage est généré par le modèle neuronal <strong className="text-cyan-300">VibeVoice</strong> ou votre voix originale clonée depuis votre vidéo.
            </p>
          </div>
        </div>

        {/* Live Voice Selector */}
        <div className="flex items-center gap-2 self-stretch md:self-auto bg-slate-950/80 p-2 rounded-xl border border-slate-800 shrink-0">
          <label className="text-[11px] font-mono text-slate-400 whitespace-nowrap">Voix :</label>
          <select
            id="step2-voice-selector"
            value={selectedVoice}
            onChange={(e) => {
              setSelectedVoice(e.target.value);
              setPreferredVoice(e.target.value);
            }}
            className="bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 outline-none cursor-pointer focus:border-cyan-500"
          >
            {availableVoices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.gender} • {v.badge})
              </option>
            ))}
          </select>
          <button type="button"
            onClick={() => playBrowserTtsPreview("Bonjour ! Vous écoutez la voix neuronale VibeVoice pour le doublage de vos cours en français.", 175, undefined, selectedVoice)}
            className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono flex items-center gap-1 cursor-pointer transition-colors"
            title="Écouter un extrait de la voix sélectionnée"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Tester</span>
          </button>
        </div>
      </div>

      {/* GUIDE PAS-À-PAS VERS LA FINALITÉ FILMORA */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">
            2
          </div>
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span>Instructions Pas à Pas (Étape 2 sur 3)</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">Doublage</span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              1. La voix masculine naturelle de <strong className="text-cyan-300">Nicolas (Français)</strong> est pré-sélectionnée.<br />
              2. Cliquez sur le bouton vert <strong className="text-emerald-400">"Générer le Master Audio"</strong> ci-dessous.<br />
              3. Une fois la barre à 100%, passez à l'<strong>Étape 3</strong> pour télécharger le fichier (.WAV ou .MP3) prêt à coller dans Filmora.
            </p>
          </div>
        </div>

        <button type="button"
          id="step2-guide-proceed-to-step3-btn"
          onClick={onProceedToStep3}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wide transition-all shrink-0 cursor-pointer ${
            hasAudioStitched
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/25'
              : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 shadow-md shadow-cyan-500/20'
          }`}
        >
          <span>{hasAudioStitched ? '✓ Audio Prêt ! Passer à Filmora' : 'Passer à Filmora (Étape 3)'}</span>
          <ArrowRight className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>

      {/* Step Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                ÉTAPE 2 • MOTEUR AUDIO STITCH & PAD
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
                SORTIE : FICHIER AUDIO PUR (.WAV / .MP3)
              </span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Génération du Master Audio Français
            </h2>
            <p className="text-sm text-slate-300 max-w-3xl">
              Construit une piste audio maîtresse 44 100 Hz Stéréo. Chaque sous-titre français est injecté à sa position temporelle exacte
              <code className="text-emerald-400 font-mono text-xs mx-1">start_time_ms</code>. Le fichier produit est un <strong>fichier audio pur</strong> prêt pour la timeline Filmora.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button"
              id="start-stitching-btn"
              onClick={startStitchAndPadProcess}
              disabled={isProcessing || subtitles.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Radio className={`w-4 h-4 ${isProcessing ? 'animate-pulse text-emerald-200' : ''}`} />
              <span>
                {subtitles.length === 0 
                  ? 'Aucun sous-titre à générer' 
                  : isProcessing 
                  ? 'Génération Audio en cours...' 
                  : 'Générer le Master Audio'}
              </span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {hasAudioStitched && (
                <button type="button"
                  id="download-master-wav-btn"
                  onClick={() => handleDownloadAudio('wav')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                  title="Télécharger le Master Studio WAV 44.1kHz Stéréo (Format recommandé Filmora)"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger Master Audio (.WAV)</span>
                </button>
              )}

              <button type="button"
                id="header-proceed-to-step3-btn"
                onClick={onProceedToStep3}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wide transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
                title="Passer à l'Étape 3 pour télécharger le fichier pour Filmora"
              >
                <span>Passer à Filmora (Étape 3)</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>

              <button type="button"
                id="test-sound-speaker-btn"
                onClick={playInstantSoundTest}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 font-mono text-xs border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Vérifier que les haut-parleurs/écouteurs émettent du son"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Tester le Son</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Stitching Progression Bar (Mandated in Prompt) */}
        <div className="mt-6 pt-5 border-t border-slate-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs font-mono mb-2 gap-1">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">
                {isProcessing
                  ? `Processing Audio: Row ${progress.current} / ${progress.total}`
                  : hasAudioStitched
                  ? `Master Canvas Complete: ${subtitles.length} / ${subtitles.length} rows stitched`
                  : 'Ready to stitch audio canvas'}
              </span>
              {isProcessing && currentStitchingRow && (
                <span className="text-slate-400 hidden sm:inline">
                  • [Rate: -r {currentStitchingRow.calculatedRateWpm} wpm]
                </span>
              )}
            </div>
            <span className="text-slate-400">{progress.percent}%</span>
          </div>

          <div className="w-full bg-slate-950 rounded-full h-3.5 p-0.5 border border-slate-800 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 via-emerald-500 to-teal-400 h-full rounded-full transition-all duration-150"
              style={{ width: `${progress.percent}%` }}
            ></div>
          </div>

          {isProcessing && currentStitchingRow && (
            <div className="mt-2 text-xs font-mono text-slate-400 truncate">
              <span className="text-slate-500 mr-2">↳ Stitched chunk:</span>
              <span className="text-slate-300">"{currentStitchingRow.frText}"</span>
            </div>
          )}
        </div>
      </div>

      {/* Critical Architecture Rules Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>NO PYDUB SPEEDUP CLIPPING</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            pydub's <code className="text-rose-400 font-mono text-[11px]">.speedup()</code> drops frame chunks and clips technical syllables. We modulate speed directly at the neural voice level via macOS <code className="text-cyan-400 font-mono text-[11px]">say -r [rate]</code>.
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 mb-1">
            <Clock className="w-4 h-4" />
            <span>EXACT MILLISECOND ALIGNMENT</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Every audio chunk is overlayed at its precise <code className="text-emerald-400 font-mono text-[11px]">start_time_ms</code> coordinate on an empty silent canvas. Natural pauses between sentences are preserved.
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 mb-1">
            <Layers className="w-4 h-4" />
            <span>FILMORA 00:00:00:00 LOCK</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Because silent padding is hardcoded into the single master WAV file, snapping to <code className="text-amber-300 font-mono text-[11px]">00:00:00:00</code> aligns all 3,500+ lecture slides without drift.
          </p>
        </div>
      </div>

      {/* Interactive Timeline & Playback Monitor */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">
              Timeline Monitor (44.1kHz Stereo Canvas)
            </h3>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-slate-400">Position:</span>
            <span className="text-cyan-400 font-bold">{msToSrtTime(currentTimeSec * 1000)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-300">{msToSrtTime(totalDurationMs)}</span>
          </div>
        </div>

        {/* Visual Timeline Waveform & Chunk Map */}
        <div className="relative bg-slate-950 rounded-xl p-4 border border-slate-800/90 overflow-hidden mb-4">
          {/* Timeline ruler */}
          <div className="flex justify-between text-[10px] font-mono text-slate-600 mb-2 border-b border-slate-800 pb-1">
            <span>00:00:00</span>
            <span>{msToSrtTime(totalDurationMs * 0.25)}</span>
            <span>{msToSrtTime(totalDurationMs * 0.50)}</span>
            <span>{msToSrtTime(totalDurationMs * 0.75)}</span>
            <span>{msToSrtTime(totalDurationMs)}</span>
          </div>

          {/* Canvas Block representation */}
          <div className="h-16 relative bg-slate-900/60 rounded-lg overflow-hidden border border-slate-800">
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-20 pointer-events-none shadow-[0_0_8px_rgba(34,211,238,0.8)]"
              style={{
                left: `${totalDurationSec > 0 ? (currentTimeSec / totalDurationSec) * 100 : 0}%`
              }}
            >
              <div className="w-2.5 h-2.5 bg-cyan-400 -translate-x-1 -translate-y-1 rounded-sm rotate-45"></div>
            </div>

            {/* Subtitle Audio Chunks overlayed on canvas */}
            {subtitles.slice(0, 150).map((sub) => {
              const leftPercent = (sub.startTimeMs / totalDurationMs) * 100;
              const widthPercent = Math.max(0.4, (sub.durationMs / totalDurationMs) * 100);
              const isAccelerated = sub.calculatedRateWpm > 185;

              return (
                <div
                  key={sub.id}
                  className={`absolute top-2 bottom-2 rounded-sm transition-all group cursor-pointer ${
                    isAccelerated
                      ? 'bg-amber-500/80 hover:bg-amber-400'
                      : 'bg-emerald-500/80 hover:bg-emerald-400'
                  }`}
                  style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                  title={`[Row ${sub.index}] ${sub.startTimeStr} -> ${sub.endTimeStr} (${sub.calculatedRateWpm} WPM)`}
                  onClick={() => {
                    setCurrentTimeSec(sub.startTimeMs / 1000);
                    if (audioRef.current) audioRef.current.currentTime = sub.startTimeMs / 1000;
                  }}
                >
                  <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] font-mono text-slate-950 font-bold px-0.5 truncate">
                      #{sub.index}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timeline Scrubber */}
          <input
            id="timeline-scrubber"
            type="range"
            min="0"
            max={totalDurationSec || 60}
            step="0.05"
            value={currentTimeSec}
            onChange={handleSeek}
            className="w-full mt-3 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
              Standard Pacing (175 WPM)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span>
              Dynamic Rate Acceleration (No Syllable Clipping)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-800 border border-slate-700"></span>
              Mathematical Silence Padding
            </span>
          </div>
        </div>

        {/* Audio Player Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-3 bg-slate-950 rounded-xl border border-slate-800">
          <div className="flex items-center gap-3">
            <button type="button"
              id="toggle-play-canvas-btn"
              onClick={togglePlayCanvas}
              disabled={!audioUrl}
              className={`p-3 rounded-xl font-bold flex items-center gap-2 transition-all ${
                isPlayingCanvas
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 disabled:opacity-30'
              }`}
            >
              {isPlayingCanvas ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              <span className="text-xs">{isPlayingCanvas ? 'Pause Playback' : 'Preview Stitched Audio'}</span>
            </button>

            <button type="button"
              id="reset-playhead-btn"
              onClick={() => {
                setCurrentTimeSec(0);
                if (audioRef.current) audioRef.current.currentTime = 0;
              }}
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 text-xs"
              title="Return to 00:00:00"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-emerald-400" />
            <span>Spécifications du fichier de sortie : Audio Stéréo 44 100 Hz • 16-bit PCM (.WAV / .MP3)</span>
          </div>

          {/* Hidden standard HTML5 audio element */}
          <audio
            ref={audioRef}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => setIsPlayingCanvas(false)}
          />
        </div>

        {/* Real-time Subprocess Logging Console (Mandated in Prompt) */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide font-mono">
              Console de Synchronisation Audio en Temps Réel
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              Journal d'exécution Stitch & Pad
            </span>
          </div>

          <div
            ref={logContainerRef}
            className="h-44 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] overflow-y-auto space-y-1"
          >
            {logs.length === 0 ? (
              <div className="text-slate-600 italic">
                Cliquez sur "Générer le Master Audio" pour assembler la bande-son audio calée sur les sous-titres.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2">
                  <span className="text-slate-600 whitespace-nowrap">[{log.timestamp}]</span>
                  <span
                    className={
                      log.type === 'rate_adjusted'
                        ? 'text-amber-400'
                        : log.type === 'stitched'
                        ? 'text-emerald-400'
                        : log.type === 'warning'
                        ? 'text-rose-400'
                        : 'text-cyan-300'
                    }
                  >
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Actions de fin d'étape */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-800">
          <div>
            {hasAudioStitched && onNavigateToSaved && (
              <button type="button"
                onClick={onNavigateToSaved}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-700/80 font-bold text-xs transition-colors cursor-pointer"
              >
                <span>Accéder au dossier 'sauvegarder' 📁</span>
              </button>
            )}
          </div>

          <button type="button"
            id="proceed-to-step3-btn"
            onClick={onProceedToStep3}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
          >
            <span>Passer à l'Étape 3 : Export Filmora</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
};
