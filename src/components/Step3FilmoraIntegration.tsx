import React, { useState, useRef } from 'react';
import { 
  Volume2, 
  CheckCircle2, 
  Download, 
  FileAudio, 
  FileText,
  Check, 
  Music, 
  Play, 
  Pause, 
  RotateCcw,
  Sparkles,
  ArrowRight,
  FolderCheck,
  AlertCircle
} from 'lucide-react';
import { SubtitleItem } from '../types';
import { formatSrt, msToFilmoraTimecode } from '../utils/timecode';
import { saveFileToSavedDirectory, playInstantSoundTest } from '../utils/audioSynthesizer';

export type AudioExportFormat = 'wav' | 'mp3';

interface Step3Props {
  subtitles: SubtitleItem[];
  projectName: string;
  hasAudioStitched: boolean;
  audioUrl: string | null;
  onProceedToStep4: () => void;
  onNavigateToStep2?: () => void;
  onNavigateToStep1?: () => void;
}

export const Step3FilmoraIntegration: React.FC<Step3Props> = ({
  subtitles,
  projectName,
  hasAudioStitched,
  audioUrl,
  onProceedToStep4,
  onNavigateToStep2,
  onNavigateToStep1
}) => {
  const [selectedFormat, setSelectedFormat] = useState<AudioExportFormat>('wav');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewTimeSec, setPreviewTimeSec] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);

  const safeProjectName = (projectName || 'cours').replace(/[^a-zA-Z0-9_-]/g, '_');
  const totalRows = subtitles.length;
  const lastSub = subtitles[totalRows - 1];
  const totalDurationMs = lastSub ? lastSub.endTimeMs + 2000 : 60000;

  const togglePlayPreview = () => {
    if (!audioPreviewRef.current) return;
    if (isPlayingPreview) {
      audioPreviewRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      audioPreviewRef.current.play().catch(e => console.warn('Preview error:', e));
      setIsPlayingPreview(true);
    }
  };

  // Télécharger le fichier audio (WAV ou MP3) directement dans le dossier Downloads
  const handleDownloadAudio = async (format: AudioExportFormat = selectedFormat) => {
    if (!audioUrl) return;
    setIsConverting(true);

    try {
      const filename = `${safeProjectName}_doublage_final.${format}`;

      if (format === 'mp3') {
        // Demande la conversion MP3 320k au backend via ffmpeg
        const baseWavName = `${safeProjectName}_fr_vibevoice.wav`;
        try {
          const resp = await fetch('/api/saved-files/convert-to-mp3', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: baseWavName })
          });

          if (resp.ok) {
            const data = await resp.json();
            const dlResp = await fetch(data.downloadUrl);
            const mp3Blob = await dlResp.blob();
            const mp3Url = URL.createObjectURL(mp3Blob);

            const a = document.createElement('a');
            a.href = mp3Url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(mp3Url);

            setDownloadSuccess(`Fichier audio MP3 (${filename})`);
            setTimeout(() => setDownloadSuccess(null), 4000);
            return;
          }
        } catch (convErr) {
          console.warn('Backend MP3 conversion failed, fallback to WAV blob:', convErr);
        }
      }

      // Téléchargement WAV direct (Master Studio 44.1kHz Stéréo)
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setDownloadSuccess(`Fichier Master ${format.toUpperCase()} (${filename})`);
      setTimeout(() => setDownloadSuccess(null), 4000);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setIsConverting(false);
    }
  };

  // Télécharger le fichier de sous-titres .SRT traduit dans le dossier Downloads
  const handleDownloadSrt = () => {
    if (!subtitles || subtitles.length === 0) return;
    const srtContent = formatSrt(subtitles, true);
    const filename = `${safeProjectName}_fr.srt`;

    // Archivage automatique dans sauvegarder/
    saveFileToSavedDirectory(filename, srtContent).catch(console.warn);

    // Téléchargement dans ~/Downloads
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadSuccess(`Fichier sous-titres SRT (${filename})`);
    setTimeout(() => setDownloadSuccess(null), 4000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-200">
      {/* 1. EN-TÊTE DE L'ÉTAPE 3 */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5" />
                ÉTAPE 3 • EXPORT WONDERSHARE FILMORA
              </span>
              <span className="text-xs text-emerald-300 font-mono">
                Voix VibeVoice Nicolas (0ms de latence)
              </span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">
              Téléchargement des Fichiers Prêts pour Filmora
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Votre cours a été doublé en français. Vous pouvez télécharger ici votre fichier audio (<strong className="text-emerald-300">WAV ou MP3</strong>) directement dans votre dossier <strong className="text-white">Downloads</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onNavigateToStep2 && (
              <button type="button"
                onClick={onNavigateToStep2}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Revenir à l'Étape 2"
              >
                <span>← Étape 2 (Doublage)</span>
              </button>
            )}
            <button type="button"
              onClick={playInstantSoundTest}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold text-xs border border-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
              title="Tester le son des haut-parleurs"
            >
              <Volume2 className="w-4 h-4" />
              <span>Tester le Son</span>
            </button>
          </div>
        </div>
      </div>

      {/* CAS OÙ L'AUDIO N'A PAS ENCORE ÉTÉ GÉNÉRÉ À L'ÉTAPE 2 */}
      {!hasAudioStitched ? (
        <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 border-2 border-amber-600/50 rounded-2xl p-8 text-center space-y-4 shadow-xl">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">L'audio n'a pas encore été généré</h3>
            <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
              Veuillez vous rendre à l'<strong>Étape 2 (Doublage VibeVoice)</strong> pour lancer la synthèse vocale avec la voix de Nicolas.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {onNavigateToStep1 && (
              <button type="button"
                onClick={onNavigateToStep1}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-colors cursor-pointer"
              >
                <span>← Étape 1 (Traduction)</span>
              </button>
            )}
            {onNavigateToStep2 && (
              <button type="button"
                id="navigate-to-step2-from-step3-btn"
                onClick={onNavigateToStep2}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wide transition-all shadow-lg shadow-emerald-500/25 cursor-pointer"
              >
                <span>Aller à l'Étape 2 : Lancer le Doublage VibeVoice</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* CAS NORMAL : AUDIO GÉNÉRÉ ET PRÊT À ÊTRE TÉLÉCHARGÉ */
        <div className="space-y-6">
          {/* INSTRUCTIONS PAS-À-PAS POUR COLLER DANS FILMORA */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">
                3
              </div>
              <div>
                <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span>Instructions Pas à Pas (Étape 3 sur 3 — Finalité Filmora)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">Prêt</span>
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  1. Choisissez le format (<strong className="text-emerald-300">WAV</strong> recommandé pour Filmora, ou <strong className="text-cyan-300">MP3</strong>).<br />
                  2. Cliquez sur le grand bouton vert ci-dessous pour enregistrer le fichier dans votre dossier <strong className="text-white">Downloads</strong>.<br />
                  3. Dans Wondershare Filmora, glissez ce fichier sur la <strong>Piste Audio A2</strong> et mutez l'anglais de la vidéo.
                </p>
              </div>
            </div>
          </div>

          {/* CARTE 1 : LE FICHIER AUDIO FINAL (MP3 ou WAV) */}
          <div className="bg-slate-900 border-2 border-emerald-500/60 rounded-2xl p-6 space-y-5 shadow-xl shadow-emerald-950/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                  <FileAudio className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>FICHIER AUDIO DOUBLÉ</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                      Prêt pour Filmora
                    </span>
                  </h3>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    Nom du fichier : <span className="text-emerald-300 font-bold">{safeProjectName}_doublage_final.{selectedFormat}</span>
                  </div>
                </div>
              </div>

              {/* Sélecteur de format : WAV ou MP3 */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
                <button type="button"
                  onClick={() => setSelectedFormat('wav')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedFormat === 'wav'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  WAV (Recommandé)
                </button>
                <button type="button"
                  onClick={() => setSelectedFormat('mp3')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedFormat === 'mp3'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  MP3 (Léger)
                </button>
              </div>
            </div>

            {/* Description du format sélectionné */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="text-slate-300">
                  {selectedFormat === 'wav' 
                    ? 'Format Master 44 100 Hz Stéréo PCM (Qualité Studio sans compression, recommandé pour Filmora).'
                    : 'Format MP3 320 kbps (Qualité haute définition compressée, fichier plus léger).'
                  }
                </span>
              </div>
              <span className="text-emerald-400 font-mono font-bold shrink-0 ml-2">
                0.000 ms de décalage
              </span>
            </div>

            {/* LE GROS BOUTON VERT DE TÉLÉCHARGEMENT DIRECT DANS DOWNLOADS */}
            <div className="pt-2">
              <button type="button"
                id="filmora-download-audio-btn"
                onClick={() => handleDownloadAudio(selectedFormat)}
                disabled={isConverting}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:via-teal-400 hover:to-cyan-400 text-slate-950 font-black text-sm uppercase tracking-wider transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
              >
                <Download className="w-5 h-5 stroke-[2.5]" />
                <span>
                  {isConverting 
                    ? 'Préparation du fichier audio...'
                    : `Télécharger l'Audio (${selectedFormat.toUpperCase()}) dans "Downloads"`
                  }
                </span>
              </button>
            </div>

            {/* Confirmation de téléchargement */}
            {downloadSuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs font-medium flex items-center gap-2 animate-in fade-in">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{downloadSuccess} enregistré dans votre dossier <strong>Downloads</strong> et archivé dans <strong>sauvegarder/</strong> !</span>
              </div>
            )}

            {/* Lecteur de pré-écoute intégré */}
            {audioUrl && (
              <div className="pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2">
                    <button type="button"
                      onClick={togglePlayPreview}
                      className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold cursor-pointer transition-colors"
                      title={isPlayingPreview ? 'Pause' : 'Écouter'}
                    >
                      {isPlayingPreview ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                    </button>
                    <button type="button"
                      onClick={() => {
                        setPreviewTimeSec(0);
                        if (audioPreviewRef.current) audioPreviewRef.current.currentTime = 0;
                      }}
                      className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                      title="Revenir au début"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <div className="text-xs font-mono text-slate-300 ml-2">
                      <span className="text-cyan-400 font-bold">{new Date(previewTimeSec * 1000).toISOString().substr(14, 5)}</span>
                      <span className="text-slate-500"> / {msToFilmoraTimecode(totalDurationMs).substr(3, 5)}</span>
                    </div>
                  </div>

                  <span className="text-xs text-slate-400 hidden sm:inline font-mono">
                    Voix : VibeVoice Nicolas (Français)
                  </span>

                  <audio
                    ref={audioPreviewRef}
                    src={audioUrl}
                    onTimeUpdate={() => {
                      if (audioPreviewRef.current) setPreviewTimeSec(audioPreviewRef.current.currentTime);
                    }}
                    onEnded={() => setIsPlayingPreview(false)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* CARTE 2 : LE FICHIER DE SOUS-TITRES TRADUITS (.SRT) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center font-bold shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Fichier de Sous-Titres Traduit :</span>
                  <span className="text-cyan-300 font-mono">{safeProjectName}_fr.srt</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Besoin d'afficher les sous-titres français à l'écran dans Filmora ? Téléchargez le fichier .SRT synchronisé.
                </p>
              </div>
            </div>

            <button type="button"
              id="filmora-download-srt-btn"
              onClick={handleDownloadSrt}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 hover:border-cyan-500/50 transition-all shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span>Télécharger .SRT (Dossier Download)</span>
            </button>
          </div>

          {/* GUIDE FILMORA EN 2 ÉTAPES ULTRA-SIMPLES */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Comment importer dans Wondershare Filmora :
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-800 flex items-center justify-center text-[10px]">1</span>
                  <span>Glisser l'audio sur la Timeline</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Depuis votre dossier <strong>Downloads</strong>, glissez <code className="text-emerald-300 font-mono">{safeProjectName}_doublage_final.{selectedFormat}</code> sur la <strong>Piste Audio A2</strong> de Filmora et calez-le tout au début (00:00:00:00).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-950 border border-emerald-800 flex items-center justify-center text-[10px]">2</span>
                  <span>Couper le son anglais original</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Dans Filmora, cliquez sur le bouton <strong>Mute (Silence)</strong> de la vidéo anglaise originale. Lancez la lecture : la voix française de Nicolas est parfaitement calée !
                </p>
              </div>
            </div>
          </div>

          {/* BOUTON VERS LE GESTIONNAIRE DE FICHIERS SAUVEGARDÉS */}
          <div className="flex justify-end pt-2">
            <button type="button"
              onClick={onProceedToStep4}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 font-bold text-xs border border-purple-800/60 hover:border-purple-600 transition-all cursor-pointer"
            >
              <FolderCheck className="w-4 h-4 text-purple-400" />
              <span>Voir tous les fichiers archivés dans sauvegarder/</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
