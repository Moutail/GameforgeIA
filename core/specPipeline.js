/* ════════════════════════════════════════════════════════════════════
 *  SPEC PIPELINE — Pipeline de génération mode "Spec"
 *  Copyright (c) 2026 CHAOUSSI Cherif — Licence MIT
 *  ----------------------------------------------------------------
 *  Flux : description → IA génère JSON → validate/fix → compile → jouable
 *  Beaucoup plus fiable que le mode raw HTML, fonctionne avec petits modèles
 *  ════════════════════════════════════════════════════════════════════ */

class SpecPipeline {

  constructor(client, ui) {
    this.client = client;
    this.ui     = ui;
    this.config = GAMEFORGE_CONFIG.PIPELINE;
  }

  async run({ description, genre, complexity, model, fixModels, criticModel }) {
    const { log, setStep, setStatus } = this.ui;
    const MAX = 3;
    this.fixModels = fixModels || [GAMEFORGE_CONFIG.MODELS.FAST_FIX];

    log("═══ MODE SPEC — Génération JSON ═══", "step");
    log(`Genre: ${genre} | Complexité: ${complexity} | Modèle: ${model.split("-").slice(0,3).join("-")}`, "info");
    setStatus("active", "GÉNÉRATION");

    let spec = null;
    let lastError = null;

    // ─── Étape 1 : Génération de la spec ────────────────────────────
    for (let attempt = 1; attempt <= MAX; attempt++) {
      setStep("gen", "active");
      log(`📋 Tentative ${attempt}/${MAX} : génération de la spec JSON...`, "step");

      try {
        const prompt = (attempt === 1)
          ? SpecPrompts.buildSpec({ description, genre, complexity })
          : SpecPrompts.buildFix({ spec, issues: lastError ? [lastError] : ["JSON invalide"], description });

        const messages = [{ role: "user", content: prompt }];
        const useModel = attempt === 1 ? model : this.fixModels[0];
        // Spec JSON rarement > 3000 tokens → 4000 suffit et respecte TPM 6k/12k
        const raw = await this.client.chat(messages, useModel, (msg, type) => log(msg, type), { maxTokens: 4000 });

        // Extraction du JSON (peut contenir du texte parasite)
        spec = this._extractJSON(raw);
        if (!spec) { lastError = "Réponse non-JSON"; log("⚠️ Pas de JSON valide trouvé", "warn"); continue; }

        // Validation
        setStep("validate", "active");
        const fixed = SpecCompiler.autoFix(spec);
        const issues = SpecCompiler.validate(fixed);

        if (issues.length === 0) {
          spec = fixed;
          log(`✅ Spec valide : ${fixed.levels.length} niveau(x), ${this._countEntities(fixed)} entités`, "success");
          break;
        } else {
          log(`⚠️ Spec invalide (${issues.length} pb) : ${issues.slice(0,2).join(" · ")}`, "warn");
          lastError = issues.join(" ; ");
          spec = fixed;
        }
      } catch (e) {
        lastError = e.message;
        log(`❌ Erreur : ${e.message.substring(0, 80)}`, "error");
      }
    }

    if (!spec) {
      setStatus("error", "ÉCHEC");
      return { success: false, error: lastError || "Pas de spec générée" };
    }

    // ─── Étape 2 : Compilation spec → HTML ─────────────────────────
    setStep("sandbox", "active");
    log("🔧 Compilation spec → HTML jouable...", "step");
    let compiled;
    try {
      compiled = await SpecCompiler.compile(spec);
    } catch (e) {
      log(`❌ Compilation échouée : ${e.message}`, "error");
      setStatus("error", "ÉCHEC");
      return { success: false, error: e.message };
    }

    // ─── Étape 3 : Test sandbox ────────────────────────────────────
    log("🧪 Injection dans la sandbox...", "step");
    this.ui.injectGame(compiled.html);

    // ─── Étape 4 : Critique (optionnelle, non bloquante) ───────────
    let critScore = null;
    try {
      setStep("quality", "active");
      const cPrompt = SpecPrompts.buildCritique({ spec, description });
      const cRaw = await this.client.chat(
        [{ role:"user", content:cPrompt }],
        criticModel || GAMEFORGE_CONFIG.MODELS.CRITIC,
        (msg, type) => log(msg, type),
        { maxTokens: 500 }   // la critique est courte (JSON de score)
      );
      const crit = this._extractJSON(cRaw);
      if (crit) {
        const total = (crit.fun || 0) + (crit.matches_description || 0) + (crit.level_design || 0);
        critScore = total;
        log(`🎯 Score : ${total}/8 — fun:${crit.fun||0} match:${crit.matches_description||0} design:${crit.level_design||0}`, total >= 5 ? "success" : "warn");
        if (crit.issues && crit.issues.length) log(`💡 Pistes : ${crit.issues.slice(0,2).join(" · ")}`, "info");
      }
    } catch (e) {
      log(`⚠️ Critique skip : ${e.message.substring(0, 60)}`, "warn");
    }

    setStep("done", "done");
    setStatus("ready", "JOUABLE");
    log(`🎮 JEU PRÊT — ${spec.levels.length} niveau(x) · ${spec.meta.title}`, "success");

    return {
      success: true,
      html: compiled.html,
      spec: spec,
      score: critScore,
      mode: "spec"
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────
  _extractJSON(raw) {
    if (!raw) return null;
    // Enlever les blocs markdown
    raw = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
    // Trouver le premier { et le dernier } équilibrés
    const start = raw.indexOf("{");
    if (start < 0) return null;
    let depth = 0, end = -1;
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === "{") depth++;
      else if (raw[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    try {
      return JSON.parse(raw.substring(start, end + 1));
    } catch (e) {
      // Tentative de réparation : trailing commas
      try {
        const cleaned = raw.substring(start, end + 1).replace(/,(\s*[\]}])/g, "$1");
        return JSON.parse(cleaned);
      } catch (e2) { return null; }
    }
  }

  _countEntities(spec) {
    let n = 0;
    (spec.levels || []).forEach(L => {
      n += (L.platforms || []).length + (L.enemies || []).length + (L.collectibles || []).length + (L.hazards || []).length;
    });
    return n;
  }
}

window.SpecPipeline = SpecPipeline;
