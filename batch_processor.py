#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Processeur de lot (Batch Processor) local via Ollama pour SavoirIA-TransApp
Gère la traduction rapide des chunks SRT en local sur votre Mac avec gemma4:e2b.
"""

import os
import sys
import urllib.request
import json

def process_chunk(input_srt_path: str, output_srt_path: str, model_name: str = "gemma4:e2b"):
    """
    Traite un chunk SRT via l'instance locale d'Ollama avec le modèle léger gemma4:e2b.
    """
    # Lecture du chunk source
    with open(input_srt_path, "r", encoding="utf-8") as f:
        srt_content = f.read()

    prompt = (
        "Tu es un expert en traduction technique et pédagogique, spécialisé dans le programme CS50. "
        "Traduis et adapte ce contenu de sous-titres SRT en français, en conservant strictement le formatage, "
        "les indices temporels (timestamps) et la structure des blocs SRT :\n\n"
        f"{srt_content}"
    )

    # Configuration de la requête pour l'API locale d'Ollama (port 11434)
    url = "http://localhost:11434/api/generate"
    payload = {
        "model": model_name,
        "prompt": prompt,
        "stream": False
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, 
        data=data, 
        headers={"Content-Type": "application/json"}
    )

    try:
        print(f"[*] Envoi du lot à Ollama (Modèle rapide : {model_name})...")
        with urllib.request.urlopen(req, timeout=300) as response:
            res_json = json.loads(response.read().decode("utf-8"))
            translated_text = res_json.get("response", "")

        # Écriture du résultat traduit
        with open(output_srt_path, "w", encoding="utf-8") as f:
            f.write(translated_text)

        print(f"[✓] Chunk traduit localement avec succès : {output_srt_path}")

    except Exception as e:
        print(f"[ERREUR Ollama] Échec du traitement local : {e}")
        print("Assurez-vous qu'Ollama est bien lancé sur votre Mac et que le modèle gemma4:e2b est disponible (ollama run gemma4:e2b).")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) == 3:
        inp = sys.argv[1]
        out = sys.argv[2]
        model = os.environ.get("OLLAMA_MODEL", "gemma4:e2b")
        process_chunk(inp, out, model)
    else:
        print("Usage: python3 batch_processor.py <input_chunk.srt> <output_chunk.srt>")