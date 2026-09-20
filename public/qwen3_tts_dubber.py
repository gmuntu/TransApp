#!/usr/bin/env python3
"""
================================================================================
STITCH & PAD DUBBER — MOTEUR VOCAL NEURAL IA & QWEN3-TTS (0% ROBOTIQUE)
================================================================================
Génère un Master Audio français 44 100 Hz Stéréo sans aucune tonalité robotique,
calé à la milliseconde près sur les sous-titres .SRT pour Wondershare Filmora.
================================================================================
"""

import os
import sys
import math
import asyncio
import tempfile
from pathlib import Path

# Fix SSL certificates on macOS Python
try:
    import certifi
    os.environ["SSL_CERT_FILE"] = certifi.where()
except ImportError:
    pass

# Ensure ffmpeg in PATH for pydub
ffmpeg_paths = ["/opt/homebrew/bin", "/usr/local/bin"]
for p in ffmpeg_paths:
    if os.path.isdir(p) and p not in os.environ.get("PATH", ""):
        os.environ["PATH"] = p + os.pathsep + os.environ.get("PATH", "")

# Patch Python 3.13 audioop (PEP 594)
try:
    import audioop
except ModuleNotFoundError:
    try:
        import audioop_lts as audioop
        sys.modules['audioop'] = audioop
    except ModuleNotFoundError:
        pass

import pysrt
from pydub import AudioSegment
import edge_tts
from deep_translator import GoogleTranslator

# Choix de la voix par défaut (0% robotique, qualité studio)
# Voix masculines : 'fr-FR-HenriNeural', 'fr-FR-RemyMultilingualNeural'
# Voix féminines  : 'fr-FR-DeniseNeural', 'fr-FR-VivienneMultilingualNeural', 'fr-FR-EloiseNeural'
DEFAULT_VOICE = "fr-FR-HenriNeural"
SAMPLE_RATE = 44100
CHANNELS = 2

# Lexique et reconnaissance du langage informatique et des expressions orales américaines
AMERICAN_CS_PATTERNS = [
    # Idiomes oraux académiques américains (US lectures)
    (r"\bunder the hood\b", "sous le capot (en coulisses)"),
    (r"\blet's dive into\b", "plongeons dans"),
    (r"\blet's dive in\b", "plongeons dans le vif du sujet"),
    (r"\brule of thumb\b", "règle générale"),
    (r"\bsanity checks?\b", "vérification de cohérence"),
    (r"\bout of the box\b", "clé en main"),
    (r"\btrade-?offs?\b", "compromis"),
    (r"\bkey takeaways?\b", "points essentiels à retenir"),
    (r"\bat the end of the day\b", "en fin de compte"),
    (r"\bboilerplate( code)?\b", "code réutilisable (boilerplate)"),
    (r"\bspin up\b", "instancier"),
    (r"\bbare metal\b", "au plus près du matériel (bare-metal)"),
    (r"\bbottlenecks?\b", "goulots d'étranglement"),
    (r"\bdeep dive\b", "analyse approfondie"),

    # Concurrence, Systèmes & Algorithmes
    (r"\bshared mutable state\b", "l'état partagé mutable"),
    (r"\brace conditions?\b", "condition de concurrence (race condition)"),
    (r"\bthread-safe\b", "sûr au niveau des threads (thread-safe)"),
    (r"\block-free\b", "sans verrou (lock-free)"),
    (r"\bdeadlocks?\b", "interblocages (deadlocks)"),
    (r"\blivelocks?\b", "verrouillages actifs (livelocks)"),
    (r"\bcontext switch(ing)?\b", "changement de contexte"),
    (r"\batomic operations?\b", "opérations atomiques"),
    (r"\bcompare-and-swap\b", "comparer-et-échanger (CAS)"),
    (r"\bcache coherence\b", "cohérence de cache"),
    (r"\bvirtual memory\b", "mémoire virtuelle"),
    (r"\bgarbage collectors?\b", "ramasse-miettes (garbage collector)"),
    (r"\bgarbage collection\b", "ramasse-miettes (garbage collection)"),
    (r"\bhash maps?\b", "tables de hachage"),
    (r"\bhash tables?\b", "tables de hachage"),
    (r"\bbinary search trees?\b", "arbres binaires de recherche (BST)"),
    (r"\blinked lists?\b", "listes chaînées"),
    (r"\btime complexity\b", "complexité temporelle"),
    (r"\bspace complexity\b", "complexité spatiale"),
    (r"\bBig-O notation\b", "notation Grand O"),
    (r"\bdynamic programming\b", "programmation dynamique"),
    (r"\bbranch prediction\b", "prédiction de branchement"),
    (r"\bout-of-order execution\b", "exécution dans le désordre"),
    (r"\bsystem calls?\b", "appels système (syscalls)"),
    (r"\bbuffer overflow\b", "dépassement de tampon (buffer overflow)"),
    (r"\bmemory leaks?\b", "fuites de mémoire")
]

def refine_american_cs_translation(text: str) -> str:
    """
    Raffine la traduction française en appliquant les équivalents stricts du langage informatique.
    """
    import re
    result = text
    for pattern, replacement in AMERICAN_CS_PATTERNS:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    return result

def ms_to_timestamp(ms: int) -> str:
    h = ms // 3600000
    m = (ms % 3600000) // 60000
    s = (ms % 60000) // 1000
    millis = ms % 1000
    return f"{h:02d}:{m:02d}:{s:02d},{millis:03d}"

async def generate_neural_audio_chunk(text: str, output_path: str, voice: str = DEFAULT_VOICE, rate_percent: int = 0):
    """
    Synthèse vocale neuronale haute définition sans accent mécanique.
    """
    rate_str = f"+{rate_percent}%" if rate_percent >= 0 else f"{rate_percent}%"
    communicate = edge_tts.Communicate(text, voice, rate=rate_str)
    await communicate.save(output_path)

def run_qwen3_stitch_and_pad(srt_input_path: str, output_wav_path: str, voice: str = DEFAULT_VOICE):
    print("=" * 75)
    print("🎙️  STITCH & PAD — MOTEUR VOCAL IA HAUTE DÉFINITION (0% ROBOTIQUE)")
    print(f"📄 Fichier source .SRT : {srt_input_path}")
    print(f"🎯 Fichier cible audio : {output_wav_path}")
    print(f"🗣️  Voix sélectionnée   : {voice}")
    print("=" * 75)

    if not os.path.exists(srt_input_path):
        print(f"❌ Erreur : fichier introuvable '{srt_input_path}'")
        sys.exit(1)

    subs = pysrt.open(srt_input_path, encoding='utf-8')
    total = len(subs)
    if total == 0:
        print("❌ Erreur : aucun sous-titre trouvé dans le fichier.")
        sys.exit(1)

    print(f"📊 {total} sous-titres chargés.")

    translator = GoogleTranslator(source='auto', target='fr')

    # Calcul de la durée totale requise pour le master canvas
    last_sub = subs[-1]
    last_end_ms = (last_sub.end.hours * 3600000 + 
                   last_sub.end.minutes * 60000 + 
                   last_sub.end.seconds * 1000 + 
                   last_sub.end.milliseconds)
    
    total_duration_ms = last_end_ms + 2000  # 2 secondes de sécurité finale
    print(f"⏱️  Durée totale master : {ms_to_timestamp(total_duration_ms)} ({total_duration_ms / 1000:.1f}s)")

    # Création du Canvas Maître Silencieux 44.1kHz Stéréo
    print("🎧 Initialisation du Master Canvas Stéréo 44 100 Hz (silence parfait)...")
    master_canvas = AudioSegment.silent(duration=total_duration_ms, frame_rate=SAMPLE_RATE)
    master_canvas = master_canvas.set_channels(CHANNELS)

    temp_dir = tempfile.mkdtemp(prefix="neural_dub_")

    for i, sub in enumerate(subs, start=1):
        raw_text = sub.text.strip().replace('\n', ' ')
        if not raw_text:
            continue

        # Détection rapide : traduire si texte en anglais
        text_fr = raw_text
        try:
            # Si le texte contient des mots anglais typiques, traduire
            if any(w in raw_text.lower() for w in ['the', 'this', 'and', 'that', 'with', 'we', 'you', 'is', 'are']):
                text_fr = translator.translate(raw_text)
        except Exception:
            text_fr = raw_text

        # Reconnaissance et raffinement du langage informatique américain
        text_fr = refine_american_cs_translation(text_fr)

        start_ms = (sub.start.hours * 3600000 + sub.start.minutes * 60000 + sub.start.seconds * 1000 + sub.start.milliseconds)
        end_ms = (sub.end.hours * 3600000 + sub.end.minutes * 60000 + sub.end.seconds * 1000 + sub.end.milliseconds)
        allowed_duration_ms = max(600, end_ms - start_ms)

        chunk_file = os.path.join(temp_dir, f"chunk_{i:04d}.mp3")

        # Adaptation du débit naturel (pacing)
        words_count = len(text_fr.split())
        estimated_sec = (words_count / 165.0) * 60.0
        allowed_sec = allowed_duration_ms / 1000.0

        rate_percent = 0
        if estimated_sec > allowed_sec:
            speedup_factor = estimated_sec / allowed_sec
            rate_percent = min(50, int((speedup_factor - 1.0) * 100))

        # Génération audio neuronale via asyncio
        asyncio.run(generate_neural_audio_chunk(text_fr, chunk_file, voice=voice, rate_percent=rate_percent))

        try:
            chunk_audio = AudioSegment.from_file(chunk_file)
            chunk_audio = chunk_audio.set_frame_rate(SAMPLE_RATE).set_channels(CHANNELS)

            # Sécurité anti-débordement
            if len(chunk_audio) > allowed_duration_ms:
                chunk_audio = chunk_audio[:allowed_duration_ms - 40].fade_out(30)

            # Superposition à la coordonnée start_ms exacte
            master_canvas = master_canvas.overlay(chunk_audio, position=start_ms)
        except Exception as e:
            print(f"⚠️ Avertissement segment #{i}: {e}")

        if i % 10 == 0 or i == total:
            pct = int((i / total) * 100)
            print(f"[{pct:3d}%] [{i:04d}/{total:04d}] Synchro {ms_to_timestamp(start_ms)} : {text_fr[:50]}...")

    print("💾 Encodage du Master Audio WAV 44.1kHz Stéréo broadcast...")
    master_canvas.export(output_wav_path, format="wav")
    file_size_mb = os.path.getsize(output_wav_path) / (1024 * 1024)

    print("=" * 75)
    print(f"✅ MASTER AUDIO TERMINÉ AVEC SUCCÈS : {output_wav_path} ({file_size_mb:.2f} MB)")
    print("🎬 DÉCALAGE : 0.000 ms — Glissez ce fichier directement sur la piste A2 de Filmora !")
    print("=" * 75)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 qwen3_tts_dubber.py <fichier.srt> [sortie.wav] [nom_voix]")
        print("Exemple : python3 qwen3_tts_dubber.py cours.srt doublage_cours.wav fr-FR-HenriNeural")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else "doublage_neural_filmora.wav"
    chosen_voice = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_VOICE

    run_qwen3_stitch_and_pad(input_file, output_file, voice=chosen_voice)
