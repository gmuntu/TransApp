import React, { useState } from 'react';
import { 
  Terminal, 
  Copy, 
  Check, 
  Download, 
  Cpu, 
  ShieldCheck, 
  FileCode, 
  FolderDown, 
  ExternalLink,
  Code2,
  Play,
  Zap,
  Sparkles
} from 'lucide-react';
import { 
  PYTHON_SOURCE_CODE, 
  REQUIREMENTS_TXT, 
  SETUP_SHELL_SCRIPT,
  BATCH_PROCESSOR_PYTHON_SCRIPT,
  DOUBLAGE_MASTER_PYTHON_SCRIPT
} from '../data/pythonScript';
import { QWEN3_TTS_COMMAND_SCRIPT, QWEN3_TTS_PYTHON_DUBBER_SCRIPT } from '../data/voiceGuides';

export const Step4PythonScriptHub: React.FC = () => {
  const [activeFile, setActiveFile] = useState<'batch_processor' | 'doublage_master' | 'qwen3' | 'script' | 'requirements' | 'setup'>('batch_processor');
  const [copied, setCopied] = useState(false);

  const getActiveContent = () => {
    switch (activeFile) {
      case 'batch_processor':
        return BATCH_PROCESSOR_PYTHON_SCRIPT;
      case 'doublage_master':
        return DOUBLAGE_MASTER_PYTHON_SCRIPT;
      case 'qwen3':
        return QWEN3_TTS_PYTHON_DUBBER_SCRIPT;
      case 'script':
        return PYTHON_SOURCE_CODE;
      case 'requirements':
        return REQUIREMENTS_TXT;
      case 'setup':
        return SETUP_SHELL_SCRIPT;
    }
  };

  const getFileName = () => {
    switch (activeFile) {
      case 'batch_processor':
        return 'batch_processor.py';
      case 'doublage_master':
        return 'doublage_master.py';
      case 'qwen3':
        return 'qwen3_tts_dubber.py';
      case 'script':
        return 'mac_stitch_and_pad_dubber.py';
      case 'requirements':
        return 'requirements.txt';
      case 'setup':
        return 'setup_mac_m1.sh';
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = getActiveContent();
    const filename = getFileName();
    const isCommand = filename.endsWith('.command') || filename.endsWith('.sh');
    const mime = isCommand ? 'application/x-sh;charset=utf-8' : 'text/plain;charset=utf-8';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-amber-950 text-amber-400 border border-amber-800 flex items-center gap-1">
                <Zap className="w-3 h-3 fill-current" />
                MOTEUR IA QWEN3-TTS & NEURAL DISPONIBLE
              </span>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Python 3.13 Desktop & Dubbing Hub
              </h2>
            </div>
            <p className="text-sm text-slate-400 max-w-3xl">
              Générez votre doublage avec le moteur <strong className="text-amber-300">Qwen3-TTS (0% robotique)</strong> ou avec le moteur Apple Silicon <strong className="text-slate-200">macOS Thomas</strong>. Aligné sur votre Master Canvas 44100Hz Stéréo pour Filmora.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="copy-active-file-btn"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
              <span>{copied ? 'Copié dans le presse-papier !' : 'Copier le code'}</span>
            </button>

            <button
              id="download-active-file-btn"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-md shadow-amber-950/30 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Télécharger {getFileName()}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5 Architecture Rules Verification Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
          <span className="text-[10px] text-amber-400 font-mono font-bold uppercase flex items-center gap-1">
            <Zap className="w-2.5 h-2.5" /> 1. Voix 0% Robot
          </span>
          <p className="text-xs font-bold text-white mt-0.5">Qwen3-TTS / Neural</p>
          <p className="text-[11px] text-slate-400 mt-1">Prosodie humaine et souffle naturel sans accent mécanique métallique.</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
          <span className="text-[10px] text-cyan-400 font-mono font-bold uppercase">2. Sous-titres</span>
          <p className="text-xs font-bold text-white mt-0.5">pysrt</p>
          <p className="text-[11px] text-slate-400 mt-1">Parse 3500+ lignes à la milliseconde sans perte de timing.</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
          <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase">3. Traduction</span>
          <p className="text-xs font-bold text-white mt-0.5">deep-translator</p>
          <p className="text-[11px] text-slate-400 mt-1">Adaptation technique pour cours de programmation et informatique.</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
          <span className="text-[10px] text-amber-400 font-mono font-bold uppercase">4. Patch Python 3.13</span>
          <p className="text-xs font-bold text-white mt-0.5">audioop-lts</p>
          <p className="text-[11px] text-slate-400 mt-1">Résout la dépréciation PEP 594 pour un pydub 100% fonctionnel.</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl">
          <span className="text-[10px] text-indigo-400 font-mono font-bold uppercase">5. Master Canvas</span>
          <p className="text-xs font-bold text-white mt-0.5">pydub (Stitch & Pad)</p>
          <p className="text-[11px] text-slate-400 mt-1">Canvas silencieux 44.1kHz Stéréo qui prévient tout drift cumulatif.</p>
        </div>
      </div>

      {/* Terminal Quick-Start on macOS */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 font-mono">
        <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
            <span className="ml-2 text-slate-300 font-bold">Terminal — zsh (MacBook Pro Apple Silicon M1)</span>
          </div>
          <span className="text-amber-400 font-bold">Qwen3-TTS & Python 3.13</span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="text-slate-500"># OPTION A (Recommandée) : Doublage IA Qwen3-TTS & Neural Studio (0% robot)</div>
          <div className="text-emerald-300 pl-3 font-semibold">
            <span className="text-amber-400">$</span> pip install edge-tts pysrt pydub audioop-lts deep-translator
          </div>
          <div className="text-emerald-300 pl-3 font-semibold">
            <span className="text-amber-400">$</span> python3 qwen3_tts_dubber.py week4.srt doublage_qwen3_filmora.wav
          </div>

          <div className="text-slate-500 pt-2"># OPTION B : Installation complète du pack PyTorch Qwen3-TTS via script Mac :</div>
          <div className="text-slate-300 pl-3">
            <span className="text-cyan-400">$</span> chmod +x setup_qwen3_tts.command && ./setup_qwen3_tts.command
          </div>

          <div className="text-slate-500 pt-2"># OPTION C : Moteur natif macOS Thomas (say -v Thomas) :</div>
          <div className="text-slate-300 pl-3">
            <span className="text-cyan-400">$</span> python3 mac_stitch_and_pad_dubber.py --input week4.srt --step all --voice Thomas
          </div>
        </div>
      </div>

      {/* Code Viewer Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {/* File Tabs */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 overflow-x-auto">
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="tab-batch-processor-btn"
              onClick={() => setActiveFile('batch_processor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeFile === 'batch_processor'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-cyan-400 hover:text-cyan-200 hover:bg-cyan-950/40'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>batch_processor.py (gemini-3.8-live)</span>
            </button>

            <button
              type="button"
              id="tab-doublage-master-btn"
              onClick={() => setActiveFile('doublage_master')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeFile === 'doublage_master'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/40'
              }`}
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>doublage_master.py (Master Filmora)</span>
            </button>

            <button
              type="button"
              id="tab-qwen3-btn"
              onClick={() => setActiveFile('qwen3')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeFile === 'qwen3'
                  ? 'bg-amber-950/60 text-amber-300 border border-amber-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>qwen3_tts_dubber.py</span>
            </button>

            <button
              type="button"
              id="tab-script-btn"
              onClick={() => setActiveFile('script')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeFile === 'script'
                  ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>mac_stitch_and_pad_dubber.py</span>
            </button>

            <button
              type="button"
              id="tab-requirements-btn"
              onClick={() => setActiveFile('requirements')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeFile === 'requirements'
                  ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>requirements.txt</span>
            </button>

            <button
              type="button"
              id="tab-setup-btn"
              onClick={() => setActiveFile('setup')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeFile === 'setup'
                  ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>setup_mac_m1.sh</span>
            </button>
          </div>

          <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap pl-3">
            {activeFile === 'qwen3' ? 'Moteur IA Qwen3 • 0% Robot' : activeFile === 'script' ? 'macOS say -v Thomas • 410 Lines' : 'Config'}
          </span>
        </div>

        {/* Code Content */}
        <div className="p-4 max-h-[600px] overflow-y-auto bg-slate-950 font-mono text-xs leading-relaxed text-slate-300">
          <pre className="whitespace-pre overflow-x-auto">
            <code>{getActiveContent()}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
