#!/usr/bin/env python3
"""
vibevoice_service.py — Persistent High-Performance VibeVoice Neural Service
===========================================================================
Hosts the VibeVoice 1.5B diffusion speech synthesis engine in memory on Apple
Silicon MPS for ultra-low latency, 0% robotic conversational French dubbing.

Features:
  - Persistent MPS in-memory model (0 reload overhead)
  - /health : Health check & device status
  - /api/voices : Full catalog of preset & cloned voices
  - /api/synthesize : Single text chunk synthesis -> 24kHz / 44.1kHz WAV
  - /api/synthesize-canvas : Full Master Canvas stitching at exact millisecond
                             coordinates with 0.000ms drift for Filmora.

Auteur : Ghislain Muntu — SavoirIA TransApp
"""

import os
import sys
import time
import io
import tempfile
import threading
import types
import torch
import numpy as np
import soundfile as sf
import librosa
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

# --- CORRECTIF 1 : Contournement AutoModel.register pour exist_ok ---
from transformers.models.auto import auto_factory
_orig_register = auto_factory._BaseAutoModelClass.register.__func__

@classmethod
def _patched_register(cls, config_class, model_class, *args, **kwargs):
    kwargs['exist_ok'] = True
    return _orig_register(cls, config_class, model_class, *args, **kwargs)

auto_factory._BaseAutoModelClass.register = _patched_register

# --- CORRECTIF 2 : Compatibilité du chemin d'import Qwen2TokenizerFast ---
try:
    from transformers import Qwen2TokenizerFast
    qwen_mod = types.ModuleType("transformers.models.qwen2.tokenization_qwen2_fast")
    qwen_mod.Qwen2TokenizerFast = Qwen2TokenizerFast
    sys.modules["transformers.models.qwen2.tokenization_qwen2_fast"] = qwen_mod
except Exception:
    pass

# Environment variables for Apple Silicon MPS stability
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# Global lock to serialize inference on Apple Silicon Metal GPU
model_lock = threading.Lock()

# Ensure VibeVoice package is in path
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
VIBEVOICE_DIR = os.path.join(ROOT_DIR, "VibeVoice")
if os.path.isdir(VIBEVOICE_DIR) and VIBEVOICE_DIR not in sys.path:
    sys.path.insert(0, VIBEVOICE_DIR)

from vibevoice.modular.modeling_vibevoice_inference import VibeVoiceForConditionalGenerationInference
from vibevoice.processor.vibevoice_processor import VibeVoiceProcessor

app = FastAPI(title="SavoirIA VibeVoice Neural Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_NAME = "microsoft/VibeVoice-1.5B"
VOICES_DIR = os.path.join(VIBEVOICE_DIR, "demo", "voices")

device = "mps" if (hasattr(torch.backends, "mps") and torch.backends.mps.is_available()) else ("cuda" if torch.cuda.is_available() else "cpu")
torch_dtype = torch.bfloat16 if device in ("mps", "cuda") else torch.float32

processor = None
model = None
is_ready = False

def get_voice_catalog():
    """Scan and list all available preset and cloned voices."""
    catalog = [
        {"id": "Nicolas", "name": "VibeVoice — Nicolas (Accent Français)", "gender": "Homme", "category": "VibeVoice Français", "badge": "⭐ Voix Sélectionnée (Prioritaire)", "isCloned": False},
        {"id": "Camille", "name": "VibeVoice — Camille (Accent Français)", "gender": "Femme", "category": "VibeVoice Français", "badge": "Studio Pro", "isCloned": False},
        {"id": "Antoine", "name": "VibeVoice — Antoine (Accent Français)", "gender": "Homme", "category": "VibeVoice Français", "badge": "Studio Pro", "isCloned": False},
        {"id": "Lea", "name": "VibeVoice — Léa (Accent Français)", "gender": "Femme", "category": "VibeVoice Français", "badge": "Studio Pro", "isCloned": False},
    ]

    # Scan for custom cloned voice WAVs
    if os.path.isdir(VOICES_DIR):
        for f in sorted(os.listdir(VOICES_DIR)):
            if f.lower().endswith(".wav") and not f.startswith("en-") and not f.startswith("zh-") and not f.startswith("in-") and not f.startswith("fr-"):
                voice_id = os.path.splitext(f)[0]
                catalog.insert(0, {
                    "id": voice_id,
                    "name": f"Voix Clonée — {voice_id.replace('_', ' ').title()}",
                    "gender": "Original",
                    "category": "Clonage Vidéo",
                    "badge": "Clonée IA",
                    "isCloned": True
                })

    return catalog

def resolve_voice_path(voice_id: str) -> str:
    """Find the WAV path for a voice preset or cloned voice."""
    preset_map = {
        "Nicolas": "fr-Nicolas_homme.wav",
        "Camille": "fr-Camille_femme.wav",
        "Antoine": "fr-Antoine_homme.wav",
        "Lea": "fr-Lea_femme.wav",
        "Alice": "fr-Nicolas_homme.wav",
        "Carter": "fr-Antoine_homme.wav",
        "Frank": "en-Frank_man.wav",
        "Mary": "en-Mary_woman_bgm.wav",
        "Maya": "en-Maya_woman.wav",
        "Samuel": "in-Samuel_man.wav",
    }

    # 1. Preset map
    if voice_id in preset_map:
        p = os.path.join(VOICES_DIR, preset_map[voice_id])
        if os.path.exists(p):
            return p

    # 2. Check directly in VOICES_DIR (e.g. cloned voices)
    for ext in ["", ".wav", ".mp3", ".m4a", ".flac"]:
        candidate = os.path.join(VOICES_DIR, f"{voice_id}{ext}")
        if os.path.isfile(candidate):
            return candidate

    # 3. Direct absolute or relative file path
    if os.path.isfile(voice_id):
        return os.path.abspath(voice_id)

    # Default fallback to native French Nicolas
    default_p = os.path.join(VOICES_DIR, "fr-Nicolas_homme.wav")
    if os.path.exists(default_p):
        return default_p
    fallback_p = os.path.join(VOICES_DIR, "en-Alice_woman.wav")
    if os.path.exists(fallback_p):
        return fallback_p
    return ""

def load_engine():
    global processor, model, is_ready
    print("=" * 60, flush=True)
    print("🚀 Démarrage du service neuronal VibeVoice en mémoire...", flush=True)
    print(f"⚙️  Périphérique : {device.upper()} | Précision : {torch_dtype}", flush=True)
    print("=" * 60, flush=True)

    try:
        t0 = time.time()
        processor = VibeVoiceProcessor.from_pretrained(MODEL_NAME)
        model = VibeVoiceForConditionalGenerationInference.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch_dtype,
            attn_implementation="sdpa",
            low_cpu_mem_usage=False
        )

        if device == "mps":
            model.to("mps")
        elif device == "cuda":
            model.to("cuda")

        model.eval()
        is_ready = True
        print(f"✅ VibeVoice chargé et opérationnel en {time.time() - t0:.2f}s !", flush=True)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ Erreur de chargement VibeVoice : {e}", flush=True)
        is_ready = False

@app.on_event("startup")
def startup_event():
    threading.Thread(target=load_engine, daemon=True).start()

@app.get("/", response_class=HTMLResponse)
def home():
    voices = get_voice_catalog()
    voices_options = "\n".join([f'<option value="{v["id"]}" {"selected" if v["id"] == "Nicolas" else ""}>{v["name"]} ({v["gender"]})</option>' for v in voices])
    voices_cards = "\n".join([
        f'''
        <div class="p-4 rounded-xl bg-slate-800/70 border border-slate-700/80 flex items-center justify-between">
          <div>
            <div class="font-bold text-sm text-white flex items-center gap-2">
              <span>{v["name"]}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">{v.get("badge", "Studio")}</span>
            </div>
            <div class="text-xs text-slate-400 mt-0.5">Genre : {v["gender"]} | Catégorie : {v["category"]}</div>
          </div>
          <button onclick="testVoice('{v["id"]}')" class="px-3 py-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition cursor-pointer">Tester</button>
        </div>
        ''' for v in voices
    ])

    return f"""<!DOCTYPE html>
<html lang="fr" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SavoirIA TransApp — Moteur Neuronal VibeVoice</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen font-sans p-6">
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="bg-gradient-to-r from-slate-900 to-slate-850 p-6 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
      <div>
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold mb-2">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Microservice VibeVoice 1.5B Opérationnel
        </div>
        <h1 class="text-2xl font-black tracking-tight text-white">SavoirIA TransApp — Moteur Neuronal</h1>
        <p class="text-xs text-slate-400 mt-1">Conçu et développé par <span class="text-cyan-400 font-medium">Ghislain Muntu</span></p>
      </div>
      <a href="http://localhost:3000" class="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-xs tracking-wide uppercase transition-all shadow-lg shadow-cyan-500/25 flex items-center gap-2">
        <span>Ouvrir l'application principale (Port 3000)</span>
        <span>→</span>
      </a>
    </div>

    <!-- Info Banner -->
    <div class="p-4 rounded-xl bg-blue-950/40 border border-blue-600/40 text-blue-200 text-xs flex items-center justify-between gap-4">
      <span>ℹ️ Ce port (5005) héberge le microservice de synthèse vocale. L'application complète avec révision SRT, traduction Google et intégration Filmora se trouve sur <strong>http://localhost:3000</strong>.</span>
      <a href="http://localhost:3000" class="underline shrink-0 text-cyan-300 font-semibold hover:text-cyan-200">Accéder à SavoirIA →</a>
    </div>

    <!-- Status Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div class="text-xs text-slate-400">Modèle Neuronal</div>
        <div class="text-sm font-bold text-white mt-1 font-mono">{MODEL_NAME}</div>
      </div>
      <div class="p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div class="text-xs text-slate-400">Accélération Matérielle</div>
        <div class="text-sm font-bold text-emerald-400 mt-1 font-mono">Apple Silicon ({device.upper()})</div>
      </div>
      <div class="p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div class="text-xs text-slate-400">Voix Prioritaire Active</div>
        <div class="text-sm font-bold text-cyan-400 mt-1">Nicolas (Français)</div>
      </div>
    </div>

    <!-- Live Synthesis Sandbox -->
    <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
      <h2 class="text-base font-bold text-white flex items-center gap-2">
        <span>🎙️ Test Direct de Synthèse VibeVoice</span>
      </h2>
      <div class="space-y-3">
        <div>
          <label class="block text-xs text-slate-400 mb-1">Texte en français à synthétiser :</label>
          <textarea id="test-text" rows="2" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500">Bienvenue dans SavoirIA TransApp. Je suis la voix Nicolas, avec un accent français naturel et sans sonorité robotique.</textarea>
        </div>
        <div class="flex flex-col sm:flex-row items-center gap-3">
          <div class="w-full sm:w-1/2">
            <label class="block text-xs text-slate-400 mb-1">Voix :</label>
            <select id="test-voice" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-slate-200">
              {voices_options}
            </select>
          </div>
          <div class="w-full sm:w-1/2 sm:pt-5">
            <button id="synth-btn" onclick="generateAudio()" class="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wide transition flex items-center justify-center gap-2 cursor-pointer">
              <span id="btn-text">Générer et écouter l'audio</span>
            </button>
          </div>
        </div>
        <div id="audio-container" class="hidden pt-2 space-y-2">
          <div class="text-xs text-emerald-400 font-semibold">✓ Audio généré avec succès par VibeVoice :</div>
          <audio id="audio-player" controls class="w-full"></audio>
        </div>
      </div>
    </div>

    <!-- Voice Catalog -->
    <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
      <h2 class="text-base font-bold text-white">Catalogue des Voix VibeVoice Françaises</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {voices_cards}
      </div>
    </div>
  </div>

  <script>
    async function generateAudio() {{
      const text = document.getElementById('test-text').value.trim();
      const voice = document.getElementById('test-voice').value;
      const btn = document.getElementById('synth-btn');
      const btnText = document.getElementById('btn-text');
      const container = document.getElementById('audio-container');
      const player = document.getElementById('audio-player');

      if (!text) return alert('Veuillez saisir un texte');

      btn.disabled = true;
      btnText.innerText = 'Génération VibeVoice en cours...';

      try {{
        const resp = await fetch('/api/synthesize', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ text, voice }})
        }});

        if (!resp.ok) throw new Error('Erreur HTTP ' + resp.status);

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        player.src = url;
        container.classList.remove('hidden');
        player.play();
      }} catch (err) {{
        alert('Erreur de synthèse : ' + err.message);
      }} finally {{
        btn.disabled = false;
        btnText.innerText = 'Générer et écouter l\\'audio';
      }}
    }}

    function testVoice(voiceId) {{
      document.getElementById('test-voice').value = voiceId;
      generateAudio();
    }}
  </script>
</body>
</html>"""

@app.get("/health")
def health():
    return {
        "status": "ok" if is_ready else "loading",
        "engine": "VibeVoice",
        "model": MODEL_NAME,
        "device": device,
        "is_ready": is_ready
    }

@app.get("/voices")
@app.get("/api/voices")
def list_voices():
    return {"voices": get_voice_catalog()}

class SynthesizeRequest(BaseModel):
    text: str
    voice: Optional[str] = "Nicolas"
    cfg_scale: Optional[float] = 1.3
    ddpm_steps: Optional[int] = 5
    sample_rate: Optional[int] = 24000

@app.post("/api/synthesize")
def synthesize(req: SynthesizeRequest):
    if not is_ready:
        raise HTTPException(status_code=503, detail="VibeVoice engine is still loading")

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    script = text if text.startswith("Speaker") else f"Speaker 1: {text}"
    voice_path = resolve_voice_path(req.voice or "Nicolas")

    if not voice_path or not os.path.isfile(voice_path):
        raise HTTPException(
            status_code=404,
            detail=f"Fichier vocal introuvable pour la voix « {req.voice} ». Vérifiez que les fichiers WAV sont présents dans {VOICES_DIR}."
        )

    try:
        model.set_ddpm_inference_steps(num_steps=req.ddpm_steps or 5)
        inputs = processor(
            text=[script],
            voice_samples=[[voice_path]],
            padding=True,
            return_tensors="pt",
            return_attention_mask=True
        )

        for k, v in inputs.items():
            if torch.is_tensor(v):
                inputs[k] = v.to(device)

        with model_lock:
            if device == "mps":
                torch.mps.synchronize()

            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_new_tokens=None,
                    cfg_scale=req.cfg_scale or 1.3,
                    tokenizer=processor.tokenizer,
                    generation_config={"do_sample": False},
                    is_prefill=True
                )

            if device == "mps":
                torch.mps.synchronize()

        if not outputs.speech_outputs or outputs.speech_outputs[0] is None:
            raise HTTPException(status_code=500, detail="No speech output generated")

        audio_tensor = outputs.speech_outputs[0]
        if torch.is_tensor(audio_tensor):
            audio_np = audio_tensor.detach().cpu().to(torch.float32).numpy()
        else:
            audio_np = np.array(audio_tensor, dtype=np.float32)

        if audio_np.ndim > 1:
            audio_np = audio_np.squeeze()
        audio_np = audio_np.astype(np.float32)

        # Resample to 44100Hz if requested
        target_sr = req.sample_rate or 24000
        if target_sr != 24000:
            audio_np = librosa.resample(audio_np, orig_sr=24000, target_sr=target_sr)

        # Normalize volume
        max_val = np.max(np.abs(audio_np))
        if max_val > 0.01:
            audio_np = audio_np * (0.88 / max_val)

        buf = io.BytesIO()
        sf.write(buf, audio_np, target_sr, format="WAV", subtype="PCM_16")
        wav_bytes = buf.getvalue()

        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        print(f"Synthesis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class SubtitleItem(BaseModel):
    id: int
    startTimeMs: int
    endTimeMs: int
    frText: str
    calculatedRateWpm: Optional[int] = 175

class CanvasRequest(BaseModel):
    subtitles: List[SubtitleItem]
    totalDurationMs: int
    voice: Optional[str] = "Nicolas"
    cfg_scale: Optional[float] = 1.3

@app.post("/api/synthesize-canvas")
def synthesize_canvas(req: CanvasRequest):
    """
    Renders every subtitle with VibeVoice, placing each onto the 44.1kHz Stereo
    Silent Canvas at its exact millisecond offset with zero cumulative drift!
    """
    if not is_ready:
        raise HTTPException(status_code=503, detail="VibeVoice engine is still loading")

    sample_rate = 44100
    canvas_ms = max(req.totalDurationMs + 2000, 5000)
    total_samples = int((canvas_ms / 1000) * sample_rate)

    master_left = np.zeros(total_samples, dtype=np.float32)
    master_right = np.zeros(total_samples, dtype=np.float32)

    voice_path = resolve_voice_path(req.voice or "Nicolas")
    model.set_ddpm_inference_steps(num_steps=5)

    print(f"🎬 Stitched Canvas: {len(req.subtitles)} sous-titres avec VibeVoice ({req.voice})...")

    for idx, sub in enumerate(req.subtitles):
        text = (sub.frText or "").strip()
        if not text:
            continue

        script = f"Speaker 1: {text}"
        try:
            inputs = processor(
                text=[script],
                voice_samples=[[voice_path]],
                padding=True,
                return_tensors="pt",
                return_attention_mask=True
            )
            for k, v in inputs.items():
                if torch.is_tensor(v):
                    inputs[k] = v.to(device)

            with model_lock:
                if device == "mps":
                    torch.mps.synchronize()

                with torch.no_grad():
                    out = model.generate(
                        **inputs,
                        max_new_tokens=None,
                        cfg_scale=req.cfg_scale or 1.3,
                        tokenizer=processor.tokenizer,
                        generation_config={"do_sample": False},
                        is_prefill=True
                    )

                if device == "mps":
                    torch.mps.synchronize()

            if out.speech_outputs and out.speech_outputs[0] is not None:
                audio_24k = out.speech_outputs[0]
                if torch.is_tensor(audio_24k):
                    audio_24k = audio_24k.detach().cpu().to(torch.float32).numpy().squeeze()
                else:
                    audio_24k = np.array(audio_24k, dtype=np.float32).squeeze()
                audio_24k = audio_24k.astype(np.float32)

                # Resample 24k -> 44.1k for Filmora master broadcast
                audio_44k = librosa.resample(audio_24k, orig_sr=24000, target_sr=sample_rate)

                # Normalize chunk peak
                chunk_peak = np.max(np.abs(audio_44k))
                if chunk_peak > 0.01:
                    audio_44k = audio_44k * (0.85 / chunk_peak)

                # Overlay onto canvas at start_time_ms
                start_sample = int((sub.startTimeMs / 1000) * sample_rate)
                end_sample = min(start_sample + len(audio_44k), total_samples)
                n_samples = end_sample - start_sample

                if n_samples > 0:
                    master_left[start_sample:end_sample] += audio_44k[:n_samples]
                    master_right[start_sample:end_sample] += audio_44k[:n_samples] * 0.98
        except Exception as err:
            print(f"Warning: Failed to synthesize segment {sub.id}: {err}")

    # Master Limiter & Normalization
    peak = max(np.max(np.abs(master_left)), np.max(np.abs(master_right)))
    if peak > 0.01:
        gain = min(1.2, 0.90 / peak)
        master_left = np.clip(master_left * gain, -0.95, 0.95)
        master_right = np.clip(master_right * gain, -0.95, 0.95)

    # Interleave Stereo PCM
    stereo_data = np.vstack((master_left, master_right)).T
    buf = io.BytesIO()
    sf.write(buf, stereo_data, sample_rate, format="WAV", subtype="PCM_16")
    wav_bytes = buf.getvalue()

    return Response(content=wav_bytes, media_type="audio/wav")

if __name__ == "__main__":
    port = int(os.environ.get("VIBEVOICE_PORT", 5005))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")