// ============================================================
//  GAMEFORGE AI — CONFIG.JS
//  ► C'est ICI que tu mets toutes tes clés et paramètres
//  ► Ne partage JAMAIS ce fichier avec tes clés remplies
// ============================================================

const GAMEFORGE_CONFIG = {

  // ┌─────────────────────────────────────────────────────┐
  // │  🔑 CLÉS API GROQ                                   │
  // │  Obtiens tes clés gratuites sur : console.groq.com  │
  // │  Remplace les chaînes "INSERE_TA_CLE_ICI_X"         │
  // └─────────────────────────────────────────────────────┘
  GROQ_API_KEYS: [
    "INSERE_TA_CLE_GROQ_ICI_1",   // ← Clé principale   (gsk_xxxx...)
    "INSERE_TA_CLE_GROQ_ICI_2",   // ← Fallback 1       (gsk_xxxx...)
    "INSERE_TA_CLE_GROQ_ICI_3",   // ← Fallback 2       (gsk_xxxx...)
    "INSERE_TA_CLE_GROQ_ICI_4",   // ← Réserve          (gsk_xxxx...)
  ],

  // ┌─────────────────────────────────────────────────────┐
  // │  🤖 MODÈLES GROQ DISPONIBLES (gratuits)             │
  // │  Chaque modèle a un rôle précis dans le pipeline    │
  // └─────────────────────────────────────────────────────┘
  MODELS: {
    // Génération principale — le plus intelligent
    MAIN:     "llama-3.3-70b-versatile",

    // Corrections rapides — ultra rapide, moins de tokens
    FAST_FIX: "llama-3.1-8b-instant",

    // Jeux complexes — contexte de 32 000 tokens
    LONG_CTX: "mixtral-8x7b-32768",

    // Validation/critique du code généré
    CRITIC:   "gemma2-9b-it",
  },

  // ┌─────────────────────────────────────────────────────┐
  // │  ⚙️  PARAMÈTRES DU PIPELINE                         │
  // └─────────────────────────────────────────────────────┘
  PIPELINE: {
    MAX_FIX_ATTEMPTS:   3,     // Nb max de tentatives de correction auto
    SANDBOX_TIMEOUT_MS: 7000,  // Temps d'attente avant de conclure "jeu OK"
    RETRY_DELAY_MS:     600,   // Pause entre 2 tentatives (rate limit)
    MAX_TOKENS:         8000,  // Tokens max par réponse Groq
    TEMPERATURE:        0.7,   // Créativité : 0 = strict, 1 = créatif
  },

  // ┌─────────────────────────────────────────────────────┐
  // │  🎮 GENRES DE JEUX SUPPORTÉS                        │
  // │  Ajoute/retire des genres ici facilement            │
  // └─────────────────────────────────────────────────────┘
  GENRES: [
    { id: "platformer", label: "Platformer", icon: "🏃" },
    { id: "arcade",     label: "Arcade",     icon: "👾" },
    { id: "shooter",    label: "Shooter",    icon: "🚀" },
    { id: "puzzle",     label: "Puzzle",     icon: "🧩" },
    { id: "rpg",        label: "RPG",        icon: "⚔️"  },
    { id: "runner",     label: "Runner",     icon: "🌀" },
  ],

  // ┌─────────────────────────────────────────────────────┐
  // │  🔗 URL API GROQ                                     │
  // │  Ne change pas sauf si Groq migre son endpoint      │
  // └─────────────────────────────────────────────────────┘
  GROQ_API_URL: "https://api.groq.com/openai/v1/chat/completions",

  // ┌─────────────────────────────────────────────────────┐
  // │  📦 VERSION                                          │
  // └─────────────────────────────────────────────────────┘
  VERSION: "1.0.0",
  APP_NAME: "GameForge AI",
};
