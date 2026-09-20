#!/bin/bash
# ==============================================================================
# Stitch & Pad — Doublage Voix Réelles IA (0% Robotique)
# Double-cliquez pour lancer le doublage vocal automatique
# ==============================================================================

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "======================================================================"
echo "🎙️  DOUBLAGE VOCAL IA (VOIX NATURELLE HENRI / NEURAL - 0% ROBOTIQUE)"
echo "======================================================================"
echo ""

if [ ! -d "venv" ]; then
    echo "❌ Environnement virtuel non trouvé. Veuillez exécuter setup_qwen3_tts.command."
    exit 1
fi

SRT_FILE="$1"
if [ -z "$SRT_FILE" ]; then
    # Recherche du premier fichier .srt dans le dossier courant
    SRT_FILE=$(ls -1 *.srt public/*.srt 2>/dev/null | head -n 1)
fi

if [ -z "$SRT_FILE" ]; then
    echo "⚠️  Aucun fichier .srt spécifié."
    echo "Glissez un fichier .srt sur ce script, ou placez votre fichier .srt dans ce dossier."
    read -p "Chemin du fichier .srt : " SRT_FILE
fi

if [ ! -f "$SRT_FILE" ]; then
    echo "❌ Fichier '$SRT_FILE' introuvable."
    exit 1
fi

BASENAME=$(basename "$SRT_FILE" .srt)
OUTPUT_WAV="${BASENAME}_doublage_final_voix_reelle.wav"

echo "📄 Fichier source : $SRT_FILE"
echo "🎯 Fichier de sortie : $OUTPUT_WAV"
echo ""

./venv/bin/python3 qwen3_tts_dubber.py "$SRT_FILE" "$OUTPUT_WAV"

if [ -f "$OUTPUT_WAV" ]; then
    echo ""
    echo "🎉 Doublage terminé ! Vous pouvez glisser '$OUTPUT_WAV' dans Filmora sur la piste A2 à 00:00:00:00."
fi

echo ""
read -n 1 -s -r -p "Appuyez sur une touche pour quitter..."
echo ""
