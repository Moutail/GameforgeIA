# 🎮 GameForge AI

**Générateur de jeux vidéo JavaScript propulsé par Groq — 100% gratuit, 0 serveur requis**

> Décris un jeu en texte → GameForge AI génère un fichier HTML5 jouable dans le navigateur, avec correction automatique des erreurs.

---

## 🚀 Démarrage rapide

### 1. Clone le projet
```bash
git clone https://github.com/TON_USERNAME/gameforge-ai.git
cd gameforge-ai
```

### 2. Configure tes clés API Groq
Ouvre `config.js` et remplace les placeholders :
```js
GROQ_API_KEYS: [
  "gsk_XXXX_ta_vraie_cle_1",   // Clé principale
  "gsk_XXXX_ta_vraie_cle_2",   // Fallback
  "gsk_XXXX_ta_vraie_cle_3",   // Fallback
  "gsk_XXXX_ta_vraie_cle_4",   // Réserve
],
```
> 🔗 Clés gratuites sur : [console.groq.com](https://console.groq.com)

### 3. Ouvre `index.html` dans ton navigateur
```
Double-clic sur index.html  (aucun serveur nécessaire)
```

---

## 📁 Structure du projet

```
gameforge-ai/
│
├── index.html              ← Interface utilisateur (HTML pur)
├── app.js                  ← Contrôleur UI (relie tout)
├── config.js               ← 🔑 CLÉS API + paramètres ici
│
├── core/
│   ├── keyRotation.js      ← Rotation intelligente des 4 clés
│   ├── groqClient.js       ← Client HTTP vers l'API Groq
│   ├── htmlProcessor.js    ← Nettoyage + validation du HTML généré
│   └── pipeline.js         ← Orchestrateur (génération → test → fix)
│
├── prompts/
│   └── prompts.js          ← System prompts de l'agent IA
│
└── styles/
    └── main.css            ← Styles (aucune dépendance externe)
```

---

## ⚙️ Comment ça marche

```
[Description texte]
       ↓
[Groq API — llama-3.3-70b]  ← Génère le code HTML/JS du jeu
       ↓
[HTMLProcessor]              ← Nettoie : supprime polices externes, injecte error handler
       ↓
[Sandbox iframe]             ← Teste le jeu dans un environnement isolé
       ↓  ← Erreur JS détectée ?
[Auto-Fix]                   ← Renvoie le code + l'erreur à Groq pour correction
       ↓  (jusqu'à 3 tentatives)
[✅ Jeu fonctionnel]         ← Affiché + téléchargeable en .html
```

---

## 🔑 Rotation des clés (anti rate-limit)

Avec 4 clés Groq gratuites, le système tourne automatiquement :
- Si K1 est rate-limitée → bascule sur K2
- Si K2 aussi → K3, puis K4
- Capacité totale : ~120 req/min (30 par clé)

---

## 🎮 Genres supportés

| Genre      | Exemples |
|------------|----------|
| Platformer | Rayman, Mario-like |
| Arcade     | Pac-Man, Tetris-like |
| Shooter    | Space Invaders, Bullet Hell |
| Puzzle     | Match-3, Sliding |
| RPG        | Zelda top-down |
| Runner     | Endless Runner |

---

## 🛠️ Personnalisation

### Ajouter un genre
Dans `config.js` :
```js
GENRES: [
  ...genres existants,
  { id: "fighting", label: "Fighting", icon: "🥊" },  // ← Ajoute ici
]
```

### Changer le modèle par défaut
Dans `config.js` :
```js
MODELS: {
  MAIN: "llama-3.3-70b-versatile",  // ← Change ici
  ...
}
```

### Améliorer les prompts
Dans `prompts/prompts.js` → fonction `buildSystem()` — ajoute des règles pour améliorer la qualité des jeux.

### Augmenter les tentatives de correction
Dans `config.js` :
```js
PIPELINE: {
  MAX_FIX_ATTEMPTS: 5,  // ← Default : 3
}
```

---

## 📦 Dépendances

**Aucune.** Zéro npm, zéro bundler, zéro framework.
- Navigateur moderne (Chrome, Firefox, Edge, Safari)
- Connexion internet (pour appeler l'API Groq)

---

## 🔒 Sécurité

- Ne commite jamais `config.js` avec tes vraies clés
- Ajoute `config.js` à ton `.gitignore` si tu publies sur GitHub
- Les clés peuvent aussi être entrées directement dans l'UI

---

## 📄 Licence

MIT — Utilise, modifie et publie librement.

---

*Projet réalisé dans le cadre d'une exploration des agents IA spécialisés avec Groq.*
