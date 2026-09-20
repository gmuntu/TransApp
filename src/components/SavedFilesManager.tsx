import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderCheck, 
  Trash2, 
  FileAudio, 
  FileText, 
  Download, 
  Play, 
  Pause, 
  RotateCcw, 
  RefreshCw, 
  FolderOpen, 
  Search, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Volume2,
  Edit3
} from 'lucide-react';

export interface SavedFileItem {
  name: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
  modifiedAt?: string;
  deletedAt?: string;
  type: 'audio' | 'subtitle' | 'other';
  extension: string;
  downloadUrl: string;
}

interface SavedFilesManagerProps {
  onOpenSubtitleInTable?: (filename: string) => void;
}

export const SavedFilesManager: React.FC<SavedFilesManagerProps> = ({
  onOpenSubtitleInTable
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'trash'>('active');
  const [savedFiles, setSavedFiles] = useState<SavedFileItem[]>([]);
  const [trashFiles, setTrashFiles] = useState<SavedFileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [savedDirPath, setSavedDirPath] = useState<string>('');
  
  // Audio playback state
  const [playingFileName, setPlayingFileName] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Notifications / Feedback
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [filePendingDelete, setFilePendingDelete] = useState<string | null>(null);
  const [isConfirmingEmptyTrash, setIsConfirmingEmptyTrash] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadFiles = async () => {
    setIsLoading(true);
    try {
      const [savedRes, trashRes] = await Promise.all([
        fetch('/api/saved-files'),
        fetch('/api/trash-files')
      ]);

      if (savedRes.ok) {
        const data = await savedRes.json();
        setSavedFiles(data.files || []);
        if (data.savedDirPath) setSavedDirPath(data.savedDirPath);
      }
      if (trashRes.ok) {
        const data = await trashRes.json();
        setTrashFiles(data.files || []);
      }
    } catch (err: any) {
      showToast('Erreur de connexion au serveur de fichiers', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleOpenFolder = async () => {
    try {
      const res = await fetch('/api/open-folder', { method: 'POST' });
      if (res.ok) {
        showToast('Dossier "sauvegarder" ouvert dans le Finder macOS');
      }
    } catch {
      showToast('Impossible d\'ouvrir le Finder automatiquement', 'error');
    }
  };

  const handleDeleteFile = async (filename: string) => {
    try {
      if (playingFileName === filename && audioRef.current) {
        audioRef.current.pause();
        setPlayingFileName(null);
      }
      const res = await fetch(`/api/saved-files/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast(`"${filename}" a été déplacé dans la poubelle 🗑️`);
        setFilePendingDelete(null);
        loadFiles();
      } else {
        const data = await res.json();
        showToast(data?.error || 'Erreur lors de la suppression', 'error');
      }
    } catch {
      showToast('Erreur réseau lors de la suppression', 'error');
    }
  };

  const handleRestoreFile = async (filename: string) => {
    try {
      const res = await fetch(`/api/trash-files/restore/${encodeURIComponent(filename)}`, {
        method: 'POST'
      });
      if (res.ok) {
        showToast(`"${filename}" a été restauré dans sauvegarder/`);
        loadFiles();
      } else {
        const data = await res.json();
        showToast(data?.error || 'Erreur lors de la restauration', 'error');
      }
    } catch {
      showToast('Erreur réseau lors de la restauration', 'error');
    }
  };

  const handleEmptyTrash = async () => {
    try {
      const res = await fetch('/api/trash-files/empty', {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        showToast(data?.message || 'Poubelle vidée définitivement');
        setIsConfirmingEmptyTrash(false);
        loadFiles();
      }
    } catch {
      showToast('Erreur lors du vidage de la poubelle', 'error');
    }
  };

  const togglePlayAudio = (filename: string, url: string) => {
    if (playingFileName === filename) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingFileName(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(e => console.warn('Audio playback error:', e));
      }
      setPlayingFileName(filename);
    }
  };

  const filteredSavedFiles = savedFiles.filter(f => 
    !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Hidden Global Audio Element */}
      <audio 
        ref={audioRef} 
        onEnded={() => setPlayingFileName(null)}
        onError={() => setPlayingFileName(null)}
      />

      {/* Header & Overview Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <FolderCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Bibliothèque des Fichiers Traités
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/80 text-[11px] font-mono font-bold">
                  sauvegarder/
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Tous vos doublages audio <span className="text-cyan-300 font-mono">.wav</span> et sous-titres traduits <span className="text-cyan-300 font-mono">.srt</span> sont automatiquement enregistrés et sécurisés ici.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <button
              onClick={handleOpenFolder}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors shadow-sm cursor-pointer"
              title="Ouvrir le dossier local dans le Finder macOS"
            >
              <FolderOpen className="w-4 h-4 text-cyan-400" />
              <span>Ouvrir dans Finder</span>
            </button>

            <button
              onClick={loadFiles}
              disabled={isLoading}
              className="inline-flex items-center justify-center p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
              title="Actualiser la liste des fichiers"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tabs & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-6 pt-5 border-t border-slate-800">
          <div className="flex items-center gap-2 bg-slate-950/80 p-1 rounded-xl border border-slate-800 w-fit">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderCheck className="w-3.5 h-3.5" />
              <span>Fichiers Sauvegardés</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'active' ? 'bg-slate-950/30 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
              }`}>
                {savedFiles.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('trash')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'trash'
                  ? 'bg-rose-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-rose-300'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Poubelle (Corbeille)</span>
              {trashFiles.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === 'trash' ? 'bg-slate-950/30 text-slate-950 font-bold' : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}>
                  {trashFiles.length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'active' && savedFiles.length > 0 && (
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un fichier..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          )}

          {activeTab === 'trash' && trashFiles.length > 0 && (
            <div>
              {isConfirmingEmptyTrash ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-300 font-medium">Vider définitivement ?</span>
                  <button
                    onClick={handleEmptyTrash}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Oui, vider
                  </button>
                  <button
                    onClick={() => setIsConfirmingEmptyTrash(false)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsConfirmingEmptyTrash(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 text-xs font-semibold border border-rose-800/80 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Vider la poubelle</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium border animate-in fade-in slide-in-from-top-1 ${
          toastMessage.type === 'success'
            ? 'bg-emerald-950/90 text-emerald-200 border-emerald-800/80'
            : 'bg-rose-950/90 text-rose-200 border-rose-800/80'
        }`}>
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Content Area */}
      {activeTab === 'active' ? (
        <div>
          {savedFiles.length === 0 ? (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-800/60 text-cyan-400 mx-auto flex items-center justify-center mb-3">
                <FolderCheck className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">Le répertoire "sauvegarder" est prêt</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                Aucun fichier n'a encore été généré. Dès que vous traduisez un fichier ou créez le doublage audio VibeVoice, les fichiers finaux <strong className="text-cyan-300">.wav</strong> et <strong className="text-cyan-300">.srt</strong> s'afficheront ici automatiquement.
              </p>
            </div>
          ) : filteredSavedFiles.length === 0 ? (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-8 text-center text-xs text-slate-400">
              Aucun fichier ne correspond à votre recherche "{searchQuery}".
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredSavedFiles.map((file) => {
                const isAudio = file.type === 'audio';
                const isPlaying = playingFileName === file.name;

                return (
                  <div 
                    key={file.name}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-xl bg-slate-900/70 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-all gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isAudio 
                          ? 'bg-purple-950/80 border border-purple-800/60 text-purple-400' 
                          : 'bg-emerald-950/80 border border-emerald-800/60 text-emerald-400'
                      }`}>
                        {isAudio ? <FileAudio className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-xs font-mono truncate max-w-xs sm:max-w-md">
                            {file.name}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase font-bold ${
                            isAudio 
                              ? 'bg-purple-950 text-purple-300 border border-purple-800/60' 
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                          }`}>
                            {file.extension}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                          <span>{file.sizeFormatted}</span>
                          <span>•</span>
                          <span>
                            {new Date(file.modifiedAt || file.createdAt).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      {isAudio && (
                        <button
                          onClick={() => togglePlayAudio(file.name, file.downloadUrl)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            isPlaying
                              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                          }`}
                        >
                          {isPlaying ? (
                            <>
                              <Pause className="w-3.5 h-3.5 fill-current" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Écouter</span>
                            </>
                          )}
                        </button>
                      )}

                      <a
                        href={file.downloadUrl}
                        download={file.name}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                        title="Télécharger sur votre ordinateur"
                      >
                        <Download className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Télécharger</span>
                      </a>

                      {!isAudio && onOpenSubtitleInTable && (
                        <button
                          type="button"
                          onClick={() => onOpenSubtitleInTable(file.name)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 text-xs font-semibold border border-cyan-700/80 transition-all cursor-pointer shadow-sm shadow-cyan-950/50"
                          title="Ouvrir ce fichier dans le tableau interactif pour le réviser et le corriger"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Corriger dans le Tableau</span>
                        </button>
                      )}

                      {filePendingDelete === file.name ? (
                        <div className="flex items-center gap-1.5 pl-1">
                          <button
                            onClick={() => handleDeleteFile(file.name)}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer"
                            title="Confirmer la mise à la poubelle"
                          >
                            Confirmer
                          </button>
                          <button
                            onClick={() => setFilePendingDelete(null)}
                            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs transition-colors cursor-pointer"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setFilePendingDelete(file.name)}
                          className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-800/60 transition-colors cursor-pointer"
                          title="Mettre ce fichier à la poubelle"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Trash Tab */
        <div>
          {trashFiles.length === 0 ? (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/60 text-slate-400 mx-auto flex items-center justify-center mb-3">
                <Trash2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">La poubelle est vide</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
                Aucun fichier n'a été mis à la poubelle. Lorsque vous supprimez un fichier de vos sauvegardes, il sera placé ici avant d'être vidé définitivement.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/40 text-rose-200 text-xs flex items-center justify-between">
                <span>{trashFiles.length} fichier(s) dans la poubelle locale (.poubelle/)</span>
                <span className="text-[11px] text-rose-300 font-mono">Vous pouvez les restaurer ou les vider</span>
              </div>

              {trashFiles.map((file) => (
                <div 
                  key={file.name}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-xl bg-slate-900/50 border border-slate-800/60 gap-3 opacity-90 hover:opacity-100 transition-opacity"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                      <Trash2 className="w-4 h-4 text-rose-400" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-300 text-xs font-mono truncate block line-through decoration-rose-500/50">
                        {file.name}
                      </span>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-0.5">
                        <span>{file.sizeFormatted}</span>
                        <span>•</span>
                        <span>
                          Supprimé le {new Date(file.deletedAt || '').toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      onClick={() => handleRestoreFile(file.name)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-300 text-xs font-semibold border border-emerald-800/60 transition-colors cursor-pointer"
                      title="Restaurer le fichier dans le dossier sauvegarder/"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restaurer</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
