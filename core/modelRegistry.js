// ============================================================
//  GAMEFORGE AI — core/modelRegistry.js
//  Catalogue des modèles supportés + capacités (tokens, tier)
//  ► Permet à l'utilisateur de choisir des modèles plus puissants
//  ► Adapte automatiquement max_tokens à chaque modèle
//  Copyright (c) 2026 CHAOUSSI Cherif — Licence MIT
// ============================================================

const ModelRegistry = {

  // ─── Catalogue par défaut ───────────────────────────────────────────
  // tier:  "free" | "paid"
  // ctx:   contexte total accepté (input + output)
  // out:   max_tokens conseillé pour la sortie (sous TPM free tier)
  // tpm:   limite tokens-per-minute (0 = pas de limite connue)
  CATALOG: [
    // ── GROQ — gratuit ────────────────────────────────────────────
    { id:"llama-3.3-70b-versatile",   provider:"groq", label:"Llama 3.3 70B ★ (recommandé)",  tier:"free", ctx:32768, out:4000,  tpm:12000 },
    { id:"llama-3.1-8b-instant",      provider:"groq", label:"Llama 3.1 8B (rapide)",          tier:"free", ctx:8192,  out:3000,  tpm:6000  },
    { id:"llama-3.1-70b-versatile",   provider:"groq", label:"Llama 3.1 70B (legacy)",         tier:"free", ctx:8192,  out:4000,  tpm:6000  },
    { id:"mixtral-8x7b-32768",        provider:"groq", label:"Mixtral 8x7B (long ctx)",        tier:"free", ctx:32768, out:4000,  tpm:5000  },
    { id:"gemma2-9b-it",              provider:"groq", label:"Gemma 2 9B (critique rapide)",   tier:"free", ctx:8192,  out:2000,  tpm:15000 },
    { id:"llama-3.1-405b-reasoning",  provider:"groq", label:"Llama 3.1 405B (raisonnement)",  tier:"paid", ctx:131072,out:8000,  tpm:0     },

    // ── ANTHROPIC — payant ────────────────────────────────────────
    { id:"claude-sonnet-4-6",         provider:"claude", label:"Claude Sonnet 4.6 ★",          tier:"paid", ctx:200000,out:16000, tpm:0 },
    { id:"claude-haiku-4-5-20251001", provider:"claude", label:"Claude Haiku 4.5 (économique)",tier:"paid", ctx:200000,out:8000,  tpm:0 },
    { id:"claude-opus-4-6",           provider:"claude", label:"Claude Opus 4.6 (max qualité)",tier:"paid", ctx:200000,out:32000, tpm:0 },

    // ── OPENAI — payant (via clé sk-…) ────────────────────────────
    { id:"gpt-4o",                    provider:"openai", label:"GPT-4o (multimodal)",          tier:"paid", ctx:128000,out:16000, tpm:0 },
    { id:"gpt-4o-mini",               provider:"openai", label:"GPT-4o mini (économique)",     tier:"paid", ctx:128000,out:8000,  tpm:0 },
    { id:"o1-mini",                   provider:"openai", label:"o1-mini (raisonnement)",       tier:"paid", ctx:128000,out:16000, tpm:0 },
  ],

  // ─── Récupère tous les modèles connus + customs utilisateur ─────────
  all() {
    const customs = (window.UserPrefs?.load().customModels) || [];
    return [...this.CATALOG, ...customs];
  },

  // Cherche par id (peut être un id custom)
  find(id) {
    return this.all().find(m => m.id === id) || null;
  },

  // Provider d'un modèle quelconque (déduit si inconnu)
  providerOf(id) {
    const found = this.find(id);
    if (found) return found.provider;
    if (typeof id !== "string") return "groq";
    if (id.startsWith("claude-"))                     return "claude";
    if (id.startsWith("gpt-") || id.startsWith("o1")) return "openai";
    return "groq";
  },

  // Limite max_tokens conseillée pour ce modèle (sécuritaire face au TPM)
  maxOutputFor(id) {
    const m = this.find(id);
    if (m && m.out) return m.out;
    // Inconnu : valeur par défaut prudente
    return 4000;
  },

  // Liste filtrée par provider
  byProvider(provider) {
    return this.all().filter(m => m.provider === provider);
  },

  // Liste filtrée par tier
  byTier(tier) {
    return this.all().filter(m => m.tier === tier);
  },

  // Devine si l'utilisateur a la clé qu'il faut pour ce modèle
  hasKeyFor(id) {
    const provider = this.providerOf(id);
    if (provider === "groq")   return (window.UserPrefs?.resolveGroqKeys()   || []).length > 0;
    if (provider === "claude") return !!(window.UserPrefs?.resolveClaudeKey());
    if (provider === "openai") return !!(window.UserPrefs?.resolveOpenAIKey());
    return false;
  },
};

window.ModelRegistry = ModelRegistry;
console.log("[ModelRegistry] chargé :", ModelRegistry.CATALOG.length, "modèles + customs");
