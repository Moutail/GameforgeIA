// ============================================================
//  GAMEFORGE AI — core/userPrefs.js
//  Préférences utilisateur persistantes (localStorage)
//  Clés API + modèles custom + onboarding state
//  Copyright (c) 2026 CHAOUSSI Cherif — Licence MIT
// ============================================================

const UserPrefs = {

  KEY: "gf_user_prefs_v1",

  // Forme par défaut
  _defaults() {
    return {
      groqKeys:     ["", "", "", ""],
      claudeKey:    "",
      openaiKey:    "",
      customModels: [],          // [{ id, label, provider, contextWindow, maxOutput }]
      preferredModel: null,
      hasOnboarded: false,
    };
  },

  // ── Lecture / écriture ─────────────────────────────────────────────
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return this._defaults();
      const parsed = JSON.parse(raw);
      return Object.assign(this._defaults(), parsed);
    } catch { return this._defaults(); }
  },

  save(prefs) {
    try { localStorage.setItem(this.KEY, JSON.stringify(prefs)); }
    catch (e) { console.warn("[UserPrefs] save failed", e); }
  },

  // Patch partiel
  update(patch) {
    const cur = this.load();
    const next = Object.assign({}, cur, patch);
    this.save(next);
    return next;
  },

  // ── Helpers spécifiques ────────────────────────────────────────────
  setGroqKey(index, value) {
    const p = this.load();
    p.groqKeys[index] = (value || "").trim();
    this.save(p);
  },

  setClaudeKey(value) { this.update({ claudeKey: (value||"").trim() }); },
  setOpenAIKey(value) { this.update({ openaiKey: (value||"").trim() }); },

  // Récupère TOUTES les clés Groq valides : config.js + localStorage merged + dédupliquées
  resolveGroqKeys() {
    const fromConfig = (window.GAMEFORGE_CONFIG?.GROQ_API_KEYS || [])
      .filter(k => k && typeof k === "string" && k.startsWith("gsk_") && !k.includes("INSERE"));
    const fromLS = this.load().groqKeys
      .filter(k => k && k.startsWith("gsk_") && !k.includes("INSERE"));
    return Array.from(new Set([...fromConfig, ...fromLS]));
  },

  resolveClaudeKey() {
    const cfg = window.GAMEFORGE_CONFIG?.ANTHROPIC_API_KEY || "";
    const ls  = this.load().claudeKey;
    if (ls && ls.startsWith("sk-ant-")) return ls;
    if (cfg && cfg.startsWith("sk-ant-")) return cfg;
    return null;
  },

  resolveOpenAIKey() {
    const ls = this.load().openaiKey;
    return (ls && ls.startsWith("sk-")) ? ls : null;
  },

  // ── Custom models ──────────────────────────────────────────────────
  addCustomModel(model) {
    const p = this.load();
    if (p.customModels.some(m => m.id === model.id)) return; // déjà présent
    p.customModels.push(model);
    this.save(p);
  },

  removeCustomModel(id) {
    const p = this.load();
    p.customModels = p.customModels.filter(m => m.id !== id);
    this.save(p);
  },

  // ── Onboarding ─────────────────────────────────────────────────────
  shouldOnboard() {
    const p = this.load();
    if (p.hasOnboarded) return false;
    // Pas onboardé ET aucune clé nulle part → afficher
    const hasGroq   = this.resolveGroqKeys().length > 0;
    const hasClaude = !!this.resolveClaudeKey();
    return !hasGroq && !hasClaude;
  },

  markOnboarded() { this.update({ hasOnboarded: true }); },

  reset() { localStorage.removeItem(this.KEY); }
};

window.UserPrefs = UserPrefs;
console.log("[UserPrefs] chargé");
