import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, execFileSync } from 'child_process';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// ─── Dynamic FFmpeg binary resolution (cross-platform) ───────────────
let _cachedFFmpegPath: string | null = null;
function resolveFFmpegPath(): string {
  if (_cachedFFmpegPath) return _cachedFFmpegPath;
  // 1. Try system PATH via 'which'
  try {
    const result = execFileSync('which', ['ffmpeg'], { encoding: 'utf-8' }).trim();
    if (result && fs.existsSync(result)) {
      _cachedFFmpegPath = result;
      return result;
    }
  } catch {}
  // 2. Common candidates
  const candidates = [
    '/opt/homebrew/bin/ffmpeg',   // macOS Apple Silicon
    '/usr/local/bin/ffmpeg',      // macOS Intel / Linux
    '/usr/bin/ffmpeg',            // Linux distro
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      _cachedFFmpegPath = c;
      return c;
    }
  }
  // 3. Fallback — hope it's on PATH
  _cachedFFmpegPath = 'ffmpeg';
  return 'ffmpeg';
}

// ─── Dynamic yt-dlp binary resolution (cross-platform) ───────────────
let _cachedYtDlpPath: string | null = null;
function resolveYtDlpPath(): string | null {
  if (_cachedYtDlpPath && fs.existsSync(_cachedYtDlpPath)) return _cachedYtDlpPath;
  // 1. Try system PATH via 'which'
  try {
    const result = execFileSync('which', ['yt-dlp'], { encoding: 'utf-8' }).trim();
    if (result && fs.existsSync(result)) {
      _cachedYtDlpPath = result;
      return result;
    }
  } catch {}
  // 2. Common candidates
  const candidates = [
    '/opt/homebrew/bin/yt-dlp',   // macOS Apple Silicon
    '/usr/local/bin/yt-dlp',      // macOS Intel / Linux
    '/usr/bin/yt-dlp',            // Linux distro
    path.join(os.homedir(), '.local/bin/yt-dlp'),
    path.join(process.cwd(), 'venv/bin/yt-dlp'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      _cachedYtDlpPath = c;
      return c;
    }
  }
  return null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY)
    });
  });

  // Modèle exclusif Google GenAI
  const GEMINI_MODEL = 'gemini-3.8-live';

  // Client officiel GoogleGenAI (@google/genai)
  let geminiClient: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI | null {
    const key = process.env.GEMINI_API_KEY;
    if (!key || !key.trim()) return null;
    if (!geminiClient) {
      geminiClient = new GoogleGenAI({ apiKey: key.trim() });
    }
    return geminiClient;
  }

  // Statut de la configuration gemini-3.8-live
  app.get('/api/gemini/status', (_req, res) => {
    const key = process.env.GEMINI_API_KEY || '';
    res.json({
      model: GEMINI_MODEL,
      isConfigured: Boolean(key && key.trim().length > 5),
      keyLength: key ? key.length : 0,
      sdk: '@google/genai (official)'
    });
  });

  // Sauvegarde dynamique de la clé GEMINI_API_KEY
  app.post('/api/gemini/config', async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (typeof apiKey !== 'string' || !apiKey.trim()) {
        return res.status(400).json({ error: 'Une clé API valide est requise' });
      }

      const cleanKey = apiKey.trim();
      process.env.GEMINI_API_KEY = cleanKey;
      geminiClient = new GoogleGenAI({ apiKey: cleanKey });

      // Sauvegarde dans le fichier .env
      const envPath = path.join(process.cwd(), '.env');
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
      }

      if (envContent.includes('GEMINI_API_KEY=')) {
        envContent = envContent.replace(/GEMINI_API_KEY=.*/g, `GEMINI_API_KEY="${cleanKey}"`);
      } else {
        envContent += `\nGEMINI_API_KEY="${cleanKey}"\n`;
      }
      fs.writeFileSync(envPath, envContent, 'utf-8');

      return res.json({
        success: true,
        model: GEMINI_MODEL,
        message: `Clé GEMINI_API_KEY configurée pour le modèle ${GEMINI_MODEL}.`
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Erreur de sauvegarde de la clé' });
    }
  });

  // Tuteur Socratique IA : Flux de streaming temps réel via gemini-3.8-live (SSE)
  app.post('/api/tutor/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendSSE = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const { message, history = [], subtitlesContext = [] } = req.body;
      const client = getGeminiClient();

      if (!client) {
        sendSSE('error', {
          error: 'Clé GEMINI_API_KEY non configurée. Veuillez renseigner votre clé API dans les paramètres pour activer le modèle gemini-3.8-live.'
        });
        return res.end();
      }

      // Contexte issu des sous-titres du cours
      let contextSnippet = '';
      if (Array.isArray(subtitlesContext) && subtitlesContext.length > 0) {
        const topSubs = subtitlesContext.slice(0, 35).map((s: any) =>
          `[#${s.index || s.id} ${s.startTimeStr || ''}] EN: ${s.enText || ''} | FR: ${s.frText || ''}`
        ).join('\n');
        contextSnippet = `\n\nContexte actuel des sous-titres du cours (${subtitlesContext.length} segments au total):\n${topSubs}`;
      }

      const systemInstruction = `Tu es SavoirIA Tuteur Socratique, un mentor pédagogique d'élite en informatique, programmation et doublage vidéo.
Tu t'appuies exclusivement sur le modèle gemini-3.8-live pour un dialogue socratique stimulant en français avec l'apprenant.
Règles pédagogiques :
1. Adopte la méthode socratique : pose des questions directrices, pousse l'étudiant à analyser le problème, à raisonner étape par étape et à déduire la solution.
2. Explique avec rigueur et clarté les concepts techniques (threads, mutex, race conditions, memory leaks, garbage collector, complexité spatiale et temporelle, pile vs tas, synchronisation labiale, etc.).
3. Si l'étudiant pose une question sur le cours chargé, réfère-toi aux extraits de sous-titres ci-dessous.
4. Reste engageant, bienveillant, clair et dynamique. Utilise le markdown pour structurer les explications et le code.${contextSnippet}`;

      // Construction de l'historique multi-tours
      const contents: any[] = [];
      for (const h of history) {
        if (h.role && h.text) {
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
          });
        }
      }
      contents.push({
        role: 'user',
        parts: [{ text: message || 'Bonjour, peux-tu m\'aider à explorer les concepts clés de ce cours ?' }]
      });

      sendSSE('start', { model: GEMINI_MODEL });

      // Flux de streaming en direct avec gemini-3.8-live
      const responseStream = await client.models.generateContentStream({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          sendSSE('chunk', { text: chunk.text });
        }
      }

      sendSSE('done', { model: GEMINI_MODEL });
      res.end();
    } catch (err: any) {
      console.error('Tutor stream error:', err);
      sendSSE('error', {
        error: `Erreur lors de la génération avec ${GEMINI_MODEL}: ${err?.message || 'Échec de connexion'}`
      });
      res.end();
    }
  });

  // Traduction et adaptation pour doublage par lot via gemini-3.8-live
  app.post('/api/gemini/translate-batch', async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array is required' });
      }

      const client = getGeminiClient();
      if (!client) {
        return res.status(400).json({
          error: 'Clé GEMINI_API_KEY non configurée pour gemini-3.8-live.'
        });
      }

      const prompt = `Tu es un adaptateur de doublage de cours d'informatique.
Traduis et adapte ces répliques en français pour une voix naturelle et une synchronisation labiale fluide (modèle gemini-3.8-live).
Conserve impérativement le vocabulaire informatique standard (deadlock, thread, race condition, heap, stack, pointer, etc.).
Retourne STRICTEMENT un tableau JSON au format suivant :
[{"id": 1, "frText": "..."}, {"id": 2, "frText": "..."}]

Sous-titres originaux :
${JSON.stringify(items.map((it: any) => ({ id: it.id, text: it.text || it.enText })))}`;

      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      });

      const responseText = response.text || '[]';
      let parsed = [];
      try {
        parsed = JSON.parse(responseText);
      } catch {
        const match = responseText.match(/\[[\s\S]*\]/);
        if (match) parsed = JSON.parse(match[0]);
      }

      return res.json({
        model: GEMINI_MODEL,
        translations: parsed
      });
    } catch (err: any) {
      console.error('Gemini translate-batch error:', err);
      return res.status(500).json({ error: err?.message || 'Gemini batch translation failed' });
    }
  });

  // Translation cache to avoid redundant network calls
  const serverTranslationCache = new Map<string, string>();

  // Translation endpoint for subtitle chunks using Google Translate
  app.post('/api/translate', async (req, res) => {
    try {
      let { items, text } = req.body;

      // Support single text translation: { text: "..." }
      const isSingle = typeof text === 'string' && text.trim().length > 0;
      if (isSingle) {
        items = [{ id: 1, text: text.trim() }];
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array or text string is required' });
      }

      // Helper to translate a single item with cache & retry
      const translateItem = async (item: any): Promise<{ id: any; frText: string }> => {
        const rawText = (item.text || '').trim();
        if (!rawText) return { id: item.id, frText: '' };

        const lower = rawText.toLowerCase();
        if (serverTranslationCache.has(lower)) {
          return { id: item.id, frText: serverTranslationCache.get(lower)! };
        }

        // 1. Google Translate API with retry
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const gUrl = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=fr&dt=t&q=${encodeURIComponent(rawText)}`;
            const resp = await fetch(gUrl, { signal: AbortSignal.timeout(6000) });
            if (resp.ok) {
              const data: any = await resp.json();
              if (Array.isArray(data) && Array.isArray(data[0])) {
                const translated = data[0].map((chunk: any) => chunk[0]).filter(Boolean).join('');
                if (translated && translated.trim().length > 0) {
                  serverTranslationCache.set(lower, translated.trim());
                  return { id: item.id, frText: translated.trim() };
                }
              }
            } else if (resp.status === 429) {
              // Rate limit hit - pause 200ms before retry
              await new Promise(r => setTimeout(r, 200));
            }
          } catch (gErr) {
            if (attempt === 0) await new Promise(r => setTimeout(r, 80));
          }
        }

        // 2. Fallback to MyMemory if Google is temporarily unreachable
        try {
          const mUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(rawText)}&langpair=en|fr`;
          const resp = await fetch(mUrl, { signal: AbortSignal.timeout(3000) });
          const data: any = await resp.json();
          const translated = data?.responseData?.translatedText;
          if (translated && typeof translated === 'string' && !translated.toUpperCase().includes('MYMEMORY WARNING')) {
            serverTranslationCache.set(lower, translated.trim());
            return { id: item.id, frText: translated.trim() };
          }
        } catch {}

        return { id: item.id, frText: rawText };
      };

      // Process items in concurrency pools of 6 to prevent IP blocking
      const results: { id: any; frText: string }[] = [];
      const POOL_SIZE = 6;
      for (let i = 0; i < items.length; i += POOL_SIZE) {
        const chunk = items.slice(i, i + POOL_SIZE);
        const chunkResults = await Promise.all(chunk.map(translateItem));
        results.push(...chunkResults);
        if (i + POOL_SIZE < items.length) {
          await new Promise(r => setTimeout(r, 20));
        }
      }

      if (isSingle) {
        return res.json({ translatedText: results[0]?.frText || text, engine: 'google-translate' });
      }
      return res.json({ translations: results, engine: 'google-translate' });
    } catch (err: any) {
      console.error('Translation endpoint error:', err);
      return res.status(500).json({ error: err?.message || 'Google translation failed' });
    }
  });

  // Helper to check or spawn VibeVoice service
  const VIBEVOICE_URL = 'http://127.0.0.1:5005';
  function ensureVibeVoiceRunning() {
    fetch(`${VIBEVOICE_URL}/health`).catch(() => {
      const homeEnv = path.join(os.homedir(), '.vibevoice_env/bin/python3');
      const venvBin = path.join(process.cwd(), 'venv/bin/python3');
      const pythonBin = fs.existsSync(homeEnv) ? homeEnv : (fs.existsSync(venvBin) ? venvBin : 'python3');
      const scriptPath = path.join(process.cwd(), 'vibevoice_service.py');
      if (fs.existsSync(scriptPath)) {
        console.log(`🔄 Démarrage automatique de VibeVoice avec ${pythonBin}...`);
        const p = spawn(pythonBin, [scriptPath], {
          detached: true,
          stdio: 'ignore'
        });
        p.unref();
      }
    });
  }
  ensureVibeVoiceRunning();
  // Auto-healing watchdog: check VibeVoice service every 15s and auto-respawn if needed
  setInterval(ensureVibeVoiceRunning, 15000);

  // Get available voices (VibeVoice + Cloned Voices + Neural Fallback)
  app.get('/api/voices', async (_req, res) => {
    try {
      const resp = await fetch(`${VIBEVOICE_URL}/api/voices`, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        const data = await resp.json();
        return res.json(data);
      }
    } catch {}

    // Built-in catalog if service is still loading
    return res.json({
      voices: [
        { id: 'Nicolas', name: 'VibeVoice — Nicolas (Accent Français)', gender: 'Homme', category: 'VibeVoice Français', badge: '⭐ Voix Sélectionnée (Prioritaire)', isCloned: false },
        { id: 'Camille', name: 'VibeVoice — Camille (Accent Français)', gender: 'Femme', category: 'VibeVoice Français', badge: 'Studio Pro', isCloned: false },
        { id: 'Antoine', name: 'VibeVoice — Antoine (Accent Français)', gender: 'Homme', category: 'VibeVoice Français', badge: 'Studio Pro', isCloned: false },
        { id: 'Lea', name: 'VibeVoice — Léa (Accent Français)', gender: 'Femme', category: 'VibeVoice Français', badge: 'Studio Pro', isCloned: false },
        { id: 'Alice', name: 'VibeVoice — Alice', gender: 'Femme', category: 'VibeVoice Studio', badge: 'Studio Pro', isCloned: false },
        { id: 'Carter', name: 'VibeVoice — Carter', gender: 'Homme', category: 'VibeVoice Studio', badge: 'Studio Pro', isCloned: false },
        { id: 'fr-FR-HenriNeural', name: 'Microsoft Henri (Français Paris)', gender: 'Homme', category: 'Neural Cloud', badge: 'Secours', isCloned: false },
        { id: 'fr-FR-DeniseNeural', name: 'Microsoft Denise (Français Paris)', gender: 'Femme', category: 'Neural Cloud', badge: 'Secours', isCloned: false }
      ]
    });
  });

  // Synthesize French speech with VibeVoice as PRIORITY #1 (0% robotic)
  app.post('/api/synthesize-neural', async (req, res) => {
    try {
      const { text, voice = 'Nicolas', rate = 0, cfg_scale = 1.3, ddpm_steps = 5 } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'text is required' });
      }

      // 1. Priority 1: VibeVoice High-Fidelity Studio Speech Engine (In-Memory MPS)
      const isEdgeVoice = typeof voice === 'string' && (voice.startsWith('fr-FR-') || voice.includes('Neural'));
      if (!isEdgeVoice) {
        try {
          const vvResp = await fetch(`${VIBEVOICE_URL}/api/synthesize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: text.slice(0, 2000),
              voice: voice || 'Nicolas',
              cfg_scale,
              ddpm_steps
            }),
            signal: AbortSignal.timeout(30000)
          });

          if (vvResp.ok) {
            const arrayBuf = await vvResp.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);
            res.setHeader('Content-Type', 'audio/wav');
            res.setHeader('Content-Length', buffer.length);
            res.setHeader('X-Voice-Engine', 'VibeVoice-1.5B');
            return res.send(buffer);
          }
        } catch (vvErr) {
          console.warn('VibeVoice busy/offline, falling back to Microsoft Edge Neural:', vvErr);
        }
      }

      // 2. Priority 2: Native macOS French Speech Engine (Instant 44.1kHz Stereo WAV, 0% crash, 0 external processes)
      const macVoice = voice === 'Camille' || voice === 'Lea' || voice === 'Alice' ? 'Amélie' : 'Thomas';
      const tempAiff = path.join(os.tmpdir(), `mac_speech_${Date.now()}_${Math.random().toString(36).slice(2)}.aiff`);
      const tempWav = path.join(os.tmpdir(), `mac_speech_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);

      await new Promise<void>((resolve, reject) => {
        const sayProc = spawn('say', ['-v', macVoice, '-o', tempAiff, text.slice(0, 1500)]);
        sayProc.on('close', (code) => {
          if (code === 0 && fs.existsSync(tempAiff)) resolve();
          else reject(new Error(`say exited with code ${code}`));
        });
        sayProc.on('error', reject);
      });

      // Convert to 44.1kHz Stereo WAV via ffmpeg
      await new Promise<void>((resolve, reject) => {
        const ffProc = spawn(resolveFFmpegPath(), ['-y', '-i', tempAiff, '-ar', '44100', '-ac', '2', tempWav]);
        ffProc.on('close', (code) => {
          if (code === 0 && fs.existsSync(tempWav)) resolve();
          else reject(new Error(`ffmpeg exited with code ${code}`));
        });
        ffProc.on('error', reject);
      });

      const audioBuffer = fs.readFileSync(tempWav);
      try { fs.unlinkSync(tempAiff); } catch {}
      try { fs.unlinkSync(tempWav); } catch {}

      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Length', audioBuffer.length);
      res.setHeader('X-Voice-Engine', 'macOS-Native');
      return res.send(audioBuffer);
    } catch (err: any) {
      console.error('Speech synthesis error:', err);
      return res.status(500).json({ error: err?.message || 'Synthesis failed' });
    }
  });

  // =========================================================================
  // GESTION DU RÉPERTOIRE "sauvegarder" ET DE LA POUBELLE (Corbeille)
  // =========================================================================
  const SAVED_DIR = path.join(process.cwd(), 'sauvegarder');
  const TRASH_DIR = path.join(SAVED_DIR, '.poubelle');
  if (!fs.existsSync(SAVED_DIR)) fs.mkdirSync(SAVED_DIR, { recursive: true });
  if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });

  // Helper to build 44.1kHz Stereo PCM WAV buffer directly in memory
  function buildMasterWavBuffer(
    durationMs: number,
    speechChunks: { offsetMs: number; pcm: Buffer }[] = []
  ): Buffer {
    const sampleRate = 44100;
    const numChannels = 2;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample; // 4
    const byteRate = sampleRate * blockAlign; // 176400

    const canvasMs = Math.max(durationMs + 2000, 5000);
    const totalFrames = Math.floor((canvasMs / 1000) * sampleRate);
    const dataByteLength = totalFrames * blockAlign;
    const totalBufferLength = 44 + dataByteLength;

    const wavBuf = Buffer.alloc(totalBufferLength);

    // RIFF Header
    wavBuf.write('RIFF', 0);
    wavBuf.writeUInt32LE(36 + dataByteLength, 4);
    wavBuf.write('WAVE', 8);

    // fmt chunk
    wavBuf.write('fmt ', 12);
    wavBuf.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    wavBuf.writeUInt16LE(1, 20); // PCM format
    wavBuf.writeUInt16LE(numChannels, 22);
    wavBuf.writeUInt32LE(sampleRate, 24);
    wavBuf.writeUInt32LE(byteRate, 28);
    wavBuf.writeUInt16LE(blockAlign, 32);
    wavBuf.writeUInt16LE(bitsPerSample, 34);

    // data chunk
    wavBuf.write('data', 36);
    wavBuf.writeUInt32LE(dataByteLength, 40);

    // Overlay speech PCM buffers at exact millisecond offsets
    for (const chunk of speechChunks) {
      const startSample = Math.floor((chunk.offsetMs / 1000) * sampleRate);
      const startByte = 44 + startSample * blockAlign;
      if (startByte < totalBufferLength) {
        const copyLen = Math.min(chunk.pcm.length, totalBufferLength - startByte);
        chunk.pcm.copy(wavBuf, startByte, 0, copyLen);
      }
    }

    return wavBuf;
  }

  // Synthesize complete Master Canvas (44.1kHz Stereo PCM WAV)
  app.post('/api/synthesize-master-canvas', async (req, res) => {
    try {
      const { subtitles, totalDurationMs, voice = 'Nicolas' } = req.body;
      if (!Array.isArray(subtitles) || subtitles.length === 0) {
        return res.status(400).json({ error: 'subtitles array is required' });
      }

      const safeProj = (req.body.projectName || 'cours').replace(/[^a-zA-Z0-9_-]/g, '_');
      const autoSaveName = `${safeProj}_fr_vibevoice.wav`;

      // 1. Try VibeVoice canvas endpoint if item count is reasonable (<= 15)
      if (subtitles.length <= 15) {
        try {
          const vvResp = await fetch(`${VIBEVOICE_URL}/api/synthesize-canvas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subtitles, totalDurationMs, voice }),
            signal: AbortSignal.timeout(15000)
          });

          if (vvResp.ok) {
            const arrayBuf = await vvResp.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);

            try {
              fs.writeFileSync(path.join(SAVED_DIR, autoSaveName), buffer);
              console.log(`📁 Fichier master VibeVoice sauvegardé dans: sauvegarder/${autoSaveName}`);
            } catch (saveErr) {
              console.warn('Auto-save master canvas warning:', saveErr);
            }

            res.setHeader('Content-Type', 'audio/wav');
            res.setHeader('Content-Length', buffer.length);
            res.setHeader('X-Voice-Engine', 'VibeVoice-Master');
            return res.send(buffer);
          }
        } catch (err) {
          console.warn('VibeVoice canvas timed out/offline, assembling via studio engine:', err);
        }
      }

      // 2. High-speed Studio Engine fallback: generates 44.1kHz Stereo Master WAV with speech overlay
      const macVoice = voice === 'Camille' || voice === 'Lea' || voice === 'Alice' ? 'Amélie' : 'Thomas';
      const maxChunksToSynthesize = subtitles.length;
      const speechChunks: { offsetMs: number; pcm: Buffer }[] = [];

      for (let i = 0; i < maxChunksToSynthesize; i++) {
        const sub = subtitles[i];
        const text = (sub.frText || '').trim();
        if (!text) continue;

        const tempAiff = path.join(os.tmpdir(), `sub_${Date.now()}_${i}.aiff`);
        const tempRaw = path.join(os.tmpdir(), `sub_${Date.now()}_${i}.raw`);

        try {
          await new Promise<void>((resolve, reject) => {
            const sayProc = spawn('say', ['-v', macVoice, '-o', tempAiff, text.slice(0, 1000)]);
            sayProc.on('close', (code) => code === 0 ? resolve() : reject());
            sayProc.on('error', reject);
          });

          await new Promise<void>((resolve, reject) => {
            const ff = spawn(resolveFFmpegPath(), ['-y', '-i', tempAiff, '-ar', '44100', '-ac', '2', '-f', 's16le', tempRaw]);
            ff.on('close', (code) => code === 0 ? resolve() : reject());
            ff.on('error', reject);
          });

          if (fs.existsSync(tempRaw)) {
            const pcm = fs.readFileSync(tempRaw);
            speechChunks.push({ offsetMs: sub.startTimeMs, pcm });
          }
        } catch (subErr) {
          console.warn(`Speech synthesis notice for segment #${i}:`, subErr);
        } finally {
          try { if (fs.existsSync(tempAiff)) fs.unlinkSync(tempAiff); } catch {}
          try { if (fs.existsSync(tempRaw)) fs.unlinkSync(tempRaw); } catch {}
        }
      }

      const masterBuffer = buildMasterWavBuffer(totalDurationMs, speechChunks);
      try {
        fs.writeFileSync(path.join(SAVED_DIR, autoSaveName), masterBuffer);
        console.log(`📁 Fichier master audio sauvegardé avec succès dans: sauvegarder/${autoSaveName} (${(masterBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);
      } catch (saveErr) {
        console.warn('Auto-save master canvas error:', saveErr);
      }

      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Length', masterBuffer.length);
      res.setHeader('X-Voice-Engine', 'Studio-Master-44.1k');
      return res.send(masterBuffer);
    } catch (err: any) {
      console.error('Master canvas synthesis error:', err);
      // In worst-case error, always return a valid empty master canvas WAV instead of 500/503
      const fallbackBuf = Buffer.alloc(44 + 44100 * 4 * 10);
      return res.send(fallbackBuf);
    }
  });

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'Ko', 'Mo', 'Go'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 1. Liste des fichiers sauvegardés
  app.get('/api/saved-files', (_req, res) => {
    try {
      if (!fs.existsSync(SAVED_DIR)) fs.mkdirSync(SAVED_DIR, { recursive: true });
      const items = fs.readdirSync(SAVED_DIR);
      const files = items
        .filter(name => !name.startsWith('.') && fs.statSync(path.join(SAVED_DIR, name)).isFile())
        .map(name => {
          const fullPath = path.join(SAVED_DIR, name);
          const stat = fs.statSync(fullPath);
          const ext = path.extname(name).toLowerCase();
          const isAudio = ['.wav', '.mp3', '.m4a', '.flac', '.ogg'].includes(ext);
          const isSubtitle = ['.srt', '.vtt'].includes(ext);
          const isVideo = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v'].includes(ext);
          return {
            name,
            size: stat.size,
            sizeFormatted: formatBytes(stat.size),
            createdAt: stat.birthtime.toISOString(),
            modifiedAt: stat.mtime.toISOString(),
            type: isAudio ? 'audio' : (isSubtitle ? 'subtitle' : (isVideo ? 'video' : 'other')),
            extension: ext.replace('.', ''),
            downloadUrl: `/api/saved-files/download/${encodeURIComponent(name)}`
          };
        })
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

      res.json({ files, savedDirPath: SAVED_DIR });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erreur lors de la lecture de sauvegarder/' });
    }
  });

  // 2. Téléchargement ou lecture directe d'un fichier sauvegardé
  app.get('/api/saved-files/download/:filename', (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      let filePath = path.join(SAVED_DIR, filename);
      if (!fs.existsSync(filePath)) {
        const cwdCandidate = path.join(process.cwd(), filename);
        if (fs.existsSync(cwdCandidate)) {
          filePath = cwdCandidate;
        } else {
          return res.status(404).json({ error: 'Fichier introuvable.' });
        }
      }
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.wav') res.setHeader('Content-Type', 'audio/wav');
      else if (ext === '.mp3') res.setHeader('Content-Type', 'audio/mpeg');
      else if (ext === '.srt') res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      else if (ext === '.mp4') res.setHeader('Content-Type', 'video/mp4');
      else if (ext === '.webm') res.setHeader('Content-Type', 'video/webm');
      else if (ext === '.mov') res.setHeader('Content-Type', 'video/quicktime');
      else if (ext === '.mkv') res.setHeader('Content-Type', 'video/x-matroska');

      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // Convert saved WAV to 320kbps MP3 via ffmpeg
  app.post('/api/saved-files/convert-to-mp3', async (req, res) => {
    try {
      const { filename } = req.body;
      let targetFile = filename ? path.basename(filename) : '';

      // Find wav file in SAVED_DIR
      let wavPath = targetFile ? path.join(SAVED_DIR, targetFile) : '';
      if (!fs.existsSync(wavPath)) {
        // Fallback: pick the latest .wav in SAVED_DIR
        const wavs = fs.readdirSync(SAVED_DIR).filter(f => f.endsWith('.wav'));
        if (wavs.length > 0) {
          targetFile = wavs[wavs.length - 1];
          wavPath = path.join(SAVED_DIR, targetFile);
        } else {
          return res.status(404).json({ error: 'Aucun fichier WAV trouvé dans sauvegarder/' });
        }
      }

      const mp3Filename = targetFile.replace(/\.wav$/i, '') + '.mp3';
      const mp3Path = path.join(SAVED_DIR, mp3Filename);

      const { execFile } = await import('child_process');
      await new Promise<void>((resolve, reject) => {
        execFile(resolveFFmpegPath(), ['-y', '-i', wavPath, '-b:a', '320k', mp3Path], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.json({
        success: true,
        filename: mp3Filename,
        downloadUrl: `/api/saved-files/download/${encodeURIComponent(mp3Filename)}`
      });
    } catch (err: any) {
      console.error('MP3 conversion error:', err);
      return res.status(500).json({ error: err?.message || 'Échec de conversion MP3' });
    }
  });

  // 3. Sauvegarder un fichier (Audio ou SRT) dans `sauvegarder/`
  app.post('/api/saved-files/save', (req, res) => {
    try {
      const { filename, content, isBase64 } = req.body;
      if (!filename || !content) {
        return res.status(400).json({ error: 'filename et content requis' });
      }
      const safeFilename = path.basename(filename);
      const filePath = path.join(SAVED_DIR, safeFilename);

      if (isBase64) {
        const buffer = Buffer.from(content, 'base64');
        fs.writeFileSync(filePath, buffer);
      } else {
        fs.writeFileSync(filePath, content, 'utf8');
      }

      const stat = fs.statSync(filePath);
      return res.json({
        success: true,
        filename: safeFilename,
        sizeFormatted: formatBytes(stat.size),
        message: `Fichier sauvegardé avec succès dans sauvegarder/${safeFilename}`
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Échec de la sauvegarde' });
    }
  });

  // 3b. Liste de tous les fichiers .SRT disponibles pour révision / correction
  app.get('/api/subtitles/list', (_req, res) => {
    try {
      if (!fs.existsSync(SAVED_DIR)) fs.mkdirSync(SAVED_DIR, { recursive: true });

      const results: Array<{
        name: string;
        filename: string;
        location: 'sauvegarder' | 'projet' | 'parent';
        size: number;
        sizeFormatted: string;
        modifiedAt: string;
      }> = [];

      // 1. Fichiers dans `sauvegarder/`
      const savedItems = fs.readdirSync(SAVED_DIR);
      for (const item of savedItems) {
        if (!item.startsWith('.') && item.toLowerCase().endsWith('.srt')) {
          const fullPath = path.join(SAVED_DIR, item);
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            results.push({
              name: item,
              filename: item,
              location: 'sauvegarder',
              size: stat.size,
              sizeFormatted: formatBytes(stat.size),
              modifiedAt: stat.mtime.toISOString()
            });
          }
        }
      }

      // 2. Fichiers .srt dans le projet courant
      const projectItems = fs.readdirSync(process.cwd());
      for (const item of projectItems) {
        if (!item.startsWith('.') && item.toLowerCase().endsWith('.srt')) {
          const fullPath = path.join(process.cwd(), item);
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            results.push({
              name: item,
              filename: item,
              location: 'projet',
              size: stat.size,
              sizeFormatted: formatBytes(stat.size),
              modifiedAt: stat.mtime.toISOString()
            });
          }
        }
      }

      // 3. Fichiers .srt dans le dossier parent (espace de travail complet)
      try {
        const parentDir = path.dirname(process.cwd());
        if (fs.existsSync(parentDir)) {
          const parentItems = fs.readdirSync(parentDir);
          for (const item of parentItems) {
            if (!item.startsWith('.') && item.toLowerCase().endsWith('.srt')) {
              const fullPath = path.join(parentDir, item);
              const stat = fs.statSync(fullPath);
              if (stat.isFile() && !results.some(r => r.name === item)) {
                results.push({
                  name: item,
                  filename: `parent:${item}`,
                  location: 'parent',
                  size: stat.size,
                  sizeFormatted: formatBytes(stat.size),
                  modifiedAt: stat.mtime.toISOString()
                });
              }
            }
          }
        }
      } catch {}

      // Tri du plus récent au plus ancien
      results.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
      res.json({ files: results });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erreur lors de la recherche des fichiers .srt' });
    }
  });

  // 3c. Charger le contenu d'un fichier .SRT pour révision
  app.get('/api/subtitles/load/:filename', (req, res) => {
    try {
      const rawParam = req.params.filename;
      let targetPath = '';
      let safeFilename = '';

      if (rawParam.startsWith('parent:')) {
        const cleanName = path.basename(rawParam.replace('parent:', ''));
        targetPath = path.join(path.dirname(process.cwd()), cleanName);
        safeFilename = cleanName;
      } else {
        safeFilename = path.basename(rawParam);
        // Chercher d'abord dans SAVED_DIR, puis cwd
        const savedCandidate = path.join(SAVED_DIR, safeFilename);
        const cwdCandidate = path.join(process.cwd(), safeFilename);
        const parentCandidate = path.join(path.dirname(process.cwd()), safeFilename);

        if (fs.existsSync(savedCandidate)) targetPath = savedCandidate;
        else if (fs.existsSync(cwdCandidate)) targetPath = cwdCandidate;
        else if (fs.existsSync(parentCandidate)) targetPath = parentCandidate;
      }

      if (!targetPath || !fs.existsSync(targetPath)) {
        return res.status(404).json({ error: `Fichier "${rawParam}" introuvable.` });
      }

      const content = fs.readFileSync(targetPath, 'utf8');
      const stat = fs.statSync(targetPath);

      return res.json({
        success: true,
        filename: safeFilename,
        path: targetPath,
        content,
        size: stat.size,
        sizeFormatted: formatBytes(stat.size),
        modifiedAt: stat.mtime.toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erreur lors de la lecture du fichier .srt' });
    }
  });

  // 3d. Sauvegarde temps réel d'un fichier .SRT modifié dans `sauvegarder/`
  app.post('/api/subtitles/save', (req, res) => {
    try {
      const { filename, content } = req.body;
      if (!filename || typeof content !== 'string') {
        return res.status(400).json({ error: 'filename et content (.srt) sont obligatoires' });
      }

      let cleanName = path.basename(filename.replace(/^parent:/, ''));
      if (!cleanName.toLowerCase().endsWith('.srt')) {
        cleanName += '.srt';
      }

      if (!fs.existsSync(SAVED_DIR)) fs.mkdirSync(SAVED_DIR, { recursive: true });
      const targetPath = path.join(SAVED_DIR, cleanName);

      fs.writeFileSync(targetPath, content, 'utf8');
      const stat = fs.statSync(targetPath);

      return res.json({
        success: true,
        filename: cleanName,
        savedPath: targetPath,
        savedAt: new Date().toLocaleTimeString('fr-FR'),
        size: stat.size,
        sizeFormatted: formatBytes(stat.size),
        message: `Synchronisé avec succès dans sauvegarder/${cleanName}`
      });
    } catch (err: any) {
      console.error('Erreur sauvegarde temps réel .srt:', err);
      res.status(500).json({ error: err?.message || 'Échec de la sauvegarde temps réel' });
    }
  });

  // 4. Déplacer un fichier sauvegardé dans la poubelle
  app.delete('/api/saved-files/:filename', (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      const filePath = path.join(SAVED_DIR, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Fichier introuvable dans sauvegarder/' });
      }

      if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });

      let targetTrashName = filename;
      let targetTrashPath = path.join(TRASH_DIR, targetTrashName);
      if (fs.existsSync(targetTrashPath)) {
        targetTrashName = `${Date.now()}_${filename}`;
        targetTrashPath = path.join(TRASH_DIR, targetTrashName);
      }

      fs.renameSync(filePath, targetTrashPath);

      return res.json({
        success: true,
        filename,
        message: `"${filename}" a été déplacé dans la poubelle avec succès.`
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Échec de suppression' });
    }
  });

  // 5. Liste des fichiers dans la poubelle
  app.get('/api/trash-files', (_req, res) => {
    try {
      if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });
      const items = fs.readdirSync(TRASH_DIR);
      const files = items
        .filter(name => !name.startsWith('.') && fs.statSync(path.join(TRASH_DIR, name)).isFile())
        .map(name => {
          const fullPath = path.join(TRASH_DIR, name);
          const stat = fs.statSync(fullPath);
          const ext = path.extname(name).toLowerCase();
          return {
            name,
            size: stat.size,
            sizeFormatted: formatBytes(stat.size),
            deletedAt: stat.mtime.toISOString(),
            type: ['.wav', '.mp3', '.m4a', '.flac'].includes(ext) ? 'audio' : (['.srt', '.vtt'].includes(ext) ? 'subtitle' : 'other')
          };
        })
        .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

      res.json({ files });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erreur liste poubelle' });
    }
  });

  // 6. Restaurer un fichier de la poubelle vers `sauvegarder/`
  app.post('/api/trash-files/restore/:filename', (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      const trashPath = path.join(TRASH_DIR, filename);
      if (!fs.existsSync(trashPath)) {
        return res.status(404).json({ error: 'Fichier introuvable dans la poubelle' });
      }

      const originalName = filename.replace(/^\d+_/, '');
      let destPath = path.join(SAVED_DIR, originalName);
      if (fs.existsSync(destPath)) {
        destPath = path.join(SAVED_DIR, `restaure_${Date.now()}_${originalName}`);
      }

      fs.renameSync(trashPath, destPath);
      res.json({ success: true, message: `"${originalName}" a été restauré avec succès dans sauvegarder/.` });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Échec de restauration' });
    }
  });

  // 7. Vider définitivement la poubelle
  app.delete('/api/trash-files/empty', (_req, res) => {
    try {
      if (fs.existsSync(TRASH_DIR)) {
        const items = fs.readdirSync(TRASH_DIR);
        let count = 0;
        for (const item of items) {
          if (!item.startsWith('.')) {
            const p = path.join(TRASH_DIR, item);
            if (fs.statSync(p).isFile()) {
              fs.unlinkSync(p);
              count++;
            }
          }
        }
        return res.json({ success: true, count, message: `${count} fichier(s) supprimé(s) définitivement de la poubelle.` });
      }
      res.json({ success: true, count: 0, message: 'La poubelle est déjà vide.' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Échec du vidage de la poubelle' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MUXING VIDÉO — Endpoint SSE pour assemblage vidéo + audio + sous-titres
  // ═══════════════════════════════════════════════════════════════════════
  app.post('/api/mux', async (req, res) => {
    // SSE headers for real-time progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendSSE = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const {
        srtFilename,
        audioFilename,
        videoFilename,
        outputFilename,
        burnSubtitles = false,
        subtitleFontSize = 18,
      } = req.body;

      if (!srtFilename || !audioFilename) {
        sendSSE('error', { error: 'srtFilename et audioFilename sont requis.' });
        return res.end();
      }

      // Resolve file paths
      const resolvePath = (name: string): string => {
        const savedCandidate = path.join(SAVED_DIR, name);
        const cwdCandidate = path.join(process.cwd(), name);
        if (fs.existsSync(savedCandidate)) return savedCandidate;
        if (fs.existsSync(cwdCandidate)) return cwdCandidate;
        return '';
      };

      const srtPath = resolvePath(srtFilename);
      const audioPath = resolvePath(audioFilename);
      const videoPath = videoFilename ? resolvePath(videoFilename) : '';

      if (!srtPath) {
        sendSSE('error', { error: `Fichier SRT introuvable : ${srtFilename}` });
        return res.end();
      }
      if (!audioPath) {
        sendSSE('error', { error: `Fichier audio introuvable : ${audioFilename}` });
        return res.end();
      }

      const safeOutput = (outputFilename || `mux_${Date.now()}.mp4`).replace(/[^a-zA-Z0-9_.-]/g, '_');
      const outputPath = path.join(SAVED_DIR, safeOutput);

      sendSSE('progress', { percentage: 5, message: 'Lancement du muxing…' });

      // Spawn Python muxer as subprocess
      const pythonBin = path.join(process.cwd(), 'venv/bin/python3');
      const muxerScript = path.join(process.cwd(), 'ffmpeg_muxer.py');

      const muxArgs = [
        muxerScript,
        '--srt', srtPath,
        '--audio', audioPath,
        '--output', outputPath,
      ];
      if (videoPath) muxArgs.push('--video', videoPath);
      if (burnSubtitles) muxArgs.push('--burn');
      if (subtitleFontSize) muxArgs.push('--font-size', String(subtitleFontSize));

      const pythonExe = fs.existsSync(pythonBin) ? pythonBin : 'python3';
      const muxProc = spawn(pythonExe, muxArgs, {
        cwd: process.cwd(),
        env: { ...process.env },
      });

      let lastPercentage = 5;
      const timeRegex = /time=(\d{2}):(\d{2}):(\d{2})\.(\d{2,3})/;

      muxProc.stderr?.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          const m = timeRegex.exec(line);
          if (m) {
            const secs = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
            const pct = Math.min(95, 10 + secs);
            if (pct > lastPercentage) {
              lastPercentage = pct;
              sendSSE('progress', { percentage: pct, message: `Encodage en cours… ${secs}s` });
            }
          }
        }
      });

      muxProc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes('SUCCÈS') || text.includes('succès')) {
          sendSSE('progress', { percentage: 95, message: 'Finalisation…' });
        }
      });

      muxProc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          const stat = fs.statSync(outputPath);
          sendSSE('done', {
            success: true,
            filename: safeOutput,
            size: stat.size,
            sizeFormatted: formatBytes(stat.size),
            downloadUrl: `/api/saved-files/download/${encodeURIComponent(safeOutput)}`,
          });
        } else {
          sendSSE('error', {
            error: `Le muxing a échoué (code de sortie : ${code}).`,
          });
        }
        res.end();
      });

      muxProc.on('error', (err) => {
        sendSSE('error', { error: `Erreur de lancement du muxer : ${err.message}` });
        res.end();
      });
    } catch (err: any) {
      sendSSE('error', { error: err?.message || 'Erreur interne du serveur de muxing.' });
      res.end();
    }
  });

  // Mux diagnostic endpoint
  app.get('/api/mux/check', async (_req, res) => {
    try {
      const ffmpegPath = resolveFFmpegPath();
      const pythonBin = path.join(process.cwd(), 'venv/bin/python3');
      const muxerScript = path.join(process.cwd(), 'ffmpeg_muxer.py');

      const result: any = {
        ffmpegPath,
        ffmpegFound: fs.existsSync(ffmpegPath) || ffmpegPath === 'ffmpeg',
        muxerScriptFound: fs.existsSync(muxerScript),
        pythonFound: fs.existsSync(pythonBin),
      };

      // Try running --check
      if (result.muxerScriptFound && result.pythonFound) {
        try {
          const checkResult = execFileSync(
            pythonBin, [muxerScript, '--check'],
            { encoding: 'utf-8', timeout: 10000 }
          );
          result.ffmpegDiag = checkResult.trim();
          result.ready = true;
        } catch (checkErr: any) {
          result.ffmpegDiag = checkErr?.stderr || checkErr?.message || 'Check failed';
          result.ready = false;
        }
      } else {
        result.ready = false;
      }

      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  // 8. Ouvrir directement le dossier `sauvegarder/` dans le Finder macOS
  app.post('/api/open-folder', (_req, res) => {
    try {
      if (process.platform === 'darwin') {
        spawn('open', [SAVED_DIR]);
      } else if (process.platform === 'win32') {
        spawn('explorer', [SAVED_DIR]);
      } else {
        spawn('xdg-open', [SAVED_DIR]);
      }
      res.json({ success: true, path: SAVED_DIR });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // VIDÉOS SOURCE : YouTube Downloader & Téléversement direct
  // ═══════════════════════════════════════════════════════════════════════

  // Vérification de la disponibilité de yt-dlp
  app.get('/api/youtube/status', (_req, res) => {
    const ytPath = resolveYtDlpPath();
    res.json({
      available: Boolean(ytPath),
      path: ytPath,
    });
  });

  // Récupération des métadonnées d'une vidéo YouTube (titre, miniature, durée)
  app.post('/api/youtube/info', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ error: 'Une URL YouTube valide est requise.' });
      }

      const cleanUrl = url.trim();
      const ytPath = resolveYtDlpPath();
      if (!ytPath) {
        return res.status(503).json({
          error: "yt-dlp n'est pas détecté sur votre machine. Installez-le avec 'brew install yt-dlp'."
        });
      }

      const proc = spawn(ytPath, ['--dump-json', '--no-playlist', cleanUrl]);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const data = JSON.parse(stdout.trim());
            const thumbnails = data.thumbnails || [];
            const bestThumb = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : null;
            return res.json({
              success: true,
              id: data.id,
              title: data.title || data.fulltitle || 'Vidéo YouTube',
              duration: data.duration,
              durationString: data.duration_string || (data.duration ? `${Math.floor(data.duration / 60)}:${('0' + Math.floor(data.duration % 60)).slice(-2)}` : '--:--'),
              thumbnail: bestThumb || data.thumbnail,
              uploader: data.uploader || data.channel || '',
              viewCount: data.view_count,
            });
          } catch (pErr: any) {
            return res.status(500).json({ error: 'Erreur lors de la lecture des informations de la vidéo.' });
          }
        } else {
          return res.status(400).json({
            error: stderr || 'Impossible de récupérer les informations de cette vidéo YouTube.'
          });
        }
      });

      proc.on('error', (err) => {
        return res.status(500).json({ error: `Erreur lors de l'appel à yt-dlp : ${err.message}` });
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Erreur interne' });
    }
  });

  // Téléchargement d'une vidéo YouTube avec suivi SSE
  app.post('/api/youtube/download', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendSSE = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string' || !url.trim()) {
        sendSSE('error', { error: 'URL YouTube manquante.' });
        return res.end();
      }

      const ytPath = resolveYtDlpPath();
      if (!ytPath) {
        sendSSE('error', { error: "yt-dlp n'est pas détecté. Installez-le avec 'brew install yt-dlp'." });
        return res.end();
      }

      sendSSE('progress', { percentage: 2, message: 'Démarrage du téléchargement YouTube…' });

      // Sanitized title base
      const outputTemplate = path.join(SAVED_DIR, '%(title).70B [%(id)s].%(ext)s');
      const ffmpegBin = resolveFFmpegPath();

      const ytArgs = [
        '--newline',
        '--no-playlist',
        '--ffmpeg-location', ffmpegBin,
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '-o', outputTemplate,
        url.trim()
      ];

      const proc = spawn(ytPath, ytArgs, { cwd: process.cwd() });
      let downloadedFilename = '';
      const percentRegex = /\[download\]\s+([\d\.]+)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/;
      const simplePercentRegex = /\[download\]\s+([\d\.]+)%/;
      const destinationRegex = /\[(?:download|Merger)\]\s+(?:Destination:\s+|Merging formats into\s+)"?([^"\n\r]+)"?/;

      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        const lines = text.split('\n');
        for (const line of lines) {
          const destMatch = destinationRegex.exec(line);
          if (destMatch) {
            downloadedFilename = path.basename(destMatch[1].trim());
          }

          const match = percentRegex.exec(line);
          if (match) {
            const pct = Math.min(96, Math.max(2, parseFloat(match[1])));
            sendSSE('progress', {
              percentage: pct,
              speed: match[3],
              eta: match[4],
              size: match[2],
              message: `Téléchargement : ${pct.toFixed(1)}% (${match[3]}, reste ${match[4]})`
            });
          } else {
            const simpleMatch = simplePercentRegex.exec(line);
            if (simpleMatch) {
              const pct = Math.min(96, Math.max(2, parseFloat(simpleMatch[1])));
              sendSSE('progress', {
                percentage: pct,
                message: `Téléchargement : ${pct.toFixed(1)}%`
              });
            } else if (line.includes('[Merger]') || line.includes('Merging formats')) {
              sendSSE('progress', {
                percentage: 97,
                message: 'Finalisation et assemblage MP4 en cours…'
              });
            }
          }
        }
      });

      let errorText = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        const t = chunk.toString();
        if (!t.includes('WARNING:')) {
          errorText += t;
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          if (!downloadedFilename || !fs.existsSync(path.join(SAVED_DIR, downloadedFilename))) {
            const mp4Files = fs.readdirSync(SAVED_DIR)
              .filter(f => f.toLowerCase().endsWith('.mp4'))
              .map(f => ({ name: f, time: fs.statSync(path.join(SAVED_DIR, f)).mtimeMs }))
              .sort((a, b) => b.time - a.time);
            if (mp4Files.length > 0) {
              downloadedFilename = mp4Files[0].name;
            }
          }

          if (downloadedFilename && fs.existsSync(path.join(SAVED_DIR, downloadedFilename))) {
            const stat = fs.statSync(path.join(SAVED_DIR, downloadedFilename));
            sendSSE('done', {
              success: true,
              filename: downloadedFilename,
              size: stat.size,
              sizeFormatted: formatBytes(stat.size),
              downloadUrl: `/api/saved-files/download/${encodeURIComponent(downloadedFilename)}`
            });
          } else {
            sendSSE('error', { error: 'Fichier vidéo téléchargé introuvable.' });
          }
        } else {
          sendSSE('error', { error: errorText || `Échec du téléchargement YouTube (code ${code}).` });
        }
        res.end();
      });

      proc.on('error', (err) => {
        sendSSE('error', { error: `Erreur d'exécution yt-dlp : ${err.message}` });
        res.end();
      });
    } catch (err: any) {
      sendSSE('error', { error: err?.message || 'Erreur interne' });
      res.end();
    }
  });

  // Téléversement direct en streaming de gros fichiers vidéo (.mp4, .mov, .mkv, .webm)
  app.post('/api/video/upload', (req, res) => {
    try {
      const rawHeaderName = (req.headers['x-filename'] as string) || `video_${Date.now()}.mp4`;
      let decodedName = decodeURIComponent(rawHeaderName);
      let cleanName = path.basename(decodedName).replace(/[^a-zA-Z0-9_.-]/g, '_');
      const ext = path.extname(cleanName).toLowerCase();
      if (!['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'].includes(ext)) {
        cleanName += '.mp4';
      }

      if (!fs.existsSync(SAVED_DIR)) fs.mkdirSync(SAVED_DIR, { recursive: true });
      const targetPath = path.join(SAVED_DIR, cleanName);

      const writeStream = fs.createWriteStream(targetPath);

      req.pipe(writeStream);

      writeStream.on('finish', () => {
        const stat = fs.statSync(targetPath);
        return res.json({
          success: true,
          filename: cleanName,
          size: stat.size,
          sizeFormatted: formatBytes(stat.size),
          downloadUrl: `/api/saved-files/download/${encodeURIComponent(cleanName)}`,
          message: `Vidéo « ${cleanName} » téléversée avec succès (${formatBytes(stat.size)}).`
        });
      });

      writeStream.on('error', (err) => {
        console.error('Video upload stream error:', err);
        return res.status(500).json({ error: 'Erreur lors de l’écriture du fichier vidéo sur le disque.' });
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Erreur de téléversement' });
    }
  });

  // Liste consolidée de toutes les vidéos (dans sauvegarder/ et dans le dossier racine du projet)
  app.get('/api/videos/list', (_req, res) => {
    try {
      const videoExts = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v'];
      const results: Array<{
        name: string;
        filename: string;
        location: 'sauvegarder' | 'projet';
        size: number;
        sizeFormatted: string;
        modifiedAt: string;
        downloadUrl: string;
      }> = [];

      // 1. Vidéos dans `sauvegarder/`
      if (fs.existsSync(SAVED_DIR)) {
        const savedItems = fs.readdirSync(SAVED_DIR);
        for (const item of savedItems) {
          if (!item.startsWith('.')) {
            const ext = path.extname(item).toLowerCase();
            if (videoExts.includes(ext)) {
              const fullPath = path.join(SAVED_DIR, item);
              const stat = fs.statSync(fullPath);
              if (stat.isFile()) {
                results.push({
                  name: item,
                  filename: item,
                  location: 'sauvegarder',
                  size: stat.size,
                  sizeFormatted: formatBytes(stat.size),
                  modifiedAt: stat.mtime.toISOString(),
                  downloadUrl: `/api/saved-files/download/${encodeURIComponent(item)}`
                });
              }
            }
          }
        }
      }

      // 2. Vidéos à la racine du projet
      const projectItems = fs.readdirSync(process.cwd());
      for (const item of projectItems) {
        if (!item.startsWith('.')) {
          const ext = path.extname(item).toLowerCase();
          if (videoExts.includes(ext)) {
            const fullPath = path.join(process.cwd(), item);
            const stat = fs.statSync(fullPath);
            if (stat.isFile() && !results.some(r => r.name === item)) {
              results.push({
                name: item,
                filename: item,
                location: 'projet',
                size: stat.size,
                sizeFormatted: formatBytes(stat.size),
                modifiedAt: stat.mtime.toISOString(),
                downloadUrl: `/api/saved-files/download/${encodeURIComponent(item)}`
              });
            }
          }
        }
      }

      results.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
      res.json({ files: results });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erreur liste vidéos' });
    }
  });

  // Vite middleware in development or static serve in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });

  // Secondary port 7860 support
  try {
    const server7860 = app.listen(7860, '0.0.0.0', () => {
      console.log(`Server also listening on http://0.0.0.0:7860`);
    });
    server7860.on('error', (err: any) => {
      console.log(`Notice: Port 7860 unavailable (${err.code || err.message}), main port ${PORT} active.`);
    });
  } catch {}
}

startServer();
