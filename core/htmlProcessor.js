// ============================================================
//  GAMEFORGE AI — core/htmlProcessor.js
//  Nettoyage, validation et auto-correction du HTML généré
//  C'est ici que l'on corrige les problèmes AVANT sandbox
// ============================================================

const HTMLProcessor = {

  // ── 1. NETTOYAGE DU RAW OUTPUT ────────────────────────────
  clean(rawText) {
    let html = rawText.trim();

    // Supprime les blocs ```html ... ``` ou ``` ... ```
    html = html.replace(/^```html?\s*/im, "").replace(/\s*```\s*$/im, "");

    // Supprime d'éventuels backticks résiduels en fin
    html = html.replace(/```\s*$/, "");

    // Si l'IA a mis du texte avant le DOCTYPE, on le coupe
    const doctypeIndex = html.toLowerCase().indexOf("<!doctype html>");
    if (doctypeIndex > 0) {
      console.warn(`[HTMLProcessor] Texte parasite supprimé (${doctypeIndex} chars avant DOCTYPE)`);
      html = html.substring(doctypeIndex);
    }

    // Vérifie qu'on a bien un DOCTYPE
    if (!html.toLowerCase().startsWith("<!doctype html>")) {
      const htmlTagIndex = html.toLowerCase().indexOf("<html");
      if (htmlTagIndex >= 0) {
        html = "<!DOCTYPE html>\n" + html.substring(htmlTagIndex);
      }
    }

    return html;
  },

  // ── 2. PRÉ-VALIDATION ─────────────────────────────────────
  validate(html) {
    const issues = [];

    if (!html.toLowerCase().includes("<!doctype html>"))
      issues.push({ type: "error",   msg: "DOCTYPE manquant" });

    if (!html.includes("</html>"))
      issues.push({ type: "error",   msg: "Balise </html> manquante" });

    if (html.length < 500)
      issues.push({ type: "error",   msg: `Code trop court (${html.length} chars) — génération incomplète` });

    if (html.includes("fonts.googleapis.com"))
      issues.push({ type: "warning", msg: "Google Fonts détecté → sera supprimé" });

    if (html.includes("@import url") && html.includes("http"))
      issues.push({ type: "warning", msg: "@import URL externe détecté → sera supprimé" });

    if (!html.includes("GAME_ERROR"))
      issues.push({ type: "warning", msg: "Error handler manquant → sera injecté" });

    if (!html.includes("requestAnimationFrame") && !html.includes("<canvas"))
      issues.push({ type: "warning", msg: "Pas de boucle canvas détectée (jeu peut être statique)" });

    if (!html.includes("overflow") || !html.match(/overflow\s*:\s*hidden/i))
      issues.push({ type: "warning", msg: "overflow:hidden manquant → sera injecté" });

    if (html.match(/canvas\.width\s*=\s*\d{3,4}\s*;/) || html.match(/canvas\.height\s*=\s*\d{3,4}\s*;/))
      issues.push({ type: "warning", msg: "Canvas taille fixe détectée → sera rendue responsive" });

    // Détection physique hors-plage
    const speedMatch    = html.match(/(?:speed|velocity|vx|playerSpeed)\s*[=:]\s*([\d.]+)\s*[;,]/);
    const gravMatch     = html.match(/gravity\s*[=:]\s*([\d.]+)\s*[;,]/);
    const jumpMatch     = html.match(/jump(?:Force|Speed|Power|Velocity)\s*[=:]\s*(-?[\d.]+)\s*[;,]/i);
    if (speedMatch   && parseFloat(speedMatch[1])   > 12)
      issues.push({ type: "warning", msg: `Vitesse fixe trop élevée (${speedMatch[1]}) → sera réduite` });
    if (gravMatch    && parseFloat(gravMatch[1])    > 1.2)
      issues.push({ type: "warning", msg: `Gravité trop forte (${gravMatch[1]}) → sera réduite` });
    if (jumpMatch    && Math.abs(parseFloat(jumpMatch[1])) > 22)
      issues.push({ type: "warning", msg: `JumpForce trop élevée (${jumpMatch[1]}) → sera réduite` });

    const hasKeyListeners = html.includes("keydown") || html.includes("keyup");
    if (!hasKeyListeners)
      issues.push({ type: "warning", msg: "Aucun listener clavier détecté → contrôles manquants" });

    const hasControlsLegend =
      html.includes("drawControls") ||
      html.includes("controls-legend") ||
      html.includes("getControlsHelp") ||
      html.includes("gf-controls");
    if (!hasControlsLegend)
      issues.push({ type: "warning", msg: "Légende contrôles absente → sera injectée" });

    return issues;
  },

  // ── 3. AUTO-FIX ───────────────────────────────────────────
  autoFix(html) {
    let fixed = html;

    // ▸ Supprime les imports Google Fonts
    fixed = fixed.replace(
      /<link[^>]*fonts\.googleapis[^>]*>/gi,
      "<!-- [GameForge] Google Font supprimé -->"
    );
    fixed = fixed.replace(
      /<link[^>]*fonts\.gstatic[^>]*>/gi,
      "<!-- [GameForge] Font supprimé -->"
    );
    fixed = fixed.replace(
      /@import\s+url\(['"]?https?:\/\/fonts\.[^)]+['"]?\)[^;]*;?/gi,
      "/* [GameForge] @import supprimé */"
    );

    // ▸ Remplace les font-family non-système par monospace
    fixed = fixed.replace(
      /font-family\s*:\s*['"][^'"]+['"]\s*(?:,\s*(?:monospace|serif|sans-serif))?/gi,
      "font-family: monospace"
    );

    // ▸ Supprime les scripts de fonts externes
    fixed = fixed.replace(
      /<script[^>]+src=["']https?:\/\/(?!cdn\.jsdelivr|cdnjs\.cloudflare)[^'"]+\/fonts[^'"]*["'][^>]*><\/script>/gi,
      "<!-- [GameForge] Script font externe supprimé -->"
    );

    // ▸ Injecte le CSS anti-débordement dans <head> ou en tête de <style>
    const overflowCSS = `
  <!-- [GameForge] CSS anti-débordement injecté -->
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;overflow:hidden;background:#000}
    canvas{display:block;position:absolute;top:0;left:0}
  </style>`;

    if (!fixed.match(/overflow\s*:\s*hidden/i)) {
      if (fixed.includes("</head>")) {
        fixed = fixed.replace("</head>", overflowCSS + "\n</head>");
      } else if (fixed.includes("<body")) {
        fixed = fixed.replace(/<body[^>]*>/, (m) => overflowCSS + "\n" + m);
      }
    }

    // ▸ Rend le canvas responsive (remplace tailles fixes hardcodées)
    //   Injecte un resizeCanvas() si le canvas a des dimensions fixes
    if (fixed.match(/canvas\.width\s*=\s*\d{3,4}\s*;/) || fixed.match(/canvas\.height\s*=\s*\d{3,4}\s*;/)) {
      fixed = fixed.replace(
        /canvas\.width\s*=\s*(\d{3,4})\s*;/g,
        "canvas.width = window.innerWidth; /* [GameForge] rendu responsive */"
      );
      fixed = fixed.replace(
        /canvas\.height\s*=\s*(\d{3,4})\s*;/g,
        "canvas.height = window.innerHeight; /* [GameForge] rendu responsive */"
      );
    }

    // ▸ Auto-fix physique hors-plage (valeurs fixes sûres — pas de référence canvas)
    //   Speed fixe > 12 → 5 (valeur sûre, pas de ReferenceError possible)
    fixed = fixed.replace(
      /\b(speed|playerSpeed)\s*=\s*(1[3-9]|[2-9]\d+)(\s*[;,])/g,
      (_, name, val, end) => `${name} = 5 /* [GameForge] speed ${val} → 5 */${end}`
    );
    //   Gravity > 1.2 → 0.4
    fixed = fixed.replace(
      /\bgravity\s*=\s*(1\.[3-9]\d*|[2-9][\d.]*)\s*([;,])/g,
      (_, val, end) => `gravity = 0.4 /* [GameForge] gravity ${val} → 0.4 */${end}`
    );
    //   jumpForce < -22 → -12
    fixed = fixed.replace(
      /\bjump(?:Force|Speed|Power|Velocity)\s*=\s*(-(?:2[3-9]|[3-9]\d+)[\d.]*)\s*([;,])/gi,
      (_, val, end) => `jumpForce = -12 /* [GameForge] jump ${val} → -12 */${end}`
    );

    // ▸ Injecte un gestionnaire de touches minimal si aucun n'est présent
    if (!fixed.includes("keydown") && !fixed.includes("keyup")) {
      const keysStub = `
  <!-- [GameForge] Gestionnaire clavier injecté automatiquement -->
  <script>
    if (typeof keys === 'undefined') {
      var keys = {};
      window.addEventListener('keydown', function(e) { keys[e.code] = true; e.preventDefault(); });
      window.addEventListener('keyup',   function(e) { keys[e.code] = false; });
    }
  <\/script>`;
      if (fixed.includes("</head>")) {
        fixed = fixed.replace("</head>", keysStub + "\n</head>");
      }
    }

    // ▸ Injecte une légende contrôles en-jeu si aucune n'est présente
    //   Détecte la présence d'un drawControls() ou d'un élément #controls-legend
    const hasControlsLegend =
      fixed.includes("drawControls") ||
      fixed.includes("controls-legend") ||
      fixed.includes("getControlsHelp") ||
      fixed.includes("gf-controls");

    if (!hasControlsLegend) {
      // Détecter le genre approximatif depuis le contenu
      const isShooter = fixed.includes("bullet") || fixed.includes("shoot") || fixed.includes("laser");
      const isPuzzle  = fixed.includes("match") || fixed.includes("grid") || (fixed.includes("click") && !fixed.includes("vy"));
      const isRPG     = fixed.includes("ATK") || fixed.includes("mana") || fixed.includes("inventory");

      let controlLines;
      if (isShooter) {
        controlLines = "\u2190 \u2192 &nbsp; D\u00e9placer<br>Espace &nbsp; Tirer<br>R &nbsp; Recommencer";
      } else if (isPuzzle) {
        controlLines = "Clic &nbsp; S\u00e9lectionner<br>Espace &nbsp; Valider<br>R &nbsp; Recommencer";
      } else if (isRPG) {
        controlLines = "ZQSD / \u2190\u2191\u2193\u2192 &nbsp; Bouger<br>Espace &nbsp; Attaquer<br>R &nbsp; Recommencer";
      } else {
        controlLines = "\u2190 \u2192 &nbsp; D\u00e9placer<br>\u2191 / Espace &nbsp; Sauter<br>R &nbsp; Recommencer";
      }

      const controlsOverlay = `
  <!-- [GameForge] L\u00e9gende contr\u00f4les inject\u00e9e automatiquement -->
  <style>
    #gf-controls {
      position: fixed;
      bottom: 12px;
      right: 14px;
      background: rgba(0,0,0,0.60);
      color: rgba(255,255,255,0.88);
      font: 12px/1.7 monospace;
      padding: 7px 12px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.15);
      pointer-events: none;
      z-index: 9999;
      white-space: nowrap;
      line-height: 1.7;
    }
  </style>
  <div id="gf-controls">${controlLines}</div>`;

      if (fixed.includes("</body>")) {
        fixed = fixed.replace("</body>", controlsOverlay + "\n</body>");
      }
    }

    // ▸ Injecte un gamepad tactile si le jeu a des controles clavier mais pas de touch
    const hasTouchControls = fixed.includes("touchstart") || fixed.includes("gf-gamepad");
    const hasKeyboard      = fixed.includes("keydown") || fixed.includes("ArrowLeft") || fixed.includes("keys[");

    if (hasKeyboard && !hasTouchControls) {
      const isShooterGP = fixed.includes("bullet") || fixed.includes("shoot");
      const isRPGGP     = fixed.includes("ATK") || fixed.includes("mana");
      const upLabel     = isShooterGP ? "FIRE" : (isRPGGP ? "ATK" : "JUMP");
      const upKeyCode   = (isShooterGP || isRPGGP) ? "Space" : "ArrowUp";

      const gpCSS = [
        "<style>",
        "#gf-gamepad{position:fixed;bottom:0;left:0;right:0;height:140px;pointer-events:none;z-index:10000;display:none}",
        "#gf-gamepad.gf-on{display:block}",
        ".gf-btn{position:absolute;border-radius:50%;background:rgba(255,255,255,0.13);border:2px solid rgba(255,255,255,0.32);color:rgba(255,255,255,0.9);font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:all;user-select:none;-webkit-user-select:none;touch-action:manipulation}",
        ".gf-btn.gf-p{background:rgba(255,255,255,0.32);border-color:rgba(255,255,255,0.7)}",
        "#gf-bl{width:52px;height:52px;left:14px;bottom:72px}",
        "#gf-br{width:52px;height:52px;left:78px;bottom:72px}",
        "#gf-bu{width:52px;height:52px;left:46px;bottom:128px}",
        "#gf-ba{width:64px;height:64px;right:22px;bottom:38px;border-radius:14px;font-size:12px;font-weight:bold;letter-spacing:1px}",
        "</style>"
      ].join("");

      const gpHTML = [
        "<div id='gf-gamepad'>",
        "<div class='gf-btn' id='gf-bl'>&#8592;</div>",
        "<div class='gf-btn' id='gf-br'>&#8594;</div>",
        "<div class='gf-btn' id='gf-bu'>&#8593;</div>",
        "<div class='gf-btn' id='gf-ba'>" + upLabel + "</div>",
        "</div>"
      ].join("");

      const gpJS = [
        "<script>",
        "(function(){",
        "  if(!('ontouchstart' in window)) return;",
        "  document.getElementById('gf-gamepad').classList.add('gf-on');",
        "  function fk(code,dn){",
        "    var e=new KeyboardEvent(dn?'keydown':'keyup',{code:code,key:code,bubbles:true,cancelable:true});",
        "    window.dispatchEvent(e);",
        "  }",
        "  var map={'gf-bl':'ArrowLeft','gf-br':'ArrowRight','gf-bu':'" + upKeyCode + "','gf-ba':'Space'};",
        "  Object.entries(map).forEach(function(kv){",
        "    var el=document.getElementById(kv[0]);",
        "    if(!el) return;",
        "    el.addEventListener('touchstart',function(e){e.preventDefault();el.classList.add('gf-p');fk(kv[1],true);},{passive:false});",
        "    el.addEventListener('touchend',function(e){e.preventDefault();el.classList.remove('gf-p');fk(kv[1],false);},{passive:false});",
        "    el.addEventListener('touchcancel',function(){el.classList.remove('gf-p');fk(kv[1],false);});",
        "  });",
        "})();",
        "<\\/script>"
      ].join("");

      const gamepadBlock = "\n  <!-- [GameForge] Gamepad tactile -->\n  " + gpCSS + "\n  " + gpHTML + "\n  " + gpJS;

      if (fixed.includes("</body>")) {
        fixed = fixed.replace("</body>", gamepadBlock + "\n</body>");
      }
    }

    // ▸ Injecte le error handler s'il manque
    if (!fixed.includes("GAME_ERROR")) {
      const errorHandler = `
  <!-- [GameForge] Error Handler injecté automatiquement -->
  <script>
    window.onerror = function(message, source, line, col, error) {
      try {
        window.parent.postMessage({
          type:  "GAME_ERROR",
          error: message + " (ligne " + line + ")",
          line:  line,
        }, "*");
      } catch(x) {}
      return true;
    };
    window.addEventListener("load", function() {
      setTimeout(function() {
        window.parent.postMessage({ type: "GAME_READY" }, "*");
      }, 800);
    });
  <\/script>`;

      if (fixed.includes("<body>")) {
        fixed = fixed.replace("<body>", "<body>" + errorHandler);
      } else if (fixed.includes("<body ")) {
        fixed = fixed.replace(/<body[^>]*>/, (match) => match + errorHandler);
      } else {
        fixed = fixed.replace("<script>", errorHandler + "<script>");
      }
    }

    return fixed;
  },

  // ── 4. PIPELINE COMPLET ───────────────────────────────────
  process(rawText) {
    const cleaned  = this.clean(rawText);
    const issues   = this.validate(cleaned);
    const hasError = issues.some(i => i.type === "error");
    const fixed    = this.autoFix(cleaned);

    return {
      html:      fixed,
      issues:    issues,
      hasError:  hasError,
      charCount: fixed.length,
    };
  },
};
