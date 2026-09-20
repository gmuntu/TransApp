import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  X, 
  Send, 
  Bot, 
  User, 
  Volume2, 
  Loader2, 
  Key, 
  CheckCircle2, 
  AlertCircle,
  BookOpen,
  Zap,
  RotateCcw
} from 'lucide-react';
import { SubtitleItem } from '../types';
import { playBrowserTtsPreview, stopBrowserTts } from '../utils/audioSynthesizer';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

interface SocraticTutorModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtitles: SubtitleItem[];
  projectName: string;
}

export const SocraticTutorModal: React.FC<SocraticTutorModalProps> = ({
  isOpen,
  onClose,
  subtitles,
  projectName
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: `Bonjour ! Je suis votre **Tuteur Socratique IA** alimenté en temps réel par **gemini-3.8-live** (Google GenAI).\n\nMon rôle n'est pas de vous donner de simples réponses toutes faites, mais de vous guider à travers des questions ciblées pour maîtriser en profondeur les concepts de votre cours et optimiser le doublage français de vos vidéos.\n\nQue souhaitez-vous explorer aujourd'hui ?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyStatusMsg, setKeyStatusMsg] = useState<string | null>(null);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Vérification de l'état de gemini-3.8-live à l'ouverture
  useEffect(() => {
    if (isOpen) {
      fetch('/api/gemini/status')
        .then(res => res.json())
        .then(data => {
          setHasApiKey(Boolean(data.isConfigured));
        })
        .catch(() => setHasApiKey(false));
    }
  }, [isOpen]);

  // Défilement automatique vers le bas
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  // Sauvegarde de la clé API Gemini
  const handleSaveApiKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!keyInput.trim()) return;

    setIsSavingKey(true);
    setKeyStatusMsg(null);

    try {
      const res = await fetch('/api/gemini/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyInput.trim() })
      });

      if (res.ok) {
        setHasApiKey(true);
        setKeyStatusMsg('Clé enregistrée avec succès ! gemini-3.8-live est actif.');
        setKeyInput('');
        setTimeout(() => setKeyStatusMsg(null), 3500);
      } else {
        const err = await res.json();
        setKeyStatusMsg(`Erreur : ${err?.error || 'Échec d\'enregistrement'}`);
      }
    } catch (err: any) {
      setKeyStatusMsg(`Erreur réseau : ${err.message}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  // Envoi de message et réception du flux SSE gemini-3.8-live
  const handleSendMessage = async (userPrompt?: string) => {
    const textToSend = (userPrompt || inputText).trim();
    if (!textToSend || isStreaming) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const modelMsgId = (Date.now() + 1).toString();
    const modelPlaceholder: Message = {
      id: modelMsgId,
      role: 'model',
      text: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg, modelPlaceholder]);
    setInputText('');
    setIsStreaming(true);

    // Préparation de l'historique
    const history = messages.map(m => ({
      role: m.role,
      text: m.text
    }));

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/tutor/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history,
          subtitlesContext: subtitles.slice(0, 40)
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(`Erreur serveur (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                setMessages(prev => prev.map(m => 
                  m.id === modelMsgId ? { ...m, text: m.text + data.text } : m
                ));
              } else if (data.error) {
                setMessages(prev => prev.map(m => 
                  m.id === modelMsgId ? { ...m, text: `⚠️ ${data.error}` } : m
                ));
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m => 
          m.id === modelMsgId 
            ? { ...m, text: `⚠️ Impossible de joindre gemini-3.8-live : ${err.message}. Vérifiez que votre clé GEMINI_API_KEY est bien configurée.` } 
            : m
        ));
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // Synthèse vocale de la réponse du tuteur via VibeVoice Nicolas
  const handleSpeak = (text: string, msgId: string) => {
    if (playingMsgId === msgId) {
      stopBrowserTts();
      setPlayingMsgId(null);
      return;
    }

    // Nettoyage sommaire du markdown pour la voix
    const cleanSpeechText = text
      .replace(/[*_#`~\[\]]/g, '')
      .replace(/\n+/g, ' ')
      .slice(0, 1200);

    setPlayingMsgId(msgId);
    playBrowserTtsPreview(cleanSpeechText, 175, () => {
      setPlayingMsgId(null);
    }, 'Nicolas');
  };

  const handleQuickQuestion = (q: string) => {
    handleSendMessage(q);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl h-[88vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-md shadow-cyan-500/10">
              <Sparkles className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Tuteur Socratique IA
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[10px] font-bold border border-cyan-500/30 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5 fill-current" />
                  gemini-3.8-live
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Dialogue temps réel & apprentissage guidé • Google GenAI Official SDK
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMessages([
                  {
                    id: 'reset',
                    role: 'model',
                    text: 'Conversation réinitialisée. Posez-moi une question sur votre cours ou vos concepts informatiques !',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  }
                ]);
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Réinitialiser la conversation"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Configuration Clé GEMINI_API_KEY si manquante */}
        {hasApiKey === false && (
          <div className="p-3 bg-amber-950/50 border-b border-amber-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-200">
              <Key className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Clé <strong>GEMINI_API_KEY</strong> requise pour activer le modèle <code>gemini-3.8-live</code>.</span>
            </div>
            <form onSubmit={handleSaveApiKey} className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="password"
                placeholder="Collez votre clé API Gemini..."
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-400 flex-1 sm:w-64"
              />
              <button
                type="submit"
                disabled={isSavingKey || !keyInput.trim()}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSavingKey ? 'Validation...' : 'Enregistrer'}
              </button>
            </form>
          </div>
        )}

        {keyStatusMsg && (
          <div className="px-4 py-2 bg-emerald-950/70 border-b border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{keyStatusMsg}</span>
          </div>
        )}

        {/* Messages Scroll Area */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 font-sans text-xs">
          {messages.map(msg => {
            const isUser = msg.role === 'user';
            const isPlaying = playingMsgId === msg.id;

            return (
              <div 
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-cyan-950 border border-cyan-800/70 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className={`max-w-[82%] sm:max-w-[75%] rounded-2xl p-4 space-y-2 shadow-md ${
                  isUser 
                    ? 'bg-cyan-600 text-slate-950 font-medium rounded-tr-sm' 
                    : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-sm leading-relaxed'
                }`}>
                  <div className="whitespace-pre-wrap leading-relaxed text-[13px]">
                    {msg.text || (isStreaming ? <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> Réflexion socratique...</span> : '')}
                  </div>

                  <div className={`flex items-center justify-between gap-2 pt-1 border-t text-[10px] font-mono ${
                    isUser ? 'border-cyan-700/50 text-cyan-900' : 'border-slate-800/80 text-slate-500'
                  }`}>
                    <span>{msg.timestamp}</span>

                    {!isUser && msg.text && (
                      <button
                        type="button"
                        onClick={() => handleSpeak(msg.text, msg.id)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                          isPlaying 
                            ? 'bg-amber-500 text-slate-950 font-bold' 
                            : 'bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700'
                        }`}
                        title="Écouter avec la voix VibeVoice Nicolas"
                      >
                        <Volume2 className="w-3 h-3" />
                        <span>{isPlaying ? 'Arrêter' : 'Écouter (VibeVoice)'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto text-[11px]">
          <span className="text-slate-500 font-mono shrink-0">Questions :</span>
          <button
            type="button"
            onClick={() => handleQuickQuestion("Pose-moi une question socratique sur le cours pour tester ma compréhension.")}
            className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 hover:border-cyan-500/50 transition-colors whitespace-nowrap cursor-pointer shrink-0"
          >
            ❓ Tester ma compréhension
          </button>
          <button
            type="button"
            onClick={() => handleQuickQuestion("Quels sont les concepts informatiques fondamentaux abordés dans ces sous-titres ?")}
            className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 hover:border-cyan-500/50 transition-colors whitespace-nowrap cursor-pointer shrink-0"
          >
            💻 Concepts clés du cours
          </button>
          <button
            type="button"
            onClick={() => handleQuickQuestion("Comment améliorer la prosodie et le débit des répliques accélérées pour Filmora ?")}
            className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 hover:border-cyan-500/50 transition-colors whitespace-nowrap cursor-pointer shrink-0"
          >
            🎙️ Prosodie & Calage Filmora
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-slate-950 border-t border-slate-800">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Posez votre question au tuteur socratique (ex: 'Que signifie cette race condition ?')..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              disabled={isStreaming}
              className="flex-1 px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isStreaming || !inputText.trim()}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-cyan-500/25 cursor-pointer disabled:opacity-50"
            >
              {isStreaming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Génération...</span>
                </>
              ) : (
                <>
                  <span>Envoyer</span>
                  <Send className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
