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
  currentSpec:   null,         // spec JSON si mode spec
  currentDescription: "",
  currentMode:   "spec",
  selectedGenre: null,
  startTime:     0,
  pipeline:      null,
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
    const time = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;
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
    ["btnDownload","btnReload","btnFullscreen","btnSave","btnEditSpec"].forEach(id => {
      const el = document.getElementById(id); if (el) el.disabled = !enabled;
    });
    // btnEditSpec uniquement si on a une spec (mode spec)
    const editBtn = document.getElementById("btnEditSpec");
    if (editBtn && enabled) editBtn.disabled = !(typeof AppState !== "undefined" && AppState.currentSpec);
  },

  setGenerateBtn(generating) {
    const btn = document.getElementById("btnGenerate");
    btn.disabled    = generating;
    btn.textContent = generating ? "⟳ GÉNÉRATION..." : "▶ GÉNÉRER LE JEU";
    if (typeof MobUI !== "undefined") MobUI.setGenerating(generating);
  },

  // ── Clés Groq (autosave dans UserPrefs) ─────────────────
  validateKey(n) {
    const val = document.getElementById(`key${n}`).value.trim();
    const dot = document.getElementById(`kd${n}`);
    const ok  = val.startsWith("gsk_") && val.length > 20 && !val.includes("INSERE");
    dot.className = "key-dot" + (ok ? " ok" : "");
    if (window.UserPrefs) UserPrefs.setGroqKey(n - 1, val);
  },

  getKeysFromInputs() {
    return [1,2,3,4]
      .map(n => document.getElementById(`key${n}`).value.trim())
      .filter(k => k.startsWith("gsk_") && !k.includes("INSERE"));
  },

  // ── Clé Anthropic ────────────────────────────
  validateAnthropicKey() {
    const val = document.getElementById("anthropicKey")?.value.trim() || "";
    const dot = document.getElementById("kdClaude");
    const ok  = val.startsWith("sk-ant-") && val.length > 20;
    if (dot) dot.className = "key-dot" + (ok ? " ok" : "");
    if (window.UserPrefs) UserPrefs.setClaudeKey(val);
  },

  getAnthropicKey() {
    if (window.UserPrefs) return UserPrefs.resolveClaudeKey();
    const inputKey  = document.getElementById("anthropicKey")?.value.trim() || "";
    const configKey = GAMEFORGE_CONFIG.ANTHROPIC_API_KEY || "";
    return (inputKey.startsWith("sk-ant-") ? inputKey : null)
        || (configKey.startsWith("sk-ant-") ? configKey : null)
        || null;
  },

  // ── Clé OpenAI ─────────────────────────────────
  validateOpenAIKey() {
    const val = document.getElementById("openaiKey")?.value.trim() || "";
    const dot = document.getElementById("kdOpenAI");
    const ok  = val.startsWith("sk-") && val.length > 20;
    if (dot) dot.className = "key-dot" + (ok ? " ok" : "");
    if (window.UserPrefs) UserPrefs.setOpenAIKey(val);
  },

  getOpenAIKey() {
    if (window.UserPrefs) return UserPrefs.resolveOpenAIKey();
    const v = document.getElementById("openaiKey")?.value.trim() || "";
    return v.startsWith("sk-") ? v : null;
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

    const model    = document.getElementById("modelSelect").value;
    const provider = window.ModelRegistry ? ModelRegistry.providerOf(model) : (model.startsWith("claude-") ? "claude" : "groq");
    const isAnthropic = provider === "claude";
    const isOpenAI    = provider === "openai";

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

    } else if (isOpenAI) {
      const openaiKey = UI.getOpenAIKey();
      if (!openaiKey) {
        UI.log("❌ Clé OpenAI manquante. Ouvre la section 🟢 et entre ta clé sk-...", "error");
        UI.toggleSection("openaiKeysBody", "openaiKeysToggle");
        return;
      }
      gameClient = new OpenAIClient(openaiKey);
      UI.log(`🟢 Mode OpenAI activé — ${model}`, "key");

    } else {
      // Mode Groq (defaut + custom)
      const allKeys = window.UserPrefs ? UserPrefs.resolveGroqKeys() : (() => {
        const inputKeys  = UI.getKeysFromInputs();
        const configKeys = GAMEFORGE_CONFIG.GROQ_API_KEYS.filter(k => k && k.startsWith("gsk_") && !k.includes("INSERE"));
        return [...new Set([...inputKeys, ...configKeys])];
      })();

      if (allKeys.length === 0) {
        UI.log("❌ Aucune clé Groq valide. Ouvre la section 🔑 et colle ta clé gsk_...", "error");
        UI.toggleSection("keysBody", "keysToggle");
        return;
      }

      const rotationManager = new KeyRotationManager(allKeys);
      gameClient = new GroqClient(rotationManager);
      UI.log(`🔑 Mode Groq — ${allKeys.length} clé(s) actives — ${model}`, "key");
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
    AppState.startTime    = Date.now();
    UI.setGenerateBtn(true);
    UI.setActionsEnabled(false);
    UI.resetPipeline();
    UI.clearLog();
    UI.showOverlay("GÉNÉRATION EN COURS", "Initialisation...", "⟳", true);

    // Interface UI pour le pipeline
    const uiBridge = {
      log:        (msg, type) => UI.log(msg, type),
      setStep:    (id, state) => UI.setStep(id, state),
      setStatus:  (type, txt) => UI.setStatus(type, txt),
      setOverlay: (sub)       => UI.setOverlayStatus(sub),
      injectGame: (html)      => UI.injectGame(html),
    };

    // ── Choix du mode : spec (par défaut, fiable) vs raw (créatif) ──
    const modeEl = document.getElementById("modeSelect");
    const mode   = modeEl ? modeEl.value : "spec";
    let pipeline, result;

    if (mode === "spec" && typeof SpecPipeline !== "undefined") {
      UI.log("🧩 Mode SPEC — IA génère du JSON, le moteur fait le reste", "key");
      pipeline = new SpecPipeline(gameClient, uiBridge);
      result = await pipeline.run({ description, genre, complexity, model, fixModels, criticModel });
    } else {
      UI.log("📝 Mode RAW — IA génère du HTML brut", "key");
      // Assets utilisateur (sprites uploadés) — uniquement en mode raw
      const assets = (typeof GameAssets !== "undefined" && GameAssets.hasAssets())
        ? GameAssets.getAll() : null;
      if (assets) UI.log(`🖼️ ${Object.keys(assets).length} asset(s) injectés`, "key");
      pipeline = new GameForgePipeline(gameClient, uiBridge);
      result = await pipeline.run({ description, genre, complexity, model, fixModels, criticModel, assets });
    }

    // Résultat
    AppState.isGenerating = false;
    UI.setGenerateBtn(false);

    const elapsed = ((Date.now() - AppState.startTime) / 1000).toFixed(1);

    if (result.success || result.html) {
      AppState.currentHTML        = result.html;
      AppState.currentSpec        = result.spec || null;
      AppState.currentDescription = description;
      AppState.currentMode        = result.mode || mode;
      UI.setActionsEnabled(true);
      document.getElementById("previewTitle").textContent =
        `🎮 ${description.substring(0, 45)}${description.length > 45 ? "..." : ""}`;

      const maxScore = result.mode === "spec" ? 8 : 14;
      if (result.success) {
        UI.hideOverlay();
        UI.log(`⏱ Terminé en ${elapsed}s — Score: ${result.score ?? "?"}/${maxScore}`, "success");
        if (typeof MobUI !== "undefined") MobUI.onGameReady();
      } else {
        UI.showOverlay(
          "GÉNÉRATION PARTIELLE",
          `${result.attempts || "?"} essai(s) — Score: ${result.score ?? 0}/${maxScore}\nCode dispo au téléchargement.`,
          "⚠️"
        );
        UI.log(`⏱ Terminé en ${elapsed}s (partiel) — Score: ${result.score ?? 0}/${maxScore}`, "warn");
      }
    } else {
      UI.log(`❌ Génération échouée en ${elapsed}s`, "error");
    }
  },

  // ── Rechargement ──────────────────────────────────────
  reload() {
    if (!AppState.currentHTML) return;
    UI.log("↺ Rechargement...", "info");
    UI.injectGame(AppState.currentHTML);
  },

  // ── Sauvegarde dans la galerie ─────────────────────
  saveToGallery() {
    if (!AppState.currentHTML) return;
    if (typeof Gallery === "undefined") { UI.log("⚠ Module Gallery indisponible", "warn"); return; }
    const entry = Gallery.save({
      title:       AppState.currentDescription.split(".")[0].substring(0, 60),
      description: AppState.currentDescription,
      html:        AppState.currentHTML,
      spec:        AppState.currentSpec,
      mode:        AppState.currentMode,
    });
    if (entry) {
      UI.log(`⭐ Sauvegardé dans la galerie (${entry.sizeKB}KB)`, "success");
      App.refreshGallery();
    } else {
      UI.log("❌ Sauvegarde impossible (quota localStorage)", "error");
    }
  },

  // ── Recharge un jeu depuis la galerie ─────────────────
  loadFromGallery(entry) {
    if (!entry) return;
    AppState.currentHTML        = entry.html;
    AppState.currentSpec        = entry.spec || null;
    AppState.currentDescription = entry.description || entry.title;
    AppState.currentMode        = entry.mode || "spec";
    UI.injectGame(entry.html);
    UI.setActionsEnabled(true);
    UI.hideOverlay();
    document.getElementById("previewTitle").textContent = `🎮 ${entry.title}`;
    UI.log(`▶ Chargement depuis galerie : ${entry.title}`, "success");
    if (typeof MobUI !== "undefined") MobUI.onGameReady();
  },

  // ── Refresh du panneau galerie ─────────────────────
  refreshGallery() {
    if (typeof Gallery === "undefined") return;
    const list  = document.getElementById("galleryList");
    const count = document.getElementById("galleryCount");
    if (count) count.textContent = Gallery.list().length;
    if (list)  Gallery.render(list, (entry) => App.loadFromGallery(entry));
  },

  // ── Téléchargement ────────────────────────────
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

  // ══════════════════════════════════════════════════════
  //  ONBOARDING (1re visite)
  // ══════════════════════════════════════════════════════
  showOnboarding() {
    const m = document.getElementById("onboardModal");
    if (m) m.classList.add("open");
  },

  _hideOnboarding() {
    document.getElementById("onboardModal")?.classList.remove("open");
  },

  completeOnboarding() {
    const groq   = document.getElementById("onboardGroqKey")?.value.trim()   || "";
    const claude = document.getElementById("onboardClaudeKey")?.value.trim() || "";
    const openai = document.getElementById("onboardOpenAIKey")?.value.trim() || "";

    let saved = 0;
    if (groq.startsWith("gsk_")) {
      const key1 = document.getElementById("key1");
      if (key1) { key1.value = groq; UI.validateKey(1); }
      saved++;
    }
    if (claude.startsWith("sk-ant-")) {
      const el = document.getElementById("anthropicKey");
      if (el) { el.value = claude; UI.validateAnthropicKey(); }
      saved++;
    }
    if (openai.startsWith("sk-")) {
      const el = document.getElementById("openaiKey");
      if (el) { el.value = openai; UI.validateOpenAIKey(); }
      saved++;
    }

    if (saved === 0) {
      UI.log("⚠ Aucune clé valide saisie — passe par la sidebar plus tard.", "warn");
    } else {
      UI.log(`✅ ${saved} clé(s) enregistrée(s) localement`, "success");
    }
    if (window.UserPrefs) UserPrefs.markOnboarded();
    this._hideOnboarding();
  },

  skipOnboarding() {
    if (window.UserPrefs) UserPrefs.markOnboarded();
    this._hideOnboarding();
    UI.log("ℹ Onboarding ignoré. Ajoute tes clés dans la sidebar quand tu veux.", "info");
  },

  // ══════════════════════════════════════════════════════
  //  MODÈLE CUSTOM (utilisateur ajoute son propre modèle)
  // ══════════════════════════════════════════════════════
  openCustomModelDialog() {
    document.getElementById("customModelModal")?.classList.add("open");
    document.getElementById("customModelId")?.focus();
  },

  closeCustomModelDialog() {
    document.getElementById("customModelModal")?.classList.remove("open");
    ["customModelId","customModelLabel","customModelOut"].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
  },

  saveCustomModel() {
    const id       = document.getElementById("customModelId").value.trim();
    const label    = document.getElementById("customModelLabel").value.trim() || id;
    const provider = document.getElementById("customModelProvider").value;
    const out      = parseInt(document.getElementById("customModelOut").value, 10) || 4000;

    if (!id) { UI.log("❌ ID du modèle requis", "error"); return; }
    if (!window.UserPrefs || !window.ModelRegistry) { UI.log("⚠ Modules indisponibles", "warn"); return; }

    UserPrefs.addCustomModel({ id, label: label + " (custom)", provider, ctx: 32768, out, tier: "paid" });
    UI.log(`✅ Modèle ajouté : ${label} (${provider})`, "success");
    rebuildModelDropdown();
    document.getElementById("modelSelect").value = id;
    this.closeCustomModelDialog();
  },
};

// ══════════════════════════════════════════════════════════
//  REBUILD MODEL DROPDOWN — depuis ModelRegistry
// ══════════════════════════════════════════════════════════
function rebuildModelDropdown() {
  const sel = document.getElementById("modelSelect");
  if (!sel) return;
  const previous = sel.value;
  sel.innerHTML = "";

  if (!window.ModelRegistry) {
    // Fallback : juste les Groq depuis config
    Object.values(GAMEFORGE_CONFIG.MODELS).forEach(v => {
      const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o);
    });
    return;
  }

  const groups = [
    { label: "── GROQ (gratuit) ──",      models: ModelRegistry.byProvider("groq").filter(m => m.tier === "free") },
    { label: "── GROQ (payant) ──",       models: ModelRegistry.byProvider("groq").filter(m => m.tier === "paid") },
    { label: "── CLAUDE (Anthropic) ──",  models: ModelRegistry.byProvider("claude") },
    { label: "── OPENAI ──",              models: ModelRegistry.byProvider("openai") },
  ];

  // Custom user models
  const customs = ModelRegistry.all().filter(m => !ModelRegistry.CATALOG.includes(m));
  if (customs.length) groups.push({ label: "── CUSTOM ──", models: customs });

  groups.forEach(g => {
    if (!g.models.length) return;
    const og = document.createElement("optgroup");
    og.label = g.label;
    g.models.forEach(m => {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.label;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });

  // Restaure la sélection précédente, sinon Llama 3.3 70B par défaut
  sel.value = previous || "llama-3.3-70b-versatile";
  if (!sel.value) sel.value = sel.options[0]?.value || "";
}

// ══════════════════════════════════════════════════════════
//  MOBUI — Contrôleur interface mobile (v2)
// ══════════════════════════════════════════════════════════
const MobUI = {
  _mode: "prompt",   // "prompt" | "game"
  _drawerOpen: false,

  isMobile() { return window.innerWidth <= 640; },

  init() {
    if (!this.isMobile()) return;

    // Déplacer les sections paramètres dans le drawer (pas cloner — évite IDs dupliqués)
    const drawerContent = document.getElementById("mobDrawerContent");
    if (drawerContent) {
      ["keysSection", "claudeSection", "assetsSection"].forEach(id => {
        const el = document.getElementById(id);
        if (el) drawerContent.appendChild(el);   // move, not clone
      });
      // Ouvrir la section clés par défaut dans le drawer
      const kb = document.getElementById("keysBody");
      if (kb) kb.style.maxHeight = "500px";
      const kt = document.getElementById("keysToggle");
      if (kt) kt.classList.remove("collapsed");
    }

    this.setMode("prompt");

    // Resize : si on passe desktop → reset
    window.addEventListener("resize", () => {
      if (!this.isMobile()) {
        const sb = document.querySelector(".sidebar");
        if (sb) { sb.classList.remove("mob-hidden"); sb.style.display = ""; }
      }
    });
  },

  // Mode "prompt" → montre formulaire + FAB Générer
  // Mode "game"   → montre jeu plein écran + FAB Retour
  setMode(mode) {
    this._mode = mode;
    const sidebar = document.querySelector(".sidebar");
    const fab     = document.getElementById("mobFab");

    if (mode === "game") {
      // Glisse la sidebar hors écran — la preview (toujours rendue) devient visible
      if (sidebar) sidebar.classList.add("mob-hidden");
      if (fab) {
        fab.textContent = "✏️  NOUVEAU JEU";
        fab.classList.add("mob-fab-game");
        fab.disabled = false;
      }
    } else {
      // Ramène la sidebar
      if (sidebar) sidebar.classList.remove("mob-hidden");
      if (fab) {
        fab.textContent = "▶  GÉNÉRER";
        fab.classList.remove("mob-fab-game");
        fab.disabled = false;
      }
    }
  },

  // Appelé par le FAB selon le mode
  fabAction() {
    if (this._mode === "game") {
      this.setMode("prompt");
    } else {
      App.generate();
    }
  },

  // Drawer paramètres
  openSettings() {
    if (!this.isMobile()) return;
    this._drawerOpen = true;
    document.getElementById("mobDrawer").classList.add("open");
  },

  closeSettings() {
    this._drawerOpen = false;
    document.getElementById("mobDrawer").classList.remove("open");
  },

  // Appelé quand un jeu est prêt
  onGameReady() {
    if (this.isMobile()) this.setMode("game");
  },

  // Sync du FAB pendant la génération
  setGenerating(on) {
    if (!this.isMobile()) return;
    const fab = document.getElementById("mobFab");
    if (!fab) return;
    if (on) {
      // Pendant la génération : retour au prompt, FAB désactivé
      this.setMode("prompt");
      fab.disabled    = true;
      fab.textContent = "⟳  GÉNÉRATION...";
    } else {
      fab.disabled = false;
    }
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

  // Construction du dropdown depuis ModelRegistry (groupé par provider/tier)
  rebuildModelDropdown();

  // Auto-déplier la section de clé du provider sélectionné
  const modelSelect = document.getElementById("modelSelect");
  modelSelect.addEventListener("change", () => {
    const provider = window.ModelRegistry ? ModelRegistry.providerOf(modelSelect.value) : "groq";
    const sections = {
      groq:   ["keysBody",       "keysToggle"],
      claude: ["claudeKeysBody", "claudeKeysToggle"],
      openai: ["openaiKeysBody", "openaiKeysToggle"],
    };
    const [bodyId, toggleId] = sections[provider] || sections.groq;
    const body = document.getElementById(bodyId);
    const toggle = document.getElementById(toggleId);
    if (body && body.style.maxHeight === "0px") {
      body.style.maxHeight = "500px";
      toggle?.classList.remove("collapsed");
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
  if (typeof MobUI !== "undefined") MobUI.init();

  // Pré-remplir les inputs depuis localStorage (UserPrefs)
  if (window.UserPrefs) {
    const prefs = UserPrefs.load();
    prefs.groqKeys.forEach((k, i) => {
      const el = document.getElementById(`key${i+1}`);
      if (el && k) { el.value = k; UI.validateKey(i+1); }
    });
    if (prefs.claudeKey) {
      const el = document.getElementById("anthropicKey");
      if (el) { el.value = prefs.claudeKey; UI.validateAnthropicKey(); }
    }
    if (prefs.openaiKey) {
      const el = document.getElementById("openaiKey");
      if (el) { el.value = prefs.openaiKey; UI.validateOpenAIKey(); }
    }
  }

  // Statut des clés au démarrage
  const groqKeys   = window.UserPrefs ? UserPrefs.resolveGroqKeys()   : GAMEFORGE_CONFIG.GROQ_API_KEYS.filter(k => k && !k.includes("INSERE"));
  const claudeKey  = window.UserPrefs ? UserPrefs.resolveClaudeKey()  : (GAMEFORGE_CONFIG.ANTHROPIC_API_KEY || null);
  const openaiKey  = window.UserPrefs ? UserPrefs.resolveOpenAIKey()  : null;

  if (groqKeys.length > 0)  UI.log(`🔑 ${groqKeys.length} clé(s) Groq disponible(s)`, "key");
  if (claudeKey)            { UI.log("🟣 Clé Claude OK",  "key"); document.getElementById("kdClaude")?.classList.add("ok"); }
  if (openaiKey)            { UI.log("🟢 Clé OpenAI OK",  "key"); document.getElementById("kdOpenAI")?.classList.add("ok"); }
  if (groqKeys.length === 0 && !claudeKey && !openaiKey) {
    UI.log("⚠️ Aucune clé. Le tutoriel d'onboarding va te guider.", "warn");
  }

  // Onboarding modal si première visite + aucune clé
  if (window.UserPrefs && UserPrefs.shouldOnboard()) {
    setTimeout(() => App.showOnboarding(), 300);
  }

  // ── Galerie : afficher les jeux sauvegardés ──
  if (typeof Gallery !== "undefined") {
    App.refreshGallery();
    const n = Gallery.list().length;
    if (n > 0) UI.log(`⭐ Galerie : ${n} jeu(x) sauvegardé(s)`, "info");
  }

  // ── Sidebar resizable (drag + localStorage) ──
  initSidebarResizer();
}

// ══════════════════════════════════════════════════════════
//  SIDEBAR RESIZER — drag pour ajuster la largeur
// ══════════════════════════════════════════════════════════
function initSidebarResizer() {
  const handle = document.getElementById("sidebarResizer");
  if (!handle) return;
  const root = document.documentElement;
  const MIN = 260, MAX = 640, KEY = "gf_sidebar_w";

  // Restaure la largeur sauvegardée
  const saved = parseInt(localStorage.getItem(KEY), 10);
  if (saved && saved >= MIN && saved <= MAX) root.style.setProperty("--sidebar-w", saved + "px");

  let dragging = false;

  const onMove = (e) => {
    if (!dragging) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const w = Math.max(MIN, Math.min(MAX, x));
    root.style.setProperty("--sidebar-w", w + "px");
    e.preventDefault();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("resizing");
    handle.classList.remove("active");
    const w = parseInt(getComputedStyle(root).getPropertyValue("--sidebar-w"), 10);
    if (w) localStorage.setItem(KEY, w);
  };
  const onDown = (e) => {
    dragging = true;
    document.body.classList.add("resizing");
    handle.classList.add("active");
    e.preventDefault();
  };

  handle.addEventListener("mousedown",  onDown);
  handle.addEventListener("touchstart", onDown, { passive:false });
  window.addEventListener("mousemove",  onMove);
  window.addEventListener("touchmove",  onMove, { passive:false });
  window.addEventListener("mouseup",    onUp);
  window.addEventListener("touchend",   onUp);

  // Double-clic = reset à 340px
  handle.addEventListener("dblclick", () => {
    root.style.setProperty("--sidebar-w", "340px");
    localStorage.removeItem(KEY);
  });
}

// Lance l'init au chargement
init();
