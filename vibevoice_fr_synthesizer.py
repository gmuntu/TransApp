#!/usr/bin/env python3
"""
vibevoice_fr_synthesizer.py — VibeVoice French TTS for SavoirIA TransApp
=========================================================================
Generates high-quality French speech audio from translated subtitle text
using the VibeVoice neural speech synthesis model.

Designed for:
  - Dubbing French CS lecture subtitles from SRT files
  - Generating WAV audio compatible with Wondershare Filmora
  - Running on Apple Silicon (MPS), CUDA GPUs, or CPU

Usage:
  # From a text file (one Speaker 1: line per segment)
  python vibevoice_fr_synthesizer.py --input texte_fr.txt --output sortie_audio.wav

  # From an SRT file (auto-extracts French text)
  python vibevoice_fr_synthesizer.py --input sous_titres.srt --output sortie_audio.wav

  # With a specific voice preset
  python vibevoice_fr_synthesizer.py --input texte_fr.txt --output sortie_audio.wav --voice Alice

Author: Ghislain Muntu — SavoirIA TransApp
"""

import argparse
import os
import sys
import re
import time
import tempfile
from pathlib import Path

# ─── Detect VibeVoice installation ─────────────────────────────────────────────
VIBEVOICE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "VibeVoice")
if os.path.isdir(VIBEVOICE_DIR) and VIBEVOICE_DIR not in sys.path:
    sys.path.insert(0, VIBEVOICE_DIR)

try:
    import torch
    from vibevoice.modular.modeling_vibevoice_inference import VibeVoiceForConditionalGenerationInference
    from vibevoice.processor.vibevoice_processor import VibeVoiceProcessor
    VIBEVOICE_AVAILABLE = True
except ImportError as e:
    VIBEVOICE_AVAILABLE = False
    print(f"⚠️  VibeVoice non disponible: {e}")
    print("   Installez avec: cd VibeVoice && pip install -e .")


# ─── SRT Parser ────────────────────────────────────────────────────────────────
def parse_srt(filepath: str) -> list[dict]:
    """Parse an SRT file and return a list of subtitle entries."""
    entries = []
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    blocks = re.split(r"\n\s*\n", content.strip())
    for block in blocks:
        lines = block.strip().split("\n")
        if len(lines) < 3:
            continue
        # Line 0: index
        # Line 1: timecodes
        # Lines 2+: text
        text = " ".join(lines[2:]).strip()
        if text:
            entries.append({"text": text})
    return entries


def parse_text_file(filepath: str) -> list[dict]:
    """Parse a plain text file: one line = one segment."""
    entries = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append({"text": line})
    return entries


# ─── VibeVoice Model Manager ──────────────────────────────────────────────────
class VibeVoiceFrenchSynthesizer:
    """Manages VibeVoice model loading and French speech synthesis."""

    MODEL_NAME = "microsoft/VibeVoice-1.5B"
    SAMPLE_RATE = 24000  # VibeVoice outputs at 24kHz

    # Available voice presets (shipped with VibeVoice demo/voices/)
    VOICE_PRESETS = {
        "Alice": "en-Alice_woman.wav",
        "Carter": "en-Carter_man.wav",
        "Frank": "en-Frank_man.wav",
        "Mary": "en-Mary_woman_bgm.wav",
        "Maya": "en-Maya_woman.wav",
        "Samuel": "in-Samuel_man.wav",
    }

    def __init__(self, model_path: str | None = None, device: str | None = None):
        if not VIBEVOICE_AVAILABLE:
            raise RuntimeError("VibeVoice n'est pas installé. Exécutez: cd VibeVoice && pip install -e .")

        self.model_path = model_path or self.MODEL_NAME
        self.device = device or self._detect_device()
        self.model = None
        self.processor = None

    def _detect_device(self) -> str:
        """Auto-detect the best available compute device."""
        if torch.cuda.is_available():
            return "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    def _get_dtype(self):
        """Get the optimal dtype for the detected device."""
        if self.device == "mps":
            return torch.float16
        elif self.device == "cuda":
            return torch.bfloat16
        return torch.float32

    def load_model(self):
        """Load VibeVoice model and processor."""
        if self.model is not None:
            return  # Already loaded

        print(f"🔄 Chargement du modèle VibeVoice ({self.model_path})...")
        print(f"   Device: {self.device} | Dtype: {self._get_dtype()}")

        self.processor = VibeVoiceProcessor.from_pretrained(self.model_path)

        load_dtype = self._get_dtype()
        attn_impl = "sdpa" if self.device in ("mps", "cpu") else "flash_attention_2"

        try:
            if self.device == "mps":
                self.model = VibeVoiceForConditionalGenerationInference.from_pretrained(
                    self.model_path,
                    torch_dtype=load_dtype,
                    attn_implementation=attn_impl,
                    device_map=None,
                )
                self.model.to("mps")
            elif self.device == "cuda":
                self.model = VibeVoiceForConditionalGenerationInference.from_pretrained(
                    self.model_path,
                    torch_dtype=load_dtype,
                    device_map="cuda",
                    attn_implementation=attn_impl,
                )
            else:
                self.model = VibeVoiceForConditionalGenerationInference.from_pretrained(
                    self.model_path,
                    torch_dtype=load_dtype,
                    device_map="cpu",
                    attn_implementation="sdpa",
                )
        except Exception as e:
            if attn_impl == "flash_attention_2":
                print(f"⚠️  flash_attention_2 échoué, repli sur SDPA: {e}")
                self.model = VibeVoiceForConditionalGenerationInference.from_pretrained(
                    self.model_path,
                    torch_dtype=load_dtype,
                    device_map=(self.device if self.device in ("cuda", "cpu") else None),
                    attn_implementation="sdpa",
                )
                if self.device == "mps":
                    self.model.to("mps")
            else:
                raise

        self.model.eval()
        self.model.set_ddpm_inference_steps(num_steps=10)
        print("✅ Modèle VibeVoice chargé avec succès!")

    def get_voice_path(self, voice_name: str) -> str:
        """Resolve a voice preset name or custom audio file path to a WAV file path."""
        # 1. Direct audio file path (voice cloning from video/audio sample)
        if os.path.isfile(voice_name):
            print(f"🎯 Utilisation d'un fichier audio direct pour le clonage de voix: {voice_name}")
            return os.path.abspath(voice_name)

        voices_dir = os.path.join(VIBEVOICE_DIR, "demo", "voices")

        # 2. Check in demo/voices with direct filename or without extension
        for ext in ["", ".wav", ".mp3", ".m4a", ".flac", ".aac"]:
            candidate = os.path.join(voices_dir, f"{voice_name}{ext}")
            if os.path.isfile(candidate):
                return candidate

        # 3. Try exact preset match
        if voice_name in self.VOICE_PRESETS:
            path = os.path.join(voices_dir, self.VOICE_PRESETS[voice_name])
            if os.path.exists(path):
                return path

        # Try case-insensitive search in voices directory
        if os.path.isdir(voices_dir):
            for f in os.listdir(voices_dir):
                if f.lower().endswith(".wav") and voice_name.lower() in f.lower():
                    return os.path.join(voices_dir, f)

        # Default to Alice
        default = os.path.join(voices_dir, self.VOICE_PRESETS.get("Alice", "en-Alice_woman.wav"))
        if os.path.exists(default):
            print(f"⚠️  Voix '{voice_name}' non trouvée, utilisation de Alice par défaut")
            return default

        raise FileNotFoundError(f"Aucun fichier voix trouvé dans {voices_dir}")

    def synthesize(
        self,
        text: str,
        voice_name: str = "Alice",
        output_path: str = "output_fr.wav",
        cfg_scale: float = 1.3,
    ) -> str:
        """
        Synthesize French speech from text using VibeVoice.

        Args:
            text: French text to synthesize (will be wrapped in Speaker 1: format)
            voice_name: Voice preset name (Alice, Carter, Frank, Mary, Maya, Samuel)
            output_path: Path to save the generated WAV file
            cfg_scale: Classifier-Free Guidance scale (higher = more faithful to text)

        Returns:
            Path to the generated WAV file
        """
        self.load_model()

        voice_path = self.get_voice_path(voice_name)
        print(f"🎤 Voix: {voice_name} ({os.path.basename(voice_path)})")

        # Format text for VibeVoice (requires "Speaker N:" prefix)
        if not text.strip().startswith("Speaker"):
            script = f"Speaker 1: {text}"
        else:
            script = text

        print(f"📝 Texte ({len(text)} caractères): {text[:120]}...")

        # Prepare inputs
        inputs = self.processor(
            text=[script],
            voice_samples=[[voice_path]],
            padding=True,
            return_tensors="pt",
            return_attention_mask=True,
        )

        # Move to device
        for k, v in inputs.items():
            if torch.is_tensor(v):
                inputs[k] = v.to(self.device)

        # Generate audio
        print(f"🔊 Génération audio (cfg_scale={cfg_scale})...")
        start_time = time.time()

        outputs = self.model.generate(
            **inputs,
            max_new_tokens=None,
            cfg_scale=cfg_scale,
            tokenizer=self.processor.tokenizer,
            generation_config={"do_sample": False},
            verbose=True,
            is_prefill=True,
        )

        generation_time = time.time() - start_time

        # Save audio
        if outputs.speech_outputs and outputs.speech_outputs[0] is not None:
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            self.processor.save_audio(outputs.speech_outputs[0], output_path=output_path)

            audio_samples = outputs.speech_outputs[0].shape[-1]
            audio_duration = audio_samples / self.SAMPLE_RATE
            rtf = generation_time / audio_duration if audio_duration > 0 else float("inf")

            print(f"✅ Audio généré: {output_path}")
            print(f"   Durée: {audio_duration:.1f}s | Temps de génération: {generation_time:.1f}s | RTF: {rtf:.2f}x")
            return output_path
        else:
            print("❌ Aucune sortie audio générée")
            return ""

    def synthesize_srt_segments(
        self,
        segments: list[dict],
        voice_name: str = "Alice",
        output_path: str = "output_fr_doublage.wav",
        cfg_scale: float = 1.3,
        max_chars_per_batch: int = 2000,
    ) -> str:
        """
        Synthesize French speech from a list of subtitle segments.

        Groups segments into batches to avoid exceeding model context limits,
        then concatenates all generated audio into a single WAV file.
        """
        if not segments:
            print("❌ Aucun segment à synthétiser")
            return ""

        # Combine all segments into a single text block for VibeVoice
        # (VibeVoice handles long-form text natively, up to ~90 minutes)
        all_text = " ".join(seg["text"] for seg in segments)

        print(f"📋 {len(segments)} segments | {len(all_text)} caractères au total")

        # If text is short enough, synthesize in one shot
        if len(all_text) <= max_chars_per_batch:
            return self.synthesize(all_text, voice_name, output_path, cfg_scale)

        # For very long text, split into batches and concatenate
        print(f"📦 Texte trop long ({len(all_text)} chars), division en lots...")

        batches = []
        current_batch = []
        current_len = 0

        for seg in segments:
            seg_len = len(seg["text"])
            if current_len + seg_len > max_chars_per_batch and current_batch:
                batches.append(" ".join(s["text"] for s in current_batch))
                current_batch = []
                current_len = 0
            current_batch.append(seg)
            current_len += seg_len

        if current_batch:
            batches.append(" ".join(s["text"] for s in current_batch))

        print(f"   {len(batches)} lots à générer")

        # Generate each batch
        temp_files = []
        for i, batch_text in enumerate(batches):
            temp_path = os.path.join(
                tempfile.gettempdir(),
                f"vibevoice_fr_batch_{i:03d}.wav"
            )
            print(f"\n─── Lot {i + 1}/{len(batches)} ───")
            result = self.synthesize(batch_text, voice_name, temp_path, cfg_scale)
            if result:
                temp_files.append(result)

        if not temp_files:
            print("❌ Aucun lot n'a produit d'audio")
            return ""

        # If only one batch, just rename it
        if len(temp_files) == 1:
            import shutil
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            shutil.move(temp_files[0], output_path)
            print(f"\n✅ Audio final: {output_path}")
            return output_path

        # Concatenate with scipy/numpy
        try:
            import soundfile as sf
            import numpy as np

            all_audio = []
            for tf in temp_files:
                data, sr = sf.read(tf)
                all_audio.append(data)
                # Add 0.3s silence between batches
                silence = np.zeros(int(0.3 * sr))
                if data.ndim > 1:
                    silence = np.zeros((int(0.3 * sr), data.shape[1]))
                all_audio.append(silence)

            concatenated = np.concatenate(all_audio)
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            sf.write(output_path, concatenated, sr)
            print(f"\n✅ Audio final concaténé: {output_path} ({len(concatenated) / sr:.1f}s)")

            # Cleanup temp files
            for tf in temp_files:
                try:
                    os.remove(tf)
                except OSError:
                    pass

            return output_path

        except ImportError:
            print("⚠️  soundfile non disponible, le dernier lot est sauvegardé comme sortie")
            import shutil
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            shutil.move(temp_files[-1], output_path)
            return output_path


# ─── CLI Entry Point ──────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="VibeVoice French TTS — SavoirIA TransApp",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemples:
  # Synthétiser du texte français simple
  python vibevoice_fr_synthesizer.py --input texte_fr.txt --output audio_fr.wav

  # Synthétiser depuis un fichier SRT traduit
  python vibevoice_fr_synthesizer.py --input sous_titres_fr.srt --output doublage.wav

  # Avec une voix spécifique et un modèle local
  python vibevoice_fr_synthesizer.py --input texte.txt --voice Frank --model ./models/VibeVoice-1.5B

Voix disponibles: Alice (femme), Carter (homme), Frank (homme), Mary (femme+bgm),
                  Maya (femme), Samuel (homme indien)
        """,
    )
    parser.add_argument("--input", "-i", default=None, help="Fichier texte (.txt) ou sous-titres (.srt)")
    parser.add_argument("--output", "-o", default="output_vibevoice_fr.wav", help="Fichier WAV de sortie")
    parser.add_argument("--voice", "-v", default="Alice", help="Préréglage voix (Alice, Carter, Frank, Mary, Maya, Samuel)")
    parser.add_argument("--model", "-m", default=None, help="Chemin ou ID HuggingFace du modèle VibeVoice")
    parser.add_argument("--device", "-d", default=None, help="Device: cuda | mps | cpu (auto-détecté)")
    parser.add_argument("--cfg-scale", type=float, default=1.3, help="CFG scale (défaut: 1.3)")
    parser.add_argument("--text", "-t", default=None, help="Texte direct à synthétiser (ignore --input)")

    args = parser.parse_args()

    if not args.text and not args.input:
        print("❌ Erreur: Veuillez fournir --input ou --text")
        sys.exit(1)

    print("=" * 60)
    print("  🎙️  VibeVoice French TTS — SavoirIA TransApp")
    print("  👤 Conçu et développé par Ghislain Muntu")
    print("=" * 60)

    synth = VibeVoiceFrenchSynthesizer(model_path=args.model, device=args.device)

    if args.text:
        # Direct text mode
        synth.synthesize(args.text, args.voice, args.output, args.cfg_scale)
    else:
        # File mode
        input_path = args.input
        if not os.path.exists(input_path):
            print(f"❌ Fichier introuvable: {input_path}")
            sys.exit(1)

        ext = os.path.splitext(input_path)[1].lower()
        if ext == ".srt":
            segments = parse_srt(input_path)
        else:
            segments = parse_text_file(input_path)

        if not segments:
            print("❌ Aucun texte trouvé dans le fichier")
            sys.exit(1)

        print(f"📄 {len(segments)} segments chargés depuis {input_path}")
        synth.synthesize_srt_segments(segments, args.voice, args.output, args.cfg_scale)

    print("\n🏁 Terminé!")


if __name__ == "__main__":
    main()
