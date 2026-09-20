#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# 🎙️  VibeVoice French TTS — SavoirIA TransApp
#     Conçu et développé par Ghislain Muntu
# ═══════════════════════════════════════════════════════════════
#
# Double-cliquez ce fichier pour lancer la démo VibeVoice Gradio
# Interface web accessible à http://localhost:7860
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "═══════════════════════════════════════════════════════════"
echo "  🎙️  VibeVoice French TTS — SavoirIA TransApp"
echo "  👤  Conçu et développé par Ghislain Muntu"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Activate virtual environment
if [ -f "./venv/bin/activate" ]; then
    source ./venv/bin/activate
    echo "✅ Environnement Python activé (venv)"
else
    echo "❌ venv non trouvé. Créez-le d'abord :"
    echo "   python3 -m venv venv"
    echo "   source venv/bin/activate"
    echo "   pip install -e ./VibeVoice/"
    read -p "Appuyez sur Entrée pour fermer..."
    exit 1
fi

# Check VibeVoice is installed
python3 -c "import vibevoice" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  VibeVoice n'est pas installé. Installation..."
    pip install -e ./VibeVoice/
fi

echo ""
echo "🔄 Lancement de la démo Gradio VibeVoice..."
echo "   Le modèle sera téléchargé automatiquement (~3 GB) au premier lancement."
echo "   Interface web: http://localhost:7860"
echo ""

# Launch Gradio demo with microsoft/VibeVoice-1.5B on port 7860
python3 VibeVoice/demo/gradio_demo.py \
    --model_path microsoft/VibeVoice-1.5B \
    --port 7860

echo ""
echo "Appuyez sur Entrée pour fermer..."
read
