/* ════════════════════════════════════════════════════════════════════
 *  SPEC PROMPT — version COMPACTE (<3k tokens) pour Groq free tier
 *  Copyright (c) 2026 CHAOUSSI Cherif — Licence MIT
 *  ----------------------------------------------------------------
 *  L'IA remplit un JSON, n'écrit pas de code. Compatible TPM 6k/12k.
 *  ════════════════════════════════════════════════════════════════════ */

const SpecPrompts = {

  // ─── Prompt principal — ULTRA COMPACT ──────────────────────────────
  buildSpec({ description, genre, complexity }) {
    const numLevels = complexity === "simple" ? 2 : complexity === "complex" ? 4 : 3;
    const desc = String(description || "").substring(0, 600);
    const example = this._miniExample(genre);

    return `Tu es un game designer. Génère UNIQUEMENT un JSON GAME_SPEC. Aucun code, aucun markdown, aucun texte avant/après. Commence par { et finis par }.

DEMANDE: "${desc}"
GENRE: ${genre} | NIVEAUX: ${numLevels} (progressifs facile→dur)

SCHEMA (toutes les clés requises):
{
"meta":{"title":"","subtitle":"","genre":"${genre}","description":""},
"theme":{
 "background":{"type":"gradient","colors":["#hex","#hex"]},
 "parallax":[{"color":"#hex","speed":0.3,"shapes":"hills|mountains|stars","y":400}],
 "palette":{"player":"#hex","platform":"#hex","enemy":"#hex","collectible":"#hex","exit":"#hex","hazard":"#hex"}
},
"physics":{"gravity":0.5,"jumpForce":-12,"moveSpeed":5,"friction":0.85},
"player":{"width":24,"height":36,"health":3,"skills":{"doubleJump":false,"shoot":false,"dash":false}},
"enemies":{"NAME":{"width":24,"height":24,"color":"#hex","ai":"patrol|fly|follow|shoot|horizontal|static","speed":2,"health":1,"damage":1}},
"boss":{"width":64,"height":80,"color":"#hex","health":10,"phases":3},
"levels":[{
 "name":"","width":2400,"height":600,
 "playerStart":{"x":80,"y":400},
 "platforms":[{"x":0,"y":550,"w":800,"h":50},{"x":900,"y":400,"w":150,"h":20,"motion":{"axis":"x","range":100,"speed":1}}],
 "enemies":[{"type":"NAME","x":500,"y":500,"range":150}],
 "collectibles":[{"type":"coin|key|crystal","x":200,"y":500,"value":10}],
 "hazards":[{"type":"spikes","x":600,"y":580,"w":80,"h":20}],
 "powerups":[{"type":"health|shield|dash|doubleJump","x":1500,"y":500,"duration":600}],
 "checkpoints":[{"x":1200,"y":500}],
 "portals":[{"x":800,"y":500,"id":"A","target":"B"},{"x":1800,"y":300,"id":"B","target":"A"}],
 "boss":{"x":2100,"y":470},
 "exit":{"x":2300,"y":470,"w":50,"h":80}
}],
"rules":{"winCondition":"reach_exit_all_levels","loseCondition":"health_zero"}
}

REGLES (obligatoires):
- 1 plateforme sol par niveau (y=height-50, w≥600)
- gap horizontal max 180px, vertical max 100px (saut)
- playerStart sur plateforme, exit sur plateforme
- niveau width≥1600 (platformer/topdown), ≥3000 (runner)
- 3-5 collectibles/niveau
- powerups: 0-2/niveau (optionnel)
- checkpoints: 1 si width>2400 (optionnel)
- portals: TOUJOURS par paire (id "A"↔target "B"), optionnel
- moving platforms: motion.axis x|y, range 50-200, speed 0.5-2 (optionnel, max 2/niveau)
- boss: SEULEMENT au dernier niveau, à droite (clé "boss" dans CE niveau ET racine)
- couleurs cohérentes au thème de la demande
- omet powerups/checkpoints/portals/boss/motion s'ils ne sont pas demandés

EXEMPLE COMPACT:
${example}

Réponds: JSON UNIQUEMENT, commence par {`;
  },

  // ─── Mini-exemple par genre (ultra court : 1 niveau, sans pretty) ──
  _miniExample(genre) {
    const ex = {
      platformer: {
        meta:{title:"Forest Quest",subtitle:"",genre:"platformer",description:""},
        theme:{background:{type:"gradient",colors:["#0a3a2a","#0a1a0a"]},parallax:[{color:"#1a4a3a",speed:0.3,shapes:"hills",y:450}],palette:{player:"#ffeb3b",platform:"#5a3a2a",enemy:"#d32f2f",collectible:"#fff176",exit:"#4caf50",hazard:"#e91e63"}},
        physics:{gravity:0.5,jumpForce:-12,moveSpeed:5,friction:0.85},
        player:{width:24,height:36,health:3,skills:{doubleJump:true,shoot:false,dash:false}},
        enemies:{slime:{width:30,height:24,color:"#9c27b0",ai:"patrol",speed:2,health:1,damage:1}},
        levels:[{name:"Forêt",width:2000,height:600,playerStart:{x:80,y:400},platforms:[{x:0,y:550,w:700,h:50},{x:800,y:480,w:200,h:20},{x:1100,y:550,w:900,h:50}],enemies:[{type:"slime",x:400,y:520,range:150}],collectibles:[{type:"coin",x:200,y:500,value:10},{type:"coin",x:850,y:440,value:10},{type:"coin",x:1500,y:500,value:10}],hazards:[{type:"spikes",x:1020,y:580,w:80,h:20}],exit:{x:1900,y:470,w:50,h:80}}],
        rules:{winCondition:"reach_exit_all_levels",loseCondition:"health_zero"}
      },
      runner: {
        meta:{title:"Neon Run",subtitle:"",genre:"runner",description:""},
        theme:{background:{type:"gradient",colors:["#0a0a2e","#1a0a3e"]},parallax:[{color:"#4a2a8e",speed:0.5,shapes:"mountains",y:400}],palette:{player:"#00e5ff",platform:"#3a1a5e",enemy:"#ff1744",collectible:"#ffea00",exit:"#76ff03",hazard:"#ff5722"}},
        physics:{gravity:0.6,jumpForce:-13,moveSpeed:6,friction:0.9},
        player:{width:24,height:36,health:3,skills:{doubleJump:true,shoot:false,dash:false}},
        enemies:{drone:{width:28,height:28,color:"#ff1744",ai:"static",speed:0,health:1,damage:1}},
        levels:[{name:"S01",width:3000,height:600,playerStart:{x:80,y:400},platforms:[{x:0,y:550,w:1200,h:50},{x:1350,y:550,w:1650,h:50}],enemies:[{type:"drone",x:1500,y:520,range:0}],collectibles:[{type:"coin",x:500,y:500,value:10},{type:"coin",x:1700,y:500,value:10},{type:"coin",x:2500,y:500,value:10}],hazards:[{type:"spikes",x:1200,y:580,w:150,h:20}],exit:{x:2900,y:470,w:50,h:80}}],
        rules:{winCondition:"reach_exit_all_levels",loseCondition:"health_zero"}
      },
      topdown: {
        meta:{title:"Maze",subtitle:"",genre:"topdown",description:""},
        theme:{background:{type:"gradient",colors:["#1a1a1a","#0a0a0a"]},parallax:[],palette:{player:"#03a9f4",platform:"#444",enemy:"#f44336",collectible:"#ffc107",exit:"#8bc34a",hazard:"#e91e63"}},
        physics:{gravity:0,jumpForce:0,moveSpeed:4,friction:1},
        player:{width:24,height:24,health:3,skills:{doubleJump:false,shoot:true,dash:false}},
        enemies:{guard:{width:24,height:24,color:"#f44336",ai:"follow",speed:1.5,health:2,damage:1}},
        levels:[{name:"Z1",width:1600,height:1200,playerStart:{x:80,y:80},platforms:[{x:0,y:0,w:1600,h:30},{x:0,y:1170,w:1600,h:30},{x:0,y:0,w:30,h:1200},{x:1570,y:0,w:30,h:1200},{x:600,y:0,w:30,h:600}],enemies:[{type:"guard",x:800,y:600,range:0}],collectibles:[{type:"key",x:1300,y:600,value:50}],hazards:[],exit:{x:1450,y:1050,w:80,h:80}}],
        rules:{winCondition:"reach_exit_all_levels",loseCondition:"health_zero"}
      },
      shooter: {
        meta:{title:"Star Defender",subtitle:"",genre:"shooter",description:""},
        theme:{background:{type:"gradient",colors:["#000010","#000033"]},parallax:[{color:"#ffffff",speed:0.2,shapes:"stars",y:300}],palette:{player:"#00ff88",platform:"#222",enemy:"#ff0044",collectible:"#ffdd00",exit:"#00ffff",hazard:"#ff4400"}},
        physics:{gravity:0.4,jumpForce:-11,moveSpeed:5,friction:0.85},
        player:{width:30,height:24,health:3,skills:{doubleJump:false,shoot:true,dash:false}},
        enemies:{invader:{width:28,height:24,color:"#ff0044",ai:"horizontal",speed:2,health:1,damage:1}},
        levels:[{name:"W1",width:2400,height:600,playerStart:{x:80,y:450},platforms:[{x:0,y:550,w:2400,h:50}],enemies:[{type:"invader",x:600,y:520,range:200},{type:"invader",x:1500,y:520,range:200}],collectibles:[{type:"coin",x:300,y:500,value:10},{type:"coin",x:1200,y:500,value:10}],hazards:[],exit:{x:2300,y:470,w:50,h:80}}],
        rules:{winCondition:"reach_exit_all_levels",loseCondition:"health_zero"}
      }
    };
    return JSON.stringify(ex[genre] || ex.platformer);
  },

  // ─── Prompt de fix : compact, spec sans pretty ─────────────────────
  buildFix({ spec, issues, description }) {
    const desc = String(description || "").substring(0, 300);
    return `Corrige ce JSON GAME_SPEC. Réponds JSON UNIQUEMENT.
DEMANDE: ${desc}
PROBLEMES:
${issues.map(i => "- " + i).join("\n")}
SPEC:
${JSON.stringify(spec)}
JSON corrigé uniquement, commence par {`;
  },

  // ─── Prompt de critique : court ────────────────────────────────────
  buildCritique({ spec, description }) {
    const desc = String(description || "").substring(0, 200);
    const specStr = JSON.stringify(spec).substring(0, 3500);
    return `Évalue cette spec. Réponds JSON: {"playable":true|false,"fun":0-3,"matches_description":0-2,"level_design":0-3,"issues":["..."]}
DEMANDE: ${desc}
SPEC: ${specStr}
JSON uniquement.`;
  }
};

window.SpecPrompts = SpecPrompts;

// ─── Diagnostic : taille du prompt à la 1re utilisation ─────────────
(function () {
  const _orig = SpecPrompts.buildSpec.bind(SpecPrompts);
  SpecPrompts.buildSpec = function (args) {
    const out = _orig(args);
    const tokens = Math.round(out.length / 4);   // estimation grossière
    console.log("[SpecPrompts v3-compact] prompt:", out.length, "chars ≈", tokens, "tokens");
    return out;
  };
  console.log("[SpecPrompts] v3-compact chargé (≈3k tokens max)");
})();
