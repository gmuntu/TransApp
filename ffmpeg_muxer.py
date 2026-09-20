#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TransApp V.2 — Module de Muxing Vidéo & Audio Robuste (FFmpeg Muxer)
=====================================================================
Auteur  : Ghislain Muntu (Lead AI & Video Architect)
Version : 2.1.0

Architecture :
  - Synchronisation audio-vidéo automatique avec la piste maître française (.WAV / .MP3).
  - Double mode sous-titres :
      * Softsub (Piste native MP4 mov_text — compatible Filmora/VLC/QuickTime).
      * Hardsub (Incrustation graphique « burn-in » via libass si disponible).
  - Détection intelligente des filtres FFmpeg et bascule automatique.
  - Génération d'un canevas studio (1080p Obsidian) si aucune vidéo source fournie.
  - Résolution multi-plateforme des binaires FFmpeg/FFprobe.
  - Suivi de progression en temps réel (parsing de ``time=`` dans stderr).
  - Timeout configurable avec watchdog (défaut : 30 min).
  - Validation du format SRT avant envoi à FFmpeg.
  - Nettoyage automatique des fichiers partiels en cas d'erreur.
  - Logging structuré via le module ``logging``.
"""

import os
import re
import sys
import shutil
import subprocess
import argparse
import logging
import threading
from typing import Optional, Callable, Dict, Any, List

# ---------------------------------------------------------------------------
# Logging structuré
# ---------------------------------------------------------------------------
logger = logging.getLogger("transapp.muxer")

if not logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter(
        "[%(asctime)s] %(levelname)-8s %(message)s",
        datefmt="%H:%M:%S"
    ))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)


# ═══════════════════════════════════════════════════════════════════════════
# Résolution des binaires FFmpeg / FFprobe
# ═══════════════════════════════════════════════════════════════════════════

def get_ffmpeg_binary() -> str:
    """
    Localise de manière robuste le binaire FFmpeg sur le système.
    Vérifie le PATH ainsi que les emplacements standards sur macOS (Homebrew) et Linux.
    """
    bin_path = shutil.which("ffmpeg")
    if bin_path:
        return bin_path

    candidates = [
        "/opt/homebrew/bin/ffmpeg",       # macOS Apple Silicon (M1/M2/M3/M4)
        "/usr/local/bin/ffmpeg",          # macOS Intel / Linux
        "/usr/bin/ffmpeg",                # Linux distribution standard
        os.path.expanduser("~/homebrew/bin/ffmpeg"),
    ]
    for candidate in candidates:
        if os.path.exists(candidate) and os.access(candidate, os.X_OK):
            return candidate

    raise FileNotFoundError(
        "[ERREUR CRITIQUE] FFmpeg est introuvable sur votre système.\n"
        "Pour l'installer rapidement sur macOS :\n"
        "    brew install ffmpeg\n"
        "Documentation officielle : https://ffmpeg.org/download.html"
    )


def get_ffprobe_binary() -> str:
    """Localise le binaire FFprobe."""
    bin_path = shutil.which("ffprobe")
    if bin_path:
        return bin_path
    candidates = [
        "/opt/homebrew/bin/ffprobe",
        "/usr/local/bin/ffprobe",
        "/usr/bin/ffprobe",
    ]
    for candidate in candidates:
        if os.path.exists(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return "ffprobe"


# ═══════════════════════════════════════════════════════════════════════════
# Diagnostics & Vérifications
# ═══════════════════════════════════════════════════════════════════════════

def verify_ffmpeg_installation() -> Dict[str, Any]:
    """
    Diagnostic complet de l'installation FFmpeg.

    Retourne un dict avec :
        - ``installed`` (bool)
        - ``path`` (str)
        - ``version`` (str)
        - ``has_libx264`` (bool)
        - ``has_aac`` (bool)
        - ``has_subtitles_filter`` (bool)  — filtre libass
        - ``has_mov_text`` (bool)
        - ``errors`` (list[str])
    """
    result: Dict[str, Any] = {
        "installed": False,
        "path": "",
        "version": "",
        "has_libx264": False,
        "has_aac": False,
        "has_subtitles_filter": False,
        "has_mov_text": False,
        "errors": [],
    }

    try:
        ffmpeg_bin = get_ffmpeg_binary()
        result["path"] = ffmpeg_bin
        result["installed"] = True
    except FileNotFoundError as e:
        result["errors"].append(str(e))
        return result

    # Version
    try:
        ver = subprocess.run(
            [ffmpeg_bin, "-version"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10
        )
        first_line = ver.stdout.splitlines()[0] if ver.stdout else ""
        result["version"] = first_line
    except Exception as exc:
        result["errors"].append(f"Impossible de lire la version FFmpeg : {exc}")

    # Codecs
    try:
        codecs = subprocess.run(
            [ffmpeg_bin, "-codecs"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10
        )
        out = codecs.stdout.lower()
        result["has_libx264"] = "libx264" in out
        result["has_aac"] = "aac" in out
        result["has_mov_text"] = "mov_text" in out
    except Exception:
        pass

    # Filtres
    try:
        filters = subprocess.run(
            [ffmpeg_bin, "-filters"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10
        )
        result["has_subtitles_filter"] = "subtitles" in filters.stdout.lower()
    except Exception:
        pass

    return result


def check_filter_available(filter_name: str) -> bool:
    """
    Vérifie si un filtre spécifique (ex: 'subtitles', 'drawtext') est activé dans FFmpeg.
    """
    try:
        ffmpeg_bin = get_ffmpeg_binary()
        res = subprocess.run(
            [ffmpeg_bin, "-filters"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10
        )
        return filter_name.lower() in res.stdout.lower()
    except Exception:
        return False


# ═══════════════════════════════════════════════════════════════════════════
# Utilitaires Média
# ═══════════════════════════════════════════════════════════════════════════

def get_media_duration_ms(media_path: str) -> int:
    """
    Récupère la durée exacte d'un fichier audio ou vidéo en millisecondes via FFprobe.
    """
    if not os.path.exists(media_path):
        return 0

    ffprobe_bin = get_ffprobe_binary()
    cmd = [
        ffprobe_bin,
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        media_path
    ]
    try:
        result = subprocess.run(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, check=True, timeout=30
        )
        dur_sec = float(result.stdout.strip())
        return int(dur_sec * 1000)
    except Exception:
        return 0


def escape_ffmpeg_filter_path(filepath: str) -> str:
    """
    Échappe les caractères réservés (deux-points, espaces, antislashs) pour les filtres complexes FFmpeg.
    """
    abs_path = os.path.abspath(filepath)
    escaped = abs_path.replace("\\", "/").replace(":", "\\:").replace("'", "\\'").replace(" ", "\\ ")
    return escaped


# ═══════════════════════════════════════════════════════════════════════════
# Validation SRT
# ═══════════════════════════════════════════════════════════════════════════

_SRT_TIMECODE_RE = re.compile(
    r"^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}",
    re.MULTILINE,
)


def validate_srt_file(srt_path: str) -> Dict[str, Any]:
    """
    Valide la structure d'un fichier SRT.

    Retourne :
        - ``valid`` (bool)
        - ``block_count`` (int) — nombre de blocs détectés
        - ``errors`` (list[str])
    """
    result: Dict[str, Any] = {"valid": False, "block_count": 0, "errors": []}

    if not os.path.exists(srt_path):
        result["errors"].append(f"Fichier SRT introuvable : {srt_path}")
        return result

    try:
        with open(srt_path, "r", encoding="utf-8") as f:
            content = f.read()
    except UnicodeDecodeError:
        try:
            with open(srt_path, "r", encoding="latin-1") as f:
                content = f.read()
        except Exception as e:
            result["errors"].append(f"Impossible de lire le fichier SRT : {e}")
            return result

    if not content.strip():
        result["errors"].append("Le fichier SRT est vide.")
        return result

    timecodes = _SRT_TIMECODE_RE.findall(content)
    result["block_count"] = len(timecodes)

    if len(timecodes) == 0:
        result["errors"].append(
            "Aucun timecode SRT valide détecté (format attendu : 00:00:00,000 --> 00:00:00,000)."
        )
        return result

    result["valid"] = True
    return result


# ═══════════════════════════════════════════════════════════════════════════
# Parsing de la progression FFmpeg
# ═══════════════════════════════════════════════════════════════════════════

_TIME_PATTERN = re.compile(r"time=(\d{2}):(\d{2}):(\d{2})\.(\d{2,3})")


def _parse_ffmpeg_time(line: str) -> Optional[float]:
    """
    Extrait la position temporelle (en secondes) d'une ligne de sortie stderr FFmpeg.
    Retourne None si la ligne ne contient pas de marqueur ``time=``.
    """
    m = _TIME_PATTERN.search(line)
    if not m:
        return None
    h, mi, s, cs = m.groups()
    frac = int(cs) / (1000 if len(cs) == 3 else 100)
    return int(h) * 3600 + int(mi) * 60 + int(s) + frac


# ═══════════════════════════════════════════════════════════════════════════
# Fonction Principale : Assemblage Vidéo + Audio + Sous-titres
# ═══════════════════════════════════════════════════════════════════════════

def create_final_video(
    srt_path: str,
    audio_path: str,
    output_mp4_path: str,
    original_video_path: Optional[str] = None,
    burn_subtitles: bool = False,
    subtitle_font_size: int = 18,
    progress_callback: Optional[Callable[[float, str], None]] = None,
    timeout_seconds: int = 1800,
) -> Dict[str, Any]:
    """
    Assemble (Mux) la vidéo finale MP4 avec synchronisation audio et sous-titres.

    Arguments :
        srt_path (str) : Chemin vers le fichier de sous-titres synchronisé (.SRT).
        audio_path (str) : Chemin vers l'audio maître doublé (.WAV ou .MP3).
        output_mp4_path (str) : Destination du fichier MP4 final.
        original_video_path (str, optionnel) : Vidéo source originale. Si None,
            un canevas studio HD 1080p est généré automatiquement.
        burn_subtitles (bool) : True pour incruster définitivement les sous-titres (Hardsub),
            False pour les intégrer en flux natif MP4 mov_text (Softsub — recommandé).
        subtitle_font_size (int) : Taille de police pour le mode burn-in (défaut : 18).
        progress_callback (callable, optionnel) : Fonction ``(pourcentage, message)`` pour l'UI.
        timeout_seconds (int) : Timeout maximum en secondes (défaut : 1800 = 30 min).

    Retourne :
        dict avec statut de succès, métadonnées du fichier généré et détails d'encodage.
    """
    # ------------------------------------------------------------------
    # 1. Résolution de FFmpeg
    # ------------------------------------------------------------------
    try:
        ffmpeg_bin = get_ffmpeg_binary()
    except FileNotFoundError as e:
        logger.error(str(e))
        return {"success": False, "error": str(e)}

    # ------------------------------------------------------------------
    # 2. Validation rigoureuse des entrées
    # ------------------------------------------------------------------
    if not os.path.exists(srt_path):
        err = f"Fichier de sous-titres SRT introuvable : {srt_path}"
        logger.error(err)
        return {"success": False, "error": err}

    if not os.path.exists(audio_path):
        err = f"Fichier audio maître introuvable : {audio_path}"
        logger.error(err)
        return {"success": False, "error": err}

    # Validation structurelle du SRT
    srt_check = validate_srt_file(srt_path)
    if not srt_check["valid"]:
        err = f"Fichier SRT invalide : {'; '.join(srt_check['errors'])}"
        logger.error(err)
        return {"success": False, "error": err, "srt_validation": srt_check}

    logger.info(f"SRT validé : {srt_check['block_count']} blocs de sous-titres détectés.")

    # ------------------------------------------------------------------
    # 3. Création du répertoire cible
    # ------------------------------------------------------------------
    out_dir = os.path.dirname(os.path.abspath(output_mp4_path))
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # 4. Durée de l'audio maître
    # ------------------------------------------------------------------
    audio_duration_ms = get_media_duration_ms(audio_path)
    audio_duration_sec = (audio_duration_ms / 1000.0) if audio_duration_ms > 0 else 60.0

    logger.info("=" * 72)
    logger.info("🎬  TRANSAPP V.2 — MODULE DE MUXING VIDÉO & AUDIO HAUTE PERFORMANCE")
    logger.info("=" * 72)
    logger.info(f"Audio Maître : {os.path.basename(audio_path)} ({audio_duration_sec:.2f}s)")
    logger.info(f"Sous-titres  : {os.path.basename(srt_path)} ({srt_check['block_count']} blocs)")
    logger.info(f"Fichier MP4  : {output_mp4_path}")

    # ------------------------------------------------------------------
    # 5. Détection de la capacité hardsub
    # ------------------------------------------------------------------
    has_subtitles = check_filter_available("subtitles")
    effective_burn = burn_subtitles and has_subtitles

    if burn_subtitles and not has_subtitles:
        logger.warning(
            "Le filtre 'subtitles' (libass) n'est pas présent dans ce build FFmpeg. "
            "Bascule automatique vers le mode Softsub MP4 mov_text "
            "(compatible QuickTime, VLC, Filmora, iPad et YouTube)."
        )

    # ------------------------------------------------------------------
    # 6. Construction de la commande FFmpeg
    # ------------------------------------------------------------------
    cmd: List[str] = [ffmpeg_bin, "-y"]

    # ═══════ CAS A : Vidéo Source Fournie ═══════
    if original_video_path and os.path.exists(original_video_path):
        mode = "source_video"
        logger.info(f"Vidéo Source : {original_video_path}")

        if progress_callback:
            progress_callback(10.0, "Analyse des flux d'entrée…")

        cmd.extend(["-i", original_video_path, "-i", audio_path])

        if effective_burn:
            sub_mode = "hardsub"
            logger.info("Mode Sous-titres : HARDSUB (Incrustation graphique directe)")
            escaped_srt = escape_ffmpeg_filter_path(srt_path)
            sub_filter = (
                f"subtitles='{escaped_srt}':force_style='"
                f"FontName=Helvetica,FontSize={subtitle_font_size},"
                f"PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
                f"BorderStyle=3,Outline=2,Shadow=1,MarginV=35'"
            )
            cmd.extend([
                "-vf", sub_filter,
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "18",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "320k",
                "-ar", "48000",
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-shortest",
                "-movflags", "+faststart",
                output_mp4_path
            ])
        else:
            sub_mode = "softsub"
            logger.info("Mode Sous-titres : SOFTSUB (Flux MP4 mov_text — Ultra-rapide sans perte)")
            cmd.extend(["-i", srt_path])
            cmd.extend([
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-map", "2:s:0",
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "320k",
                "-ar", "48000",
                "-c:s", "mov_text",
                "-metadata:s:s:0", "language=fra",
                "-metadata:s:s:0", "title=Français (SavoirIA)",
                "-shortest",
                "-movflags", "+faststart",
                output_mp4_path
            ])

    # ═══════ CAS B : Canevas Studio HD 1080p ═══════
    else:
        mode = "canvas_studio"
        logger.info("Mode Canevas : Aucun fichier vidéo source.")
        logger.info(f"Création d'un canevas studio HD 1080p (Noir Obsidian 30fps, {audio_duration_sec:.2f}s)…")

        if progress_callback:
            progress_callback(15.0, "Génération du canevas studio HD 1080p…")

        cmd.extend([
            "-f", "lavfi",
            "-i", f"color=c=0x0E111A:s=1920x1080:r=30:d={audio_duration_sec:.3f}",
            "-i", audio_path
        ])

        if effective_burn:
            sub_mode = "hardsub"
            escaped_srt = escape_ffmpeg_filter_path(srt_path)
            sub_filter = (
                f"subtitles='{escaped_srt}':force_style='"
                f"FontName=Helvetica,FontSize={subtitle_font_size},"
                f"PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
                f"BorderStyle=3,Outline=2,Shadow=1,MarginV=45'"
            )
            cmd.extend([
                "-vf", sub_filter,
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "20",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "320k",
                "-ar", "48000",
                "-shortest",
                "-movflags", "+faststart",
                output_mp4_path
            ])
        else:
            sub_mode = "softsub"
            cmd.extend(["-i", srt_path])
            cmd.extend([
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-map", "2:s:0",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "22",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "320k",
                "-ar", "48000",
                "-c:s", "mov_text",
                "-metadata:s:s:0", "language=fra",
                "-metadata:s:s:0", "title=Français (SavoirIA)",
                "-shortest",
                "-movflags", "+faststart",
                output_mp4_path
            ])

    # ------------------------------------------------------------------
    # 7. Exécution avec suivi de progression temps réel
    # ------------------------------------------------------------------
    logger.info(f"Mode : {mode} | Sous-titres : {sub_mode}")
    logger.debug(f"Commande FFmpeg : {' '.join(cmd)}")

    if progress_callback:
        progress_callback(20.0, "Lancement du multiplexage FFmpeg…")

    timed_out = False

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
        )

        # Watchdog timeout thread
        def _kill_on_timeout():
            nonlocal timed_out
            timed_out = True
            logger.error(f"Timeout atteint ({timeout_seconds}s). Arrêt forcé de FFmpeg.")
            try:
                process.kill()
            except Exception:
                pass

        timer = threading.Timer(timeout_seconds, _kill_on_timeout)
        timer.daemon = True
        timer.start()

        # Lecture temps réel de stderr pour la progression
        last_pct = 20.0
        stderr_lines: List[str] = []

        for line in process.stderr:
            stderr_lines.append(line)
            encoded_time = _parse_ffmpeg_time(line)
            if encoded_time is not None and audio_duration_sec > 0:
                pct = min(95.0, 20.0 + (encoded_time / audio_duration_sec) * 75.0)
                if pct > last_pct + 0.5:  # Update every 0.5% minimum
                    last_pct = pct
                    if progress_callback:
                        progress_callback(
                            round(pct, 1),
                            f"Encodage : {encoded_time:.1f}s / {audio_duration_sec:.1f}s"
                        )

        process.wait()
        timer.cancel()

        stderr_full = "".join(stderr_lines)

        # ------------------------------------------------------------------
        # 8. Vérification du résultat
        # ------------------------------------------------------------------
        if timed_out:
            # Nettoyage du fichier partiel
            if os.path.exists(output_mp4_path):
                try:
                    os.remove(output_mp4_path)
                    logger.info("Fichier partiel supprimé après timeout.")
                except OSError:
                    pass
            return {
                "success": False,
                "error": f"Timeout : l'encodage a dépassé {timeout_seconds}s et a été interrompu.",
                "ffmpeg_cmd": cmd,
            }

        if process.returncode != 0:
            err_detail = stderr_full[-1500:] if stderr_full else "Erreur inconnue FFmpeg"
            logger.error(f"FFmpeg code de retour : {process.returncode}")
            # Nettoyage du fichier corrompu
            if os.path.exists(output_mp4_path):
                try:
                    os.remove(output_mp4_path)
                    logger.info("Fichier partiel/corrompu supprimé.")
                except OSError:
                    pass
            return {
                "success": False,
                "error": err_detail,
                "ffmpeg_cmd": cmd,
            }

        if not os.path.exists(output_mp4_path):
            return {
                "success": False,
                "error": "Le fichier de sortie n'a pas été créé par FFmpeg.",
                "ffmpeg_cmd": cmd,
            }

        # ------------------------------------------------------------------
        # 9. Métadonnées du résultat
        # ------------------------------------------------------------------
        file_size = os.path.getsize(output_mp4_path)
        final_duration_ms = get_media_duration_ms(output_mp4_path)

        if progress_callback:
            progress_callback(100.0, "✅ Vidéo MP4 finale générée avec succès !")

        logger.info(f"✅ SUCCÈS : Vidéo finale MP4 générée avec succès !")
        logger.info(f"   Fichier  : {output_mp4_path}")
        logger.info(f"   Taille   : {file_size / (1024 * 1024):.2f} Mo")
        logger.info(f"   Durée    : {final_duration_ms / 1000.0:.2f} secondes")
        logger.info(f"   Mode     : {mode} ({sub_mode})")
        logger.info("=" * 72)

        return {
            "success": True,
            "output_file": output_mp4_path,
            "duration_ms": final_duration_ms,
            "file_size_bytes": file_size,
            "file_size_formatted": f"{file_size / (1024 * 1024):.2f} Mo",
            "mode": mode,
            "subtitles_mode": sub_mode,
            "srt_blocks": srt_check["block_count"],
            "ffmpeg_cmd": cmd,
            "error": None,
        }

    except Exception as exc:
        logger.exception(f"Erreur inattendue lors du muxing : {exc}")
        # Nettoyage en cas d'erreur
        if os.path.exists(output_mp4_path):
            try:
                os.remove(output_mp4_path)
            except OSError:
                pass
        return {
            "success": False,
            "error": str(exc),
            "ffmpeg_cmd": cmd,
        }


# ═══════════════════════════════════════════════════════════════════════════
# Interface CLI & Script Autonome
# ═══════════════════════════════════════════════════════════════════════════

def _cli_progress(pct: float, msg: str) -> None:
    """Callback de progression pour l'interface CLI."""
    bar_len = 30
    filled = int(bar_len * pct / 100)
    bar = "█" * filled + "░" * (bar_len - filled)
    print(f"\r  [{bar}] {pct:5.1f}%  {msg}", end="", flush=True)
    if pct >= 100:
        print()


def main():
    parser = argparse.ArgumentParser(
        description="TransApp V.2 — Muxing Vidéo & Audio avec Sous-titres (FFmpeg Muxer)"
    )
    parser.add_argument("--srt", required=False, help="Chemin du fichier sous-titres .SRT")
    parser.add_argument("--audio", required=False, help="Chemin du fichier audio maître (.WAV ou .MP3)")
    parser.add_argument("--output", required=False, help="Chemin du fichier de sortie .MP4")
    parser.add_argument("--video", required=False, default=None, help="Vidéo originale (optionnel)")
    parser.add_argument("--burn", action="store_true", help="Incruster graphiquement les sous-titres (Hardsub si disponible)")
    parser.add_argument("--font-size", type=int, default=18, help="Taille police des sous-titres (défaut: 18)")
    parser.add_argument("--timeout", type=int, default=1800, help="Timeout max en secondes (défaut: 1800)")
    parser.add_argument("--check", action="store_true", help="Vérifier la présence et la version de FFmpeg")
    parser.add_argument("--validate-srt", required=False, help="Valider un fichier SRT sans lancer le muxing")

    args = parser.parse_args()

    # Mode diagnostic complet
    if args.check:
        diag = verify_ffmpeg_installation()
        if diag["installed"]:
            print(f"[✓] FFmpeg détecté : {diag['path']}")
            print(f"    Version   : {diag['version']}")
            print(f"    libx264   : {'✓' if diag['has_libx264'] else '✗'}")
            print(f"    AAC       : {'✓' if diag['has_aac'] else '✗'}")
            print(f"    mov_text  : {'✓' if diag['has_mov_text'] else '✗'}")
            print(f"    subtitles : {'✓' if diag['has_subtitles_filter'] else '✗ (libass absent — Softsub uniquement)'}")
            sys.exit(0)
        else:
            for err in diag["errors"]:
                print(f"[✗] {err}")
            sys.exit(1)

    # Mode validation SRT
    if args.validate_srt:
        result = validate_srt_file(args.validate_srt)
        if result["valid"]:
            print(f"[✓] Fichier SRT valide : {result['block_count']} blocs de sous-titres.")
        else:
            print(f"[✗] Fichier SRT invalide :")
            for err in result["errors"]:
                print(f"    → {err}")
        sys.exit(0 if result["valid"] else 1)

    # Mode muxing
    if not args.srt or not args.audio or not args.output:
        parser.print_help()
        print("\nExemple d'utilisation :")
        print("  python3 ffmpeg_muxer.py --srt week0_fr.srt --audio week0_fr.wav --output final.mp4")
        print("  python3 ffmpeg_muxer.py --srt week0_fr.srt --audio week0_fr.wav --output final.mp4 --video source.mp4 --burn")
        print("  python3 ffmpeg_muxer.py --check")
        print("  python3 ffmpeg_muxer.py --validate-srt week0_fr.srt")
        sys.exit(1)

    result = create_final_video(
        srt_path=args.srt,
        audio_path=args.audio,
        output_mp4_path=args.output,
        original_video_path=args.video,
        burn_subtitles=args.burn,
        subtitle_font_size=args.font_size,
        progress_callback=_cli_progress,
        timeout_seconds=args.timeout,
    )

    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
