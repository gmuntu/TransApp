import { useState, useRef, useEffect, type FC } from 'react';
import {
  Film,
  Upload,
  Play,
  Download,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileVideo,
  FileAudio,
  FileText,
  Settings2,
  Zap,
  Monitor,
  Check,
  Link,
  Clock,
  Sparkles,
  RefreshCw,
  X,
  Eye,
  ArrowDownToLine,
  Layers,
} from 'lucide-react';

const YouTubeIcon: FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

interface MuxProgress {
  percentage: number;
  message: string;
}

interface MuxResult {
  success: boolean;
  filename: string;
  size: number;
  sizeFormatted: string;
  downloadUrl: string;
}

interface YouTubeVideoInfo {
  id: string;
  title: string;
  duration: number;
  durationString: string;
  thumbnail: string | null;
  uploader: string;
}

interface Step5VideoMuxingProps {
  projectName: string;
  onNavigateToSaved: () => void;
}

type SubtitleMode = 'softsub' | 'hardsub';
type VideoSourceTab = 'youtube' | 'upload' | 'library';

export const Step5VideoMuxing: FC<Step5VideoMuxingProps> = ({
  projectName,
  onNavigateToSaved,
}) => {
  // --- Fichiers disponibles ---
  const [srtFiles, setSrtFiles] = useState<string[]>([]);
  const [audioFiles, setAudioFiles] = useState<string[]>([]);
  const [videoFiles, setVideoFiles] = useState<string[]>([]);

  // --- Sélections pour le muxing ---
  const [selectedSrt, setSelectedSrt] = useState<string>('');
  const [selectedAudio, setSelectedAudio] = useState<string>('');
  const [selectedVideo, setSelectedVideo] = useState<string>('');
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>('softsub');
  const [fontSize, setFontSize] = useState<number>(18);
  const [outputFilename, setOutputFilename] = useState<string>(
    `${projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}_final.mp4`
  );

  // --- État de l'import vidéo ---
  const [sourceTab, setSourceTab] = useState<VideoSourceTab>('youtube');
  const [showVideoPreview, setShowVideoPreview] = useState(false);

  // YouTube Downloader
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeInfo, setYoutubeInfo] = useState<YouTubeVideoInfo | null>(null);
  const [isLoadingYtInfo, setIsLoadingYtInfo] = useState(false);
  const [isDownloadingYt, setIsDownloadingYt] = useState(false);
  const [ytProgress, setYtProgress] = useState<{ percentage: number; speed?: string; eta?: string; message: string }>({
    percentage: 0,
    message: '',
  });
  const [ytError, setYtError] = useState('');

  // Upload Fichier Local
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  // --- Muxing State ---
  const [isMuxing, setIsMuxing] = useState(false);
  const [progress, setProgress] = useState<MuxProgress>({ percentage: 0, message: '' });
  const [muxResult, setMuxResult] = useState<MuxResult | null>(null);
  const [error, setError] = useState<string>('');

  // Diagnostic FFmpeg & yt-dlp
  const [ffmpegReady, setFfmpegReady] = useState<boolean | null>(null);
  const [ffmpegDiag, setFfmpegDiag] = useState<string>('');
  const [ytAvailable, setYtAvailable] = useState<boolean | null>(null);

  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  // --- Chargement initial ---
  useEffect(() => {
    loadAvailableFiles();
    checkFfmpegStatus();
    checkYtStatus();
  }, []);

  async function checkYtStatus() {
    try {
      const res = await fetch('/api/youtube/status');
      if (res.ok) {
        const data = await res.json();
        setYtAvailable(data.available ?? false);
      }
    } catch {
      setYtAvailable(false);
    }
  }

  async function loadAvailableFiles() {
    try {
      const [savedRes, videosRes, srtRes] = await Promise.all([
        fetch('/api/saved-files'),
        fetch('/api/videos/list'),
        fetch('/api/subtitles/list'),
      ]);

      if (savedRes.ok) {
        const data = await savedRes.json();
        const files: { name: string; extension: string }[] = data.files || [];
        const srts = files.filter(f => f.extension === 'srt').map(f => f.name);
        const audios = files.filter(f => ['wav', 'mp3', 'm4a', 'flac'].includes(f.extension)).map(f => f.name);
        setSrtFiles(srts);
        setAudioFiles(audios);

        if (srts.length > 0 && !selectedSrt) setSelectedSrt(srts[0]);
        if (audios.length > 0 && !selectedAudio) setSelectedAudio(audios[0]);
      }

      if (videosRes.ok) {
        const data = await videosRes.json();
        const vids = (data.files || []).map((f: any) => f.name);
        setVideoFiles(vids);
      }

      if (srtRes.ok) {
        const data = await srtRes.json();
        const extra = (data.files || []).map((f: any) => f.name);
        setSrtFiles(prev => Array.from(new Set([...prev, ...extra])));
      }
    } catch {}
  }

  async function checkFfmpegStatus() {
    try {
      const res = await fetch('/api/mux/check');
      if (res.ok) {
        const data = await res.json();
        setFfmpegReady(data.ready ?? false);
        setFfmpegDiag(data.ffmpegDiag || '');
      }
    } catch {
      setFfmpegReady(false);
    }
  }

  // --- YouTube Downloader Handlers ---
  async function handleAnalyzeYoutube(urlToAnalyze?: string) {
    const targetUrl = (urlToAnalyze ?? youtubeUrl).trim();
    if (!targetUrl) return;

    setIsLoadingYtInfo(true);
    setYtError('');
    setYoutubeInfo(null);

    try {
      const res = await fetch('/api/youtube/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setYoutubeInfo(data);
      } else {
        setYtError(data.error || 'Impossible d’analyser cette vidéo YouTube.');
      }
    } catch (err: any) {
      setYtError(err?.message || 'Erreur réseau lors de l’analyse YouTube.');
    } finally {
      setIsLoadingYtInfo(false);
    }
  }

  async function handleDownloadYoutube() {
    if (!youtubeUrl.trim()) return;

    setIsDownloadingYt(true);
    setYtProgress({ percentage: 2, message: 'Démarrage du téléchargement YouTube…' });
    setYtError('');

    try {
      const response = await fetch('/api/youtube/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl.trim() }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        setYtError('Impossible de lire la progression du téléchargement.');
        setIsDownloadingYt(false);
        return;
      }

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventName = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventName = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (eventName === 'progress') {
                setYtProgress({
                  percentage: payload.percentage ?? 0,
                  speed: payload.speed,
                  eta: payload.eta,
                  message: payload.message ?? '',
                });
              } else if (eventName === 'done') {
                setYtProgress({ percentage: 100, message: '✅ Téléchargement YouTube terminé !' });
                if (payload.filename) {
                  setSelectedVideo(payload.filename);
                }
                await loadAvailableFiles();
              } else if (eventName === 'error') {
                setYtError(payload.error || 'Échec du téléchargement');
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setYtError(err?.message || 'Erreur réseau');
    } finally {
      setIsDownloadingYt(false);
    }
  }

  // --- Upload Handlers ---
  function handleUploadVideo(file: File) {
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError('');
    setUploadSuccess('');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/video/upload');
    xhr.setRequestHeader('x-filename', encodeURIComponent(file.name));

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = async () => {
      setIsUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          setSelectedVideo(data.filename);
          setUploadSuccess(`Vidéo « ${data.filename} » prête pour l'assemblage !`);
          await loadAvailableFiles();
        } catch {
          setSelectedVideo(file.name);
          setUploadSuccess(`Vidéo téléversée avec succès !`);
        }
      } else {
        setUploadError('Erreur lors du téléversement du fichier vidéo.');
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      setUploadError('Échec de la connexion lors du téléversement.');
    };

    xhr.send(file);
  }

  // --- Launch FFmpeg Muxing ---
  async function handleStartMux() {
    if (!selectedSrt || !selectedAudio) return;

    setIsMuxing(true);
    setProgress({ percentage: 0, message: 'Initialisation du muxing…' });
    setMuxResult(null);
    setError('');

    try {
      const response = await fetch('/api/mux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          srtFilename: selectedSrt,
          audioFilename: selectedAudio,
          videoFilename: selectedVideo || undefined,
          outputFilename,
          burnSubtitles: subtitleMode === 'hardsub',
          subtitleFontSize: fontSize,
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        setError('Impossible de lire la réponse du serveur.');
        setIsMuxing(false);
        return;
      }

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventName = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventName = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (eventName === 'progress') {
                setProgress({
                  percentage: payload.percentage ?? 0,
                  message: payload.message ?? '',
                });
              } else if (eventName === 'done') {
                setMuxResult(payload);
                setProgress({ percentage: 100, message: '✅ Vidéo assemblée avec succès !' });
              } else if (eventName === 'error') {
                setError(payload.error || 'Erreur inconnue');
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Erreur de connexion au serveur de muxing.');
    } finally {
      setIsMuxing(false);
    }
  }

  const canStart = selectedSrt && selectedAudio && !isMuxing;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/40 flex items-center justify-center shadow-inner">
              <Film className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-white tracking-tight">
                  Étape 5 — Assembler la vidéo finale
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Optionnel
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Combinez votre vidéo source avec la voix française et les sous-titres synchronisés en un fichier MP4 unique.
              </p>
            </div>
          </div>

          {/* Badges de statut */}
          <div className="flex items-center gap-2 flex-wrap">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${
                ffmpegReady === true
                  ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-300'
                  : ffmpegReady === false
                  ? 'bg-rose-950/60 border-rose-600/60 text-rose-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {ffmpegReady === true ? (
                <><CheckCircle className="w-3.5 h-3.5" /> Muxer FFmpeg Prêt</>
              ) : ffmpegReady === false ? (
                <><AlertTriangle className="w-3.5 h-3.5" /> FFmpeg Non Détecté</>
              ) : (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Vérification…</>
              )}
            </div>

            {ytAvailable !== null && (
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${
                  ytAvailable
                    ? 'bg-red-950/50 border-red-600/50 text-red-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <YouTubeIcon className="w-3.5 h-3.5 text-red-400" />
                {ytAvailable ? 'YouTube Activé' : 'YouTube Non Configuré'}
              </div>
            )}
          </div>
        </div>

        {ffmpegDiag && (
          <div className="mt-3 text-[11px] font-mono text-slate-400 bg-slate-950/60 rounded-lg px-3 py-2 border border-slate-800">
            {ffmpegDiag}
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 1 : SOURCE VIDÉO (YouTube / Téléversement / Existant) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 font-bold text-xs flex items-center justify-center">
                1
              </span>
              <h3 className="text-base font-bold text-white tracking-tight">
                Vidéo Source
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Importez la vidéo depuis YouTube, téléversez un fichier de votre Mac, ou choisissez une vidéo déjà disponible.
            </p>
          </div>

          {/* Onglets de sélection de source */}
          <div className="flex bg-slate-950 border border-slate-800 p-1 rounded-xl gap-1 self-start sm:self-auto">
            <button
              onClick={() => setSourceTab('youtube')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                sourceTab === 'youtube'
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <YouTubeIcon className="w-3.5 h-3.5 text-red-400" />
              Lien YouTube
            </button>
            <button
              onClick={() => setSourceTab('upload')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                sourceTab === 'upload'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              Téléverser un fichier
            </button>
            <button
              onClick={() => setSourceTab('library')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                sourceTab === 'library'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Bibliothèque ({videoFiles.length})
            </button>
          </div>
        </div>

        {/* ─── Onglet YouTube ─── */}
        {sourceTab === 'youtube' && (
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5 space-y-4 animate-fade-in">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">
                Collez l'adresse de la vidéo YouTube :
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Link className="w-4 h-4 text-slate-500" />
                  </div>
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => {
                      setYoutubeUrl(e.target.value);
                      if (e.target.value.includes('youtube.com') || e.target.value.includes('youtu.be')) {
                        handleAnalyzeYoutube(e.target.value);
                      }
                    }}
                    placeholder="https://www.youtube.com/watch?v=... ou https://youtu.be/..."
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-red-500 transition shadow-inner"
                  />
                </div>

                <button
                  onClick={() => handleAnalyzeYoutube()}
                  disabled={!youtubeUrl.trim() || isLoadingYtInfo}
                  className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    youtubeUrl.trim() && !isLoadingYtInfo
                      ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/25'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {isLoadingYtInfo ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyse…</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" /> Analyser</>
                  )}
                </button>
              </div>
            </div>

            {/* Erreur YouTube */}
            {ytError && (
              <div className="p-3 bg-rose-950/40 border border-rose-700/60 rounded-xl flex items-start gap-2.5 text-xs text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{ytError}</span>
              </div>
            )}

            {/* Aperçu YouTube & Bouton de Téléchargement */}
            {youtubeInfo && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  {youtubeInfo.thumbnail ? (
                    <img
                      src={youtubeInfo.thumbnail}
                      alt={youtubeInfo.title}
                      className="w-24 h-16 object-cover rounded-lg border border-slate-700 shadow-md shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-16 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                      <YouTubeIcon className="w-8 h-8 text-red-500" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-100 truncate" title={youtubeInfo.title}>
                      {youtubeInfo.title}
                    </h4>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      {youtubeInfo.uploader && (
                        <span>👤 {youtubeInfo.uploader}</span>
                      )}
                      {youtubeInfo.durationString && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {youtubeInfo.durationString}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleDownloadYoutube}
                  disabled={isDownloadingYt}
                  className={`w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg shrink-0 cursor-pointer ${
                    !isDownloadingYt
                      ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-600/25'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {isDownloadingYt ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Téléchargement en cours…</>
                  ) : (
                    <><ArrowDownToLine className="w-4 h-4" /> Télécharger pour l'assemblage</>
                  )}
                </button>
              </div>
            )}

            {/* Progression Téléchargement YouTube */}
            {isDownloadingYt && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300 flex items-center gap-2">
                    <YouTubeIcon className="w-3.5 h-3.5 text-red-500" />
                    Téléchargement YouTube HD
                  </span>
                  <span className="font-mono text-red-400 font-bold">
                    {ytProgress.percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-red-600 via-rose-500 to-orange-500"
                    style={{ width: `${ytProgress.percentage}%` }}
                  />
                </div>
                <p className="text-[11px] font-mono text-slate-400">{ytProgress.message}</p>
              </div>
            )}
          </div>
        )}

        {/* ─── Onglet Téléversement Local ─── */}
        {sourceTab === 'upload' && (
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5 space-y-4 animate-fade-in">
            <input
              type="file"
              ref={fileInputRef}
              accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/avi,.mp4,.mov,.mkv,.webm,.avi"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadVideo(file);
              }}
            />

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleUploadVideo(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/70'
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-3">
                <Upload className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-200">
                Glissez votre vidéo ici ou cliquez pour choisir
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                Prend en charge les formats MP4, MOV, MKV, WebM de toute taille (HD / 4K).
              </p>
            </div>

            {/* Progression Téléversement */}
            {isUploading && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-indigo-300 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Téléversement vers le studio…
                  </span>
                  <span className="font-mono text-indigo-400 font-bold">
                    {uploadProgress}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-indigo-500 to-purple-500"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {uploadError && (
              <div className="p-3 bg-rose-950/40 border border-rose-700/60 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                {uploadError}
              </div>
            )}

            {uploadSuccess && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-700/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                {uploadSuccess}
              </div>
            )}
          </div>
        )}

        {/* ─── Onglet Bibliothèque ─── */}
        {sourceTab === 'library' && (
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">
                Vidéos détectées sur votre machine :
              </span>
              <button
                onClick={loadAvailableFiles}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition"
              >
                <RefreshCw className="w-3 h-3" /> Actualiser
              </button>
            </div>

            {videoFiles.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4 text-center">
                Aucune vidéo enregistrée pour l'instant. Téléversez un fichier ou collez un lien YouTube.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {videoFiles.map(v => (
                  <div
                    key={v}
                    onClick={() => setSelectedVideo(v)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                      selectedVideo === v
                        ? 'bg-purple-950/50 border-purple-500/70 text-purple-200 font-bold shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileVideo className="w-4 h-4 text-purple-400 shrink-0" />
                      <span className="truncate" title={v}>{v}</span>
                    </div>
                    {selectedVideo === v && (
                      <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Bannière Vidéo Sélectionnée ─── */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-400 flex items-center justify-center shrink-0">
              <FileVideo className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Vidéo actuellement sélectionnée :
              </span>
              <p className="text-xs font-bold text-slate-100 truncate">
                {selectedVideo || '— Aucune (génération automatique d’un canevas noir HD 1080p) —'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {selectedVideo && (
              <>
                <button
                  onClick={() => setShowVideoPreview(!showVideoPreview)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-indigo-400" />
                  {showVideoPreview ? 'Masquer l’aperçu' : 'Aperçu vidéo'}
                </button>

                <button
                  onClick={() => { setSelectedVideo(''); setShowVideoPreview(false); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition cursor-pointer"
                  title="Retirer la vidéo (utiliser le canevas studio 1080p)"
                >
                  <X className="w-3.5 h-3.5" />
                  Retirer
                </button>
              </>
            )}
          </div>
        </div>

        {/* Lecteur d'Aperçu Vidéo Source */}
        {selectedVideo && showVideoPreview && (
          <div className="bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl animate-fade-in">
            <div className="bg-slate-950 px-4 py-2 flex items-center justify-between border-b border-slate-800 text-xs text-slate-400">
              <span className="font-mono">Aperçu : {selectedVideo}</span>
              <button
                onClick={() => setShowVideoPreview(false)}
                className="hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <video
              src={`/api/saved-files/download/${encodeURIComponent(selectedVideo)}`}
              controls
              className="w-full max-h-[350px] bg-black"
            >
              Votre navigateur ne prend pas en charge la lecture vidéo.
            </video>
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 2 : FICHIERS REQUIS (SRT & AUDIO) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sélecteur SRT */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs flex items-center justify-center font-bold">
                2
              </span>
              <FileText className="w-4 h-4 text-cyan-400" />
              Sous-titres synchronisés (.SRT) *
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/30">
              Requis
            </span>
          </div>

          <select
            value={selectedSrt}
            onChange={(e) => setSelectedSrt(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition shadow-inner"
          >
            <option value="">— Sélectionner un fichier SRT —</option>
            {srtFiles.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          {!selectedSrt ? (
            <p className="text-[11px] text-amber-400/90">
              ⚠ Requis — Sélectionnez vos sous-titres traduits pour la synchronisation.
            </p>
          ) : (
            <p className="text-[11px] text-slate-400">
              ✓ Fichier sous-titres sélectionné.
            </p>
          )}
        </div>

        {/* Sélecteur Audio Maître */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center font-bold">
                3
              </span>
              <FileAudio className="w-4 h-4 text-emerald-400" />
              Audio Français Maître (.WAV / .MP3) *
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
              Requis
            </span>
          </div>

          <select
            value={selectedAudio}
            onChange={(e) => setSelectedAudio(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition shadow-inner"
          >
            <option value="">— Sélectionner l'audio maître —</option>
            {audioFiles.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          {!selectedAudio ? (
            <p className="text-[11px] text-amber-400/90">
              ⚠ Requis — Sélectionnez la piste vocale française générée.
            </p>
          ) : (
            <p className="text-[11px] text-slate-400">
              ✓ Piste audio doublée prête pour le mixage.
            </p>
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 3 : PARAMÈTRES D'ASSEMBLAGE */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
          <Settings2 className="w-4 h-4 text-slate-400" />
          Options d'assemblage
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Mode Sous-titres */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Affichage des sous-titres
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSubtitleMode('softsub')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  subtitleMode === 'softsub'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Activable (Rapide)
              </button>
              <button
                type="button"
                onClick={() => setSubtitleMode('hardsub')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  subtitleMode === 'hardsub'
                    ? 'bg-indigo-500 text-white font-bold shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Incrusté (Brûlé)
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {subtitleMode === 'softsub'
                ? 'Piste intégrée activable/désactivable dans VLC ou QuickTime.'
                : 'Sous-titres dessinés sur l’image — visibles sur tous les écrans.'}
            </p>
          </div>

          {/* Taille de Police (Hardsub) */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Taille police (si incrusté)
            </label>
            <input
              type="number"
              min={12}
              max={36}
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value) || 18)}
              disabled={subtitleMode === 'softsub'}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 disabled:opacity-40 transition shadow-inner"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Par défaut : 18px.
            </p>
          </div>

          {/* Nom du Fichier Sortie */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Nom du fichier vidéo final
            </label>
            <input
              type="text"
              value={outputFilename}
              onChange={(e) => setOutputFilename(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition shadow-inner"
              placeholder="video_finale.mp4"
            />
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 4 : BOUTON DE LANCEMENT & PROGRESSION */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <button
          onClick={handleStartMux}
          disabled={!canStart || ffmpegReady === false}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all shadow-xl cursor-pointer ${
            canStart && ffmpegReady !== false
              ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-400 hover:to-pink-400 text-white shadow-indigo-500/25 scale-[1.01]'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
          }`}
        >
          {isMuxing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Assemblage en cours…</>
          ) : (
            <><Zap className="w-4 h-4" /> Lancer l'assemblage de la vidéo finale</>
          )}
        </button>

        {isMuxing && (
          <div className="flex-1 text-xs text-slate-400 font-mono">
            {progress.message}
          </div>
        )}
      </div>

      {/* Barre de Progression de l'assemblage */}
      {(isMuxing || progress.percentage > 0) && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-200 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-indigo-400" />
              Progression de l'encodage
            </span>
            <span className="font-mono text-indigo-300 font-bold">
              {progress.percentage.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progress.percentage}%`,
                background: progress.percentage >= 100
                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                  : 'linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899)',
              }}
            />
          </div>
          <p className="text-[11px] text-slate-400 font-mono">{progress.message}</p>
        </div>
      )}

      {/* Affichage d'erreur */}
      {error && (
        <div className="bg-rose-950/50 border border-rose-700/60 rounded-2xl p-5 flex items-start gap-3 shadow-lg">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-rose-300 mb-1">Erreur lors de l'assemblage</p>
            <p className="text-xs text-rose-300/80 font-mono whitespace-pre-wrap">{error}</p>
          </div>
        </div>
      )}

      {/* Résultat final avec Succès & Lecteur Vidéo */}
      {muxResult && muxResult.success && (
        <div className="bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-600/50 rounded-2xl p-6 space-y-5 shadow-2xl">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-emerald-300">
                Vidéo finale assemblée avec succès !
              </h3>
              <p className="text-xs text-emerald-400/80 font-mono mt-0.5">
                {muxResult.filename} — {muxResult.sizeFormatted}
              </p>
            </div>
          </div>

          {/* Lecteur vidéo intégré */}
          <div className="rounded-2xl overflow-hidden border border-slate-700 bg-black shadow-2xl">
            <video
              ref={videoPreviewRef}
              src={muxResult.downloadUrl}
              controls
              className="w-full max-h-[420px]"
            >
              Votre navigateur ne prend pas en charge la lecture vidéo.
            </video>
          </div>

          {/* Boutons d'action */}
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={muxResult.downloadUrl}
              download={muxResult.filename}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/25 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Télécharger le fichier MP4
            </a>
            <button
              onClick={() => {
                if (videoPreviewRef.current) {
                  videoPreviewRef.current.play();
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              <Play className="w-4 h-4" />
              Lire la Vidéo
            </button>
            <button
              onClick={onNavigateToSaved}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Voir dans Sauvegardes
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
