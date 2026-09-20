#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import subprocess
from pathlib import Path
from pydub import AudioSegment

def generate_master_audio(subtitles_translated, output_filename="cours_cs50_week0_master.wav"):
    print("[*] Début de l'assemblage du Master Audio (Anti-chevauchement actif)...")

    # 1. Créer un canevas vide initial (Stéréo, 44.1 kHz)
    # On initialise avec un court silence de base ou une piste vide
    master_canvas = AudioSegment.silent(duration=1000, frame_rate=44100)
    master_canvas = master_canvas.set_channels(2)

    current_cursor_ms = 0  # Curseur strict pour suivre la fin de la dernière réplique injectée

    for index, item in enumerate(subtitles_translated):
        start_ms = item.get('start_time_ms', 0)
        text = item.get('text', '').strip()

        if not text:
            continue

        # Fichier audio temporaire pour chaque réplique
        temp_audio_path = f"/tmp/replica_{index}.aiff"

        try:
            # 2. Génération de la voix avec macOS 'say' en protégeant les nombres négatifs avec '--'
            subprocess.run(
                ['say', '-v', 'Thomas', '-r', '175', '-o', temp_audio_path, '--', text],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )

            # Charger le segment audio généré
            if os.path.exists(temp_audio_path) and os.path.getsize(temp_audio_path) > 0:
                segment = AudioSegment.from_file(temp_audio_path)
                segment = segment.set_frame_rate(44100).set_channels(2)
                segment_duration = len(segment)

                # 3. RÈGLE ANTI-CHEVAUCHEMENT :
                # Si le timestamp théorique commence avant la fin de la réplique précédente,
                # on décale proprement avec un petit silence de sécurité de 50ms pour éviter toute superposition.
                if start_ms < current_cursor_ms:
                    target_position = current_cursor_ms + 50
                else:
                    target_position = start_ms

                # Étendre le canevas maître si nécessaire et superposer le segment au bon endroit
                required_length = target_position + segment_duration
                if len(master_canvas) < required_length:
                    extension_length = required_length - len(master_canvas)
                    master_canvas += AudioSegment.silent(duration=extension_length, frame_rate=44100).set_channels(2)

                master_canvas = master_canvas.overlay(segment, position=target_position)

                # Mettre à jour le curseur de fin
                current_cursor_ms = target_position + segment_duration

                # Nettoyer le fichier temporaire individuel
                os.remove(temp_audio_path)

        except Exception as e:
            print(f"[!] Avertissement sur la réplique #{index} ('{text[:20]}...'): {e}")
            continue

    # 4. Normalisation Studio et Exportation finale
    print("[*] Normalisation studio du master audio...")
    # Normalisation simple à -1.0 dBFS
    change_in_dbFS = -1.0 - master_canvas.max_dBFS
    normalized_canvas = master_canvas.apply_gain(change_in_dbFS)

    print(f"[*] Exportation du Master WAV Broadcast : {output_filename}")
    normalized_canvas.export(output_filename, format="wav", parameters=["-ar", "44100", "-ac", "2"])
    
    print(f"[✓] DOUBLAGE MASTER TERMINÉ SANS CHEVAUCHEMENT : {output_filename}")
    return output_filename