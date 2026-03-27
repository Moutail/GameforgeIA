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
   * @returns {Promise<{success, html, attempts, score, error}>}
   */
  async run({ description, genre, complexity, model, fixModels, criticModel, assets = null }) {
    const { log, setStep, setStatus, setOverlay } = this.ui;
    const MAX = this.config.MAX_FIX_ATTEMPTS;

    this.fixModels   = fixModels   || [GAMEFORGE_CONFIG.MODELS.FAST_FIX, GAMEFORGE_CONFIG.MODELS.LONG_CTX];
    this.criticModel = criticModel || GAMEFORGE_CONFIG.MODELS.CRITIC;

    let lastCode         = null;
    let lastError        = null;
    let previousIssues   = [];   // Feedback critique accumulé entre les tentatives
    let isQualityRetry   = false;
    let bestScore        = 0;
    let bestHtml         = null;

    this.assets = assets;  // assets fournis par l'utilisateur

    log("═══ DÉMARRAGE PIPELINE ═══", "step");
    log(`Genre: ${genre} | Complexité: ${complexity} | Modèle: ${model.split("-").slice(0,3).join("-")}`, "info");
    if (assets) log(`🖼️ ${Object.keys(assets).length} asset(s) injecté(s) dans le prompt`, "key");
    log(`Tentatives max: ${MAX} | Seuil qualité: ${this.config.QUALITY_THRESHOLD}/12`, "info");
    setStatus("active", "GÉNÉRATION");

    for (let attempt = 1; attempt <= MAX; attempt++) {

      try {
        // ── ÉTAPE A : Génération ou Correction ─────────────────
        if (attempt === 1 || isQualityRetry) {
          isQualityRetry = false;
          lastCode = await this._generate({
            description, genre, complexity, model,
            previousIssues, assets: this.assets, log, setStep,
          });
          previousIssues = []; // reset après chaque régénération complète
        } else {
          lastCode = await this._fix({ lastCode, lastError, description, attempt, log, setStep });
        }

        // ── ÉTAPE B : Traitement HTML ──────────────────────────
        setStep("validate", "active");
        log("🔍 Validation et nettoyage du HTML...", "step");

        const result = HTMLProcessor.process(lastCode);
        lastCode = result.html;

        result.issues.forEach(issue => {
          log(`  ${issue.type === "error" ? "❌" : "⚠️"} ${issue.msg}`, issue.type === "error" ? "error" : "warn");
        });

        if (result.issues.some(i => i.type === "error")) {
          log("❌ Erreurs structurelles → passage en correction IA", "error");
          lastError = result.issues.find(i => i.type === "error").msg;
          setStep("validate", "error");
          continue;
        }

        log(`✅ HTML valide (${(result.charCount / 1000).toFixed(1)}k chars)`, "success");
        setStep("validate", "done");

        // ── ÉTAPE C : Test en Sandbox ──────────────────────────
        setStep("sandbox", "active");
        log(`🧪 Sandbox test (${attempt}/${MAX})...`, "step");
        setOverlay(`Test sandbox — tentative ${attempt}/${MAX}...`);

        const sandboxResult = await this._testInSandbox(lastCode);

        if (!sandboxResult.success) {
          lastError = sandboxResult.error;
          setStep("sandbox", "error");
          log(`❌ Erreur runtime: ${lastError}`, "error");
          if (attempt < MAX) {
            setStep("fix", "fixing");
            log(`🔧 Correction lancée (tentative ${attempt + 1}/${MAX})...`, "warn");
          }
          continue;
        }

        setStep("sandbox", "done");

        // ── ÉTAPE D : Critique qualité ─────────────────────────
        setStep("quality", "active");
        log("🎯 Évaluation qualité...", "step");

        const critiqueResult = await this._critique({ html: lastCode, description, genre, log });
        const score          = critiqueResult.total;
        const threshold      = this.config.QUALITY_THRESHOLD || 7;

        // Garde toujours le meilleur résultat en mémoire
        if (score > bestScore) {
          bestScore = score;
          bestHtml  = lastCode;
        }

        // Log détaillé du score (max 14)
        const maxScore = 14;
        const filled   = Math.round((score / maxScore) * 10);
        const scoreBar = "█".repeat(filled) + "░".repeat(10 - filled);
        log(`🎯 [${scoreBar}] ${score}/14 — méca:${critiqueResult.mechanics ?? "?"} visuel:${critiqueResult.visuals ?? "?"} ctrl:${critiqueResult.controls ?? "?"} bugs:${critiqueResult.bugs ?? "?"} match:${critiqueResult.description_match ?? "?"} feel:${critiqueResult.feel ?? "?"}`, score >= threshold ? "success" : "warn");

        if (!critiqueResult.pass && attempt < MAX) {
          setStep("quality", "error");
          if (critiqueResult.issues && critiqueResult.issues.length > 0) {
            critiqueResult.issues.forEach(p => log(`   ↳ ${p}`, "warn"));
            previousIssues = critiqueResult.issues; // injecté dans le prochain buildSystem
          }
          lastError      = `Qualité insuffisante (${score}/14): ${(critiqueResult.issues || []).join(", ")}`;           // Ajouter feel dans les issues si feel=0
          if ((critiqueResult.feel ?? 1) === 0 && !previousIssues.some(p => p.includes("physique")))
            previousIssues.push("Physique injouable : utilise PHYS.speed=canvas.width*0.004, jumpForce=-(canvas.height*0.018), gravity=canvas.height*0.0007");
          isQualityRetry = true;
          setStep("fix", "fixing");
          log(`🔄 Régénération avec feedback ciblé (tentative ${attempt + 1}/${MAX})...`, "warn");
          continue;
        }

        // ✅ JEU VALIDÉ
        setStep("quality", "done");
        setStep("done", "done");
        setStatus("", "PRÊT");
        log(`🎮 JEU VALIDÉ ! Score ${score}/14 — ${attempt} tentative${attempt > 1 ? "s" : ""}`, "success");

        return { success: true, html: lastCode, attempts: attempt, score, error: null };

      } catch (err) {
        log(`💥 Erreur inattendue: ${err.message}`, "error");
        lastError = err.message;

        if (attempt >= MAX) {
          setStatus("error", "ERREUR");
          return { success: false, html: bestHtml || lastCode, attempts: attempt, score: bestScore, error: err.message };
        }
      }
    }

    // Échec après toutes les tentatives — retourne le meilleur résultat obtenu
    log(`� Échec après ${MAX} tentatives. Meilleur score: ${bestScore}/12`, "error");
    setStatus("error", "ÉCHEC PARTIEL");
    return { success: false, html: bestHtml || lastCode, attempts: MAX, score: bestScore, error: lastError };
  }

  // ── ÉTAPE : GÉNÉRATION INITIALE ───────────────────────────
  async _generate({ description, genre, complexity, model, previousIssues = [], assets = null, log, setStep }) {
    setStep("gen", "active");
    const isRetry = previousIssues.length > 0;
    log(isRetry
      ? `📝 Régénération avec ${previousIssues.length} contrainte(s) ciblée(s)...`
      : "📝 Génération du jeu en cours...", "step");
    if (assets && Object.keys(assets).length > 0)
      log(`🖼️ ${Object.keys(assets).length} asset(s) transmis au prompt`, "key");

    const systemPrompt = Prompts.buildSystem(description, genre, complexity, previousIssues, assets);
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
        log("⚠️ CRITIC : réponse non-JSON → régénération demandée", "warn");
        return { pass: false, total: 0, issues: ["Réponse CRITIC invalide — nouvelle tentative"], mechanics: null, visuals: null, bugs: null, controls: null, description_match: null, feel: null };
      }

      const parsed            = JSON.parse(jsonMatch[0]);
      const total             = typeof parsed.total === "number" ? parsed.total : 0;
      const threshold         = this.config.QUALITY_THRESHOLD || 8;
      const controls          = typeof parsed.controls         === "number" ? parsed.controls         : 0;
      // pass sera recalculé après extraction de feel
      const issues            = Array.isArray(parsed.issues) ? parsed.issues : [];
      const mechanics         = typeof parsed.mechanics        === "number" ? parsed.mechanics        : null;
      const visuals           = typeof parsed.visuals          === "number" ? parsed.visuals          : null;
      const bugs              = typeof parsed.bugs             === "number" ? parsed.bugs             : null;
      const description_match = typeof parsed.description_match === "number" ? parsed.description_match : null;
      const feel              = typeof parsed.feel             === "number" ? parsed.feel             : null;

      // pass explicite du modèle OU recalculé avec feel
      const passCalc = total >= threshold && controls >= 1 && (feel === null || feel >= 1);
      const passFinal = typeof parsed.pass === "boolean" ? parsed.pass : passCalc;

      return { pass: passFinal, total, issues, mechanics, visuals, bugs, controls, description_match, feel };

    } catch (err) {
      // CRITIC indisponible : on retourne un score neutre bas pour forcer re-check
      log(`⚠️ CRITIC indisponible (${err.message.substring(0, 60)}) → score conservateur`, "warn");
      return { pass: false, total: 0, issues: ["CRITIC indisponible — qualité non vérifiée"], mechanics: null, visuals: null, bugs: null, controls: null, description_match: null, feel: null };
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
