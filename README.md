# 🎮 GameForge AI — v2.0

**Générateur de jeux vidéo HTML5/Canvas propulsé par Groq & Claude — 100% gratuit, 0 serveur requis**

> Décris un jeu en texte → GameForge AI génère un fichier HTML5 jouable dans le navigateur, avec pipeline de qualité automatique : génération → validation → sandbox → critique → correction → régénération.

---

## 🚀 Démarrage rapide

### 1. Clone le projet
```bash
git clone https://github.com/TON_USERNAME/gameforge-ai.git
cd gameforge-ai
```

### 2. Configure tes clés API

**Option A — Groq (gratuit)**  
Ouvre `config.js` et remplace les placeholders :
```js
GROQ_API_KEYS: [
  "gsk_ta_cle_1",   // Clé principale
  "gsk_ta_cle_2",   // Fallback 1
  "gsk_ta_cle_3",   // Fallback 2
  "gsk_ta_cle_4",   // Réserve
],
```
> 🔗 Clés gratuites : [console.groq.com](https://console.groq.com)

**Option B — Claude Anthropic (payant, qualité supérieure)**  
```js
ANTHROPIC_API_KEY: "sk-ant-api03-...",
```
> 🔗 Clés : [console.anthropic.com](https://console.anthropic.com)

### 3. Ouvre `index.html` dans ton navigateur
```
Double-clic sur index.html   (aucun serveur, aucun npm nécessaire)
```
Ou via un serveur local (recommandé) :
```bash
python -m http.server 8080
# → http://localhost:8080
```

---

## Structure du projet

```
gameforge-ai/
│
├── index.html              ← Interface utilisateur
├── app.js                  ← Contrôleur UI + orchestration
├── config.js               ← 🔑 CLÉS API + tous les paramètres
│
├── core/
│   ├── assetManager.js     ← Upload sprites, Base64, catalogue
│   ├── keyRotation.js      ← Rotation round-robin des clés Groq
│   ├── groqClient.js       ← Client Groq (retry + backoff exponentiel)
│   ├── anthropicClient.js  ← Client Claude (Anthropic)
│   ├── htmlProcessor.js    ← Nettoyage, validation, auto-fix HTML
│   └── pipeline.js         ← Orchestrateur principal (5 étapes)
│
├── prompts/
│   └── prompts.js          ← 12 règles de génération + CRITIC
│
└── styles/
    └── main.css            ← Thème retro-terminal (0 dépendance)
```

---

## ⚙️ Pipeline de génération (v2.0)

```
[Description + Genre + Complexité]
            ↓
  ┌─────────────────────────┐
  │  1. GÉNÉRATION          │  llama-3.3-70b / claude-sonnet
  │     10 règles imposées  │  → HTML complet avec contrôles,
  │     Feedback précédent  │    sprites composés, canvas responsive
  └────────────┬────────────┘
               ↓
  ┌─────────────────────────┐
  │  2. VALIDATION HTML     │  HTMLProcessor
  │     Auto-fix CSS        │  → overflow:hidden injecté
  │     Canvas responsive   │  → canvas.width = window.innerWidth
  │     Error handler       │  → keys{} injecté si absent
  │     Légende contrôles   │  → overlay #gf-controls injecté si absent
  └────────────┬────────────┘
               ↓
  ┌─────────────────────────┐
  │  3. SANDBOX TEST        │  iframe isolé
  │     window.onerror      │  → Détecte crashes JS runtime
  │     10s timeout         │  → GAME_READY ou GAME_ERROR
  └────────────┬────────────┘
               ↓ erreur ?  →  AUTO-FIX (llama-3.1-8b-instant)
  ┌─────────────────────────┐
  │  4. CRITIQUE QUALITÉ    │  llama-3.1-8b-instant
  │     Score /12           │  → 5 dimensions évaluées
  │     Seuil : 8/12        │  → Issues précises et actionnables
  └────────────┬────────────┘
               ↓ score < 8 ? → RÉGÉNÉRATION avec feedback ciblé
  ┌─────────────────────────┐
  │  5. ✅ JEU VALIDÉ       │  Affiché + téléchargeable .html
  └─────────────────────────┘
        Jusqu'à 5 tentatives max
```

---

## 🎯 Système de critique qualité — 5 dimensions (/12)

| Dimension | Max | Critère |
|---|---|---|
| **mechanics** | 3 | Physique, collisions, ennemis, gameplay fonctionnel |
| **visuals** | 3 | Sprites composés (3+ formes), gradient, HUD, effets |
| **controls** | 2 | `keys{}` complet, flèches+WASD, **légende visible pendant le jeu** |
| **bugs** | 2 | Variables initialisées, canvas responsive, pas de vies négatives |
| **description_match** | 2 | Correspondance avec la description utilisateur |

> **Règle de validation** : `total >= 8` **ET** `controls >= 1`  
> Un jeu sans contrôles fonctionnels **ou sans légende visible** est systématiquement rejeté.

---

## 📜 Les 10 règles du système de prompt

| Règle | Description |
|---|---|
| #1 Format | Sortie `<!DOCTYPE html>` uniquement, zéro markdown |
| #2 Ressources | Zéro CDN externe, zéro Google Fonts, tout inline |
| #3 Error handler | `window.onerror` + `GAME_READY` postMessage obligatoires |
| #4 Architecture | Machine d'états, delta-time, variables initialisées |
| #5 Mécaniques | Code spécifique au genre (gravité AABB, grille ennemis, etc.) |
| #6 Visuels | Gradient obligatoire, sprites composés, HUD semi-transparent |
| #7 Anti-patterns | Liste de patterns interdits (vies négatives, fond blanc, etc.) |
| #8 Canvas responsive | `window.innerWidth/Height`, listener `resize`, `overflow:hidden` |
| **#9 Contrôles** | `const keys={}` + `keydown/keyup` + ArrowLeft/WASD/Space **EXACT** |
| **#10 Sprites** | Interdit les `fillRect` seuls — exemples de `drawPlayer/drawEnemy` fournis |
| **#11 Légende en-jeu** | `drawControls()` visible pendant le jeu — fond semi-transparent bas-droite |
| **#12 Niveaux + caméra** | `LEVELS[]` en % canvas, caméra scrolling, parallaxe 3 couches, transitions |}

---

## 🔑 Rotation des clés Groq (anti rate-limit)

Avec 4 clés gratuites, le système tourne automatiquement avec **backoff exponentiel** :

```
K1 rate-limit → wait(800ms) → K2
K2 rate-limit → wait(1.6s)  → K3
K3 rate-limit → wait(3.2s)  → K4
K4 rate-limit → wait(6.4s)  → K1 (max 8s)
```

- Lecture du header `Retry-After` si fourni par l'API
- Erreurs permanentes (modèle décommissionné, 401, 400) → **throw immédiat**, zéro retry inutile
- Capacité totale estimée : ~120 req/min (4 × 30)

---

## 🤖 Modèles disponibles

### Groq (gratuit)
| Rôle | Modèle | Usage |
|---|---|---|
| `MAIN` | `llama-3.3-70b-versatile` | Génération principale |
| `FAST_FIX` | `llama-3.1-8b-instant` | Correction rapide + Critique |
| `LONG_CTX` | `llama-3.1-70b-versatile` | Jeux complexes |
| `CRITIC` | `llama-3.1-8b-instant` | Évaluation qualité |

### Claude / Anthropic (payant)
| Rôle | Modèle |
|---|---|
| `MAIN` | `claude-sonnet-4-6` |
| `FAST_FIX` | `claude-haiku-4-5-20251001` |
| `CRITIC` | `claude-haiku-4-5-20251001` |

---

## 🎮 Genres supportés

| Genre | Mécaniques imposées |
|---|---|
| 🏃 **Platformer** | Gravité, saut canJump, collision AABB, ennemis patrouilleurs |
| 👾 **Arcade** | Multiplicateur score ×4, vagues progressives, power-ups |
| 🚀 **Shooter** | Grille 5×3, tirs cooldown, explosions canvas, barrières |
| 🧩 **Puzzle** | Grille 6×6, match-3 ou swap, animations disparition |
| ⚔️ **RPG** | HP/ATK/DEF HUD, aggro range, loot système, mini-map |
| 🌀 **Runner** | Scroll auto, parallaxe 2 couches, obstacles procéduraux |

---

## ⚙️ Paramètres `config.js`

```js
PIPELINE: {
  MAX_FIX_ATTEMPTS:   5,      // Tentatives max (correction + régénération qualité)
  SANDBOX_TIMEOUT_MS: 10000,  // Délai sandbox avant de conclure "OK" (10s)
  RETRY_DELAY_MS:     800,    // Délai de base backoff exponentiel
  MAX_RETRY_DELAY_MS: 8000,   // Délai max backoff
  MAX_TOKENS:         16000,  // Tokens max par réponse IA
  TEMPERATURE:        0.7,    // Créativité (0 = strict, 1 = aléatoire)
  QUALITY_THRESHOLD:  8,      // Score minimum /12 pour valider un jeu
}
```

---

## 🖼️ Assets utilisateur (Sprites / Fonds)

### Principe
L'utilisateur peut uploader ses propres images directement dans l'UI. Elles sont converties en **Base64 inline** et injectées dans le prompt — l'IA génère alors le jeu en utilisant `drawImage()` avec ces sprites au lieu de dessiner des formes.

### Workflow
```
Upload hero.png + enemy.png + background.jpg
           ↓
[AssetManager] Base64 + dimensions + rôle
           ↓
[Prompt] « ASSETS DISPO : hero (48×64px), enemy (32×32px)... »
           ↓
[Jeu généré] ctx.drawImage(assets["hero"], player.x, player.y, 48, 64)
```

### Rôles disponibles
| Rôle | Usage généré |
|---|---|
| **Héros** | `drawImage` centré sur `player.x/y` |
| **Ennemi** | `drawImage` sur chaque ennemi |
| **Fond** | `drawImage` taille plein canvas |
| **Plateforme** | `drawImage` tiling horizontal |
| **Item** | `drawImage` sur les collectables |

> Formats supportés : PNG, WebP, SVG, GIF. Glisser-déposer disponible.

---

## 🎮 Niveaux multiples (RÈGLE #12)

La RÈGLE #12 force la génération d'un tableau `LEVELS[]` avec :
- **3-5 niveaux** de difficulté croissante
- Positions en **% de canvas** pour être 100% responsive
- **Caméra scrolling** qui suit le joueur (`cam.x` + `ctx.translate`)
- **Parallaxe 3 couches** (0.1× / 0.4× / 1.0×)
- **Transitions** avec pause + message entre niveaux
- **Écran WIN** après le dernier niveau

```js
const LEVELS = [
  { id:1, bgColors:['#1a1a2e','#16213e'], platforms:[...], enemies:[...], goal:{xp:0.85,yp:0.88} },
  { id:2, bgColors:['#0d1b2a','#1b2a3b'], platforms:[...], enemies:[...], goal:{xp:0.9, yp:0.88} },
  { id:3, bgColors:['#1a0a2e','#2d1b4e'], platforms:[...], enemies:[...], goal:{xp:0.9, yp:0.88} },
];
```

---

## 🛠️ Personnalisation

### Ajouter un genre
```js
// config.js → GENRES
{ id: "fighting", label: "Fighting", icon: "🥊" }
```
Puis ajouter les mécaniques dans `prompts/prompts.js` → `genreMechanics`.

### Augmenter la qualité des jeux générés
- Augmente `MAX_TOKENS` (plus de code = jeu plus complet)
- Baisse `TEMPERATURE` (0.5 = moins de variabilité, plus rigoureux)
- Ajoute des règles dans `prompts.js` → `buildSystem()`

### Activer Claude pour une qualité maximale
1. Entre ta clé dans l'UI (section 🟣) ou dans `config.js`
2. Sélectionne `claude-sonnet ★` dans le dropdown modèle

---

## 📦 Dépendances

**Aucune.** Zéro npm, zéro bundler, zéro framework frontend.

- Navigateur moderne (Chrome, Firefox, Edge, Safari)
- Connexion internet (appels API Groq/Anthropic)
- Python (optionnel) pour le serveur local

---

## 🔒 Sécurité

- **Ne commite jamais** `config.js` avec les vraies clés
- Ajoute `config.js` à `.gitignore` avant tout push
- Les clés peuvent être entrées dans l'UI sans modifier `config.js`
- Toutes les requêtes partent du navigateur (pas de serveur intermédiaire)

---

## 📄 Licence

MIT — Utilise, modifie, redistribue librement.
