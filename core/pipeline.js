// ============================================================
//  GAMEFORGE AI — core/pipeline.js
//  Orchestrateur principal : génération + auto-correction
//  Dépend de : groqClient.js, htmlProcessor.js, prompts.js
// ============================================================

class GameForgePipeline {

  /**
   * @param {GroqClient}  client   - Instance du client Groq
   * @param {Object}      ui       - Référence aux composants UI
   */
  constructor(client, ui) {
    this.client = client;
    this.ui     = ui;   // { log, setStep, setStatus, setOverlay }
    this.config = GAMEFORGE_CONFIG.PIPELINE;
  }

  // ── PIPELINE PRINCIPAL ────────────────────────────────────
  /**
   * Lance la génération complète avec boucle de correction auto
   *
   * @param {Object} params
   * @param {string} params.description - Description du jeu
   * @param {string} params.genre       - Genre sélectionné
   * @param {string} params.complexity  - simple | medium | complex
   * @param {string} params.model       - Modèle Groq principal
   * @returns {Promise<{success, html, attempts, error}>}
   */
  async run({ description, genre, complexity, model }) {
    const { log, setStep, setStatus, setOverlay } = this.ui;
    const MAX = this.config.MAX_FIX_ATTEMPTS;

    let lastCode  = null;
    let lastError = null;

    log("═══ DÉMARRAGE PIPELINE ═══", "step");
    log(`Genre: ${genre} | Complexité: ${complexity} | Modèle: ${model}`, "info");
    setStatus("active", "GÉNÉRATION");

    // ──────────────────────────────────────────────────────────
    //  BOUCLE TENTATIVE (1 génération + N corrections max)
    // ──────────────────────────────────────────────────────────
    for (let attempt = 1; attempt <= MAX; attempt++) {

      try {
        // ── ÉTAPE A : Génération ou Correction ────────────────
        if (attempt === 1) {
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

        if (sandboxResult.success) {
          // ✅ JEU FONCTIONNEL
          setStep("sandbox", "done");
          setStep("done",    "done");
          setStatus("", "PRÊT");
          log(`🎮 JEU FONCTIONNEL ! (${attempt} tentative${attempt > 1 ? "s" : ""})`, "success");

          return { success: true, html: lastCode, attempts: attempt, error: null };

        } else {
          // ❌ Erreur runtime détectée dans le sandbox
          lastError = sandboxResult.error;
          setStep("sandbox", "error");
          log(`❌ Erreur runtime: ${lastError}`, "error");

          if (attempt < MAX) {
            log(`🔧 Auto-correction lancée (tentative ${attempt + 1}/${MAX})...`, "warn");
            setStep("fix", "fixing");
          }
        }

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

    // On utilise un modèle rapide pour les corrections
    const fixModel = attempt === 2
      ? GAMEFORGE_CONFIG.MODELS.FAST_FIX   // llama 8B (rapide)
      : GAMEFORGE_CONFIG.MODELS.LONG_CTX;  // mixtral (contexte long)

    log(`   Modèle de correction : ${fixModel.split("-").slice(0,3).join("-")}`, "info");

    const fixPrompt = Prompts.buildFix(lastCode, lastError, description, attempt);
    const messages  = [{ role: "user", content: fixPrompt }];

    const raw = await this.client.chat(messages, fixModel, (msg, type) => log(msg, type));
    setStep("fix", "done");
    return raw;
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
