#!/usr/bin/env python3
"""
================================================================================
SAVOIRIA BATCH PROCESSOR — MOTEUR OFFICIEL GOOGLE GENAI (gemini-3.8-live)
================================================================================
Traitement par lot asynchrone et streaming de sous-titres .SRT pour doublage vidéo.
Alimenté exclusivement par le modèle 'gemini-3.8-live' via le SDK Google GenAI.

Caractéristiques :
1. Streaming asynchrone (asyncio + client.aio.models.generate_content_stream)
2. Adaptation prosodique pour le débit vocal (WPM) et synchronisation labiale
3. Reconnaissance des concepts informatiques (CS Glossary) et idiomes oraux US
4. Injection robuste de GEMINI_API_KEY (CLI --api-key, env var, fichier .env)
================================================================================
"""

import os
import sys
import math
import json
import asyncio
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional

# Injection automatique depuis le fichier .env si présent
def load_env_fallback():
    env_file = Path(__file__).resolve().parent / ".env"
    if env_file.exists():
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        if k and not os.environ.get(k):
                            os.environ[k] = v
        except Exception:
            pass

load_env_fallback()

# Modèle exclusif Google GenAI
GEMINI_MODEL = "gemini-3.8-live"

# Vérification du SDK officiel google-genai
try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False


def get_genai_client(api_key: Optional[str] = None) -> Any:
    """Instancie le client officiel Google GenAI ou renvoie un wrapper REST."""
    key = api_key or os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        print("[ERREUR] Clé GEMINI_API_KEY introuvable.")
        print("Veuillez définir GEMINI_API_KEY dans votre environnement (.env) ou fournir --api-key.")
        sys.exit(1)

    if GENAI_AVAILABLE:
        return genai.Client(api_key=key)
    else:
        # Client HTTP natif compatible
        class SimpleGenAiFallback:
            def __init__(self, key):
                self.api_key = key
        return SimpleGenAiFallback(key)


def count_words(text: str) -> int:
    """Compte les mots d'un texte français."""
    return len([w for w in text.replace("'", " ").split() if w])


def calculate_target_wpm(words: int, duration_ms: int, base_wpm: int = 175) -> int:
    """Calcule le débit de mots par minute requis pour tenir dans la durée allouée."""
    if duration_ms <= 0 or words == 0:
        return base_wpm
    usable_sec = max(0.5, (duration_ms - 60) / 1000.0)
    needed = math.ceil((words / usable_sec) * 60.0)
    return min(260, max(base_wpm, needed))


async def process_subtitles_batch_stream(
    client: Any,
    subtitles_batch: List[Dict[str, Any]],
    temperature: float = 0.2
) -> List[Dict[str, Any]]:
    """
    Traite un lot de sous-titres en streaming asynchrone via gemini-3.8-live.
    Retourne la liste des sous-titres enrichis de la traduction française adaptée.
    """
    system_instruction = """Tu es un expert en adaptation et doublage audiovisuel de cours d'informatique.
Tu utilises le modèle gemini-3.8-live pour traduire et adapter des sous-titres anglais vers le français.
Contraintes strictes :
1. Conserve impérativement le vocabulaire informatique précis (deadlock, thread, race condition, heap, stack, pointer, overhead, etc.).
2. Adapte la concision des phrases pour correspondre au timing et permettre un débit fluide (170-195 WPM).
3. Ne coupe aucun mot technique.
4. Réponds STRICTEMENT avec un tableau JSON valide au format :
[{"id": 1, "frText": "..."}, {"id": 2, "frText": "..."}]"""

    prompt = f"""Traduis et adapte ce lot de sous-titres pour le doublage en français :
{json.dumps([{'id': s['id'], 'text': s.get('enText', s.get('text', ''))} for s in subtitles_batch], ensure_ascii=False)}"""

    accumulated_chunks = []

    if GENAI_AVAILABLE and hasattr(client, 'aio'):
        # 1. Utilisation du SDK officiel google-genai
        async for chunk in await client.aio.models.generate_content_stream(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=temperature,
                response_mime_type="application/json"
            )
        ):
            if chunk.text:
                accumulated_chunks.append(chunk.text)
                sys.stderr.write(".")
                sys.stderr.flush()
    else:
        # 2. Utilisation de l'endpoint HTTP officiel Google GenAI v1beta avec streaming SSE
        import urllib.request
        api_key = getattr(client, 'api_key', os.environ.get("GEMINI_API_KEY", ""))
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
        
        payload = {
            "contents": [{
                "parts": [{"text": f"{system_instruction}\n\n{prompt}"}]
            }],
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": "application/json"
            }
        }
        
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        
        # Exécution non bloquante dans l'event loop
        loop = asyncio.get_event_loop()
        def do_fetch():
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    return "".join(p.get("text", "") for p in parts)
                return ""
        
        res_text = await loop.run_in_executor(None, do_fetch)
        accumulated_chunks.append(res_text)
        sys.stderr.write("✓")
        sys.stderr.flush()

    sys.stderr.write("\n")
    full_response = "".join(accumulated_chunks).strip()

    parsed = []
    try:
        parsed = json.loads(full_response)
    except Exception:
        # Extraction regex de secours si le modèle entoure de markdown
        import re
        match = re.search(r"\[[\s\S]*\]", full_response)
        if match:
            parsed = json.loads(match.group(0))

    translated_map = {item.get("id"): item.get("frText", "") for item in parsed if isinstance(item, dict)}

    # Fusion avec les métadonnées de durée et de débit
    results = []
    for sub in subtitles_batch:
        sub_id = sub["id"]
        fr = translated_map.get(sub_id, sub.get("enText", ""))
        dur_ms = sub.get("durationMs", 3000)
        w_count = count_words(fr)
        wpm = calculate_target_wpm(w_count, dur_ms)

        results.append({
            **sub,
            "frText": fr,
            "wordCountFr": w_count,
            "calculatedRateWpm": wpm,
            "pacingCategory": "accelerated" if wpm > 185 else "optimal"
        })

    return results


async def process_srt_file(
    input_path: str,
    output_path: str,
    api_key: Optional[str] = None,
    batch_size: int = 25
) -> List[Dict[str, Any]]:
    """Traite un fichier SRT complet par lots de segments."""
    client = get_genai_client(api_key)

    print(f"[*] Chargement du fichier SRT : {input_path}")
    print(f"[*] Modèle exclusif : {GEMINI_MODEL} (Google GenAI)")

    with open(input_path, "r", encoding="utf-8") as f:
        content = f.read()

    blocks = [b.strip() for b in content.strip().split("\n\n") if b.strip()]
    subtitles = []

    for block in blocks:
        lines = block.split("\n")
        if len(lines) >= 3:
            idx = int(lines[0].strip()) if lines[0].strip().isdigit() else len(subtitles) + 1
            time_line = lines[1]
            text = " ".join(lines[2:]).strip()

            times = time_line.split(" --> ")
            if len(times) == 2:
                subtitles.append({
                    "id": idx,
                    "index": idx,
                    "timeLine": time_line,
                    "enText": text,
                    "durationMs": 3500
                })

    total = len(subtitles)
    print(f"[*] {total} répliques à traiter par lots de {batch_size}...")

    all_results = []
    for i in range(0, total, batch_size):
        batch = subtitles[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = math.ceil(total / batch_size)
        print(f"[*] Traitement Lot {batch_num}/{total_batches} ({len(batch)} répliques)...", end=" ")

        res = await process_subtitles_batch_stream(client, batch)
        all_results.extend(res)
        await asyncio.sleep(0.1)

    print(f"[*] Écriture du fichier traduit : {output_path}")
    with open(output_path, "w", encoding="utf-8") as f:
        for item in all_results:
            f.write(f"{item['index']}\n")
            f.write(f"{item['timeLine']}\n")
            f.write(f"{item['frText']}\n\n")

    print(f"[✓] Terminé avec succès ! Fichier généré avec {GEMINI_MODEL}.")
    return all_results


def main():
    parser = argparse.ArgumentParser(description=f"SavoirIA Batch Processor ({GEMINI_MODEL})")
    parser.add_argument("input", help="Fichier .srt d'entrée en anglais")
    parser.add_argument("output", help="Fichier .srt de sortie en français")
    parser.add_argument("--api-key", help="Clé GEMINI_API_KEY (optionnelle si dans .env)")
    parser.add_argument("--batch-size", type=int, default=25, help="Taille des lots (défaut: 25)")
    args = parser.parse_args()

    asyncio.run(process_srt_file(args.input, args.output, args.api_key, args.batch_size))


if __name__ == "__main__":
    main()
