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
    "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",   // ← Clé principale   (gsk_xxxx...)
    "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",   // ← Fallback 1       (gsk_xxxx...)
    "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",   // ← Fallback 2       (gsk_xxxx...)
    "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",   // ← Réserve          (gsk_xxxx...)
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

    // Jeux complexes — grand contexte
    LONG_CTX: "llama-3.1-70b-versatile",

    // Validation/critique du code généré
    CRITIC:   "llama-3.1-8b-instant",
  },

  // ┌─────────────────────────────────────────────────────┐
  // │  🟣 CLÉ API ANTHROPIC (Claude)                      │
  // │  Obtiens ta clé sur : console.anthropic.com         │
  // │  Format : sk-ant-api03-xxxx...                      │
  // │  Laisse vide si tu n'as pas de compte Anthropic     │
  // └─────────────────────────────────────────────────────┘
  ANTHROPIC_API_KEY: "",   // ← Mets ta clé Claude ici (sk-ant-...)

  // ┌─────────────────────────────────────────────────────┐
  // │  🤖 MODÈLES CLAUDE (Anthropic — payants)            │
  // │  Qualité supérieure pour la génération de code      │
  // └─────────────────────────────────────────────────────┘
  ANTHROPIC_MODELS: {
    // Génération principale — meilleur rapport qualité/coût
    MAIN:     "claude-sonnet-4-6",

    // Corrections et critique — rapide et économique
    FAST_FIX: "claude-haiku-4-5-20251001",

    // Critique qualité — rapide et économique
    CRITIC:   "claude-haiku-4-5-20251001",

    // Génération haute qualité — le plus puissant (optionnel)
    OPUS:     "claude-opus-4-6",
  },

  // ┌─────────────────────────────────────────────────────┐
  // │  ⚙️  PARAMÈTRES DU PIPELINE                         │
  // └─────────────────────────────────────────────────────┘
  PIPELINE: {
    MAX_FIX_ATTEMPTS:   5,      // Nb max de tentatives (correction + régénération qualité)
    SANDBOX_TIMEOUT_MS: 10000,  // Temps d'attente avant de conclure "jeu OK" (10s)
    RETRY_DELAY_MS:     800,    // Pause de base entre 2 tentatives (rate limit)
    MAX_RETRY_DELAY_MS: 8000,   // Pause max (backoff exponentiel)
    MAX_TOKENS:         16000,  // Tokens max par réponse (jeux plus complets)
    TEMPERATURE:        0.7,    // Créativité : 0 = strict, 1 = créatif
    QUALITY_THRESHOLD:  10,     // Score minimum /14 pour valider un jeu (étape CRITIC — 6 dimensions)
    FORCE_REGEN_ON_LOW: true,   // Régénérer complètement si score < seuil (vs juste corriger)
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
  VERSION: "2.0.0",
  APP_NAME: "GameForge AI",
};
