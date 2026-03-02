// ============================================================
//  GAMEFORGE AI — core/htmlProcessor.js
//  Nettoyage, validation et auto-correction du HTML généré
//  C'est ici que l'on corrige les problèmes AVANT sandbox
// ============================================================

const HTMLProcessor = {

  // ── 1. NETTOYAGE DU RAW OUTPUT ────────────────────────────
  // Supprime les artefacts markdown que l'IA insère parfois
  clean(rawText) {
    let html = rawText.trim();

    // Supprime les blocs ```html ... ``` ou ``` ... ```
    html = html.replace(/^```html?\s*/im, "").replace(/\s*```\s*$/im, "");

    // Si l'IA a mis du texte avant le DOCTYPE, on le coupe
    const doctypeIndex = html.toLowerCase().indexOf("<!doctype html>");
    if (doctypeIndex > 0) {
      console.warn(`[HTMLProcessor] Texte parasite supprimé (${doctypeIndex} chars avant DOCTYPE)`);
      html = html.substring(doctypeIndex);
    }

    // Vérifie qu'on a bien un DOCTYPE
    if (!html.toLowerCase().startsWith("<!doctype html>")) {
      // Tentative de récupération : cherche la première balise <html>
      const htmlTagIndex = html.toLowerCase().indexOf("<html");
      if (htmlTagIndex >= 0) {
        html = "<!DOCTYPE html>\n" + html.substring(htmlTagIndex);
      }
    }

    return html;
  },

  // ── 2. PRÉ-VALIDATION ─────────────────────────────────────
  // Retourne une liste de problèmes détectés (avant injection)
  validate(html) {
    const issues = [];

    if (!html.toLowerCase().includes("<!doctype html>"))
      issues.push({ type: "error",   msg: "DOCTYPE manquant" });

    if (!html.includes("</html>"))
      issues.push({ type: "error",   msg: "Balise </html> manquante" });

    if (html.includes("fonts.googleapis.com"))
      issues.push({ type: "warning", msg: "Google Fonts détecté → sera supprimé" });

    if (html.includes("@import url") && html.includes("http"))
      issues.push({ type: "warning", msg: "@import URL externe détecté → sera supprimé" });

    if (!html.includes("GAME_ERROR"))
      issues.push({ type: "warning", msg: "Error handler manquant → sera injecté" });

    if (!html.includes("requestAnimationFrame") && !html.includes("<canvas"))
      issues.push({ type: "warning", msg: "Pas de boucle canvas détectée (jeu peut être statique)" });

    if (html.length < 500)
      issues.push({ type: "error",   msg: `Code trop court (${html.length} chars) — génération incomplète` });

    return issues;
  },

  // ── 3. AUTO-FIX ───────────────────────────────────────────
  // Corrections automatiques sans passer par l'IA
  autoFix(html) {
    let fixed = html;

    // ▸ Supprime les imports Google Fonts (cause n°1 des 404)
    fixed = fixed.replace(
      /<link[^>]*fonts\.googleapis[^>]*>/gi,
      "<!-- [GameForge] Google Font supprimé → police système utilisée -->"
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

    // ▸ Supprime les autres CDN scripts qui pourraient échouer
    //   (on garde Phaser, Three.js car ils sont utiles)
    fixed = fixed.replace(
      /<script[^>]+src=["']https?:\/\/(?!cdn\.jsdelivr|cdnjs\.cloudflare)[^'"]+\/fonts[^'"]*["'][^>]*><\/script>/gi,
      "<!-- [GameForge] Script font externe supprimé -->"
    );

    // ▸ Injecte le error handler s'il manque
    if (!fixed.includes("GAME_ERROR")) {
      const errorHandler = `
  <!-- [GameForge] Error Handler injecté automatiquement -->
  <script>
    // Remonte les erreurs JS vers le parent (détection sandbox)
    window.onerror = function(message, source, line, col, error) {
      try {
        window.parent.postMessage({
          type:  "GAME_ERROR",
          error: message + " (ligne " + line + ")",
          line:  line,
        }, "*");
      } catch(x) {}
      return true; // Empêche le log natif du navigateur
    };
    // Signal "jeu chargé sans erreur"
    window.addEventListener("load", function() {
      setTimeout(function() {
        window.parent.postMessage({ type: "GAME_READY" }, "*");
      }, 800);
    });
  <\/script>`;

      // Insère juste après <body> ou avant le premier <script>
      if (fixed.includes("<body>")) {
        fixed = fixed.replace("<body>", "<body>" + errorHandler);
      } else if (fixed.includes("<body ")) {
        fixed = fixed.replace(/<body[^>]*>/, (match) => match + errorHandler);
      } else {
        // Fallback : insère avant le premier script du jeu
        fixed = fixed.replace("<script>", errorHandler + "<script>");
      }
    }

    return fixed;
  },

  // ── 4. PIPELINE COMPLET ───────────────────────────────────
  // Enchaîne clean → validate → autoFix et retourne un rapport
  process(rawText) {
    const cleaned  = this.clean(rawText);
    const issues   = this.validate(cleaned);
    const hasError = issues.some(i => i.type === "error");
    const fixed    = this.autoFix(cleaned);

    return {
      html:     fixed,
      issues:   issues,
      hasError: hasError,
      charCount: fixed.length,
    };
  },
};
