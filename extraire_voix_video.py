#!/usr/bin/env python3
"""
extraire_voix_video.py — Extract clean reference voice from a video for VibeVoice Cloning
==========================================================================================
Extrait un échantillon vocal propre (10 à 30 secondes) depuis un fichier vidéo (MP4, MKV, MOV...)
ou audio, calibré pour le clonage de voix haute-fidélité VibeVoice (24kHz Mono 16-bit PCM).

Usage:
  # Extraire 20 secondes à partir de la 30ème seconde
  python extraire_voix_video.py --input "mon_cours.mp4" --start 00:00:30 --duration 20 --name "prof_cs"

  # Le fichier est automatiquement sauvé et placé dans VibeVoice/demo/voices/
  # Il devient immédiatement disponible sous le nom de voix "prof_cs" !

Auteur : Ghislain Muntu — SavoirIA TransApp
"""

import argparse
import os
import subprocess
import sys
import shutil

def main():
    parser = argparse.ArgumentParser(
        description="Extraction d'échantillon vocal pour Clonage VibeVoice — SavoirIA TransApp",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Conseils pour un clonage optimal :
  1. Choisissez un moment où l'orateur parle seul (sans musique, sans applaudissements, sans bruit de fond).
  2. Une durée de 15 à 30 secondes est idéale pour capturer le timbre, la dynamique et la hauteur de voix.
  3. L'échantillon sera converti en 24 000 Hz Mono (format natif des tokenizers de VibeVoice).
        """
    )
    parser.add_argument("--input", "-i", required=True, help="Chemin du fichier vidéo (MP4, MKV, MOV...) ou audio")
    parser.add_argument("--start", "-s", default="00:00:15", help="Position de début (ex: 00:01:30 ou en secondes, défaut: 00:00:15)")
    parser.add_argument("--duration", "-d", default="25", help="Durée de l'échantillon en secondes (défaut: 25)")
    parser.add_argument("--name", "-n", default="prof_original", help="Nom attribué à la voix (ex: prof_cs, orateur1...)")
    parser.add_argument("--output", "-o", default=None, help="Chemin de sortie personnalisé du fichier WAV")

    args = parser.parse_args()

    input_file = os.path.abspath(args.input)
    if not os.path.isfile(input_file):
        print(f"❌ Erreur: Fichier introuvable : {input_file}")
        sys.exit(1)

    # Clean name
    clean_name = "".join(c for c in args.name if c.isalnum() or c in ("_", "-")).strip() or "voix_originale"
    output_filename = f"{clean_name}.wav"

    # Default output paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    voices_dir = os.path.join(script_dir, "VibeVoice", "demo", "voices")
    
    if args.output:
        final_output = os.path.abspath(args.output)
    else:
        final_output = os.path.join(script_dir, output_filename)

    # Detect ffmpeg
    ffmpeg_bin = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
    if not os.path.isfile(ffmpeg_bin) and not shutil.which("ffmpeg"):
        print("❌ Erreur: ffmpeg n'est pas détecté sur votre système.")
        sys.exit(1)

    print("=" * 60)
    print("  🎙️  Extraction d'échantillon pour Clonage de Voix")
    print("  👤  SavoirIA TransApp — Ghislain Muntu")
    print("=" * 60)
    print(f"📹 Fichier source   : {input_file}")
    print(f"⏱️  Position départ : {args.start}")
    print(f"⏳ Durée extrait   : {args.duration}s")
    print(f"🏷️  Nom de la voix   : {clean_name}")
    print(f"💾 Fichier généré   : {final_output}")
    print("")

    # ffmpeg command:
    # -ss [start] -i [input] -t [duration] -vn (no video) -acodec pcm_s16le -ar 24000 -ac 1 (24kHz Mono PCM)
    # -af loudnorm (normalize loudness for consistent voice prompt embeddings)
    cmd = [
        ffmpeg_bin,
        "-y",
        "-ss", str(args.start),
        "-i", input_file,
        "-t", str(args.duration),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "24000",
        "-ac", "1",
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        final_output
    ]

    try:
        print("⚙️  Extraction et normalisation audio via FFmpeg...")
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        print("✅ Échantillon audio généré avec succès !")
    except subprocess.CalledProcessError as e:
        print(f"❌ Erreur FFmpeg : {e.stderr.decode('utf-8', errors='ignore')}")
        sys.exit(1)

    # Copy to VibeVoice demo/voices/ directory for automatic preset recognition
    if os.path.isdir(voices_dir):
        preset_target = os.path.join(voices_dir, output_filename)
        shutil.copy2(final_output, preset_target)
        print(f"✨ Intégré dans le catalogue VibeVoice : {preset_target}")
        print(f"   La voix '{clean_name}' est désormais disponible dans Gradio et le CLI !")
    
    print("")
    print("=" * 60)
    print("🚀 COMMENT L'UTILISER POUR LE DOUBLAGE :")
    print("=" * 60)
    print("Option 1 — En ligne de commande avec vibevoice_fr_synthesizer :")
    print(f"  python vibevoice_fr_synthesizer.py --input sous_titres.srt --voice \"{clean_name}\" --output doublage.wav")
    print("")
    print("Option 2 — Avec le chemin direct vers le fichier audio :")
    print(f"  python vibevoice_fr_synthesizer.py --input test_vibevoice_fr.txt --voice \"{final_output}\" --output doublage.wav")
    print("")
    print("Option 3 — Dans l'interface Web Gradio :")
    print(f"  Double-cliquez sur lancer_vibevoice_tts.command et sélectionnez '{clean_name}'")
    print("=" * 60)

if __name__ == "__main__":
    main()
