/* ════════════════════════════════════════════════════════════════════
 *  GAMEFORGE RUNTIME ENGINE v2.0
 *  Copyright (c) 2026 CHAOUSSI Cherif — Licence MIT
 *  ----------------------------------------------------------------
 *  Moteur universel : platformer / runner / topdown / shooter
 *  Entités v2 : boss multi-phases, power-ups, checkpoints,
 *               portails, plateformes mobiles, sprites pixel-art.
 *  ════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  // ─── BOOTSTRAP ─────────────────────────────────────────────────────
  var SPEC = window.GAME_SPEC;
  if (!SPEC) {
    document.body.innerHTML = "<pre style='color:#f00;font-family:monospace;padding:20px'>ERROR: window.GAME_SPEC manquant</pre>";
    return;
  }
  var SP = window.GFSprites;   // sprites optionnels
  var canvas = document.getElementById("game") || (function () { var c = document.createElement("canvas"); c.id = "game"; document.body.appendChild(c); return c; })();
  var ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  var W = 0, H = 0;
  function resize() { W = canvas.width = innerWidth; H = canvas.height = innerHeight; ctx.imageSmoothingEnabled = false; }
  addEventListener("resize", resize); resize();

  // ─── INPUT (clavier + tactile unifié) ──────────────────────────────
  var keys = {}, touch = { left:0,right:0,up:0,down:0,action:0,action2:0 };
  addEventListener("keydown", function (e) { keys[e.code]=1; if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space"].indexOf(e.code)>=0) e.preventDefault(); });
  addEventListener("keyup",   function (e) { keys[e.code]=0; });
  function input() {
    return {
      left:    keys.ArrowLeft||keys.KeyA||touch.left,
      right:   keys.ArrowRight||keys.KeyD||touch.right,
      up:      keys.ArrowUp||keys.KeyW||touch.up,
      down:    keys.ArrowDown||keys.KeyS||touch.down,
      jump:    keys.Space||keys.ArrowUp||keys.KeyW||touch.up||touch.action,
      action:  keys.KeyJ||keys.KeyZ||keys.Space||touch.action,
      action2: keys.KeyK||keys.KeyX||touch.action2
    };
  }

  // ─── TACTILE GAMEPAD ──────────────────────────────────────────────
  function buildTouchPad() {
    if (!("ontouchstart" in window) && navigator.maxTouchPoints === 0) return;
    var p = document.createElement("div"); p.id = "gf-pad";
    p.innerHTML = '<div class="dpad"><button data-k="left">◀</button><button data-k="up">▲</button><button data-k="down">▼</button><button data-k="right">▶</button></div><div class="actions"><button data-k="action">A</button><button data-k="action2">B</button></div>';
    var s = document.createElement("style");
    s.textContent = '#gf-pad{position:fixed;left:0;right:0;bottom:0;height:140px;display:flex;justify-content:space-between;align-items:flex-end;padding:14px;pointer-events:none;z-index:1000;user-select:none}#gf-pad .dpad{position:relative;width:140px;height:120px;pointer-events:auto}#gf-pad .actions{display:flex;gap:14px;pointer-events:auto}#gf-pad button{position:absolute;background:rgba(255,255,255,0.18);border:2px solid rgba(255,255,255,0.35);color:#fff;font-size:22px;font-family:monospace;border-radius:50%;width:54px;height:54px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:none}#gf-pad button:active,#gf-pad button.gf-on{background:rgba(255,255,255,0.45);transform:scale(0.92)}#gf-pad .dpad button[data-k="left"]{left:0;top:33px}#gf-pad .dpad button[data-k="right"]{left:66px;top:33px}#gf-pad .dpad button[data-k="up"]{left:33px;top:0}#gf-pad .dpad button[data-k="down"]{left:33px;top:66px}#gf-pad .actions button{position:relative;width:64px;height:64px;font-size:24px;font-weight:bold;background:rgba(0,255,136,0.25);border-color:rgba(0,255,136,0.6)}';
    document.head.appendChild(s); document.body.appendChild(p);
    [].forEach.call(p.querySelectorAll("button"), function (b) {
      var k = b.getAttribute("data-k");
      var on = function (e) { e.preventDefault(); touch[k]=1; b.classList.add("gf-on"); };
      var off= function (e) { e.preventDefault(); touch[k]=0; b.classList.remove("gf-on"); };
      b.addEventListener("touchstart", on, {passive:false});
      b.addEventListener("touchend",   off,{passive:false});
      b.addEventListener("touchcancel",off,{passive:false});
      b.addEventListener("mousedown",  on); b.addEventListener("mouseup", off); b.addEventListener("mouseleave", off);
    });
  } buildTouchPad();

  // ─── AUDIO ─────────────────────────────────────────────────────────
  var AC = null;
  function beep(f, d, t) { try { if (!AC) AC = new (window.AudioContext||window.webkitAudioContext)(); var o=AC.createOscillator(),g=AC.createGain(); o.type=t||"square"; o.frequency.value=f; g.gain.value=0.08; o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime+(d||0.08)); } catch(e){} }

  // ─── HELPERS ───────────────────────────────────────────────────────
  function aabb(a, b) { return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
  function clamp(v, lo, hi) { return v<lo?lo:v>hi?hi:v; }
  function get(o, p, d) { var k=p.split("."), c=o; for (var i=0;i<k.length;i++){ if(c==null)return d; c=c[k[i]]; } return c==null?d:c; }
  function drawSprite(role, x, y, w, h, facing) {
    if (SP && SP.has(role)) SP.draw(ctx, x, y, w, h, role, palette, facing||1);
    else { ctx.fillStyle = palette[role] || "#888"; ctx.fillRect(x, y, w, h); }
  }

  // ─── SPEC / WORLD ──────────────────────────────────────────────────
  var theme    = SPEC.theme   || {};
  var palette  = theme.palette || { player:"#0f8", platform:"#888", enemy:"#f44", collectible:"#fd0", exit:"#0ff", hazard:"#f08" };
  var phys     = SPEC.physics || { gravity:0.5, jumpForce:-12, moveSpeed:5, friction:0.85 };
  var pSpec    = SPEC.player  || { width:24, height:36, health:3 };
  var levels   = SPEC.levels  || [];
  var genre    = (SPEC.meta && SPEC.meta.genre) || "platformer";
  var enemyDefs= SPEC.enemies || {};
  var bossDef  = SPEC.boss    || null;

  var state = {
    mode:"title", levelIdx:0, score:0, lives:pSpec.health||3,
    cam:{x:0,y:0}, player:null, level:null, fxs:[],
    msgT:0, msg:"", checkpoint:null,
    powerups:{ shield:0, dash:0, doubleJump:0 }
  };

  // ─── PLAYER ────────────────────────────────────────────────────────
  function makePlayer(start) {
    return {
      x:start.x, y:start.y, w:pSpec.width||24, h:pSpec.height||36,
      vx:0, vy:0, onGround:false, facing:1,
      jumps:0, maxJumps: get(SPEC,"player.skills.doubleJump",false) ? 2 : 1,
      invul:0, dead:false, shootCD:0, dashCD:0, dashing:0
    };
  }

  // ─── LEVEL LOAD ────────────────────────────────────────────────────
  function loadLevel(i) {
    var L = levels[i]; if (!L) return;
    state.level = {
      idx:i, name: L.name || "Niveau "+(i+1),
      width: L.width||2400, height: L.height||H,
      platforms: (L.platforms||[]).map(function(p){
        return {
          x:p.x, y:p.y, w:p.w, h:p.h,
          color:p.color||palette.platform, type:p.type||"solid",
          // moving platform
          motion: p.motion||null,    // {axis:"x"|"y", range:200, speed:1}
          baseX:p.x, baseY:p.y, t:0, dir:1
        };
      }),
      enemies: (L.enemies||[]).map(function(e){
        var d = enemyDefs[e.type] || {};
        return {
          type:e.type, x:e.x, y:e.y,
          w:d.width||24, h:d.height||24, color:d.color||palette.enemy,
          ai:d.ai||"patrol", speed:d.speed||2, health:d.health||1, damage:d.damage||1,
          range:e.range||200, baseX:e.x, baseY:e.y, dir:1, t:0, dead:false,
          sprite: d.sprite||e.type
        };
      }),
      collectibles: (L.collectibles||[]).map(function(c){
        return { x:c.x, y:c.y, w:14, h:14, type:c.type||"coin", value:c.value||10, taken:false };
      }),
      hazards: (L.hazards||[]).map(function(h){
        return { x:h.x, y:h.y, w:h.w, h:h.h, type:h.type||"spikes", color:h.color||palette.hazard };
      }),
      // ── NOUVEAUTÉS v2 ──
      powerups: (L.powerups||[]).map(function(p){
        return { x:p.x, y:p.y, w:18, h:18, type:p.type||"health", duration:p.duration||600, taken:false };
      }),
      checkpoints: (L.checkpoints||[]).map(function(c){
        return { x:c.x, y:c.y, w:16, h:32, activated:false };
      }),
      portals: (L.portals||[]).map(function(p){
        return { x:p.x, y:p.y, w:24, h:32, target:p.target, id:p.id, cooldown:0 };
      }),
      boss: L.boss ? makeBoss(L.boss) : null,
      exit: L.exit || { x:(L.width||2400)-80, y:H-200, w:50, h:80 },
      bg: L.bg || theme.background
    };
    state.player = makePlayer(state.checkpoint || L.playerStart || {x:80, y:200});
    state.fxs = [];
    flash(state.level.name);
  }

  function flash(t) { state.msg = t; state.msgT = 90; }

  // ─── BOSS ──────────────────────────────────────────────────────────
  function makeBoss(b) {
    var d = bossDef || {};
    return {
      x:b.x, y:b.y, w:d.width||64, h:d.height||80,
      color:d.color||palette.enemy,
      health:b.health||d.health||10, maxHealth:b.health||d.health||10,
      phase:1, phases:d.phases||3,
      pattern:"idle", patternT:0, t:0,
      vx:0, vy:0, baseX:b.x, baseY:b.y, dead:false, hurtT:0
    };
  }

  function updateBoss() {
    var L = state.level, p = state.player; if (!L.boss || L.boss.dead || !p) return;
    var b = L.boss; b.t++; if (b.hurtT > 0) b.hurtT--;
    var hpRatio = b.health / b.maxHealth;
    b.phase = hpRatio > 0.66 ? 1 : hpRatio > 0.33 ? 2 : 3;
    b.patternT++;
    var ratio = [0,0,140,90,60][b.phase] || 90;

    if (b.patternT > ratio) {
      b.patternT = 0;
      var patterns = b.phase === 1 ? ["shoot","shoot","jump"] : b.phase === 2 ? ["shoot","jump","spread","shoot"] : ["spread","spread","jump","spread"];
      b.pattern = patterns[(b.t / 100 | 0) % patterns.length];

      if (b.pattern === "shoot") {
        var dx = p.x - b.x, dy = p.y - b.y, m = Math.sqrt(dx*dx+dy*dy)||1;
        state.fxs.push({ kind:"bullet", x:b.x+b.w/2, y:b.y+b.h/2, vx:dx/m*5, vy:dy/m*5, t:180, friendly:false, color:"#ff44aa" });
        beep(220, 0.1, "sawtooth");
      } else if (b.pattern === "spread") {
        for (var k = 0; k < 8; k++) {
          var a = (Math.PI*2/8)*k;
          state.fxs.push({ kind:"bullet", x:b.x+b.w/2, y:b.y+b.h/2, vx:Math.cos(a)*4, vy:Math.sin(a)*4, t:120, friendly:false, color:"#ff44aa" });
        }
        beep(180, 0.15, "sawtooth");
      } else if (b.pattern === "jump") {
        b.vy = -14; beep(140, 0.2, "square");
      }
    }

    // Mouvement : rebondit
    b.x += Math.cos(b.t*0.02) * 0.8;
    b.vy += phys.gravity * 0.6; b.y += b.vy;
    if (b.y > b.baseY) { b.y = b.baseY; b.vy = 0; }

    // Player attack : stomp ou bullet
    if (!p.dead && p.vy > 0 && p.y + p.h - p.vy <= b.y + 6 && aabb(p, b)) {
      b.health--; b.hurtT = 15; p.vy = phys.jumpForce * 0.7; beep(900, 0.08);
      if (b.health <= 0) {
        b.dead = true; state.score += 500;
        state.fxs.push({ kind:"explosion", x:b.x+b.w/2, y:b.y+b.h/2, t:30, color:b.color });
        beep(660, 0.3, "sine");
      }
    } else if (aabb(p, b)) hurt(1);
  }

  // ─── PHYSICS / UPDATE ──────────────────────────────────────────────
  function updatePlayer(I) {
    var p = state.player, L = state.level; if (!p || p.dead) return;
    if (state.powerups.shield > 0) state.powerups.shield--;
    if (state.powerups.dash > 0)   state.powerups.dash--;
    if (state.powerups.doubleJump > 0) { state.powerups.doubleJump--; p.maxJumps = 2; }
    else if (!get(SPEC,"player.skills.doubleJump",false)) p.maxJumps = 1;

    // Movement
    if (genre === "topdown") {
      var dx = (I.right?1:0)-(I.left?1:0), dy = (I.down?1:0)-(I.up?1:0);
      var m = Math.sqrt(dx*dx+dy*dy)||1;
      p.vx = dx/m*phys.moveSpeed; p.vy = dy/m*phys.moveSpeed;
      if (dx>0) p.facing=1; else if (dx<0) p.facing=-1;
    } else if (genre === "runner") {
      p.vx = phys.moveSpeed * 1.2;
      if (I.jump && (p.onGround || p.jumps < p.maxJumps)) {
        if (!p._jumpHeld) { p.vy = phys.jumpForce; p.onGround = false; p.jumps++; beep(440, 0.06); }
        p._jumpHeld = true;
      } else if (!I.jump) p._jumpHeld = false;
      p.vy += phys.gravity; if (p.vy > 18) p.vy = 18; p.facing = 1;
    } else {
      var ax = (I.right?1:0)-(I.left?1:0);
      p.vx = ax * phys.moveSpeed * (p.dashing > 0 ? 2.5 : 1);
      if (ax > 0) p.facing = 1; else if (ax < 0) p.facing = -1;
      if (I.jump && (p.onGround || p.jumps < p.maxJumps)) {
        if (!p._jumpHeld) { p.vy = phys.jumpForce; p.onGround = false; p.jumps++; beep(520, 0.07); }
        p._jumpHeld = true;
      } else if (!I.jump) p._jumpHeld = false;
      p.vy += phys.gravity; if (p.vy > 18) p.vy = 18;
      // Dash
      if (I.action2 && p.dashCD <= 0 && (get(SPEC,"player.skills.dash",false) || state.powerups.dash > 0)) {
        p.dashing = 12; p.dashCD = 60; beep(700, 0.06);
      }
      if (p.dashing > 0) p.dashing--;
      if (p.dashCD > 0)  p.dashCD--;
    }

    // Tir
    if (I.action && p.shootCD <= 0 && get(SPEC,"player.skills.shoot",false)) {
      state.fxs.push({ kind:"bullet", x:p.x+p.w/2, y:p.y+p.h/2, vx:p.facing*10, vy:0, t:60, friendly:true, color:"#0ff" });
      p.shootCD = 12; beep(880, 0.04);
    }
    if (p.shootCD > 0) p.shootCD--;

    // Move + collide
    p.x += p.vx;
    L.platforms.forEach(function(pl){ if (aabb(p,pl)) { if (p.vx>0) p.x=pl.x-p.w; else if (p.vx<0) p.x=pl.x+pl.w; p.vx=0; } });
    p.y += p.vy; p.onGround = false;
    L.platforms.forEach(function(pl){
      if (aabb(p,pl)) {
        if (p.vy>0) {
          p.y=pl.y-p.h; p.vy=0; p.onGround=true; p.jumps=0;
          // moving platform : embarque le joueur
          if (pl.motion) { p._ridingX = pl._lastDx||0; }
        } else if (p.vy<0) { p.y=pl.y+pl.h; p.vy=0; }
      }
    });
    if (p._ridingX) { p.x += p._ridingX; p._ridingX = 0; }
    if (genre === "topdown") { p.onGround=true; p.jumps=0; }

    // Bounds
    p.x = clamp(p.x, 0, L.width-p.w);
    if (p.y > L.height + 200) hurt(999);

    if (p.invul > 0) p.invul--;

    // Hazards
    L.hazards.forEach(function(h){ if (aabb(p,h)) hurt(1); });

    // Collectibles
    L.collectibles.forEach(function(c){
      if (!c.taken && aabb(p,c)) { c.taken=true; state.score+=c.value; beep(1200,0.05,"sine"); state.fxs.push({kind:"sparkle",x:c.x+7,y:c.y+7,t:20}); }
    });

    // Power-ups
    L.powerups.forEach(function(pu){
      if (pu.taken || !aabb(p,pu)) return;
      pu.taken = true; beep(1000, 0.12, "sine");
      state.fxs.push({ kind:"sparkle", x:pu.x+9, y:pu.y+9, t:30 });
      if (pu.type === "health") { state.lives = Math.min((pSpec.health||3)+1, state.lives+1); }
      else if (pu.type === "shield") { state.powerups.shield = pu.duration; }
      else if (pu.type === "dash")   { state.powerups.dash   = pu.duration; }
      else if (pu.type === "doubleJump") { state.powerups.doubleJump = pu.duration; }
    });

    // Checkpoints
    L.checkpoints.forEach(function(cp){
      if (!cp.activated && aabb(p,cp)) { cp.activated = true; state.checkpoint = {x:cp.x, y:cp.y-p.h}; flash("✓ Checkpoint"); beep(660,0.1,"sine"); }
    });

    // Portails
    L.portals.forEach(function(po){
      if (po.cooldown > 0) { po.cooldown--; return; }
      if (!aabb(p,po)) return;
      var dest = L.portals.find(function(o){ return o.id === po.target; });
      if (dest) { p.x = dest.x; p.y = dest.y - p.h; dest.cooldown = 30; po.cooldown = 30; beep(800,0.15,"sine"); state.fxs.push({kind:"sparkle",x:p.x+p.w/2,y:p.y+p.h/2,t:25}); }
    });

    // Exit (boss requis OU clés)
    if (aabb(p, L.exit)) {
      var keysLeft = L.collectibles.filter(function(c){ return c.type==="key" && !c.taken; }).length;
      var bossAlive = L.boss && !L.boss.dead;
      if (keysLeft === 0 && !bossAlive) {
        beep(660,0.1,"sine"); setTimeout(function(){beep(880,0.15,"sine");}, 100);
        if (state.levelIdx + 1 < levels.length) {
          state.levelIdx++; state.checkpoint = null; state.mode = "nextLevel";
          setTimeout(function(){ loadLevel(state.levelIdx); state.mode = "play"; }, 1200);
        } else state.mode = "win";
      }
    }
  }

  function hurt(dmg) {
    var p = state.player; if (!p || p.invul > 0 || p.dead) return;
    if (state.powerups.shield > 0) { state.powerups.shield = 0; beep(400,0.1); state.fxs.push({kind:"sparkle",x:p.x+p.w/2,y:p.y+p.h/2,t:20}); p.invul = 30; return; }
    state.lives -= dmg; p.invul = 60; beep(180, 0.18, "sawtooth");
    if (state.lives <= 0) {
      if (state.checkpoint) {
        state.lives = 1; p.x = state.checkpoint.x; p.y = state.checkpoint.y; p.vx=0; p.vy=0; p.invul = 90;
        flash("Respawn checkpoint");
      } else { p.dead = true; state.mode = "dead"; }
    }
  }

  function updateEnemies() {
    var L = state.level, p = state.player;
    // Plateformes mobiles
    L.platforms.forEach(function(pl){
      if (!pl.motion) return;
      pl.t++;
      var prev = pl.motion.axis === "x" ? pl.x : pl.y;
      var off = Math.sin(pl.t * 0.02 * pl.motion.speed) * pl.motion.range;
      if (pl.motion.axis === "x") pl.x = pl.baseX + off;
      else pl.y = pl.baseY + off;
      pl._lastDx = pl.motion.axis === "x" ? (pl.x - prev) : 0;
    });
    L.enemies.forEach(function(e){
      if (e.dead) return; e.t++;
      if (e.ai === "patrol") {
        e.x += e.dir * e.speed; if (Math.abs(e.x-e.baseX) > e.range) e.dir *= -1;
      } else if (e.ai === "horizontal") {
        e.x += e.dir * e.speed;
        var hit = L.platforms.some(function(pl){ return aabb({x:e.x,y:e.y+e.h,w:e.w,h:2}, pl); });
        if (!hit || Math.abs(e.x-e.baseX) > e.range) e.dir *= -1;
      } else if (e.ai === "fly") {
        e.x = e.baseX + Math.cos(e.t*0.04)*e.range; e.y = e.baseY + Math.sin(e.t*0.06)*30;
      } else if (e.ai === "follow" && p) {
        var dx=p.x-e.x, dy=p.y-e.y, m=Math.sqrt(dx*dx+dy*dy)||1;
        e.x += dx/m*e.speed; e.y += dy/m*e.speed;
      } else if (e.ai === "shoot" && p && e.t % 90 === 0) {
        var dx2=p.x-e.x, dy2=p.y-e.y, m2=Math.sqrt(dx2*dx2+dy2*dy2)||1;
        state.fxs.push({ kind:"bullet", x:e.x+e.w/2, y:e.y+e.h/2, vx:dx2/m2*5, vy:dy2/m2*5, t:120, friendly:false, color:"#f44" });
      }
      if (p && !p.dead && aabb(p,e)) {
        if (genre === "platformer" && p.vy > 0 && p.y + p.h - p.vy <= e.y + 4) {
          e.dead = true; p.vy = phys.jumpForce*0.7; state.score += 25; beep(700,0.08);
        } else hurt(e.damage);
      }
    });
    // FX
    state.fxs = state.fxs.filter(function(f){
      f.t--;
      if (f.kind === "bullet") {
        f.x += f.vx; f.y += f.vy;
        if (f.friendly) {
          L.enemies.forEach(function(e){
            if (!e.dead && aabb({x:f.x-3,y:f.y-3,w:6,h:6},e)) { e.health--; f.t=0; if (e.health<=0) { e.dead=true; state.score+=50; beep(900,0.06); } }
          });
          if (L.boss && !L.boss.dead && aabb({x:f.x-3,y:f.y-3,w:6,h:6}, L.boss)) {
            L.boss.health--; L.boss.hurtT = 10; f.t = 0; beep(800,0.05);
            if (L.boss.health <= 0) { L.boss.dead = true; state.score += 500; state.fxs.push({kind:"explosion",x:L.boss.x+L.boss.w/2,y:L.boss.y+L.boss.h/2,t:30,color:L.boss.color}); }
          }
        } else if (p && !p.dead && aabb({x:f.x-3,y:f.y-3,w:6,h:6}, p)) { hurt(1); f.t = 0; }
      }
      return f.t > 0;
    });
  }

  // ─── CAMERA ────────────────────────────────────────────────────────
  function updateCamera() {
    var p = state.player, L = state.level; if (!p || !L) return;
    var tx = p.x - W*0.4, ty = L.height > H ? p.y - H*0.5 : 0;
    state.cam.x += (tx-state.cam.x)*0.1; state.cam.y += (ty-state.cam.y)*0.1;
    state.cam.x = clamp(state.cam.x, 0, Math.max(0, L.width-W));
    state.cam.y = clamp(state.cam.y, 0, Math.max(0, L.height-H));
  }

  // ─── RENDER ────────────────────────────────────────────────────────
  function drawBackground() {
    var bg = state.level && state.level.bg ? state.level.bg : theme.background;
    if (bg && bg.type === "gradient" && bg.colors) {
      var g = ctx.createLinearGradient(0,0,0,H), n = bg.colors.length;
      bg.colors.forEach(function(c,i){ g.addColorStop(i/(n-1||1), c); });
      ctx.fillStyle = g;
    } else if (bg && bg.color) ctx.fillStyle = bg.color;
    else ctx.fillStyle = "#0a0a18";
    ctx.fillRect(0,0,W,H);
  }
  function drawParallax() {
    (theme.parallax||[]).forEach(function(lay, idx){
      ctx.fillStyle = lay.color || "#222";
      var off = (state.cam.x*(lay.speed||0.3))%W, y = lay.y!=null ? lay.y : H-(60+idx*30);
      if (lay.shapes === "stars") {
        for (var i=0;i<50;i++){ var sx=((i*173-off)%W+W)%W, sy=(i*71)%H; ctx.fillRect(sx,sy,2,2); }
      } else if (lay.shapes === "mountains") {
        ctx.beginPath(); ctx.moveTo(0,H);
        for (var k=0;k<=8;k++){ var mx=(k*(W/7)-off+W*2)%(W*1.2); ctx.lineTo(mx, y-(k%2?40:80)); }
        ctx.lineTo(W,H); ctx.closePath(); ctx.fill();
      } else {
        for (var b=-1;b<6;b++){ ctx.beginPath(); ctx.arc((b*W*0.4-off+W*2)%(W*1.5), y, 80+idx*20, Math.PI, 0); ctx.fill(); }
      }
    });
  }
  function drawLevel() {
    var L = state.level; if (!L) return;
    ctx.save(); ctx.translate(-state.cam.x, -state.cam.y);

    // Plateformes (sprites tilés ou rect simple)
    L.platforms.forEach(function(pl){
      if (SP && SP.has("platform") && pl.h <= 30 && pl.w <= 400) {
        SP.draw(ctx, pl.x, pl.y, pl.w, pl.h, "platform", palette, 1);
      } else {
        ctx.fillStyle = pl.color; ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
        ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(pl.x, pl.y, pl.w, 3);
      }
    });

    // Hazards
    L.hazards.forEach(function(h){
      ctx.fillStyle = h.color;
      var n = Math.max(2, Math.floor(h.w/12));
      for (var i=0;i<n;i++){ var sx=h.x+i*(h.w/n);
        ctx.beginPath(); ctx.moveTo(sx, h.y+h.h); ctx.lineTo(sx+h.w/n/2, h.y); ctx.lineTo(sx+h.w/n, h.y+h.h); ctx.closePath(); ctx.fill();
      }
    });

    // Collectibles (sprites pixel-art)
    L.collectibles.forEach(function(c){
      if (c.taken) return;
      var pulse = Math.sin(Date.now()*0.006)*2;
      var role = c.type === "key" ? "key" : c.type === "crystal" ? "crystal" : "coin";
      drawSprite(role, c.x, c.y+pulse, c.w, c.h, 1);
    });

    // Power-ups
    L.powerups.forEach(function(pu){
      if (pu.taken) return;
      var pulse = Math.sin(Date.now()*0.008)*3;
      var role = "powerup_" + pu.type;
      if (SP && SP.has(role)) SP.draw(ctx, pu.x, pu.y+pulse, pu.w, pu.h, role, palette, 1);
      else { ctx.fillStyle = pu.type==="health"?"#f44":pu.type==="shield"?"#48f":"#ff0"; ctx.fillRect(pu.x, pu.y+pulse, pu.w, pu.h); }
    });

    // Checkpoints
    L.checkpoints.forEach(function(cp){
      var col = cp.activated ? "#4caf50" : "#888";
      var oldPal = palette.checkpoint; palette.checkpoint = col;
      drawSprite("flag", cp.x, cp.y, cp.w, cp.h, 1);
      palette.checkpoint = oldPal;
    });

    // Portails
    L.portals.forEach(function(po){
      var spin = Date.now()*0.005;
      ctx.save(); ctx.translate(po.x+po.w/2, po.y+po.h/2); ctx.rotate(spin);
      drawSprite("portal", -po.w/2, -po.h/2, po.w, po.h, 1);
      ctx.restore();
    });

    // Exit
    var ex = L.exit;
    var keysLeft = L.collectibles.filter(function(c){return c.type==="key"&&!c.taken;}).length;
    var bossAlive = L.boss && !L.boss.dead;
    if (keysLeft === 0 && !bossAlive) drawSprite("exit_door", ex.x, ex.y, ex.w, ex.h, 1);
    else { ctx.fillStyle = "rgba(150,150,150,0.4)"; ctx.fillRect(ex.x, ex.y, ex.w, ex.h);
      ctx.fillStyle = "#fff"; ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
      ctx.fillText("🔒", ex.x+ex.w/2, ex.y+ex.h/2+5); ctx.textAlign = "left";
    }

    // Enemies
    L.enemies.forEach(function(e){
      if (e.dead) return;
      var role = e.sprite || e.type;
      if (!SP || !SP.has(role)) role = "drone";
      drawSprite(role, e.x, e.y, e.w, e.h, e.x < (p?p.x:0) ? 1 : -1);
    });

    // Boss
    if (L.boss && !L.boss.dead) {
      var b = L.boss;
      if (b.hurtT > 0 && Math.floor(b.hurtT/2)%2 === 0) ctx.globalAlpha = 0.4;
      drawSprite("boss", b.x, b.y, b.w, b.h, 1);
      ctx.globalAlpha = 1;
      // Healthbar
      var hbY = b.y - 12, hbW = b.w, hr = b.health/b.maxHealth;
      ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(b.x, hbY, hbW, 6);
      ctx.fillStyle = hr>0.5?"#4f4":hr>0.25?"#fc4":"#f44"; ctx.fillRect(b.x, hbY, hbW*hr, 6);
    }

    // FX
    state.fxs.forEach(function(f){
      if (f.kind === "bullet") {
        ctx.fillStyle = f.color || (f.friendly?"#0ff":"#f44");
        ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, Math.PI*2); ctx.fill();
      } else if (f.kind === "sparkle") {
        ctx.fillStyle = "rgba(255,255,150,"+(f.t/30)+")";
        ctx.beginPath(); ctx.arc(f.x, f.y, 12-f.t/3, 0, Math.PI*2); ctx.fill();
      } else if (f.kind === "explosion" && SP) {
        SP.fxExplosion(ctx, f.x, f.y, f.t, f.color);
      }
    });

    // Player
    var p = state.player;
    if (p) {
      var blink = p.invul > 0 && Math.floor(p.invul/4)%2 === 0;
      if (!blink) {
        if (state.powerups.shield > 0) {
          ctx.strokeStyle = "rgba(80,150,255,0.7)"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x+p.w/2, p.y+p.h/2, p.w*0.9, 0, Math.PI*2); ctx.stroke();
        }
        drawSprite("humanoid", p.x, p.y, p.w, p.h, p.facing);
        if (p.dashing > 0) {
          ctx.fillStyle = "rgba(0,255,255,0.3)";
          for (var i = 1; i <= 3; i++) ctx.fillRect(p.x - p.facing*i*8, p.y, p.w, p.h);
        }
      }
    }
    ctx.restore();
  }

  function drawHUD() {
    ctx.save();
    ctx.font = "bold 14px monospace";
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(10, 10, 240, 70);
    ctx.fillStyle = palette.collectible || "#fd0"; ctx.fillText("SCORE: "+state.score, 20, 32);
    ctx.fillStyle = "#f55"; ctx.fillText("VIES:  "+state.lives, 20, 52);
    // Power-up timers
    var pwx = 130;
    if (state.powerups.shield > 0) { ctx.fillStyle = "#48f"; ctx.fillText("🛡"+Math.ceil(state.powerups.shield/60), pwx, 32); pwx += 50; }
    if (state.powerups.dash > 0)   { ctx.fillStyle = "#ff0"; ctx.fillText("⚡"+Math.ceil(state.powerups.dash/60),  pwx, 32); pwx += 50; }
    if (state.powerups.doubleJump > 0) { ctx.fillStyle = "#0fc"; ctx.fillText("⇈"+Math.ceil(state.powerups.doubleJump/60), pwx, 32); }
    ctx.fillStyle = "#fff"; ctx.textAlign = "right";
    ctx.fillText((state.level?state.level.name:"")+" · "+(state.levelIdx+1)+"/"+levels.length, W-20, 32);
    ctx.textAlign = "left";

    if (state.msgT > 0) {
      state.msgT--;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, H/2-40, W, 80);
      ctx.fillStyle = "#fff"; ctx.font = "bold 28px monospace"; ctx.textAlign = "center";
      ctx.fillText(state.msg, W/2, H/2+8); ctx.textAlign = "left";
    }
    ctx.restore();
  }

  function drawTitle() {
    drawBackground(); drawParallax();
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0,0,W,H);
    ctx.textAlign = "center";
    ctx.fillStyle = palette.player;
    ctx.font = "bold "+Math.min(56,W/12)+"px monospace";
    ctx.fillText((SPEC.meta&&SPEC.meta.title)||"GAME", W/2, H/2-30);
    ctx.fillStyle = "#fff"; ctx.font = Math.min(18,W/30)+"px monospace";
    ctx.fillText((SPEC.meta&&SPEC.meta.subtitle)||"", W/2, H/2+10);
    var pulse = Math.sin(Date.now()*0.005)*0.3+0.7;
    ctx.fillStyle = "rgba(255,255,255,"+pulse+")"; ctx.font = "bold "+Math.min(20,W/24)+"px monospace";
    ctx.fillText("► APPUIE / TOUCHE pour commencer", W/2, H/2+60);
    ctx.font = Math.min(13,W/40)+"px monospace"; ctx.fillStyle = "rgba(255,255,255,0.6)";
    var ctrl = genre==="topdown" ? "ZQSD/Flèches : déplacer" : "Flèches : déplacer · Espace : sauter";
    if (get(SPEC,"player.skills.shoot",false)) ctrl += " · J : tirer";
    if (get(SPEC,"player.skills.dash",false))  ctrl += " · K : dash";
    ctx.fillText(ctrl, W/2, H-30); ctx.textAlign = "left";
  }

  function drawDeathOrWin() {
    drawBackground(); drawLevel();
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0,0,W,H);
    ctx.textAlign = "center"; ctx.font = "bold "+Math.min(56,W/10)+"px monospace";
    ctx.fillStyle = state.mode==="win" ? palette.collectible : "#f55";
    ctx.fillText(state.mode==="win"?"VICTOIRE !":"GAME OVER", W/2, H/2-20);
    ctx.fillStyle = "#fff"; ctx.font = "20px monospace";
    ctx.fillText("Score : "+state.score, W/2, H/2+20);
    ctx.font = "16px monospace"; ctx.fillText("► Touche pour rejouer", W/2, H/2+60);
    ctx.textAlign = "left";
  }

  // ─── MAIN LOOP ─────────────────────────────────────────────────────
  function loop() {
    var I = input();
    if (state.mode === "title") {
      drawTitle();
      if (I.jump||I.action||I.left||I.right||I.up||I.down) {
        state.mode = "play"; state.levelIdx = 0; state.score = 0;
        state.lives = pSpec.health||3; state.checkpoint = null;
        state.powerups = { shield:0, dash:0, doubleJump:0 };
        loadLevel(0);
      }
    } else if (state.mode === "play" || state.mode === "nextLevel") {
      if (state.mode === "play") { updatePlayer(I); updateEnemies(); updateBoss(); updateCamera(); }
      drawBackground(); drawParallax(); drawLevel(); drawHUD();
    } else if (state.mode === "dead" || state.mode === "win") {
      drawDeathOrWin();
      if (I.jump||I.action) state.mode = "title";
    }
    requestAnimationFrame(loop);
  }
  setInterval(function(){ if (state.player && !input().jump) state.player._jumpHeld = false; }, 100);
  loop();
  console.log("[GameForge v2] "+(SPEC.meta&&SPEC.meta.title)+" — "+levels.length+" niveaux ("+genre+") "+(SP?"+sprites":""));
})();
