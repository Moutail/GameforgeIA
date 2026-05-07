/* ════════════════════════════════════════════════════════════════════
 *  GAMEFORGE SPRITES — Pixel-art procédural
 *  Copyright (c) 2026 CHAOUSSI Cherif — Licence MIT
 *  ----------------------------------------------------------------
 *  Templates ASCII : chaque caractère = couleur ('1','2',... = index, '.' = transparent)
 *  Couleurs lues depuis spec.theme.palette + accents auto (shading)
 *  ════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  // ─── Helpers couleur ───────────────────────────────────────────────
  function darken(hex, amt) {
    if (!hex || hex[0] !== "#") return "#000";
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, ((n >> 16) & 255) - amt);
    var g = Math.max(0, ((n >> 8) & 255) - amt);
    var b = Math.max(0, (n & 255) - amt);
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  }
  function lighten(hex, amt) { return darken(hex, -amt); }

  // ─── TEMPLATES ─────────────────────────────────────────────────────
  // Légende : 1=primary 2=secondary 3=accent 4=dark 5=light W=white K=black .=transparent
  var T = {
    // ── Joueur humanoïde ──
    humanoid: [
      "..2222..",
      ".233332.",
      ".25KK52.",  // visage
      ".233332.",
      "..1111..",  // cou
      ".111111.",  // torse
      ".115511.",
      ".11..11.",
      "..4..4..",  // jambes
      "..4..4..",
    ],
    // ── Robot ──
    robot: [
      ".222222.",
      "21K22K12",
      "211111112",
      "21W11W12",
      ".112211.",
      ".411114.",
      ".411114.",
      "..3..3..",
      "..3..3..",
    ],
    // ── Slime ──
    slime: [
      "...11...",
      "..1111..",
      ".115511.",
      ".11K11K.",
      "111WW111",
      "11111111",
      ".111111.",
    ],
    // ── Chauve-souris / fly ──
    bat: [
      "2..1..2",
      "22.1.22",
      "2231322",
      ".21K12.",
      ".21112.",
      "..3.3..",
    ],
    // ── Drone ──
    drone: [
      "..222..",
      ".22K22.",
      "2211122",
      "22W1W22",
      "2211122",
      ".22322.",
      "..343..",
    ],
    // ── Tourelle / turret ──
    turret: [
      "...3....",
      "...3....",
      ".22222..",
      ".21K12..",
      "12222221",
      "12111121",
      "44444444",
      "44444444",
    ],
    // ── BOSS (16x16) ──
    boss: [
      "....333333....",
      "...32222223...",
      "..3211111123..",
      ".321K1111K123.",
      ".311WW1WW113.",
      ".31111551113..",
      ".32111111123..",
      ".33222222233..",
      "..344444443...",
      "...4......4...",
      "..4........4..",
      "..3........3..",
    ],
    // ── Pièce / coin ──
    coin: [
      ".111.",
      "1551.",
      "15W1.",
      "1551.",
      ".111.",
    ],
    // ── Clé ──
    key: [
      "..1..",
      ".151.",
      "..1..",
      "..1..",
      ".11..",
      "..11.",
    ],
    // ── Cristal / gem ──
    crystal: [
      "..1..",
      ".151.",
      "11551",
      ".111.",
      "..1..",
    ],
    // ── Power-up health ──
    powerup_health: [
      ".22222.",
      "2WK1KW2",
      "211511",
      "2W515W2",
      "211511",
      "2WK1KW2",
      ".22222.",
    ],
    // ── Power-up shield ──
    powerup_shield: [
      "..222..",
      ".22K22.",
      "2211122",
      "21W1W12",
      "21111112",
      ".211112.",
      "..2222..",
      "...22...",
    ],
    // ── Power-up dash ──
    powerup_dash: [
      ".......",
      "1.1.1..",
      "11111..",
      "1111111",
      "11111..",
      "1.1.1..",
      ".......",
    ],
    // ── Drapeau / checkpoint ──
    flag: [
      "1WWWW.",
      "1WWWW.",
      "1WWWW.",
      "1.....",
      "1.....",
      "1.....",
      "1.....",
      "44444.",
    ],
    // ── Portail ──
    portal: [
      "..1111..",
      ".155551.",
      "15WWWW51",
      "15WKKW51",
      "15WKKW51",
      "15WWWW51",
      ".155551.",
      "..1111..",
    ],
    // ── Sortie ──
    exit_door: [
      "1111111",
      "1WWWWW1",
      "1W333W1",
      "1W3K3W1",
      "1W333W1",
      "1WWWWW1",
      "1111111",
      "4444444",
    ],
    // ── Spike ──
    spike: [
      ".1.",
      "111",
      "111",
    ],
    // ── Platform tile ──
    platform: [
      "1WWWWWWW",
      "11111111",
      "44444444",
    ],
  };

  // ─── Map des couleurs : type → palette de 5 couleurs (1,2,3,4,5) ───
  function buildColors(role, basePal) {
    var p = basePal || {};
    var role2col = {
      player:      p.player      || "#0f8",
      enemy:       p.enemy       || "#f44",
      boss:        p.boss || p.enemy || "#a02",
      collectible: p.collectible || "#fd0",
      key:         "#ffeebb",
      powerup:     "#0ff",
      checkpoint:  "#0f0",
      portal:      "#a0f",
      exit:        p.exit        || "#0ff",
      hazard:      p.hazard      || "#f08",
      platform:    p.platform    || "#888",
    };
    var base = role2col[role] || "#888";
    return {
      "1": base,
      "2": darken(base, 50),    // contour
      "3": lighten(base, 40),   // highlight
      "4": darken(base, 90),    // ombre
      "5": lighten(base, 80),   // éclat
      "K": "#0a0a0a",           // noir (yeux)
      "W": "#ffffff",           // blanc
    };
  }

  // ─── Draw function principale ──────────────────────────────────────
  function draw(ctx, x, y, w, h, role, palette, facing) {
    var tpl = T[role] || T.humanoid;
    var colors = buildColors(role, palette);
    var rows = tpl.length, cols = tpl[0].length;
    var px = w / cols, py = h / rows;
    facing = facing || 1;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var ch = tpl[r][facing < 0 ? cols - 1 - c : c];
        if (ch === "." || ch === " ") continue;
        ctx.fillStyle = colors[ch] || "#888";
        ctx.fillRect(x + c * px, y + r * py, Math.ceil(px) + 0.3, Math.ceil(py) + 0.3);
      }
    }
  }

  // ─── Effets (sparkle, explosion, etc.) ─────────────────────────────
  function fxExplosion(ctx, x, y, t, color) {
    var n = 8;
    for (var i = 0; i < n; i++) {
      var ang = (Math.PI * 2 / n) * i;
      var d = (30 - t) * 1.2;
      var px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d;
      ctx.fillStyle = color || "#ff0";
      ctx.globalAlpha = Math.max(0, t / 30);
      ctx.fillRect(px - 3, py - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
  }

  // ─── EXPORT ────────────────────────────────────────────────────────
  window.GFSprites = {
    draw: draw,
    fxExplosion: fxExplosion,
    has: function (role) { return !!T[role]; },
    templates: T,
    buildColors: buildColors,
  };
})();
