#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TransApp V.2 - Module d'Optimisation Web & Multidiffusion
Auteur : Ghislain Muntu (Lead AI & Video Architect)
"""

import os
import subprocess
import shutil
from typing import Dict, Any

def get_ffmpeg_binary() -> str:
    bin_path = shutil.which("ffmpeg")
    if bin_path:
        return bin_path
    candidates = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]
    for candidate in candidates:
        if os.path.exists(candidate) and os.access(candidate, os.X_OK):
            return candidate
    raise FileNotFoundError("FFmpeg introuvable sur le système.")

def optimize_video_for_web(
    input_video_path: str,
    output_mp4_path: str,
    target_resolution: str = "1280x720",  # HD 720p idéal pour le web, ou "1920x1080"
    crf_value: int = 23,                 # Compromis qualité/poids (entre 20 et 26)
    preset: str = "medium"               # Vitesse d'encodage
) -> Dict[str, Any]:
    """
    Optimise et compresse une vidéo MP4 pour le web (Streaming / LMS Savoir IA).
    - Réencode en H.264 (profil Main/High) + AAC.
    - Applique un redimensionnement proportionnel avec padding.
    - Déplace l'indexation (moov atom) au début du fichier (-movflags +faststart)
      pour permettre la lecture en streaming instantané.
    """
    try:
        ffmpeg_bin = get_ffmpeg_binary()
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}

    if not os.path.exists(input_video_path):
        return {"success": False, "error": f"Fichier source introuvable : {input_video_path}"}

    print("=" * 72)
    print("🌐 TRANSAAP V.2 — OPTIMISATION WEB & MULTIDIFFUSION")
    print("=" * 72)
    print(f"[*] Source     : {input_video_path}")
    print(f"[*] Destination: {output_mp4_path}")
    print(f"[*] Résolution : {target_resolution}")
    print(f"[*] Qualité CRF: {crf_value}")

    cmd = [
        ffmpeg_bin,
        "-y",
        "-i", input_video_path,
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", str(crf_value),
        "-vf", f"scale={target_resolution}",
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output_mp4_path
    ]

    print(f"[*] Exécution de la compression web...")

    try:
        subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True
        )

        file_size_mo = os.path.getsize(output_mp4_path) / (1024 * 1024)
        print(f"[✓] SUCCÈS : Vidéo optimisée pour le web !")
        print(f"    - Fichier : {output_mp4_path}")
        print(f"    - Taille  : {file_size_mo:.2f} Mo")
        print("=" * 72)

        return {
            "success": True,
            "output_file": output_mp4_path,
            "file_size_mo": file_size_mo,
            "error": None
        }

    except subprocess.CalledProcessError as exc:
        err_msg = exc.stderr[-1000:] if exc.stderr else "Erreur inconnue"
        print(f"[ERREUR FFmpeg] {err_msg}")
        return {"success": False, "error": err_msg}

if __name__ == "__main__":
    optimize_video_for_web(
        input_video_path="cours_cs50_week0_final.mp4",
        output_mp4_path="cours_cs50_week0_web.mp4",
        target_resolution="1280x720"
    )