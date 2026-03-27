// ============================================================
//  GAMEFORGE AI — core/assetManager.js
//  Gestion des assets utilisateur : upload, Base64, catalogue
//  Utilisé par app.js (UI) et pipeline.js (injection prompt)
// ============================================================

class AssetManager {

  constructor() {
    this.assets = {};
    // { name: { dataUrl, width, height, mimeType, role, fileName } }
  }

  // ── Chargement d'un fichier image ─────────────────────────
  /**
   * @param {File}   file   - Fichier uploadé
   * @param {string} role   - "hero" | "enemy" | "background" | "platform" | "item" | "other"
   * @returns {Promise<{name, width, height}>}
   */
  loadFile(file, role = "other") {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        return reject(new Error(`${file.name} n'est pas une image`));
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Erreur lecture ${file.name}`));
      reader.onload  = (e) => {
        const dataUrl = e.target.result;
        const img     = new Image();

        img.onerror = () => reject(new Error(`Image invalide : ${file.name}`));
        img.onload  = () => {
          const name = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_");
          this.assets[name] = {
            dataUrl,
            width:    img.width,
            height:   img.height,
            mimeType: file.type,
            role,
            fileName: file.name,
          };
          resolve({ name, width: img.width, height: img.height });
        };

        img.src = dataUrl;
      };

      reader.readAsDataURL(file);
    });
  }

  // ── Suppression d'un asset ────────────────────────────────
  remove(name) {
    delete this.assets[name];
  }

  clear() {
    this.assets = {};
  }

  hasAssets() {
    return Object.keys(this.assets).length > 0;
  }

  getAll() {
    return { ...this.assets };
  }

  // ── Génération du bloc prompt à injecter dans buildSystem ─
  buildPromptBlock() {
    const entries = Object.entries(this.assets);
    if (entries.length === 0) return "";

    const catalog = entries
      .map(([name, a]) => `  - "${name}" → rôle:${a.role}, taille:${a.width}×${a.height}px`)
      .join("\n");

    const dataLines = entries
      .map(([name, a]) => `    "${name}": "${a.dataUrl}"`)
      .join(",\n");

    // Exemples d'utilisation par rôle
    const usageExamples = entries.map(([name, a]) => {
      switch (a.role) {
        case "hero":
          return `  ctx.drawImage(assets["${name}"], player.x - ${Math.round(a.width/2)}, player.y - ${a.height}, ${a.width}, ${a.height});`;
        case "enemy":
          return `  ctx.drawImage(assets["${name}"], e.x - ${Math.round(a.width/2)}, e.y - ${a.height}, ${a.width}, ${a.height});`;
        case "background":
          return `  ctx.drawImage(assets["${name}"], 0, 0, canvas.width, canvas.height);`;
        case "platform":
          return `  ctx.drawImage(assets["${name}"], p.x, p.y, p.w, ${a.height});`;
        case "item":
          return `  ctx.drawImage(assets["${name}"], item.x, item.y, ${a.width}, ${a.height});`;
        default:
          return `  ctx.drawImage(assets["${name}"], x, y, ${a.width}, ${a.height});`;
      }
    }).join("\n");

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ASSETS FOURNIS PAR L'UTILISATEUR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATALOGUE :
${catalog}

RÈGLE ABSOLUE : utilise ctx.drawImage() avec ces assets au lieu de dessiner
les sprites manuellement. NE JAMAIS ignorer les assets fournis.

CODE D'INITIALISATION OBLIGATOIRE (dans le premier <script>, AVANT requestAnimationFrame) :
  const assetSrc = {
${dataLines}
  };
  const assets = {};
  let assetsLoaded = false;

  (function loadAssets(cb) {
    const keys = Object.keys(assetSrc);
    if (keys.length === 0) { cb(); return; }
    let n = 0;
    keys.forEach(k => {
      const img = new Image();
      img.onload  = () => { assets[k] = img; if (++n === keys.length) cb(); };
      img.onerror = () => { assets[k] = null;  if (++n === keys.length) cb(); };
      img.src = assetSrc[k];
    });
  })(function() {
    assetsLoaded = true;
    requestAnimationFrame(loop);  // démarrer la boucle APRÈS le chargement
  });

UTILISATION DANS draw() :
${usageExamples}

INTERDIT :
  ✗ Démarrer requestAnimationFrame avant que assetsLoaded === true
  ✗ Redessiner manuellement un sprite qui a un asset fourni
  ✗ Ignorer ctx.drawImage et utiliser fillRect pour les entités avec asset
`;
  }

  // ── Génération du HTML miniature pour l'UI ─────────────────
  buildPreviewItem(name, asset) {
    return `
<div class="asset-item" data-name="${name}" title="${asset.fileName} (${asset.width}×${asset.height})">
  <img src="${asset.dataUrl}" alt="${name}">
  <div class="asset-meta">
    <span class="asset-name">${name}</span>
    <select class="asset-role" onchange="AssetPanel.setRole('${name}', this.value)">
      <option value="hero"       ${asset.role==="hero"       ?"selected":""}>🦸 Héros</option>
      <option value="enemy"      ${asset.role==="enemy"      ?"selected":""}>👾 Ennemi</option>
      <option value="background" ${asset.role==="background" ?"selected":""}>🌅 Fond</option>
      <option value="platform"   ${asset.role==="platform"   ?"selected":""}>🟫 Plateforme</option>
      <option value="item"       ${asset.role==="item"       ?"selected":""}>⭐ Item</option>
      <option value="other"      ${asset.role==="other"      ?"selected":""}>❓ Autre</option>
    </select>
  </div>
  <button class="asset-remove" onclick="AssetPanel.remove('${name}')">✕</button>
</div>`;
  }
}

// ── Singleton global ──────────────────────────────────────────
const GameAssets = new AssetManager();
