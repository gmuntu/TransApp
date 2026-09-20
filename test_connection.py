import os
from google import genai
from dotenv import load_dotenv

# Charge automatiquement le fichier .env
load_dotenv()

def test_gemini_connection():
    print("Initialisation du client Google GenAI...")
    
    # Le client récupère la clé depuis le fichier .env
    client = genai.Client()

    print("Envoi de la requête de test au modèle gemini-3.8-flash...")
    try:
        response = client.models.generate_content(
            model='gemini-3.8-flash',
            contents='Bonjour ! Réponds par une courte phrase pour confirmer que la liaison avec Savoir IA est active.',
        )
        print("\n Réponse reçue de l'API avec succès :")
        print("-" * 50)
        print(response.text)
        print("-" * 50)
        print("La connexion API est pleinement opérationnelle !")
        
    except Exception as e:
        print(f"\n Erreur lors de la communication avec l'API : {e}")

if __name__ == "__main__":
    test_gemini_connection()