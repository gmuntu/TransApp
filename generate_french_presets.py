#!/usr/bin/env python3
import os
import sys
import asyncio
import certifi
import soundfile as sf
import librosa

os.environ["SSL_CERT_FILE"] = certifi.where()

VOICES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "VibeVoice", "demo", "voices")
os.makedirs(VOICES_DIR, exist_ok=True)

FRENCH_PRESETS = [
    {
        "filename": "fr-Camille_femme.wav",
        "voice": "fr-FR-DeniseNeural",
        "text": "Bonjour et bienvenue dans ce cours d'informatique. Aujourd'hui, nous allons étudier l'architecture des microprocesseurs, les structures de données avancées et la synchronisation des processus en mémoire partagée."
    },
    {
        "filename": "fr-Antoine_homme.wav",
        "voice": "fr-FR-HenriNeural",
        "text": "Bonjour à tous. Dans cette séance, nous explorons l'optimisation des algorithmes, la complexité temporelle et la prévention des conditions de concurrence dans le développement logiciel moderne."
    },
    {
        "filename": "fr-Lea_femme.wav",
        "voice": "fr-FR-VivienneMultilingualNeural",
        "text": "Comprendre les principes fondamentaux du génie logiciel permet de concevoir des systèmes distribués hautement résilients, fiables et performants à grande échelle."
    },
    {
        "filename": "fr-Nicolas_homme.wav",
        "voice": "fr-FR-RemyMultilingualNeural",
        "text": "L'exécution dans le désordre et la prédiction de branchement sont des mécanismes matériels essentiels pour maximiser le débit d'instructions par cycle d'horloge du processeur."
    }
]

async def generate_all():
    import edge_tts
    for preset in FRENCH_PRESETS:
        out_path = os.path.join(VOICES_DIR, preset["filename"])
        print(f"🎙️ Génération de la référence vocale française : {preset['filename']} ({preset['voice']})...")
        tmp_mp3 = f"/tmp/{preset['filename']}.mp3"
        communicate = edge_tts.Communicate(preset["text"], preset["voice"])
        await communicate.save(tmp_mp3)
        
        # Load and resample to 24000 Hz mono (VibeVoice standard acoustic format)
        y, sr = librosa.load(tmp_mp3, sr=24000, mono=True)
        sf.write(out_path, y, 24000, subtype='PCM_16')
        try:
            os.remove(tmp_mp3)
        except:
            pass
        duration = len(y) / 24000
        print(f"✅ Créé avec succès : {out_path} ({duration:.1f}s)")

if __name__ == "__main__":
    asyncio.run(generate_all())
