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
    ["keys","gen","validate","sandbox","fix","done"].forEach(s => this.setStep(s, "idle"));
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

  // ── Clés ──────────────────────────────────────────────
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

    // Récupère les clés depuis les inputs ET depuis config.js
    const inputKeys  = UI.getKeysFromInputs();
    const configKeys = GAMEFORGE_CONFIG.GROQ_API_KEYS.filter(
      k => k && k.startsWith("gsk_") && !k.includes("INSERE")
    );
    const allKeys = [...new Set([...inputKeys, ...configKeys])];

    if (allKeys.length === 0) {
      UI.log("❌ Aucune clé Groq valide. Ajoute tes clés dans config.js ou dans les inputs.", "error");
      return;
    }

    const description = document.getElementById("promptInput").value.trim();
    if (!description) {
      UI.log("❌ Description vide. Décris ton jeu.", "error");
      return;
    }

    const model      = document.getElementById("modelSelect").value;
    const complexity = document.getElementById("complexitySelect").value;
    const genre      = AppState.selectedGenre || GAMEFORGE_CONFIG.GENRES[0].id;

    // Reset
    AppState.isGenerating = true;
    AppState.currentHTML  = null;
    UI.setGenerateBtn(true);
    UI.setActionsEnabled(false);
    UI.resetPipeline();
    UI.showOverlay("GÉNÉRATION EN COURS", "Initialisation...", "⟳", true);

    // Crée les instances
    const rotationManager = new KeyRotationManager(allKeys);
    const groqClient      = new GroqClient(rotationManager);

    // Interface UI pour le pipeline
    const uiBridge = {
      log:        (msg, type) => UI.log(msg, type),
      setStep:    (id, state) => UI.setStep(id, state),
      setStatus:  (type, txt) => UI.setStatus(type, txt),
      setOverlay: (sub)       => UI.setOverlayStatus(sub),
      injectGame: (html)      => UI.injectGame(html),
    };

    const pipeline = new GameForgePipeline(groqClient, uiBridge);

    // Lance le pipeline
    const result = await pipeline.run({ description, genre, complexity, model });

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

  // Modèles depuis config.js
  const modelSelect = document.getElementById("modelSelect");
  Object.entries(GAMEFORGE_CONFIG.MODELS).forEach(([key, val]) => {
    const opt = document.createElement("option");
    opt.value       = val;
    opt.textContent = val.split("-").slice(0, 3).join("-");
    if (key === "MAIN") opt.selected = true;
    modelSelect.appendChild(opt);
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

  // Avertissement si aucune clé en config
  const configKeys = GAMEFORGE_CONFIG.GROQ_API_KEYS.filter(
    k => k && !k.includes("INSERE")
  );
  if (configKeys.length === 0) {
    UI.log("⚠️ Aucune clé dans config.js — utilise les inputs ou édite config.js", "warn");
  } else {
    UI.log(`🔑 ${configKeys.length} clé(s) chargée(s) depuis config.js`, "key");
  }
}

// Lance l'init au chargement
init();
