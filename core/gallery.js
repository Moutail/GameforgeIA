/* ════════════════════════════════════════════════════════════════════
 *  GAMEFORGE GALLERY — Sauvegarde / historique des jeux générés
 *  Copyright (c) 2026 CHAOUSSI Cherif — Licence MIT
 *  ----------------------------------------------------------------
 *  Stockage : localStorage (clé "gf_gallery")
 *  Format   : [{ id, title, date, mode, html, spec?, thumb? }]
 *  Limites  : 20 entrées max (FIFO), ~5MB total (limite navigateur)
 *  ════════════════════════════════════════════════════════════════════ */

const Gallery = {
  KEY: "gf_gallery",
  MAX: 20,

  // ─── CRUD ─────────────────────────────────────────────────────────
  list() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || "[]"); }
    catch (e) { return []; }
  },

  save({ title, html, spec, mode, description }) {
    const items = this.list();
    const entry = {
      id: "g_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: (title || description || "Sans titre").substring(0, 60),
      description: (description || "").substring(0, 200),
      date: Date.now(),
      mode: mode || "spec",
      html: html,
      spec: spec || null,
      sizeKB: Math.round((html ? html.length : 0) / 1024)
    };
    items.unshift(entry);                       // plus récent en tête
    while (items.length > this.MAX) items.pop();
    try {
      localStorage.setItem(this.KEY, JSON.stringify(items));
      return entry;
    } catch (e) {
      // Quota dépassé : on retire le plus vieux et on retente
      items.pop();
      try { localStorage.setItem(this.KEY, JSON.stringify(items)); return entry; }
      catch (e2) { return null; }
    }
  },

  get(id) {
    return this.list().find(e => e.id === id) || null;
  },

  delete(id) {
    const items = this.list().filter(e => e.id !== id);
    localStorage.setItem(this.KEY, JSON.stringify(items));
  },

  clear() {
    localStorage.removeItem(this.KEY);
  },

  // ─── EXPORT ────────────────────────────────────────────────────────
  download(id) {
    const e = this.get(id); if (!e) return;
    const blob = new Blob([e.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (e.title.replace(/[^a-z0-9]+/gi, "_") || "game") + ".html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // ─── UI : rend la galerie dans un conteneur ───────────────────────
  render(container, onLoad) {
    const items = this.list();
    if (items.length === 0) {
      container.innerHTML = '<div class="gallery-empty">Aucun jeu sauvegardé.<br><small>Génère un jeu puis clique « ⭐ Sauvegarder ».</small></div>';
      return;
    }
    container.innerHTML = items.map(e => `
      <div class="gallery-card" data-id="${e.id}">
        <div class="gallery-card-head">
          <span class="gallery-card-title">${this._esc(e.title)}</span>
          <span class="gallery-card-mode">${e.mode === "spec" ? "🧩" : "📝"}</span>
        </div>
        <div class="gallery-card-meta">${this._fmtDate(e.date)} · ${e.sizeKB}KB</div>
        <div class="gallery-card-actions">
          <button data-act="load"     data-id="${e.id}">▶ Jouer</button>
          <button data-act="download" data-id="${e.id}">⬇ HTML</button>
          <button data-act="delete"   data-id="${e.id}" class="gallery-danger">🗑</button>
        </div>
      </div>
    `).join("");

    container.querySelectorAll("button[data-act]").forEach(b => {
      b.onclick = (ev) => {
        ev.stopPropagation();
        const act = b.dataset.act, id = b.dataset.id;
        if (act === "load")     { const e = this.get(id); if (e && onLoad) onLoad(e); }
        else if (act === "download") this.download(id);
        else if (act === "delete") {
          if (confirm("Supprimer « " + (this.get(id) || {}).title + " » ?")) {
            this.delete(id); this.render(container, onLoad);
          }
        }
      };
    });
  },

  // ─── Helpers ──────────────────────────────────────────────────────
  _esc(s) { return String(s).replace(/[<>&"']/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&#39;"}[c])); },
  _fmtDate(ts) {
    const d = new Date(ts), now = Date.now(), diff = now - ts;
    if (diff < 60000) return "à l'instant";
    if (diff < 3600000) return Math.floor(diff/60000) + " min";
    if (diff < 86400000) return Math.floor(diff/3600000) + "h";
    return d.toLocaleDateString() + " " + d.getHours() + ":" + String(d.getMinutes()).padStart(2,"0");
  },
};

window.Gallery = Gallery;
