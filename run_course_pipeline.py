#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Orchestrateur Externe pour SavoirIA-TransApp
Gère le découpage, le checkpointing et l'assemblage pour les fichiers massifs (ex: 3400+ lignes).
"""

import os
import sys
import json
import argparse
import subprocess
from pathlib import Path

STATE_FILE = "pipeline_state.json"

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"completed_chunks": [], "status": "IDLE"}

def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

def split_srt(input_path, chunk_size=500):
    """Découpe un grand fichier SRT en morceaux de N lignes."""
    with open(input_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Séparation approximative par blocs de sous-titres basés sur les doubles retours à la ligne
    blocks = [b.strip() for b in content.strip().split('\n\n') if b.strip()]
    
    chunks = []
    for i in range(0, len(blocks), chunk_size):
        chunk_blocks = blocks[i:i + chunk_size]
        chunk_filename = f"temp_chunk_{len(chunks)+1}.srt"
        with open(chunk_filename, "w", encoding="utf-8") as cf:
            cf.write("\n\n".join(chunk_blocks) + "\n\n")
        chunks.append(chunk_filename)
        
    print(f"[*] Fichier divisé en {len(chunks)} morceaux d'environ {chunk_size} répliques.")
    return chunks

def main():
    parser = argparse.ArgumentParser(description="Orchestrateur de cours Savoir IA")
    parser.add_argument("input_srt", help="Chemin vers le fichier SRT complet du cours")
    parser.add_argument("output_wav", help="Chemin vers le fichier audio WAV final")
    parser.add_argument("--chunk-size", type=int, default=500, help="Nombre de répliques par lot de traitement")
    parser.add_argument("--api-key", help="Clé API Gemini", default=os.environ.get("GEMINI_API_KEY"))
    args = parser.parse_args()

    if not args.api_key:
        print("[ERREUR] Clé API Gemini manquante. Définissez la variable GEMINI_API_KEY.")
        sys.exit(1)

    # Initialisation globale de l'environnement pour éviter le bug de portée
    env = os.environ.copy()
    env["GEMINI_API_KEY"] = args.api_key

    print("================================================================================")
    print(" SAVOIRIA PIPELINE ORCHESTRATOR • Gestion des cours massifs")
    print("================================================================================")

    state = load_state()
    chunks = split_srt(args.input_srt, chunk_size=args.chunk_size)
    
    translated_chunks = []
    
    for idx, chunk in enumerate(chunks, 1):
        translated_chunk_name = f"translated_{chunk}"
        
        if chunk in state["completed_chunks"] and os.path.exists(translated_chunk_name):
            print(f"[✓] Morceau {idx}/{len(chunks)} déjà traité (Checkpoint trouvé). Saut...")
            translated_chunks.append(translated_chunk_name)
            continue
            
        print(f"\n[*] Traitement du morceau {idx}/{len(chunks)} ({chunk})...")
        
        # Appel du processeur de lot existant
        cmd = [
            "./venv/bin/python3", "batch_processor.py",
            chunk, translated_chunk_name
        ]
        
        res = subprocess.run(cmd, env=env)
        if res.returncode != 0:
            print(f"[ERREUR] Échec du traitement sur le morceau {idx}. Sauvegarde de l'état. Relancez pour reprendre.")
            sys.exit(1)
            
        # Validation du checkpoint
        state["completed_chunks"].append(chunk)
        save_state(state)
        translated_chunks.append(translated_chunk_name)

    print("\n[*] Tous les morceaux ont été traduits avec succès !")
    print("[*] Lancement de l'assemblage final via doublage_master.py...")

    # Fusion des fichiers SRT traduits temporaires en un seul fichier global temporaire
    final_merged_srt = "temp_final_merged.srt"
    with open(final_merged_srt, "w", encoding="utf-8") as outfile:
        for t_chunk in translated_chunks:
            with open(t_chunk, "r", encoding="utf-8") as infile:
                outfile.write(infile.read() + "\n\n")

    # Appel du master de doublage sur le fichier complet fusionné
    master_cmd = [
        "./venv/bin/python3", "doublage_master.py",
        final_merged_srt, args.output_wav
    ]
    
    res_master = subprocess.run(master_cmd, env=env)
    if res_master.returncode != 0:
        print("[ERREUR] Échec lors de l'assemblage audio final.")
        sys.exit(1)

    print(f"\n[✓] SUCCÈS TOTAL ! Master audio généré : {args.output_wav}")
    print("[*] Nettoyage des fichiers temporaires...")
    
    # Nettoyage optionnel des fichiers intermédiaires
    for c in chunks:
        if os.path.exists(c): os.remove(c)
    for tc in translated_chunks:
        if os.path.exists(tc): os.remove(tc)
    if os.path.exists(final_merged_srt): os.remove(final_merged_srt)
    if os.path.exists(STATE_FILE): os.remove(STATE_FILE)
    
    print("[✓] Pipeline nettoyé et prêt pour l'intégration !")

if __name__ == "__main__":
    main()