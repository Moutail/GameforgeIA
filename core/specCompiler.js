/* ════════════════════════════════════════════════════════════════════
 *  SPEC COMPILER — Compile une spec JSON + le runtime en un HTML jouable
 *  Copyright (c) 2026 CHAOUSSI Cherif — Licence MIT
 *  ----------------------------------------------------------------
 *  Entrée : objet GAME_SPEC + runtime.js (chargé depuis disque)
 *  Sortie : HTML autonome, single-file, mobile-ready
 *  ════════════════════════════════════════════════════════════════════ */

const SpecCompiler = {

  // Cache du moteur (chargé une seule fois)
  _engineCache: null,
  _spritesCache: null,

  async loadEngine() {
    if (this._engineCache && this._spritesCache) {
      return { sprites: this._spritesCache, runtime: this._engineCache };
    }
    try {
      const [sRes, rRes] = await Promise.all([
        fetch("engine/sprites.js"),
        fetch("engine/runtime.js"),
      ]);
      if (!sRes.ok || !rRes.ok) throw new Error("HTTP " + sRes.status + "/" + rRes.status);
      this._spritesCache = await sRes.text();
      this._engineCache  = await rRes.text();
      return { sprites: this._spritesCache, runtime: this._engineCache };
    } catch (e) {
      throw new Error("Impossible de charger engine/* : " + e.message);
    }
  },

  // ─── Validation de la spec (anti-bugs IA) ──────────────────────────
  validate(spec) {
    const issues = [];
    if (!spec || typeof spec !== "object") return ["Spec invalide (pas un objet)"];
    if (!spec.meta || !spec.meta.title) issues.push("meta.title manquant");
    if (!spec.meta || !spec.meta.genre) issues.push("meta.genre manquant");
    if (!Array.isArray(spec.levels) || spec.levels.length === 0) issues.push("levels vide ou absent");
    else {
      spec.levels.forEach((L, i) => {
        if (!Array.isArray(L.platforms) || L.platforms.length < 1) issues.push(`Niveau ${i+1} : pas de plateformes`);
        if (!L.exit) issues.push(`Niveau ${i+1} : pas d'exit`);
        if (!L.playerStart) issues.push(`Niveau ${i+1} : pas de playerStart`);
      });
    }
    return issues;
  },

  // ─── Auto-fix sécuritaire de la spec ───────────────────────────────
  autoFix(spec) {
    const s = JSON.parse(JSON.stringify(spec));   // deep clone

    // Defaults
    s.meta    = s.meta    || {};
    s.meta.title = s.meta.title || "Untitled Game";
    s.meta.genre = s.meta.genre || "platformer";
    s.theme   = s.theme   || {};
    s.theme.palette = s.theme.palette || { player:"#0f8", platform:"#888", enemy:"#f44", collectible:"#fd0", exit:"#0ff", hazard:"#f08" };
    s.theme.background = s.theme.background || { type:"gradient", colors:["#1a1a2e","#0f0f1e"] };
    s.theme.parallax   = s.theme.parallax   || [{ color:"#16213e", speed:0.3, shapes:"hills" }];
    s.physics = s.physics || { gravity:0.5, jumpForce:-12, moveSpeed:5, friction:0.85 };
    s.player  = s.player  || { width:24, height:36, health:3 };
    s.enemies = s.enemies || {};
    s.rules   = s.rules   || {};
    s.levels  = Array.isArray(s.levels) && s.levels.length ? s.levels : [this._defaultLevel()];

    // Clamp physics dans les bonnes plages
    s.physics.gravity   = this._clamp(s.physics.gravity,   0.2,  1.0);
    s.physics.jumpForce = this._clamp(s.physics.jumpForce, -18, -8);
    s.physics.moveSpeed = this._clamp(s.physics.moveSpeed,  2,  9);

    // Boss def (optionnel, partagé)
    if (s.boss) {
      s.boss.width  = s.boss.width  || 64;
      s.boss.height = s.boss.height || 80;
      s.boss.color  = s.boss.color  || s.theme.palette.enemy;
      s.boss.health = s.boss.health || 10;
      s.boss.phases = s.boss.phases || 3;
    }

    // Fix levels (incluant nouvelles entités v2)
    s.levels.forEach((L, i) => {
      L.name        = L.name || ("Niveau " + (i+1));
      L.width       = Math.max(800, L.width || 2400);
      L.height      = Math.max(400, L.height || 600);
      L.platforms   = Array.isArray(L.platforms) ? L.platforms : [];
      L.enemies     = Array.isArray(L.enemies) ? L.enemies : [];
      L.collectibles= Array.isArray(L.collectibles) ? L.collectibles : [];
      L.hazards     = Array.isArray(L.hazards) ? L.hazards : [];
      L.powerups    = Array.isArray(L.powerups) ? L.powerups : [];
      L.checkpoints = Array.isArray(L.checkpoints) ? L.checkpoints : [];
      L.portals     = Array.isArray(L.portals) ? L.portals : [];
      L.playerStart = L.playerStart || { x:80, y:200 };
      L.exit        = L.exit || { x:L.width-100, y:L.height-150, w:50, h:80 };

      // S'assurer qu'il y a au moins un sol
      if (L.platforms.length === 0) {
        L.platforms.push({ x:0, y:L.height-50, w:L.width, h:50 });
      }

      // Plateformes mobiles : valider motion
      L.platforms.forEach(pl => {
        if (pl.motion) {
          pl.motion.axis  = (pl.motion.axis === "y") ? "y" : "x";
          pl.motion.range = this._clamp(pl.motion.range, 30, 400);
          pl.motion.speed = this._clamp(pl.motion.speed, 0.3, 3);
        }
      });

      // Power-ups : types valides
      L.powerups = L.powerups.filter(p => p && typeof p.x === "number");
      L.powerups.forEach(p => {
        if (!["health","shield","dash","doubleJump"].includes(p.type)) p.type = "health";
        p.duration = p.duration || 600;
      });

      // Portails : doivent venir par paires (id ↔ target)
      L.portals = L.portals.filter(p => p && typeof p.x === "number" && p.id && p.target);

      // Boss niveau-spécifique : juste position + override health
      if (L.boss) {
        L.boss.x = L.boss.x != null ? L.boss.x : L.width - 300;
        L.boss.y = L.boss.y != null ? L.boss.y : L.height - 130;
      }
    });

    return s;
  },

  _clamp(v, lo, hi) {
    v = parseFloat(v);
    if (isNaN(v)) return (lo + hi) / 2;
    return Math.max(lo, Math.min(hi, v));
  },

  _defaultLevel() {
    return {
      name: "Tutoriel",
      width: 1600, height: 600,
      playerStart: { x:80, y:400 },
      platforms: [
        { x:0, y:550, w:600, h:50 },
        { x:700, y:480, w:200, h:20 },
        { x:1000, y:400, w:200, h:20 },
        { x:1300, y:550, w:300, h:50 }
      ],
      collectibles: [{ type:"coin", x:780, y:440 }, { type:"coin", x:1080, y:360 }],
      enemies: [],
      hazards: [],
      exit: { x:1500, y:470, w:50, h:80 }
    };
  },

  // ─── Compile la spec en HTML self-contained ────────────────────────
  async compile(spec) {
    const fixed   = this.autoFix(spec);
    const issues  = this.validate(fixed);
    const eng     = await this.loadEngine();
    const specStr = JSON.stringify(fixed, null, 2);

    const html = `<!DOCTYPE html>
<!--
  Généré par GameForge AI v3 — Spec Mode + Pixel-Art
  Copyright (c) 2026 CHAOUSSI Cherif — Licence MIT
  Titre   : ${this._esc(fixed.meta.title)}
  Genre   : ${fixed.meta.genre}
  Niveaux : ${fixed.levels.length}
-->
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="generator" content="GameForge AI by CHAOUSSI Cherif">
<title>${this._esc(fixed.meta.title)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{width:100%;height:100%;overflow:hidden;background:#000;font-family:monospace;touch-action:none}
  canvas#game{display:block;width:100vw;height:100vh;background:#000;image-rendering:pixelated;image-rendering:crisp-edges}
</style>
</head>
<body>
<canvas id="game"></canvas>
<script>
/* ─── GAME SPEC ─── */
window.GAME_SPEC = ${specStr};
</script>
<script>
${eng.sprites}
</script>
<script>
${eng.runtime}
</script>
</body>
</html>`;

    return { html, spec: fixed, issues };
  },

  _esc(s) {
    return String(s).replace(/[<>&"']/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&#39;"}[c]));
  },
};

window.SpecCompiler = SpecCompiler;
