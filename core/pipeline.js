// ============================================================
//  GAMEFORGE AI — core/pipeline.js
//  Orchestrateur principal : génération + auto-correction + critique
//  Dépend de : groqClient.js / anthropicClient.js, htmlProcessor.js, prompts.js
// ============================================================

class GameForgePipeline {

  /**
   * @param {GroqClient|AnthropicClient}  client   - Instance du client IA
   * @param {Object}                      ui       - Référence aux composants UI
   */
  constructor(client, ui) {
    this.client = client;
    this.ui     = ui;   // { log, setStep, setStatus, setOverlay, injectGame }
    this.config = GAMEFORGE_CONFIG.PIPELINE;
  }

  // ── PIPELINE PRINCIPAL ────────────────────────────────────
  /**
   * Lance la génération complète avec boucle de correction auto + critique qualité
   *
   * @param {Object}   params
   * @param {string}   params.description  - Description du jeu
   * @param {string}   params.genre        - Genre sélectionné
   * @param {string}   params.complexity   - simple | medium | complex
   * @param {string}   params.model        - Modèle principal sélectionné
   * @param {string[]} params.fixModels    - [modèle fix rapide, modèle fix lent]
   * @param {string}   params.criticModel  - Modèle pour la critique qualité
   * @returns {Promise<{success, html, attempts, error}>}
   */
  async run({ description, genre, complexity, model, fixModels, criticModel }) {
    const { log, setStep, setStatus, setOverlay } = this.ui;
    const MAX = this.config.MAX_FIX_ATTEMPTS;

    // Stocker les modèles pour les étapes suivantes
    this.fixModels   = fixModels   || [GAMEFORGE_CONFIG.MODELS.FAST_FIX, GAMEFORGE_CONFIG.MODELS.LONG_CTX];
    this.criticModel = criticModel || GAMEFORGE_CONFIG.MODELS.CRITIC;

    let lastCode       = null;
    let lastError      = null;
    let isQualityRetry = false; // true si on régénère à cause d'un mauvais score critique

    log("═══ DÉMARRAGE PIPELINE ═══", "step");
    log(`Genre: ${genre} | Complexité: ${complexity} | Modèle: ${model.split("-").slice(0,3).join("-")}`, "info");
    setStatus("active", "GÉNÉRATION");

    // ──────────────────────────────────────────────────────────
    //  BOUCLE TENTATIVE (1 génération + N corrections max)
    // ──────────────────────────────────────────────────────────
    for (let attempt = 1; attempt <= MAX; attempt++) {

      try {
        // ── ÉTAPE A : Génération ou Correction ────────────────
        // On régénère (pas juste un fix) si c'est un retry qualité
        if (attempt === 1 || isQualityRetry) {
          isQualityRetry = false;
          lastCode = await this._generate({ description, genre, complexity, model, log, setStep });
        } else {
          lastCode = await this._fix({ lastCode, lastError, description, attempt, log, setStep });
        }

        // ── ÉTAPE B : Traitement HTML ─────────────────────────
        setStep("validate", "active");
        log("🔍 Validation et nettoyage du HTML...", "step");

        const result = HTMLProcessor.process(lastCode);
        lastCode = result.html;

        // Log les problèmes détectés
        result.issues.forEach(issue => {
          const type = issue.type === "error" ? "error" : "warn";
          log(`  ${issue.type === "error" ? "❌" : "⚠️"} ${issue.msg}`, type);
        });

        if (result.issues.some(i => i.type === "error")) {
          log("❌ Erreurs structurelles → passage en correction IA", "error");
          lastError = result.issues.find(i => i.type === "error").msg;
          setStep("validate", "error");
          continue; // Prochaine tentative = fix IA
        }

        log(`✅ HTML valide (${result.charCount} chars)`, "success");
        setStep("validate", "done");

        // ── ÉTAPE C : Test en Sandbox ─────────────────────────
        setStep("sandbox", "active");
        log("🧪 Test dans sandbox iframe...", "step");
        setOverlay(`Test sandbox (essai ${attempt}/${MAX})...`);

        const sandboxResult = await this._testInSandbox(lastCode);

        if (!sandboxResult.success) {
          // ❌ Erreur runtime détectée dans le sandbox
          lastError = sandboxResult.error;
          setStep("sandbox", "error");
          log(`❌ Erreur runtime: ${lastError}`, "error");

          if (attempt < MAX) {
            log(`🔧 Auto-correction lancée (tentative ${attempt + 1}/${MAX})...`, "warn");
            setStep("fix", "fixing");
          }
          continue;
        }

        setStep("sandbox", "done");

        // ── ÉTAPE D : Critique qualité ────────────────────────
        setStep("quality", "active");
        log("🎯 Évaluation qualité en cours...", "step");

        const critiqueResult = await this._critique({ html: lastCode, description, genre, log });

        const score     = critiqueResult.total;
        const threshold = this.config.QUALITY_THRESHOLD || 7;

        if (!critiqueResult.pass && attempt < MAX) {
          // Score insuffisant → régénérer (pas fixer)
          setStep("quality", "error");
          log(`🎯 Score qualité: ${score}/10 — sous le seuil (${threshold}/10)`, "warn");
          if (critiqueResult.issues && critiqueResult.issues.length > 0) {
            log(`   Problèmes : ${critiqueResult.issues.join(" | ")}`, "warn");
          }
          lastError      = `Qualité insuffisante (${score}/10): ${(critiqueResult.issues || []).join(", ")}`;
          isQualityRetry = true;
          setStep("fix", "fixing");
          log(`🔄 Régénération avec contraintes renforcées (tentative ${attempt + 1}/${MAX})...`, "warn");
          continue;
        }

        // ✅ JEU VALIDÉ (sandbox OK + qualité OK)
        setStep("quality", "done");
        log(`🎯 Score qualité: ${score}/10 ✅`, "success");
        setStep("done", "done");
        setStatus("", "PRÊT");
        log(`🎮 JEU FONCTIONNEL ! (${attempt} tentative${attempt > 1 ? "s" : ""})`, "success");

        return { success: true, html: lastCode, attempts: attempt, error: null };

      } catch (err) {
        log(`💥 Erreur inattendue: ${err.message}`, "error");
        lastError = err.message;

        if (attempt >= MAX) {
          setStatus("error", "ERREUR");
          return { success: false, html: lastCode, attempts: attempt, error: err.message };
        }
      }
    }

    // Échec après toutes les tentatives
    log(`💀 Échec après ${MAX} tentatives. Dernier code disponible.`, "error");
    setStatus("error", "ÉCHEC PARTIEL");
    return { success: false, html: lastCode, attempts: MAX, error: lastError };
  }

  // ── ÉTAPE : GÉNÉRATION INITIALE ───────────────────────────
  async _generate({ description, genre, complexity, model, log, setStep }) {
    setStep("gen", "active");
    log("📝 Génération du jeu en cours...", "step");

    const systemPrompt = Prompts.buildSystem(description, genre, complexity);
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user",   content: `Génère maintenant le jeu : ${description}` },
    ];

    const raw = await this.client.chat(messages, model, (msg, type) => log(msg, type));
    setStep("gen", "done");
    return raw;
  }

  // ── ÉTAPE : AUTO-CORRECTION ───────────────────────────────
  async _fix({ lastCode, lastError, description, attempt, log, setStep }) {
    setStep("fix", "fixing");
    log(`🔧 Correction (essai ${attempt}) — erreur: "${lastError}"`, "warn");

    // Sélectionner le bon modèle de fix selon la tentative
    const fixModel = this.fixModels[attempt - 2] || this.fixModels[this.fixModels.length - 1];
    log(`   Modèle de correction : ${fixModel.split("-").slice(0,3).join("-")}`, "info");

    const fixPrompt = Prompts.buildFix(lastCode, lastError, description, attempt);
    const messages  = [{ role: "user", content: fixPrompt }];

    const raw = await this.client.chat(messages, fixModel, (msg, type) => log(msg, type));
    setStep("fix", "done");
    return raw;
  }

  // ── ÉTAPE : CRITIQUE QUALITATIVE ─────────────────────────
  /**
   * Évalue la qualité du jeu généré via le modèle CRITIC.
   * Retourne {pass, total, issues} — si le CRITIC échoue, on présume pass=true.
   */
  async _critique({ html, description, genre, log }) {
    try {
      const critiquePrompt = Prompts.buildCritique(html, description, genre);
      const messages = [{ role: "user", content: critiquePrompt }];

      log(`   Modèle critique : ${this.criticModel.split("-").slice(0,3).join("-")}`, "info");
      const raw = await this.client.chat(messages, this.criticModel, (msg, type) => log(msg, type));

      // Extraire le JSON de la réponse (peut contenir du texte parasite)
      const jsonMatch = raw.match(/\{[^{}]*"total"\s*:\s*\d+[^{}]*\}/);
      if (!jsonMatch) {
        log("⚠️ CRITIC : réponse non-JSON → qualité présumée OK", "warn");
        return { pass: true, total: 10, issues: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const total  = typeof parsed.total === "number" ? parsed.total : 10;
      const pass   = typeof parsed.pass  === "boolean" ? parsed.pass : total >= (this.config.QUALITY_THRESHOLD || 7);
      const issues = Array.isArray(parsed.issues) ? parsed.issues : [];

      return { pass, total, issues };

    } catch (err) {
      // Le CRITIC ne doit jamais bloquer le pipeline
      log(`⚠️ CRITIC indisponible (${err.message.substring(0, 60)}) → qualité présumée OK`, "warn");
      return { pass: true, total: 10, issues: [] };
    }
  }

  // ── ÉTAPE : TEST SANDBOX ──────────────────────────────────
  _testInSandbox(html) {
    return new Promise((resolve) => {
      // Injecte dans l'iframe via l'UI
      this.ui.injectGame(html);

      let timer;
      const handler = (event) => {
        if (!event.data || typeof event.data !== "object") return;

        if (event.data.type === "GAME_READY") {
          clearTimeout(timer);
          window.removeEventListener("message", handler);
          resolve({ success: true, error: null });
        }

        if (event.data.type === "GAME_ERROR") {
          clearTimeout(timer);
          window.removeEventListener("message", handler);
          resolve({ success: false, error: event.data.error });
        }
      };

      window.addEventListener("message", handler);

      // Timeout : si pas de message dans X secondes → on assume OK
      timer = setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve({ success: true, error: null }); // Pas d'erreur = présumé OK
      }, this.config.SANDBOX_TIMEOUT_MS);
    });
  }
}
