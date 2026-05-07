/* ════════════════════════════════════════════════════════════════════
 *  SPEC EDITOR — Édite la spec JSON et recompile en live
 *  Copyright (c) 2026 CHAOUSSI Cherif — Licence MIT
 *  ----------------------------------------------------------------
 *  Modal overlay avec textarea JSON + bouton Recompile + Reset
 *  Travaille sur AppState.currentSpec (stocké après chaque génération spec)
 *  ════════════════════════════════════════════════════════════════════ */

const SpecEditor = {

  _modal: null,
  _ta: null,
  _statusEl: null,

  // ─── Crée le modal une seule fois ─────────────────────────────────
  _build() {
    if (this._modal) return;
    const m = document.createElement("div");
    m.id = "specEditorModal";
    m.className = "spec-editor-modal";
    m.innerHTML = `
      <div class="spec-editor-box">
        <div class="spec-editor-head">
          <span class="spec-editor-title">✎ ÉDITEUR DE SPEC LIVE</span>
          <span class="spec-editor-status" id="specEditorStatus"></span>
          <button class="spec-editor-close" onclick="SpecEditor.close()">✕ Fermer</button>
        </div>
        <textarea class="spec-editor-textarea" id="specEditorTA" spellcheck="false"></textarea>
        <div class="spec-editor-actions">
          <button class="spec-editor-btn"         onclick="SpecEditor.format()">{ } Formater</button>
          <button class="spec-editor-btn"         onclick="SpecEditor.reset()">↺ Reset</button>
          <button class="spec-editor-btn primary" onclick="SpecEditor.recompile()">▶ Recompiler & Tester</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    this._modal    = m;
    this._ta       = document.getElementById("specEditorTA");
    this._statusEl = document.getElementById("specEditorStatus");
    // Ferme via Échap
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this._modal.classList.contains("open")) this.close();
    });
  },

  // ─── API publique ─────────────────────────────────────────────────
  open() {
    this._build();
    const spec = (typeof AppState !== "undefined" && AppState.currentSpec) ? AppState.currentSpec : null;
    if (!spec) {
      this._setStatus("Aucune spec — génère un jeu en mode 🧩 Spec d'abord", "err");
      this._ta.value = "{}";
    } else {
      this._original = JSON.stringify(spec, null, 2);
      this._ta.value = this._original;
      this._setStatus("Édite et clique Recompiler", "ok");
    }
    this._modal.classList.add("open");
    setTimeout(() => this._ta.focus(), 50);
  },

  close() {
    if (this._modal) this._modal.classList.remove("open");
  },

  format() {
    try {
      const obj = JSON.parse(this._ta.value);
      this._ta.value = JSON.stringify(obj, null, 2);
      this._setStatus("✓ JSON valide formaté", "ok");
    } catch (e) {
      this._setStatus("⚠ JSON invalide : " + e.message, "err");
    }
  },

  reset() {
    if (!this._original) return;
    this._ta.value = this._original;
    this._setStatus("↺ Spec restaurée", "ok");
  },

  async recompile() {
    let spec;
    try { spec = JSON.parse(this._ta.value); }
    catch (e) { this._setStatus("⚠ JSON invalide : " + e.message, "err"); return; }

    this._setStatus("⟳ Compilation...", "info");
    try {
      const result = await SpecCompiler.compile(spec);
      AppState.currentHTML = result.html;
      AppState.currentSpec = result.spec;
      UI.injectGame(result.html);
      this._setStatus(`✓ Recompilé — ${result.spec.levels.length} niveau(x) · ${result.issues.length} pb`, result.issues.length ? "warn" : "ok");
      // Si en mode mobile, basculer sur le jeu
      if (typeof MobUI !== "undefined" && MobUI.isMobile && MobUI.isMobile()) MobUI.onGameReady();
    } catch (e) {
      this._setStatus("⚠ Erreur compilation : " + e.message, "err");
    }
  },

  _setStatus(msg, kind) {
    if (!this._statusEl) return;
    this._statusEl.textContent = msg;
    this._statusEl.className = "spec-editor-status spec-editor-status-" + (kind || "info");
  },
};

window.SpecEditor = SpecEditor;
