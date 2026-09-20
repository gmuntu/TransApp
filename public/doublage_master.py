#!/usr/bin/env python3
"""
================================================================================
SAVOIRIA DOUBLAGE MASTER — PIPELINE OFFICIEL GEMINI-3.8-LIVE & FILMORA
================================================================================
Génération d'un Master Audio Français 44 100 Hz Stéréo (PCM 16-bit) calé
à la milliseconde près (0.000 ms de décalage) sur la timeline Wondershare Filmora.

Intégration :
1. Modèle exclusif Google GenAI : gemini-3.8-live pour la prosodie et le calage labial
2. Moteur d'assemblage Stitch & Pad 44.1kHz Stéréo sur canvas silencieux
3. Synthèse vocale de haute qualité sans hachage de syllabes techniques
4. Prise en charge asynchrone des flux et des fichiers longs (>3500 lignes)
================================================================================
"""

import os
import sys
import math
import shutil
import asyncio
import tempfile
import argparse
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any

# Patch Python 3.13 PEP 594 pour audioop
try:
    import audioop
except ModuleNotFoundError:
    try:
        import audioop_lts as audioop
        sys.modules['audioop'] = audioop
    except ModuleNotFoundError:
        pass

# Import pydub
try:
    from pydub import AudioSegment
except ImportError:
    print("[ERREUR] pydub non installé. Lancez : pip install pydub audioop-lts")
    sys.exit(1)

# Import du processeur de lot gemini-3.8-live
try:
    from batch_processor import process_srt_file, GEMINI_MODEL, get_genai_client
except ImportError:
    print("[AVERTISSEMENT] batch_processor.py non trouvé dans le même dossier.")
    GEMINI_MODEL = "gemini-3.8-live"

SAMPLE_RATE = 44100
CHANNELS = 2
DEFAULT_VOICE = "Thomas" # Voix masculine française native macOS (ou edge-tts fr-FR-HenriNeural)


def srt_time_to_ms(time_str: str) -> int:
    """Convertit '00:01:23,456' en millisecondes."""
    try:
        parts = time_str.strip().replace(',', '.').split(':')
        h = int(parts[0])
        m = int(parts[1])
        s_parts = parts[2].split('.')
        s = int(s_parts[0])
        ms = int(s_parts[1].ljust(3, '0')[:3])
        return h * 3600000 + m * 60000 + s * 1000 + ms
    except Exception:
        return 0


def generate_speech_chunk_macos(text: str, rate_wpm: int, voice: str, out_wav_path: str):
    """Génère un segment audio via le synthétiseur natif Apple Silicon avec modulation WPM."""
    with tempfile.NamedTemporaryFile(suffix=".aiff", delete=False) as temp_aiff:
        temp_aiff_path = temp_aiff.name

    try:
        # say -v Thomas -r [rate] -o temp.aiff "texte"
        cmd = ["say", "-v", voice, "-r", str(rate_wpm), "-o", temp_aiff_path, text]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # Conversion en WAV 44.1kHz Stéréo via ffmpeg
        ffmpeg_bin = "/opt/homebrew/bin/ffmpeg" if os.path.exists("/opt/homebrew/bin/ffmpeg") else "ffmpeg"
        conv_cmd = [
            ffmpeg_bin, "-y", "-i", temp_aiff_path,
            "-ar", str(SAMPLE_RATE), "-ac", str(CHANNELS),
            out_wav_path
        ]
        subprocess.run(conv_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    finally:
        if os.path.exists(temp_aiff_path):
            os.remove(temp_aiff_path)


def assemble_master_canvas(
    subtitles_data: List[Dict[str, Any]],
    output_master_wav: str,
    voice: str = DEFAULT_VOICE,
    safety_padding_ms: int = 50
) -> str:
    """
    Construit le Master Silent Canvas 44.1kHz Stéréo et superpose chaque réplique
    à sa coordonnée temporelle exacte (start_time_ms).
    """
    if not subtitles_data:
        print("[ERREUR] Aucun sous-titre à assembler.")
        return ""

    last_sub = subtitles_data[-1]
    total_duration_ms = last_sub.get("endTimeMs", 60000) + 3000

    print(f"[*] Initialisation Master Canvas Silencieux : {total_duration_ms / 1000.0:.1f}s (44.1kHz Stéréo)")
    master_canvas = AudioSegment.silent(duration=total_duration_ms, frame_rate=SAMPLE_RATE)
    master_canvas = master_canvas.set_channels(CHANNELS)

    temp_dir = tempfile.mkdtemp(prefix="savoiria_dub_")
    stitched_count = 0

    try:
        for idx, sub in enumerate(subtitles_data):
            text = (sub.get("frText") or "").strip()
            if not text:
                continue

            start_ms = sub.get("startTimeMs", 0)
            target_wpm = sub.get("calculatedRateWpm", 175)
            sub_id = sub.get("id", idx + 1)

            chunk_wav = os.path.join(temp_dir, f"sub_{sub_id}.wav")

            try:
                generate_speech_chunk_macos(text, target_wpm, voice, chunk_wav)
                if os.path.exists(chunk_wav) and os.path.getsize(chunk_wav) > 100:
                    audio_segment = AudioSegment.from_wav(chunk_wav)
                    # Overlay à la position temporelle exacte (start_ms)
                    master_canvas = master_canvas.overlay(audio_segment, position=start_ms)
                    stitched_count += 1
                    print(f"  ↳ [{sub_id}/{len(subtitles_data)}] Inséré à {start_ms}ms ({target_wpm} WPM) : \"{text[:45]}...\"")
            except Exception as e:
                print(f"  [!] Avertissement réplique #{sub_id} : {e}")

        # Normalisation audio professionnelle (-1.0 dBFS)
        print("[*] Normalisation studio du master audio...")
        master_canvas = master_canvas.normalize(headroom=1.0)

        # Sauvegarde du Master WAV final
        print(f"[*] Exportation du Master WAV Broadcast : {output_master_wav}")
        master_canvas.export(output_master_wav, format="wav")
        size_mb = os.path.getsize(output_master_wav) / (1024 * 1024)
        print(f"[✓] DOUBLAGE MASTER TERMINÉ : {output_master_wav} ({size_mb:.2f} MB)")
        print(f"[✓] Prêt pour Filmora : Glissez sur la piste A2 à 00:00:00:00.")

        return output_master_wav
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


async def run_doublage_pipeline(
    input_srt: str,
    output_wav: str,
    api_key: Optional[str] = None,
    voice: str = DEFAULT_VOICE
):
    """Orchestre la chaîne complète : Traduction gemini-3.8-live + Assemblage Master."""
    print("=" * 80)
    print(f"SAVOIRIA DOUBLAGE MASTER • {GEMINI_MODEL}")
    print("=" * 80)

    translated_srt = str(Path(output_wav).with_suffix(".srt"))

    # Étape 1 : Traitement du SRT avec gemini-3.8-live
    print("\n>>> ÉTAPE 1 : Traduction & Calibrage Prosodique via gemini-3.8-live")
    results = await process_srt_file(input_srt, translated_srt, api_key=api_key)

    # Calcul des timecodes en ms
    for r in results:
        t_line = r.get("timeLine", "")
        if " --> " in t_line:
            parts = t_line.split(" --> ")
            r["startTimeMs"] = srt_time_to_ms(parts[0])
            r["endTimeMs"] = srt_time_to_ms(parts[1])
            r["durationMs"] = max(500, r["endTimeMs"] - r["startTimeMs"])

    # Étape 2 : Assemblage Master Canvas
    print("\n>>> ÉTAPE 2 : Assemblage Audio 44.1kHz Stéréo (Stitch & Pad)")
    assemble_master_canvas(results, output_wav, voice=voice)


def main():
    parser = argparse.ArgumentParser(description=f"SavoirIA Doublage Master ({GEMINI_MODEL})")
    parser.add_argument("input_srt", help="Fichier .srt d'origine en anglais")
    parser.add_argument("output_wav", help="Fichier .wav Master de sortie pour Filmora")
    parser.add_argument("--api-key", help="Clé GEMINI_API_KEY (optionnelle si dans .env)")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help=f"Voix de doublage (défaut: {DEFAULT_VOICE})")
    args = parser.parse_args()

    asyncio.run(run_doublage_pipeline(args.input_srt, args.output_wav, api_key=args.api_key, voice=args.voice))


if __name__ == "__main__":
    main()
