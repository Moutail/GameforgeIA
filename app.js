// ============================================================
//  GAMEFORGE AI — app.js
//  Contrôleur principal : relie l'UI aux modules core
//  Dépend de : config.js + tous les modules core/
//  C'est le seul fichier qui touche au DOM directement
// ============================================================

// ── ÉTAT GLOBAL ───────────────────────────────────────────
const AppState = {
  isGenerating:  false,
  currentHTML:   null,
  selectedGenre: null,
  pipeline:      null,  // Instance GameForgePipeline
};

// ══════════════════════════════════════════════════════════
//  UI — Composant d'interface
//  Toutes les manipulations DOM sont centralisées ici
// ══════════════════════════════════════════════════════════
const UI = {

  // ── Log ────────────────────────────────────────────────
  log(msg, type = "info") {
    const body = document.getElementById("logBody");
    const now  = new Date();
    const time = `${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;
    const el   = document.createElement("div");
    el.className = "log-entry";
    el.innerHTML = `<span class="log-time">${time}</span><span class="log-msg ${type}">${msg}</span>`;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  },

  clearLog() {
    document.getElementById("logBody").innerHTML = "";
  },

  // ── Pipeline steps ────────────────────────────────────
  setStep(id, state) {
    const el = document.getElementById(`ps-${id}`);
    if (!el) return;
    el.className = "pipe-step" + (state !== "idle" ? ` ${state}` : "");
  },

  resetPipeline() {
    ["keys","gen","validate","sandbox","quality","fix","done"].forEach(s => this.setStep(s, "idle"));
  },

  // ── Status bar ────────────────────────────────────────
  setStatus(type, text) {
    document.getElementById("statusDot").className  = `status-dot${type ? " " + type : ""}`;
    document.getElementById("statusText").textContent = text;
  },

  // ── Overlay ───────────────────────────────────────────
  showOverlay(title, sub, icon = "⟳", spinning = false) {
    document.getElementById("overlayIcon").innerHTML  = spinning ? `<span class="spinner">${icon}</span>` : icon;
    document.getElementById("overlayTitle").textContent = title;
    document.getElementById("overlaySub").textContent   = sub;
    document.getElementById("overlay").classList.remove("hidden");
  },

  hideOverlay() {
    document.getElementById("overlay").classList.add("hidden");
  },

  setOverlayStatus(sub) {
    const el = document.getElementById("overlaySub");
    if (el) el.textContent = sub;
  },

  // ── Iframe ────────────────────────────────────────────
  injectGame(html) {
    document.getElementById("gameFrame").srcdoc = html;
  },

  // ── Boutons action ────────────────────────────────────
  setActionsEnabled(enabled) {
    ["btnDownload","btnReload","btnFullscreen"].forEach(id => {
      document.getElementById(id).disabled = !enabled;
    });
  },

  setGenerateBtn(generating) {
    const btn = document.getElementById("btnGenerate");
    btn.disabled    = generating;
    btn.textContent = generating ? "⟳ GÉNÉRATION..." : "▶ GÉNÉRER LE JEU";
  },

  // ── Clés Groq ─────────────────────────────────────────
  validateKey(n) {
    const val = document.getElementById(`key${n}`).value.trim();
    const dot = document.getElementById(`kd${n}`);
    const ok  = val.startsWith("gsk_") && val.length > 20 && !val.includes("INSERE");
    dot.className = "key-dot" + (ok ? " ok" : "");
  },

  getKeysFromInputs() {
    return [1,2,3,4]
      .map(n => document.getElementById(`key${n}`).value.trim())
      .filter(k => k.startsWith("gsk_") && !k.includes("INSERE"));
  },

  // ── Clé Anthropic ─────────────────────────────────────
  validateAnthropicKey() {
    const val = document.getElementById("anthropicKey")?.value.trim() || "";
    const dot = document.getElementById("kdClaude");
    const ok  = val.startsWith("sk-ant-") && val.length > 20;
    if (dot) dot.className = "key-dot" + (ok ? " ok" : "");
  },

  getAnthropicKey() {
    const inputKey  = document.getElementById("anthropicKey")?.value.trim() || "";
    const configKey = GAMEFORGE_CONFIG.ANTHROPIC_API_KEY || "";
    return (inputKey.startsWith("sk-ant-") ? inputKey : null)
        || (configKey.startsWith("sk-ant-") ? configKey : null)
        || null;
  },

  // ── Sections ──────────────────────────────────────────
  toggleSection(bodyId, toggleId) {
    const body    = document.getElementById(bodyId);
    const toggle  = document.getElementById(toggleId);
    const isHidden = body.style.maxHeight === "0px" || body.style.maxHeight === "";

    if (isHidden) {
      body.style.maxHeight = "500px";
      toggle.classList.remove("collapsed");
    } else {
      body.style.maxHeight = "0px";
      toggle.classList.add("collapsed");
    }
  },
};

// ══════════════════════════════════════════════════════════
//  APP — Contrôleur applicatif
// ══════════════════════════════════════════════════════════
const App = {

  // ── Génération principale ─────────────────────────────
  async generate() {
    if (AppState.isGenerating) return;

    const model      = document.getElementById("modelSelect").value;
    const isAnthropic = model.startsWith("claude-");

    // ── Validation des clés selon le provider ─────────
    let gameClient;

    if (isAnthropic) {
      const anthropicKey = UI.getAnthropicKey();
      if (!anthropicKey) {
        UI.log("❌ Clé Claude manquante. Ouvre la section 🟣 et entre ta clé sk-ant-...", "error");
        UI.toggleSection("claudeKeysBody", "claudeKeysToggle");
        return;
      }
      gameClient = new AnthropicClient(anthropicKey);
      UI.log(`🟣 Mode Claude activé — ${model}`, "key");

    } else {
      // Mode Groq
      const inputKeys  = UI.getKeysFromInputs();
      const configKeys = GAMEFORGE_CONFIG.GROQ_API_KEYS.filter(
        k => k && k.startsWith("gsk_") && !k.includes("INSERE")
      );
      const allKeys = [...new Set([...inputKeys, ...configKeys])];

      if (allKeys.length === 0) {
        UI.log("❌ Aucune clé Groq valide. Ajoute tes clés dans config.js ou dans les inputs.", "error");
        return;
      }

      const rotationManager = new KeyRotationManager(allKeys);
      gameClient = new GroqClient(rotationManager);
    }

    const description = document.getElementById("promptInput").value.trim();
    if (!description) {
      UI.log("❌ Description vide. Décris ton jeu.", "error");
      return;
    }

    const complexity = document.getElementById("complexitySelect").value;
    const genre      = AppState.selectedGenre || GAMEFORGE_CONFIG.GENRES[0].id;

    // Modèles de fix et critique selon le provider
    const fixModels  = isAnthropic
      ? [GAMEFORGE_CONFIG.ANTHROPIC_MODELS.FAST_FIX, GAMEFORGE_CONFIG.ANTHROPIC_MODELS.FAST_FIX]
      : [GAMEFORGE_CONFIG.MODELS.FAST_FIX, GAMEFORGE_CONFIG.MODELS.LONG_CTX];

    const criticModel = isAnthropic
      ? GAMEFORGE_CONFIG.ANTHROPIC_MODELS.CRITIC
      : GAMEFORGE_CONFIG.MODELS.CRITIC;

    // Reset UI
    AppState.isGenerating = true;
    AppState.currentHTML  = null;
    UI.setGenerateBtn(true);
    UI.setActionsEnabled(false);
    UI.resetPipeline();
    UI.showOverlay("GÉNÉRATION EN COURS", "Initialisation...", "⟳", true);

    // Interface UI pour le pipeline
    const uiBridge = {
      log:        (msg, type) => UI.log(msg, type),
      setStep:    (id, state) => UI.setStep(id, state),
      setStatus:  (type, txt) => UI.setStatus(type, txt),
      setOverlay: (sub)       => UI.setOverlayStatus(sub),
      injectGame: (html)      => UI.injectGame(html),
    };

    const pipeline = new GameForgePipeline(gameClient, uiBridge);

    // Lance le pipeline
    const result = await pipeline.run({ description, genre, complexity, model, fixModels, criticModel });

    // Résultat
    AppState.isGenerating = false;
    UI.setGenerateBtn(false);

    if (result.success || result.html) {
      AppState.currentHTML = result.html;
      UI.setActionsEnabled(true);
      document.getElementById("previewTitle").textContent =
        `🎮 ${description.substring(0, 45)}${description.length > 45 ? "..." : ""}`;

      if (result.success) {
        UI.hideOverlay();
      } else {
        UI.showOverlay(
          "GÉNÉRATION PARTIELLE",
          `Erreur après ${result.attempts} essais. Code dispo au téléchargement.`,
          "⚠️"
        );
      }
    }
  },

  // ── Rechargement ──────────────────────────────────────
  reload() {
    if (!AppState.currentHTML) return;
    UI.log("↺ Rechargement...", "info");
    UI.injectGame(AppState.currentHTML);
  },

  // ── Téléchargement ────────────────────────────────────
  download() {
    if (!AppState.currentHTML) return;
    const genre  = AppState.selectedGenre || "game";
    const ts     = new Date().toISOString().slice(0,10);
    const blob   = new Blob([AppState.currentHTML], { type: "text/html" });
    const a      = document.createElement("a");
    a.href       = URL.createObjectURL(blob);
    a.download   = `gameforge-${genre}-${ts}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    UI.log("⬇ Jeu téléchargé !", "success");
  },

  // ── Plein écran ───────────────────────────────────────
  fullscreen() {
    const frame = document.getElementById("gameFrame");
    if (frame.requestFullscreen)       frame.requestFullscreen();
    else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen();
  },
};

// ══════════════════════════════════════════════════════════
//  INIT — Construit l'UI dynamiquement depuis config.js
// ══════════════════════════════════════════════════════════
function init() {
  // Genres depuis config.js
  const genreGrid = document.getElementById("genreGrid");
  GAMEFORGE_CONFIG.GENRES.forEach((g, i) => {
    const btn = document.createElement("button");
    btn.className = "genre-btn" + (i === 0 ? " active" : "");
    btn.textContent = `${g.icon} ${g.label}`;
    btn.onclick = () => {
      document.querySelectorAll(".genre-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      AppState.selectedGenre = g.id;
    };
    genreGrid.appendChild(btn);
    if (i === 0) AppState.selectedGenre = g.id;
  });

  // Modèles dans le dropdown — groupés par provider
  const modelSelect = document.getElementById("modelSelect");

  // Groupe Groq (gratuit)
  const groqGroup = document.createElement("optgroup");
  groqGroup.label = "── GROQ (gratuit) ──";
  const groqLabels = { MAIN: "llama-3.3-70b ★", FAST_FIX: "llama-3.1-8b (rapide)", LONG_CTX: "mixtral-8x7b (contexte)", CRITIC: "gemma2-9b (critique)" };
  Object.entries(GAMEFORGE_CONFIG.MODELS).forEach(([key, val]) => {
    const opt = document.createElement("option");
    opt.value       = val;
    opt.textContent = groqLabels[key] || val.split("-").slice(0,3).join("-");
    if (key === "MAIN") opt.selected = true;
    groqGroup.appendChild(opt);
  });
  modelSelect.appendChild(groqGroup);

  // Groupe Claude (payant)
  const claudeGroup = document.createElement("optgroup");
  claudeGroup.label = "── CLAUDE (payant) ──";
  const claudeOptions = [
    { val: GAMEFORGE_CONFIG.ANTHROPIC_MODELS.MAIN,     label: "claude-sonnet ★ (recommandé)" },
    { val: GAMEFORGE_CONFIG.ANTHROPIC_MODELS.FAST_FIX, label: "claude-haiku (rapide/économique)" },
    { val: GAMEFORGE_CONFIG.ANTHROPIC_MODELS.OPUS,     label: "claude-opus (max qualité)" },
  ];
  claudeOptions.forEach(({ val, label }) => {
    const opt = document.createElement("option");
    opt.value       = val;
    opt.textContent = label;
    claudeGroup.appendChild(opt);
  });
  modelSelect.appendChild(claudeGroup);

  // Afficher/masquer la section Claude selon le modèle sélectionné
  modelSelect.addEventListener("change", () => {
    const isClaude = modelSelect.value.startsWith("claude-");
    const claudeSection = document.getElementById("claudeKeysBody");
    const claudeToggle  = document.getElementById("claudeKeysToggle");
    if (isClaude && claudeSection.style.maxHeight === "0px") {
      claudeSection.style.maxHeight = "500px";
      claudeToggle.classList.remove("collapsed");
    }
  });

  // Raccourci clavier
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      App.generate();
    }
  });

  UI.log(`${GAMEFORGE_CONFIG.APP_NAME} v${GAMEFORGE_CONFIG.VERSION} initialisé`, "success");
  UI.log("Ctrl+Entrée pour générer rapidement", "info");

  // Statut des clés au démarrage
  const configGroqKeys = GAMEFORGE_CONFIG.GROQ_API_KEYS.filter(k => k && !k.includes("INSERE"));
  const configClaudeKey = GAMEFORGE_CONFIG.ANTHROPIC_API_KEY;

  if (configGroqKeys.length > 0) {
    UI.log(`🔑 ${configGroqKeys.length} clé(s) Groq chargée(s) depuis config.js`, "key");
  }
  if (configClaudeKey && configClaudeKey.startsWith("sk-ant-")) {
    UI.log("🟣 Clé Claude chargée depuis config.js", "key");
    // Valider le dot
    const dot = document.getElementById("kdClaude");
    if (dot) dot.className = "key-dot ok";
  }
  if (configGroqKeys.length === 0 && !configClaudeKey) {
    UI.log("⚠️ Aucune clé trouvée. Ajoute une clé Groq ou Claude.", "warn");
  }
}

// Lance l'init au chargement
init();
