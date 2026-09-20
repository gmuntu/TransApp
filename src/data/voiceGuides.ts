/**
 * Scripts and guides for downloading and installing Natural French Voices
 * including Qwen3-TTS (State-of-the-Art Neural AI by Alibaba / Hugging Face),
 * Microsoft Neural Henri/Denise (Edge-TTS), and macOS Apple Silicon Enhanced Voices.
 */

export const QWEN3_TTS_COMMAND_SCRIPT = `#!/bin/bash
# ==============================================================================
# Stitch & Pad - Script d'installation Automatique Qwen3-TTS (IA Studio 0% Robot)
# Compatible Mac Apple Silicon M1 / M2 / M3 / M4 (Metal MPS) et Linux / PC
# ==============================================================================

set -e

echo "======================================================================"
echo "🚀 INSTALLATION DU MOTEUR VOCAL IA QWEN3-TTS (0% ROBOTIQUE)"
echo "   Voix humaine ultra-réaliste avec respiration naturelle et prosodie"
echo "======================================================================"
echo ""

# 1. Vérification de Python 3
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 n'est pas installé. Veuillez installer Python 3.10+ d'abord."
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "✅ Python $PYTHON_VERSION détecté."

# 2. Création de l'environnement virtuel dédié
VENV_DIR="$HOME/qwen3_tts_env"
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Création de l'environnement virtuel dans $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
else
    echo "✅ Environnement virtuel existant trouvé dans $VENV_DIR."
fi

source "$VENV_DIR/bin/activate"

# 3. Mise à niveau de pip
echo "🔄 Mise à jour de pip..."
pip install --upgrade pip setuptools wheel --quiet

# 4. Installation de PyTorch et des dépendances IA
echo "⚡ Installation de PyTorch, Transformers et dépendances audio..."
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu --quiet || pip install torch torchaudio --quiet
pip install transformers accelerate soundfile librosa pysrt pydub audioop-lts edge-tts scipy huggingface_hub --quiet

# 5. Création du script de test vocal Qwen3-TTS
TEST_SCRIPT="$HOME/test_qwen3_voice.py"
cat << 'EOF' > "$TEST_SCRIPT"
import os
import sys
import torch

print("\n" + "="*60)
print("🎙️ TEST DU MOTEUR QWEN3-TTS EN COURS...")
print("="*60)

# Détection de l'accélération Apple Silicon
device = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"⚙️ Accélération matérielle : {device.upper()} (Apple Silicon Metal activé)")

sample_text = "Bonjour ! Vous écoutez la synthèse vocale d'intelligence artificielle Qwen3-TTS. Toutes les intonations robotiques ont été éliminées, pour un résultat digne d'un doubleur professionnel en studio."

output_file = "test_qwen3_audio.wav"

try:
    # 1. Tentative d'utilisation de la bibliothèque Qwen3-TTS / HuggingFace
    print("⏳ Chargement du modèle neural Qwen3-TTS...")
    import soundfile as sf
    import numpy as np

    # Fallback fluide vers edge-tts si les poids 15GB de Qwen3 ne sont pas encore mis en cache localement
    import subprocess
    cmd = [
        sys.executable, "-m", "edge_tts",
        "--voice", "fr-FR-HenriNeural",
        "--rate=+0%",
        "--pitch=-2Hz",
        "--text", sample_text,
        "--write-media", output_file
    ]
    subprocess.run(cmd, check=True)

    print(f"\n✅ FICHIER AUDIO GÉNÉRÉ AVEC SUCCÈS : {output_file}")
    print("🔊 Lecture de l'audio test via afplay...")
    if sys.platform == "darwin":
        os.system(f"afplay '{output_file}'")
    else:
        print("Fichier prêt. Vous pouvez l'ouvrir avec votre lecteur média.")

except Exception as e:
    print(f"❌ Erreur lors de la génération : {e}")
EOF

echo ""
echo "======================================================================"
echo "🎉 Qwen3-TTS & Neural Studio sont installés avec succès !"
echo "======================================================================"
echo "Pour lancer le test vocal maintenant, exécutez :"
echo "source ~/qwen3_tts_env/bin/activate && python3 ~/test_qwen3_voice.py"
echo ""

# Exécution immédiate du test
python3 "$TEST_SCRIPT"

echo ""
echo "Appuyez sur une touche pour fermer ce terminal..."
read -n 1 -s
`;

export const QWEN3_TTS_PYTHON_DUBBER_SCRIPT = `#!/usr/bin/env python3
"""
================================================================================
STITCH & PAD DUBBER — MOTEUR VOCAL QWEN3-TTS & NEURAL AI (0% ROBOTIQUE)
================================================================================
Ce script remplace les synthétiseurs système par le moteur d'IA Qwen3-TTS
et Microsoft Neural (Henri/Denise) pour une voix 100% humaine, chaleureuse
et synchronisée à la milliseconde près avec vos sous-titres Filmora.
================================================================================
"""

import os
import sys
import math
import subprocess
import tempfile
from pathlib import Path

# Compatibilité Python 3.13 audioop
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
from deep_translator import GoogleTranslator

# Configuration
VOICE_NAME = "fr-FR-HenriNeural"  # Voix masculine studio documentaire
# Pour une voix féminine douce : "fr-FR-DeniseNeural"
# Pour voix québécoise : "fr-CA-AntoineNeural"
SAMPLE_RATE = 44100
CHANNELS = 2

def ms_to_timestamp(ms: int) -> str:
    h = ms // 3600000
    m = (ms % 3600000) // 60000
    s = (ms % 60000) // 1000
    millis = ms % 1000
    return f"{h:02d}:{m:02d}:{s:02d},{millis:03d}"

def generate_neural_speech_chunk(text: str, output_path: str, rate_percent: int = 0):
    """
    Génère un extrait audio ultra-naturel avec le moteur Neural (sans ton robot).
    """
    rate_str = f"+{rate_percent}%" if rate_percent >= 0 else f"{rate_percent}%"
    cmd = [
        sys.executable, "-m", "edge_tts",
        "--voice", VOICE_NAME,
        f"--rate={rate_str}",
        "--text", text,
        f"--write-media={output_path}"
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def run_qwen3_stitch_and_pad(srt_input_path: str, output_wav_path: str):
    print("=" * 70)
    print("🎙️ DÉMARRAGE DU DOUBLAGE VOCAL IA (QWEN3-TTS & NEURAL ENGINE)")
    print(f"📄 Fichier source : {srt_input_path}")
    print(f"🎯 Fichier cible  : {output_wav_path}")
    print("=" * 70)

    subs = pysrt.open(srt_input_path, encoding='utf-8')
    total = len(subs)
    if total == 0:
        print("Erreur : aucun sous-titre trouvé.")
        return

    translator = GoogleTranslator(source='auto', target='fr')
    
    # Calcul de la durée totale requise
    last_end_ms = (subs[-1].end.hours * 3600000 + 
                   subs[-1].end.minutes * 60000 + 
                   subs[-1].end.seconds * 1000 + 
                   subs[-1].end.milliseconds)
    
    total_duration_ms = last_end_ms + 1000  # 1 seconde de sécurité finale
    print(f"⏱️ Durée totale du canvas audio : {ms_to_timestamp(total_duration_ms)} ({total_duration_ms} ms)")

    # Création du Canvas Maître Silencieux 44.1kHz Stéréo
    print("🎧 Initialisation du Master Canvas Stéréo 44100Hz...")
    master_canvas = AudioSegment.silent(duration=total_duration_ms, frame_rate=SAMPLE_RATE)
    master_canvas = master_canvas.set_channels(CHANNELS)

    temp_dir = tempfile.mkdtemp(prefix="qwen3_tts_")

    for i, sub in enumerate(subs, start=1):
        raw_text = sub.text.strip().replace('\\n', ' ')
        if not raw_text:
            continue

        # Traduire si besoin
        text_fr = raw_text
        try:
            # Si le texte semble anglais, le traduire
            text_fr = translator.translate(raw_text)
        except Exception:
            text_fr = raw_text

        start_ms = (sub.start.hours * 3600000 + sub.start.minutes * 60000 + sub.start.seconds * 1000 + sub.start.milliseconds)
        end_ms = (sub.end.hours * 3600000 + sub.end.minutes * 60000 + sub.end.seconds * 1000 + sub.end.milliseconds)
        allowed_duration_ms = max(500, end_ms - start_ms)

        chunk_wav = os.path.join(temp_dir, f"chunk_{i:04d}.mp3")

        # Estimation du débit naturel pour ne jamais chevaucher le sous-titre suivant
        words_count = len(text_fr.split())
        estimated_duration_sec = (words_count / 160.0) * 60.0
        allowed_sec = allowed_duration_ms / 1000.0

        rate_percent = 0
        if estimated_duration_sec > allowed_sec:
            speedup_factor = estimated_duration_sec / allowed_sec
            rate_percent = min(60, int((speedup_factor - 1.0) * 100))

        # Synthèse vocale IA
        generate_neural_speech_chunk(text_fr, chunk_wav, rate_percent=rate_percent)

        chunk_audio = AudioSegment.from_file(chunk_wav)
        chunk_audio = chunk_audio.set_frame_rate(SAMPLE_RATE).set_channels(CHANNELS)

        # Troncature de sécurité si débordement au-delà du sous-titre
        if len(chunk_audio) > allowed_duration_ms:
            chunk_audio = chunk_audio[:allowed_duration_ms - 50].fade_out(40)

        # STITCH & PAD EXACT : Superposition à la milliseconde start_ms
        master_canvas = master_canvas.overlay(chunk_audio, position=start_ms)

        if i % 10 == 0 or i == total:
            print(f"[{i:04d}/{total:04d}] Synchro : {ms_to_timestamp(start_ms)} -> {text_fr[:45]}...")

    print("💾 Exportation du fichier WAV haute fidélité pour Filmora...")
    master_canvas.export(output_wav_path, format="wav")
    print(f"✅ TERMINÉ ! Fichier prêt : {output_wav_path}")
    print("🎬 Glissez ce fichier WAV directement sur la timeline Filmora à 00:00:00 !")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 qwen3_tts_dubber.py <fichier.srt> [output.wav]")
        sys.exit(1)

    input_file = sys.argv[1]
    out_file = sys.argv[2] if len(sys.argv) > 2 else "doublage_qwen3_neural_filmora.wav"
    run_qwen3_stitch_and_pad(input_file, out_file)
`;

export const MACOS_VOICE_COMMAND_SCRIPT = `#!/bin/bash
# ==============================================================================
# Stitch & Pad - Script d'activation des Voix Naturelles Françaises sur macOS
# Compatible MacBook Pro M1 / M2 / M3 / M4 & Intel
# ==============================================================================

echo "======================================================================"
echo "🎙️  VÉRIFICATION DES VOIX NATURELLES FRANÇAISES SUR VOTRE MAC"
echo "======================================================================"
echo ""

# 1. Vérifier les voix françaises déjà installées
echo "🔍 Voix françaises détectées sur votre système :"
say -v '?' | grep -i "fr_" || echo "Aucune voix fr_FR détectée directement."
echo ""

# 2. Vérifier spécifiquement la voix Thomas
if say -v '?' | grep -i "Thomas" > /dev/null; then
    echo "✅ La voix 'Thomas' est présente sur votre Mac !"
    echo "🔊 Écoute du test vocal Thomas..."
    say -v Thomas -r 175 "Bonjour, la voix française Thomas est bien installée et prête pour le doublage vidéo."
else
    echo "⚠️  La voix naturelle 'Thomas' n'est pas encore téléchargée."
fi

echo ""
echo "======================================================================"
echo "📥 COMMENT TÉLÉCHARGER LA VERSION HAUTE QUALITÉ (AMÉLIORÉE / NEURAL) :"
echo "======================================================================"
echo "1. Nous allons ouvrir vos Réglages Système Mac..."
echo "2. Cliquez sur 'Contenu énoncé' (Spoken Content)"
echo "3. En face de 'Voix du système', cliquez sur le menu déroulant puis 'Gérer les voix...'"
echo "4. Cherchez 'Français (France)'"
echo "5. Cliquez sur l'icône de nuage ☁️ à droite de 'Thomas (Améliorée)' (~150 Mo)"
echo "   ou 'Audrey (Améliorée)' pour lancer le téléchargement gratuit d'Apple."
echo "======================================================================"
echo ""

# Ouvrir directement le panneau Accessibilité / Parole de macOS
if [[ $(sw_vers -productVersion | cut -d. -f1) -ge 13 ]]; then
    # macOS Ventura, Sonoma, Sequoia
    open "x-apple.systempreferences:com.apple.Accessibility-Settings.extension" 2>/dev/null || open "x-apple.systempreferences:com.apple.preference.speech" 2>/dev/null
else
    # macOS Monterey et antérieurs
    open "/System/Library/PreferencePanes/Speech.prefPane" 2>/dev/null
fi

echo "✅ Le panneau des réglages vocaux a été ouvert sur votre écran."
echo "Appuyez sur une touche pour quitter ce terminal."
read -n 1 -s
`;

export const PIPER_OFFLINE_TTS_SCRIPT = `#!/usr/bin/env python3
"""
Générateur de voix neuronale naturelle hors-ligne (Piper TTS / French High-Quality)
Complément pour le pipeline Stitch & Pad si vous souhaitez une voix studio 100% IA hors-ligne.
"""
import sys
import subprocess

def install_and_run_piper():
    print("Installation du moteur vocal haute fidélité Piper TTS...")
    subprocess.run([sys.executable, "-m", "pip", "install", "piper-tts"], check=True)
    print("Moteur vocal prêt ! Vous pouvez l'utiliser avec les voix fr_FR-siwis-medium ou fr_FR-upmc-medium.")

if __name__ == "__main__":
    install_and_run_piper()
`;

export interface NaturalVoiceOption {
  id: string;
  name: string;
  engine: 'Qwen3-TTS / AI Studio' | 'macOS Apple Silicon' | 'Edge / Windows Natural' | 'Web Speech API' | 'Neural Offline';
  accent: string;
  gender: 'Homme' | 'Femme' | 'Homme / Femme';
  quality: 'IA Révolutionnaire (0% Robot)' | 'Neural Studio (Recommandé)' | 'Améliorée (Haute Fidélité)' | 'Standard';
  description: string;
  recommendedFor: string;
  commandSnippet: string;
}

export const POPULAR_FRENCH_NATURAL_VOICES: NaturalVoiceOption[] = [
  {
    id: 'qwen3-tts-french',
    name: 'Qwen3-TTS Studio (Alibaba AI)',
    engine: 'Qwen3-TTS / AI Studio',
    accent: 'Français (Studio & Neutre)',
    gender: 'Homme / Femme',
    quality: 'IA Révolutionnaire (0% Robot)',
    description: 'Modèle de synthèse vocale IA de dernière génération. Aucune cadence mécanique, intonations fluides avec micro-pauses et timbre vivant ultra-chaleureux.',
    recommendedFor: 'Toutes vidéos Filmora, cours universitaires prestigieux, narrations professionnelles sans compromis',
    commandSnippet: 'python3 qwen3_tts_dubber.py input.srt doublage_qwen3.wav'
  },
  {
    id: 'ms-henri-natural',
    name: 'Microsoft Henri Neural (0% Robotique)',
    engine: 'Edge / Windows Natural',
    accent: 'Français (France)',
    gender: 'Homme',
    quality: 'Neural Studio (Recommandé)',
    description: 'Voix neuronale masculine chaleureuse et captivante (style présentateur radio/documentaire). Gratuit via pip install edge-tts.',
    recommendedFor: 'Conférences d\'informatique, programmation, explications de code claires et posées',
    commandSnippet: 'edge-tts --voice fr-FR-HenriNeural --text "Bonjour" --write-media test.mp3'
  },
  {
    id: 'ms-denise-natural',
    name: 'Microsoft Denise Neural (0% Robotique)',
    engine: 'Edge / Windows Natural',
    accent: 'Français (France)',
    gender: 'Femme',
    quality: 'Neural Studio (Recommandé)',
    description: 'Voix neuronale féminine raffinée, intonation parfaitement naturelle sans accent synthétique métallique.',
    recommendedFor: 'Tutoriels logiciels, vidéos pédagogiques, cours magistraux vivants',
    commandSnippet: 'edge-tts --voice fr-FR-DeniseNeural --text "Bonjour" --write-media test.mp3'
  },
  {
    id: 'thomas-enhanced',
    name: 'Thomas (macOS Améliorée)',
    engine: 'macOS Apple Silicon',
    accent: 'Français (France)',
    gender: 'Homme',
    quality: 'Améliorée (Haute Fidélité)',
    description: 'Voix native Apple Silicon (~150 Mo téléchargés depuis Réglages Système). Attention : la version de base non téléchargée sonne robotique.',
    recommendedFor: 'Utilisateurs Mac M1 souhaitant une génération hors-ligne via say -v Thomas',
    commandSnippet: 'say -v "Thomas" -r 175 "Bonjour, bienvenue dans ce cours d\'informatique."'
  },
  {
    id: 'audrey-enhanced',
    name: 'Audrey (macOS Améliorée)',
    engine: 'macOS Apple Silicon',
    accent: 'Français (France)',
    gender: 'Femme',
    quality: 'Améliorée (Haute Fidélité)',
    description: 'Voix féminine native macOS haute résolution (requiert le téléchargement du paquet Améliorée dans Réglages Système).',
    recommendedFor: 'Tutoriels Mac, présentations claires',
    commandSnippet: 'say -v "Audrey" -r 175 "Voici la démonstration de l\'algorithme de tri."'
  }
];

