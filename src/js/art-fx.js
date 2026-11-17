/* art-fx.js — projectiles, ground zones, lightning, floating labels and every transient effect. Registers PK.art.fx.
   Calm by design: effects are short, small and few, and nothing lingers. Every look is a sprite rendered once
   (3 device px per world unit) and stamped with drawImage; only a handful of rings/lanes are stroked live. */
(function () {
  'use strict';
  const PK = (window.PK = window.PK || {});
  const ART = (PK.art = PK.art || {});
  const C0 = PK.COL || {};
  const COL = { M: C0.M || '#a3b85e', A: C0.A || '#4da8ff', I: C0.I || '#b77dff', N: C0.N || '#ff5e4f', S: C0.S || '#ffa01f', brass: C0.brass || '#f2bb3d' };
  const TAU = Math.PI * 2, OUT = '#0a1118', S = 3, NONE = [];
  const DASH_AURA = [9, 13], DASH_LANE = [13, 12], DASH_CLAIM = [10, 8];
  const GHOST_C = Math.cos(0.26), GHOST_S = Math.sin(0.26);

  /* ---------- tiny helpers ---------- */
  function hex(h) {
    h = String(h || '');
    if (h[0] === '#' && h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    if (h[0] !== '#' || h.length !== 7) return [255, 255, 255];
    const n = parseInt(h.slice(1), 16); return n === n ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
  }
  function rgba(h, a) { const c = hex(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(h, to, k) { const c = hex(h), d = hex(to); return 'rgb(' + Math.round(c[0] + (d[0] - c[0]) * k) + ',' + Math.round(c[1] + (d[1] - c[1]) * k) + ',' + Math.round(c[2] + (d[2] - c[2]) * k) + ')'; }
  /* cheap deterministic "random" per effect: same value every frame for the same (seed, i) */
  function h(seed, i) { const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return v - Math.floor(v); }
  const eo2 = (f) => 1 - (1 - f) * (1 - f), eo3 = (f) => 1 - (1 - f) * (1 - f) * (1 - f);
  function dot(x, cx, cy, r, col) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fillStyle = col; x.fill(); }
  function rr(x, px, py, w, hh, rad) { x.beginPath(); x.moveTo(px + rad, py); x.arcTo(px + w, py, px + w, py + hh, rad); x.arcTo(px + w, py + hh, px, py + hh, rad); x.arcTo(px, py + hh, px, py, rad); x.arcTo(px, py, px + w, py, rad); x.closePath(); }
  function cap(x, x0, x1, r) { x.beginPath(); x.arc(x1 - r, 0, r, -Math.PI / 2, Math.PI / 2); x.arc(x0 + r, 0, r, Math.PI / 2, Math.PI * 1.5); x.closePath(); }

  /* sprite: w,h in world units, origin (ox,oy) in units from the top-left (default: centre) */
  function mk(w, hh, fn, ox, oy) {
    const cv = document.createElement('canvas'); cv.width = Math.ceil(w * S); cv.height = Math.ceil(hh * S);
    const x = cv.getContext('2d'); ox = ox === undefined ? w / 2 : ox; oy = oy === undefined ? hh / 2 : oy;
    x.scale(S, S); x.translate(ox, oy); x.lineJoin = 'round'; x.lineCap = 'round'; fn(x);
    return { c: cv, w, h: hh, ox, oy };
  }
  /* stamp a sprite with its origin at (x,y), scaled by k — no transform change */
  function put(c, s, x, y, k) { c.drawImage(s.c, x - s.ox * k, y - s.oy * k, s.w * k, s.h * k); }
  function ringStroke(c, x, y, r, col, w, a) { if (a <= 0.01 || r <= 0.5) return; c.globalAlpha = a > 1 ? 1 : a; c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }

  /* ---------- soft sprites, cached by colour ---------- */
  const GL = {}, SK = {};
  function glow(col) {
    let s = GL[col]; if (s) return s;
    s = document.createElement('canvas'); s.width = s.height = 64; const x = s.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.28, rgba(col, 0.62)); g.addColorStop(0.62, rgba(col, 0.18)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (GL[col] = s);
  }
  function speck(col) {
    let s = SK[col]; if (s) return s;
    s = document.createElement('canvas'); s.width = s.height = 24; const x = s.getContext('2d'), g = x.createRadialGradient(10, 9, 0, 12, 12, 12);
    g.addColorStop(0, mix(col, '#ffffff', 0.65)); g.addColorStop(0.5, rgba(col, 1)); g.addColorStop(0.78, rgba(col, 0.92)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, 24, 24); return (SK[col] = s);
  }
  function puff(r, g, b, a) {
    const s = document.createElement('canvas'); s.width = s.height = 96; const x = s.getContext('2d'), gr = x.createRadialGradient(45, 43, 0, 48, 48, 46);
    gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'); gr.addColorStop(0.5, 'rgba(' + r + ',' + g + ',' + b + ',' + a * 0.72 + ')'); gr.addColorStop(0.82, 'rgba(' + r + ',' + g + ',' + b + ',' + a * 0.2 + ')'); gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = gr; x.beginPath(); x.arc(48, 48, 47, 0, Math.PI * 2); x.fill(); return s;
  }
  function starSprite(fill, halo) {
    return mk(18, 18, (x) => {
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 8.5); g.addColorStop(0, rgba(halo, 0.6)); g.addColorStop(1, rgba(halo, 0)); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 8.5, 0, TAU); x.fill();
      x.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? 1.9 : 7.8; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fillStyle = fill; x.fill();
    });
  }
  function flamePath(x, cx, by, w, hh, tip) {
    x.beginPath(); x.moveTo(cx + tip, by - hh);
    x.bezierCurveTo(cx + w * 0.55 + tip * 0.3, by - hh * 0.6, cx + w * 1.15, by - hh * 0.32, cx + w, by - hh * 0.14);
    x.bezierCurveTo(cx + w * 0.85, by + hh * 0.1, cx - w * 0.85, by + hh * 0.1, cx - w, by - hh * 0.14);
    x.bezierCurveTo(cx - w * 1.15, by - hh * 0.32, cx - w * 0.3 + tip * 0.3, by - hh * 0.55, cx + tip, by - hh); x.closePath();
  }

  /* ---------- the sprite sheet (built on first use) ---------- */
  let SP = null;
  function boot() {
    SP = {};
    /* Fact Blaster bolt: white-hot idea capsule, brass rim, short tapering trail. Points along +x, origin = head. */
    SP.bolt = mk(48, 18, (x) => {
      let g = x.createRadialGradient(1, 0, 0, 1, 0, 8.5); g.addColorStop(0, 'rgba(255,220,120,.55)'); g.addColorStop(1, 'rgba(255,190,60,0)'); x.fillStyle = g; x.beginPath(); x.arc(1, 0, 8.5, 0, TAU); x.fill();
      g = x.createLinearGradient(-34, 0, 0, 0); g.addColorStop(0, 'rgba(255,196,70,0)'); g.addColorStop(0.5, 'rgba(255,204,90,.4)'); g.addColorStop(1, 'rgba(255,232,160,.95)');
      x.fillStyle = g; x.beginPath(); x.moveTo(-34, 0); x.lineTo(-2, -3.3); x.lineTo(-2, 3.3); x.closePath(); x.fill();
      cap(x, -5.6, 8.4, 5); x.fillStyle = 'rgba(10,17,24,.78)'; x.fill();
      cap(x, -4.7, 7.5, 4); x.fillStyle = COL.brass; x.fill();
      cap(x, -3.6, 6.7, 2.8); x.fillStyle = '#fffbe8'; x.fill();
    }, 36, 9);
    /* cannonball + its soft ground shadow */
    SP.ball = mk(20, 20, (x) => {
      x.beginPath(); x.arc(0, 0, 6.6, 0, TAU); x.fillStyle = '#39454d'; x.fill();
      x.save(); x.clip(); dot(x, -1.4, -1.6, 6.1, '#6c7c85'); x.restore();
      x.beginPath(); x.ellipse(-2.5, -2.9, 2.1, 1.3, -0.6, 0, TAU); x.fillStyle = 'rgba(236,246,250,.9)'; x.fill();
      x.lineWidth = 1.6; x.strokeStyle = OUT; x.beginPath(); x.arc(0, 0, 6.6, 0, TAU); x.stroke();
      x.lineWidth = 0.7; x.strokeStyle = 'rgba(255,236,190,.5)'; x.beginPath(); x.arc(0, 0, 7.8, 0, TAU); x.stroke();
    });
    SP.shadow = mk(20, 10, (x) => { x.scale(1, 0.5); const g = x.createRadialGradient(0, 0, 0, 0, 0, 9); g.addColorStop(0, 'rgba(4,10,16,.95)'); g.addColorStop(0.6, 'rgba(4,10,16,.6)'); g.addColorStop(1, 'rgba(4,10,16,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 9, 0, TAU); x.fill(); });
    /* newspaper */
    SP.paper = mk(22, 16, (x) => {
      rr(x, -8, -5.5, 16, 11, 1.3); x.fillStyle = '#f7f0da'; x.fill();
      x.save(); x.clip(); x.fillStyle = '#e2d5b2'; x.fillRect(0.5, -6, 8, 12); x.restore();
      x.fillStyle = '#2a2017'; x.fillRect(-6.5, -3.9, 5.5, 2);
      x.fillStyle = '#75654e'; x.fillRect(-6.5, -0.9, 5.5, 0.9); x.fillRect(-6.5, 0.9, 4.1, 0.9); x.fillRect(-6.5, 2.7, 5.1, 0.9); x.fillRect(1.9, -3.8, 4.6, 0.9);
      x.fillStyle = '#b9a988'; x.fillRect(1.9, -1.9, 4.6, 3.6);
      x.strokeStyle = 'rgba(42,32,23,.45)'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(0.5, -5.5); x.lineTo(0.5, 5.5); x.stroke();
      rr(x, -8, -5.5, 16, 11, 1.3); x.lineWidth = 1.5; x.strokeStyle = OUT; x.stroke();
    });
    /* boomerang (drawn for r = 13) + the spin lines that trail its tips */
    SP.boom = mk(48, 48, (x) => {
      const r = 13, arm = () => { x.beginPath(); x.moveTo(-r * 1.02, r * 0.42); x.quadraticCurveTo(-r * 0.4, -r * 0.4, 0, -r * 0.58); x.quadraticCurveTo(r * 0.4, -r * 0.4, r * 1.02, r * 0.42); };
      arm(); x.strokeStyle = OUT; x.lineWidth = r * 0.76; x.stroke();
      arm(); x.strokeStyle = '#8750dc'; x.lineWidth = r * 0.52; x.stroke();
      x.save(); x.translate(-0.5, -1); arm(); x.strokeStyle = COL.I; x.lineWidth = r * 0.34; x.stroke(); x.restore();
      x.save(); x.translate(-0.9, -1.9); arm(); x.strokeStyle = 'rgba(255,255,255,.34)'; x.lineWidth = r * 0.09; x.stroke(); x.restore();
      x.strokeStyle = '#f7efff'; x.lineWidth = r * 0.36; x.beginPath(); x.moveTo(-r * 1.0, r * 0.4); x.lineTo(-r * 0.86, r * 0.14); x.moveTo(r * 1.0, r * 0.4); x.lineTo(r * 0.86, r * 0.14); x.stroke();
      dot(x, 0, -r * 0.5, 1.9, '#ffd77a'); x.lineWidth = 0.9; x.strokeStyle = OUT; x.stroke();
    });
    SP.swoosh = mk(48, 48, (x) => {
      const R = 15.4, t0 = Math.atan2(0.42, 1.02), tips = [t0, Math.PI - t0];
      for (const a of tips) for (let i = 0; i < 5; i++) { x.strokeStyle = 'rgba(236,222,255,' + (0.9 - i * 0.19) + ')'; x.lineWidth = 3.4 - i * 0.5; x.beginPath(); x.arc(0, 0, R, a - 0.32 - (i + 1) * 0.3, a - 0.32 - i * 0.3 + 0.02); x.stroke(); }
    });
    /* alliance orb: blue core inside a tilted ring, soft halo; plus its trailing ghost */
    SP.orb = mk(36, 36, (x) => {
      const g = x.createRadialGradient(0, 0, 2, 0, 0, 17); g.addColorStop(0, 'rgba(77,168,255,.6)'); g.addColorStop(0.55, 'rgba(77,168,255,.22)'); g.addColorStop(1, 'rgba(77,168,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 17, 0, TAU); x.fill();
      x.strokeStyle = '#0d2c52'; x.lineWidth = 3.1; x.beginPath(); x.ellipse(0, 0.6, 11.6, 4.2, -0.32, Math.PI, TAU); x.stroke();
      x.strokeStyle = '#eaf5ff'; x.lineWidth = 1.7; x.beginPath(); x.ellipse(0, 0.6, 11.6, 4.2, -0.32, Math.PI, TAU); x.stroke();
      x.beginPath(); x.arc(0, 0, 7.4, 0, TAU); x.fillStyle = '#2a76cf'; x.fill();
      x.save(); x.clip(); dot(x, -1.3, -1.6, 6.5, '#5cb0ff'); dot(x, -2.3, -2.7, 3.3, '#c2e4ff'); x.restore();
      dot(x, -3, -3.3, 1.3, '#ffffff');
      x.lineWidth = 1.6; x.strokeStyle = '#0d2c52'; x.beginPath(); x.arc(0, 0, 7.4, 0, TAU); x.stroke();
      x.strokeStyle = '#0d2c52'; x.lineWidth = 3.1; x.beginPath(); x.ellipse(0, 0.6, 11.6, 4.2, -0.32, 0.1, Math.PI - 0.1); x.stroke();
      x.strokeStyle = '#eaf5ff'; x.lineWidth = 1.7; x.beginPath(); x.ellipse(0, 0.6, 11.6, 4.2, -0.32, 0, Math.PI); x.stroke();
    });
    /* burning fuse trail: six flame frames, each with its own ground glow and ember */
    SP.flame = [];
    for (let k = 0; k < 6; k++) SP.flame.push(mk(60, 54, (x) => {
      const ph = k / 6 * TAU, T = [[-11, 5.6, 11, 2.1], [10.5, 6, 12.5, 4.0], [0, 8, 17.5, 0]];
      x.save(); x.scale(1, 0.42); const g = x.createRadialGradient(0, 0, 2, 0, 0, 28); g.addColorStop(0, 'rgba(240,120,40,.34)'); g.addColorStop(0.5, 'rgba(220,80,24,.18)'); g.addColorStop(1, 'rgba(200,60,16,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 28, 0, TAU); x.fill(); x.restore();
      x.fillStyle = 'rgba(46,16,6,.62)'; x.beginPath(); x.ellipse(0, 0.9, 17.5, 4.3, 0, 0, TAU); x.fill();
      dot(x, -8.5, 1.6, 1.1, 'rgba(255,140,50,.9)'); dot(x, 6.5, 2, 1, 'rgba(255,160,60,.9)'); dot(x, 14, 0.9, 0.9, 'rgba(240,120,40,.85)'); dot(x, -15, 0.7, 0.8, 'rgba(240,120,40,.8)');
      for (const q of T) {
        const cx = q[0], w = q[1], sway = Math.sin(ph + q[3]) * w * 0.32, hh = q[2] * (1 + Math.cos(ph * 2 + q[3]) * 0.09);
        flamePath(x, cx, 0, w, hh, sway); x.fillStyle = '#d63a0e'; x.fill(); x.lineWidth = 1.1; x.strokeStyle = 'rgba(96,24,0,.66)'; x.stroke();
        flamePath(x, cx + w * 0.05, -0.6, w * 0.64, hh * 0.66, sway * 0.75); x.fillStyle = '#f06a16'; x.fill();
        flamePath(x, cx + w * 0.02, -1.1, w * 0.3, hh * 0.3, sway * 0.5); x.fillStyle = '#ffae4a'; x.fill();
      }
    }, 30, 41));
    /* emperor's planted flag, three wave frames (origin = foot of the pole) */
    SP.flag = [];
    for (let k = 0; k < 3; k++) SP.flag.push(mk(38, 44, (x) => {
      const wv = [0, 1.7, -1.4][k];
      x.fillStyle = 'rgba(10,17,24,.5)'; x.beginPath(); x.ellipse(0, 0.6, 6.5, 2.4, 0, 0, TAU); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 3.6; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -31); x.stroke(); x.strokeStyle = '#eadcc0'; x.lineWidth = 1.7; x.stroke();
      const flag = () => { x.beginPath(); x.moveTo(1, -30.5); x.bezierCurveTo(8, -33.5 + wv, 14, -27 - wv, 23, -30 + wv * 0.6); x.lineTo(22.4, -17.6 + wv * 0.4); x.bezierCurveTo(14, -15 - wv, 8, -21.5 + wv, 1, -18.5); x.closePath(); };
      flag(); x.fillStyle = COL.I; x.fill();
      x.save(); x.clip(); x.fillStyle = 'rgba(60,20,120,.34)'; x.fillRect(0, -22.5, 26, 10); x.restore();
      flag(); x.lineWidth = 1.6; x.strokeStyle = OUT; x.stroke();
      dot(x, 11.6, -24.6 + wv * 0.2, 2.5, '#ffd77a'); x.lineWidth = 1; x.strokeStyle = OUT; x.stroke();
      dot(x, 0, -32.2, 2.2, COL.brass); x.lineWidth = 1.2; x.strokeStyle = OUT; x.stroke();
    }, 10, 39));
    /* effect bits */
    SP.starW = starSprite('#ffffff', '#ffd77a'); SP.starB = starSprite('#ffe08a', '#ffb93d'); SP.starG = starSprite('#d8ffe9', '#58e69a'); SP.starC = starSprite('#ffffff', '#7fe3ff');
    SP.smoke = puff(64, 56, 52, 0.78); SP.dust = puff(214, 199, 172, 0.72);
    SP.flash = (() => { const s = document.createElement('canvas'); s.width = s.height = 96; const x = s.getContext('2d'), g = x.createRadialGradient(48, 48, 0, 48, 48, 48); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.32, 'rgba(255,238,176,.95)'); g.addColorStop(0.66, 'rgba(255,170,60,.55)'); g.addColorStop(1, 'rgba(255,110,30,0)'); x.fillStyle = g; x.fillRect(0, 0, 96, 96); return s; })();
    SP.fire = (() => { const sp = document.createElement('canvas'); sp.width = sp.height = 96; const x = sp.getContext('2d'), g = x.createRadialGradient(46, 45, 0, 48, 48, 48); g.addColorStop(0, 'rgba(255,250,214,1)'); g.addColorStop(0.3, 'rgba(255,206,92,.98)'); g.addColorStop(0.62, 'rgba(255,124,32,.9)'); g.addColorStop(0.86, 'rgba(214,62,14,.5)'); g.addColorStop(1, 'rgba(180,40,10,0)'); x.fillStyle = g; x.fillRect(0, 0, 96, 96); return sp; })();
    SP.plus = mk(14, 14, (x) => {
      const p = () => { x.beginPath(); x.moveTo(-1.7, -5); x.lineTo(1.7, -5); x.lineTo(1.7, -1.7); x.lineTo(5, -1.7); x.lineTo(5, 1.7); x.lineTo(1.7, 1.7); x.lineTo(1.7, 5); x.lineTo(-1.7, 5); x.lineTo(-1.7, 1.7); x.lineTo(-5, 1.7); x.lineTo(-5, -1.7); x.lineTo(-1.7, -1.7); x.closePath(); };
      p(); x.lineWidth = 2.6; x.strokeStyle = 'rgba(6,36,22,.85)'; x.stroke(); x.fillStyle = '#6dfab0'; x.fill();
      x.fillStyle = 'rgba(255,255,255,.75)'; x.fillRect(-1, -4.2, 1.2, 2.2);
    });
    SP.impact = mk(34, 34, (x) => {
      const st = (R, r, n) => { x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2 + 0.2, rad = i % 2 ? r : R; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad); } x.closePath(); };
      st(14, 7.2, 8); x.fillStyle = '#ff4a3a'; x.fill(); x.lineWidth = 1.6; x.strokeStyle = OUT; x.stroke();
      st(8.6, 4.2, 8); x.fillStyle = '#ffd9a0'; x.fill(); st(4.6, 2.3, 8); x.fillStyle = '#ffffff'; x.fill();
    });
    SP.muzzle = mk(30, 24, (x) => {
      let g = x.createRadialGradient(0, 0, 0, 0, 0, 7); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.5, 'rgba(255,224,130,.6)'); g.addColorStop(1, 'rgba(255,190,60,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 7, 0, TAU); x.fill();
      const lobe = (a, len, w) => { x.save(); x.rotate(a); g = x.createLinearGradient(0, 0, len, 0); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.45, 'rgba(255,226,140,.85)'); g.addColorStop(1, 'rgba(255,180,50,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(0, -w); x.quadraticCurveTo(len * 0.6, -w * 0.7, len, 0); x.quadraticCurveTo(len * 0.6, w * 0.7, 0, w); x.closePath(); x.fill(); x.restore(); };
      lobe(0, 19, 3.6); lobe(-0.62, 10, 2.4); lobe(0.62, 10, 2.4);
    }, 8, 12);
    SP.ghost = glow('#6db8ff');
  }

  /* enemy bullet: ONE danger look for every shooter — dark spiked burr, red-hot rim, orange body, white-hot core.
     The shooter's colour is ignored on purpose (tinted bullets were mistaken for gems and for the hero's orbs). */
  const EB = {};
  function ebSprite(r) {
    r = Math.round(r) || 6; let s = EB[r]; if (s) return s;
    const body = '#ff5a3c', R = r + 7;
    s = mk(R * 2, R * 2, (x) => {
      let g = x.createRadialGradient(0, 0, r * 0.6, 0, 0, R); g.addColorStop(0, 'rgba(255,58,36,.46)'); g.addColorStop(1, 'rgba(255,58,36,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, R, 0, TAU); x.fill();
      x.beginPath(); for (let i = 0; i < 16; i++) { const a = i * TAU / 16, rad = i % 2 ? r + 1.4 : r + 4.2; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad); } x.closePath(); x.fillStyle = OUT; x.fill();
      g = x.createRadialGradient(-r * 0.22, -r * 0.24, r * 0.08, 0, 0, r); g.addColorStop(0, '#fffbe6'); g.addColorStop(0.34, '#ffc98f'); g.addColorStop(0.74, body); g.addColorStop(1, mix(body, '#000000', 0.28));
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill();
      x.lineWidth = 1.15; x.strokeStyle = 'rgba(255,66,44,.95)'; x.beginPath(); x.arc(0, 0, r + 0.35, 0, TAU); x.stroke();
    });
    return (EB[r] = s);
  }

  /* ---------- text sprites (floating labels + the blast numbers) ---------- */
  const TX = new Map(); let meas = null, made = 0;
  /* labels drawn before the web fonts arrived are thrown away once they load; the blast numbers are re-made at once
     so the first chain reaction never pays for font set-up mid-fight */
  function warmText() { try { for (let n = 1; n <= 5; n++) label(String(n), 30, '#ffffff', '400'); label('0123456789 +-!', 12, '#ffffff'); label('ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz', 15, '#ffffff'); } catch (e) {} }
  function clearText() { TX.clear(); setTimeout(warmText, 60); }
  try { if (document.fonts) { document.fonts.ready.then(clearText); if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', clearText); } } catch (e) {}
  function label(str, size, col, face) {
    const key = size + '|' + col + '|' + (face || '') + '|' + str; let s = TX.get(key); if (s) return s;
    if (TX.size > 240) TX.clear();
    if (!meas) meas = document.createElement('canvas').getContext('2d');
    const font = (face || '900') + ' ' + size + 'px ' + (face ? "'Alfa Slab One', " : '') + 'Nunito, system-ui, sans-serif', lw = Math.max(2.6, size * 0.2);
    meas.font = font; const w = Math.ceil(meas.measureText(str).width + lw * 2 + 4), hh = Math.ceil(size * 1.4 + lw * 2);
    s = mk(w, hh, (x) => { x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round'; x.lineWidth = lw; x.strokeStyle = 'rgba(8,14,20,.94)'; x.strokeText(str, 0, size * 0.04); x.fillStyle = col; x.fillText(str, 0, size * 0.04); });
    TX.set(key, s); made++; return s;
  }

  /* ================= projectiles ================= */
  function bullet(c, b, t) {
    if (!SP) boot();
    switch (b.kind) {
      case 'bolt': { const m = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / m, uy = b.vy / m, s = SP.bolt; c.transform(ux, uy, -uy, ux, b.x, b.y); c.drawImage(s.c, -s.ox, -s.oy, s.w, s.h); break; }
      case 'paper': { const s = SP.paper, k = (b.r || 8) / 8; c.translate(b.x, b.y); c.rotate(b.rot); c.scale(k, k * (0.74 + 0.26 * Math.cos(b.rot * 1.3))); c.drawImage(s.c, -s.ox, -s.oy, s.w, s.h); break; }
      case 'shell': {
        /* landing mark: a small brass crosshair that tightens as the shell arrives. Friendly, and never bigger than 18 units. */
        const f = Math.min(1, b.t / b.dur), zh = b.z / 70, R = 6 + 8 * (1 - f);
        c.globalAlpha = 0.3 + 0.55 * f; c.strokeStyle = '#ffd77a'; c.lineWidth = 1.6; c.lineCap = 'round';
        c.beginPath(); c.arc(b.tx, b.ty, R, 0, TAU);
        c.moveTo(b.tx - R - 3, b.ty); c.lineTo(b.tx - R + 3.2, b.ty); c.moveTo(b.tx + R - 3.2, b.ty); c.lineTo(b.tx + R + 3, b.ty); c.moveTo(b.tx, b.ty - R - 3); c.lineTo(b.tx, b.ty - R + 3.2); c.moveTo(b.tx, b.ty + R - 3.2); c.lineTo(b.tx, b.ty + R + 3); c.stroke();
        c.beginPath(); c.arc(b.tx, b.ty, 1.5, 0, TAU); c.fillStyle = '#ffe9a8'; c.fill();
        c.globalAlpha = 0.36 * (1 - zh * 0.45); put(c, SP.shadow, b.x, b.y, 1 - zh * 0.3);
        c.globalAlpha = 1; put(c, SP.ball, b.x, b.y - b.z, 1 + zh * 0.32); break;
      }
      case 'boom': { const k = (b.r || 13) / 13, w = SP.swoosh, s = SP.boom; c.translate(b.x, b.y); c.rotate(b.spin); c.globalAlpha = 0.55; c.drawImage(w.c, -w.ox * k, -w.oy * k, w.w * k, w.h * k); c.globalAlpha = 1; c.drawImage(s.c, -s.ox * k, -s.oy * k, s.w * k, s.h * k); break; }
    }
  }
  /* the stage does not reset state between enemy bullets: plain stamp, nothing left changed */
  function ebullet(c, b, t) { const s = b._s || (b._s = ebSprite(b.r)), w = s.w * (1 + 0.09 * Math.sin(t * 11 + b.x * 0.05 + b.y * 0.03)); c.drawImage(s.c, b.x - w / 2, b.y - w / 2, w, w); }
  function orbs(c, p, t) {
    if (!SP) boot(); const os = p.orbPos;
    for (let i = 0; i < os.length; i++) {
      const o = os[i], dx = o.x - p.x, dy = o.y - p.y, gx = p.x + dx * GHOST_C + dy * GHOST_S, gy = p.y - dx * GHOST_S + dy * GHOST_C;
      c.globalAlpha = 0.42; c.drawImage(SP.ghost, gx - 8, gy - 8, 16, 16);
      c.globalAlpha = 1; put(c, SP.orb, o.x, o.y, 1 + 0.06 * Math.sin(t * 9 + i * 2.1));
    }
  }

  /* ================= ground zones ================= */
  function zone(c, z, t, g) {
    if (!SP) boot();
    if (z.kind === 'fire') {
      const l0 = z._l0 || (z._l0 = z.life), age = l0 - z.life, grow = age < 0.12 ? 0.45 + age / 0.12 * 0.55 : 1, die = z.life < 0.35 ? Math.max(0, z.life / 0.35) : 1, heat = Math.max(0, Math.min(1, z.life / l0));
      let fi = Math.floor(t * 11 + z.x * 0.37 + z.y * 0.23) % 6; if (fi < 0) fi += 6;
      const hp = g && g.player, hd = hp ? Math.abs(z.x - hp.x) + Math.abs(z.y - hp.y) * 1.4 : 99, near = hd < 30 ? 0.4 + 0.6 * hd / 30 : 1;   // thin the fire right under the hero
      c.globalAlpha = Math.min(1, die * 1.25) * (0.5 + 0.5 * heat) * 0.76 * near; put(c, SP.flame[fi], z.x, z.y + 2, (z.r / 22) * 0.74 * grow * (0.5 + 0.5 * die) * (0.5 + 0.5 * heat));
    } else if (z.kind === 'claim') {
      const R = z.r;
      if (z.warn > 0) {
        const w0 = z._w0 || (z._w0 = Math.max(z.warn, 0.01)), f = Math.max(0, 1 - z.warn / w0), hot = z.warn < 0.3 && Math.sin(t * 34) > 0;
        c.beginPath(); c.arc(z.x, z.y, R, 0, TAU); c.fillStyle = COL.I; c.globalAlpha = 0.09 + 0.1 * f; c.fill();
        c.globalAlpha = 1; c.strokeStyle = hot ? '#ffffff' : '#d2adff'; c.lineWidth = 3.4; c.setLineDash(DASH_CLAIM); c.lineDashOffset = -t * 36; c.stroke(); c.setLineDash(NONE); c.lineDashOffset = 0;
        c.beginPath(); c.arc(z.x, z.y, Math.max(1, R * f), 0, TAU); c.globalAlpha = 0.22; c.fill(); c.globalAlpha = 0.75; c.lineWidth = 2; c.strokeStyle = '#d2adff'; c.stroke();
      } else {
        const fade = Math.min(1, Math.max(0, z.life / 0.45)), on = z._on === undefined ? (z._on = t) : z._on, pop = Math.min(1, Math.max(0, (t - on) / 0.18));
        c.beginPath(); c.arc(z.x, z.y, R, 0, TAU); c.fillStyle = COL.I; c.globalAlpha = (0.26 + 0.04 * Math.sin(t * 5)) * fade; c.fill();
        c.globalAlpha = 0.96 * fade; c.strokeStyle = '#d2adff'; c.lineWidth = 3.6; c.stroke();
        c.beginPath(); c.arc(z.x, z.y, R - 7, 0, TAU); c.globalAlpha = 0.32 * fade; c.lineWidth = 1.4; c.setLineDash(DASH_CLAIM); c.lineDashOffset = t * 16; c.stroke(); c.setLineDash(NONE); c.lineDashOffset = 0;
        if (pop < 1) ringStroke(c, z.x, z.y, R * (1 + 0.14 * pop), '#f6ecff', 3.4 * (1 - pop) + 0.5, (1 - pop) * 0.85);
        let fi = Math.floor(t * 5 + z.x * 0.1) % 3; if (fi < 0) fi += 3;
        c.globalAlpha = fade; put(c, SP.flag[fi], z.x, z.y + 5, 1.05 + (1 - pop) * 0.4);
      }
    } else if (z.kind === 'blast') {
      const R = z.r, f = Math.max(0, Math.min(1, 1 - Math.max(0, z.warn) / (z.w0 || 1))), hot = z.warn < 0.35, blink = hot && Math.sin(t * 40) > 0;
      c.beginPath(); c.arc(z.x, z.y, R, 0, TAU); c.fillStyle = COL.S; c.globalAlpha = 0.16; c.fill();
      c.globalAlpha = 1; c.strokeStyle = blink ? '#fff1c4' : COL.S; c.lineWidth = hot ? 4.4 : 3.4; c.stroke();
      c.beginPath(); c.arc(z.x, z.y, Math.max(1, R * f), 0, TAU); c.fillStyle = '#ff6a14'; c.globalAlpha = hot ? 0.46 : 0.32; c.fill();
      const ns = z._s || (z._s = label(String(z.n), 30, '#ffffff', '400')), k = Math.min(R * 0.95, 48) / ns.h * (hot ? 1.1 : 1);
      c.globalAlpha = 1; put(c, ns, z.x, z.y, k);
    }
  }
  /* the Neutral Zone is on screen all the time: almost not there */
  function aura(c, p, t) {
    const R = p.auraR; if (!(R > 0)) return;
    c.beginPath(); c.arc(p.x, p.y, R, 0, TAU); c.fillStyle = '#c8ebff'; c.globalAlpha = 0.03; c.fill();
    c.globalAlpha = 0.18 + 0.04 * Math.sin(t * 2.2); c.strokeStyle = '#dcf2ff'; c.lineWidth = 1.3; c.setLineDash(DASH_AURA); c.lineDashOffset = t * 11; c.stroke(); c.setLineDash(NONE); c.lineDashOffset = 0; c.globalAlpha = 1;
  }
  /* dash warning: a tapering red lane the width of the charger, arrows running down it */
  function telegraph(c, x, y, dx, dy, len, w, t, a) {
    const r = a && a.r ? a.r : w * 4, hw0 = r * 0.82, hw1 = Math.max(2.5, r * 0.26), nx = -dy, ny = dx, pulse = 0.5 + 0.5 * Math.sin(t * 22);
    const sx = x + dx * r * 0.7, sy = y + dy * r * 0.7, ex = x + dx * len, ey = y + dy * len, tip = hw1 * 2.6;
    c.beginPath(); c.moveTo(sx + nx * hw0, sy + ny * hw0); c.lineTo(ex + nx * hw1, ey + ny * hw1); c.lineTo(ex + dx * tip, ey + dy * tip); c.lineTo(ex - nx * hw1, ey - ny * hw1); c.lineTo(sx - nx * hw0, sy - ny * hw0); c.closePath();
    c.fillStyle = '#ff4335'; c.globalAlpha = 0.2 + 0.14 * pulse; c.fill();
    c.lineJoin = 'round'; c.globalAlpha = 0.7 + 0.3 * pulse; c.strokeStyle = '#ff8a7a'; c.lineWidth = 1.8; c.stroke();
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.lineCap = 'butt'; c.setLineDash(DASH_LANE); c.lineDashOffset = -t * 250; c.globalAlpha = 0.9; c.strokeStyle = '#fff0ec'; c.lineWidth = Math.max(2.6, w * 0.6); c.stroke();
    c.setLineDash(NONE); c.lineDashOffset = 0; c.lineCap = 'round'; c.globalAlpha = 1;
  }

  /* ================= lightning, rings, particles, labels ================= */
  function arcs(c, g, t) {
    const as = g.arcs; if (!as.length) return; if (!SP) boot(); const tick = Math.floor((t || 0) * 45);
    c.lineCap = 'round'; c.lineJoin = 'round'; c.globalCompositeOperation = 'lighter'; const gs = glow('#bfe3ff');
    for (let n = 0; n < as.length; n++) {
      const a = as[n], pts = a.pts, k = Math.max(0, Math.min(1, a.life / 0.12)); if (!pts || pts.length < 2 || k <= 0) continue;
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1], dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, seg = len > 80 ? 4 : 3, amp = Math.min(12, len * 0.17);
        for (let s = 1; s < seg; s++) { const o = (h(n * 3.7 + i * 1.31 + s * 0.71 + 1, tick) - 0.5) * 2 * amp; c.lineTo(p0.x + dx * s / seg + nx * o, p0.y + dy * s / seg + ny * o); }
        c.lineTo(p1.x, p1.y);
      }
      c.globalAlpha = 0.22 * k; c.strokeStyle = '#3f9bff'; c.lineWidth = 8; c.stroke();
      c.globalAlpha = 0.9 * k; c.strokeStyle = a.col || '#9fd6ff'; c.lineWidth = 3.6; c.stroke();
      c.globalAlpha = k; c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.stroke();
      c.globalAlpha = 0.8 * k; const s = 18 + 8 * k; for (let i = 1; i < pts.length; i++) c.drawImage(gs, pts[i].x - s / 2, pts[i].y - s / 2, s, s);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  /* g.rings / g.parts are only filled by the engine's fallback path; styled here so they still match */
  function rings(c, g) { const rs = g.rings; if (!rs.length) return; for (let i = 0; i < rs.length; i++) { const q = rs[i], f = Math.max(0, Math.min(1, 1 - q.life / q.max)); ringStroke(c, q.x, q.y, q.r0 + (q.r1 - q.r0) * eo2(f), q.col, q.w * (1 - f) + 0.8, 1 - f); } c.globalAlpha = 1; }
  function parts(c, g) { const ps = g.parts; if (!ps.length) return; for (let i = 0; i < ps.length; i++) { const q = ps[i], a = Math.max(0, q.life / q.max), s = q.size * (0.5 + 0.5 * a); c.globalAlpha = a; c.drawImage(speck(q.col), q.x - s / 2, q.y - s / 2, s, s); } c.globalAlpha = 1; }
  function texts(c, g) {
    const ts = g.texts; if (!ts.length) return; const m0 = made;
    for (let i = 0; i < ts.length; i++) {
      const q = ts[i]; if (q.dead || !q.str) continue;
      const l0 = q._l0 || (q._l0 = q.life), age = l0 - q.life, u = age / 0.16, k = u < 1 ? 0.6 + 0.4 * u + 0.2 * Math.sin(u * Math.PI) : 1;
      let sp = q._s;
      if (!sp) { if (made - m0 >= 4) continue; sp = q._s = label(String(q.str), q.size || 12, q.col || '#ffffff'); }   // at most 4 new label sprites a frame; the rest appear a frame later
      c.globalAlpha = Math.max(0, Math.min(1, q.life / 0.25)); put(c, sp, q.x, q.y - (q.size || 12) * 0.36, k);
    }
    c.globalAlpha = 1;
  }

  /* ================= effects ================= */
  const CAP = 80, bk = {};
  /* slow device (the engine sets PK.lowFx): about half as many particles and half as many small events */
  const cnt = (n) => (PK.lowFx ? Math.ceil(n / 2) : n);
  /* token bucket on the run clock: `rate` per second, up to `burst` at once */
  function allow(now, key, rate, burst) {
    if (PK.lowFx) { rate *= 0.5; burst = Math.max(1, burst >> 1); }
    let b = bk[key]; if (!b) b = bk[key] = { tok: burst, last: now };
    if (now < b.last) { b.tok = burst; b.last = now; }
    b.tok = Math.min(burst, b.tok + (now - b.last) * rate); b.last = now;
    if (b.tok >= 1) { b.tok -= 1; return true; } return false;
  }
  /* hard cap: at most CAP live effects. A new one may push out the oldest effect of equal or lower priority. */
  function add(g, kind, x, y, life, pri) {
    const fx = g.fxs;
    if (fx.length >= CAP) {
      let live = 0, victim = null;
      for (let i = 0; i < fx.length; i++) { const o = fx[i]; if (o.dead) continue; live++; if (o.pri <= pri && (!victim || o.pri < victim.pri)) victim = o; }
      if (live >= CAP) { if (!victim) return null; victim.dead = true; }
      if (fx.length >= CAP + 60) return null;
    }
    const q = { kind, x, y, t: 0, life, dead: false, pri, seed: Math.random() * 97 + 1, r: 0, a: 0, col: '#ffffff', n: 0, ox: 0, oy: 0, fol: false, big: false };
    fx.push(q); return q;
  }
  function emit(g, kind, x, y, o) {
    if (!g || !g.fxs) return; o = o || {}; const now = g.t || 0; let q;
    switch (kind) {
      case 'kill': if (!o.elite && !allow(now, 'kill', 26, 8)) return; q = add(g, 'kill', x, y, o.elite ? 0.5 : 0.3, o.elite ? 1 : 0); if (q) { q.col = o.col || '#ffffff'; q.r = o.r || 10; q.big = !!o.elite; q.n = cnt(o.elite ? 7 : q.r > 14 ? 4 : 3); } break;
      case 'explode': if (!allow(now, 'explode', 12, 5)) return; q = add(g, 'explode', x, y, 0.42, 1); if (q) q.r = o.r || 60; break;
      case 'blast': q = add(g, 'explode', x, y, 0.46, 2); if (q) { q.r = o.r || 60; q.big = true; } break;
      case 'hit': if (!allow(now, 'hit', 12, 3)) return; q = add(g, 'hit', x, y, 0.15, 0); if (q) { q.a = o.a || 0; q.col = o.kind === 'paper' ? '#ffffff' : '#ffe9a8'; } break;
      case 'muzzle': if (!allow(now, 'muzzle', 9, 2)) return; q = add(g, 'muzzle', x, y, 0.09, 0); if (q) q.a = o.a || 0; break;
      case 'gem': if (!allow(now, 'gem', 6, 2)) return; q = add(g, 'twinkle', x, y, 0.26, 0); if (q) { q.fol = true; q.ox = (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 9); q.oy = -12 - Math.random() * 20; q.r = 0.8; q.n = 0; } break;
      case 'coin': if (!allow(now, 'coin', 6, 2)) return; q = add(g, 'twinkle', x, y, 0.3, 0); if (q) { q.fol = true; q.ox = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 10); q.oy = -16 - Math.random() * 18; q.r = 1.05; q.n = 1; } break;
      case 'chest': q = add(g, 'burst', x, y, 0.5, 2); if (q) { q.r = 46; q.col = COL.brass; q.n = cnt(8); } break;
      case 'heal': if (!allow(now, 'heal', 3, 1)) return; q = add(g, 'heal', x, y, 0.62, 1); if (q) q.fol = true; break;
      case 'hurt': if (!allow(now, 'hurt', 5, 2)) return; q = add(g, 'hurt', x, y, 0.24, 1); if (q) { q.fol = true; q.ox = (Math.random() - 0.5) * 12; q.oy = -4 + (Math.random() - 0.5) * 10; } break;
      case 'levelup': q = add(g, 'levelup', x, y, 0.66, 2); if (q) q.fol = true; break;
      case 'elite': q = add(g, 'ping', x, y, 0.62, 1); if (q) { q.r = (o.r || 24) * 3.2; q.col = COL.brass; } break;
      case 'bossIn': q = add(g, 'slam', x, y, 1.15, 2); if (q) { q.r = o.r || 44; q.col = o.col || '#ffffff'; } break;
      case 'bossDie': q = add(g, 'bossdie', x, y, 0.9, 2); if (q) { q.r = o.r || 44; q.col = o.col || '#ffffff'; } break;
      case 'shieldUp': q = add(g, 'shieldup', x, y, 0.4, 2); if (q) q.r = (o.r || 44) * 1.75; break;
      case 'shieldBreak': q = add(g, 'shatter', x, y, 0.56, 2); if (q) q.r = (o.r || 44) * 1.75; break;
      case 'nuke': q = add(g, 'nuke', x, y, 0.5, 2); if (q) q.r = o.r || 500; break;
      case 'dash': if (!allow(now, 'dash', 10, 5)) return; q = add(g, 'dust', x, y, 0.32, 0); if (q) q.a = o.a || 0; break;
      case 'down': q = add(g, 'down', x, y, 0.6, 2); break;
      case 'revive': q = add(g, 'revive', x, y, 0.72, 2); if (q) { q.r = o.r || 260; q.fol = true; } break;
      default: break;
    }
  }

  const DRAW = {
    /* a few cause-coloured specks; the monster's own death pop does the heavy lifting */
    kill(c, q, f) {
      const e = eo2(f), sp = speck(q.col), base = q.r * 0.45 + 4;
      c.globalAlpha = 1 - f * f;
      for (let i = 0; i < q.n; i++) { const an = h(q.seed, i) * TAU, d = (base + h(q.seed, i + 9) * 11) * e, s = (4.4 + h(q.seed, i + 5) * 2.8) * (1 - f * 0.55); c.drawImage(sp, q.x + Math.cos(an) * d - s / 2, q.y + Math.sin(an) * d - 5 * e - s / 2, s, s); }
      if (q.big) { ringStroke(c, q.x, q.y, q.r * (1 + 2.6 * e), COL.brass, 4.6 * (1 - f) + 0.6, 1 - f); const st = SP.starB; c.globalAlpha = Math.sin(f * Math.PI); for (let i = 0; i < 3; i++) { const an = h(q.seed, i + 20) * TAU, d = q.r * (0.6 + 1.5 * e); put(c, st, q.x + Math.cos(an) * d, q.y + Math.sin(an) * d - 6, 0.7); } }
    },
    /* white flash → warm fireball → ring out to the true blast radius → a little smoke and a few embers */
    explode(c, q, f) {
      const R = q.r, e = eo3(f), dR = Math.min(R, 110), fbR = q.big ? Math.min(R * 0.62, 74) : Math.min(R * 0.46, 46), dim = q.big ? 1 : 0.78, nS = cnt(4), nE = cnt(5);
      if (f > 0.14) { const u = (f - 0.14) / 0.86, pr = Math.min(R * 0.44, 38); c.globalAlpha = Math.sin(u * Math.PI) * 0.42; for (let i = 0; i < nS; i++) { const an = h(q.seed, i) * TAU, d = dR * (0.14 + 0.34 * e), sz = pr * (0.7 + 0.7 * u); c.drawImage(SP.smoke, q.x + Math.cos(an) * d - sz / 2, q.y + Math.sin(an) * d - 9 * u - sz / 2, sz, sz); } }
      if (f < 0.62) { const u = f / 0.62, fr = fbR * (0.5 + 0.5 * eo3(u)); c.globalAlpha = (1 - u) * (1 - u * 0.3) * dim; c.drawImage(SP.fire, q.x - fr, q.y - fr, fr * 2, fr * 2); }
      if (f < 0.22) { const u = f / 0.22, fr = (q.big ? Math.min(R * 0.7, 84) : Math.min(R * 0.5, 50)) * (0.55 + 0.45 * u); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - u) * 0.85 * dim; c.drawImage(SP.flash, q.x - fr, q.y - fr, fr * 2, fr * 2); c.globalCompositeOperation = 'source-over'; }
      ringStroke(c, q.x, q.y, R * (0.28 + 0.72 * e), q.big ? '#ffc37a' : '#ffdc9a', (q.big ? 5.6 : 3.6) * (1 - f) + 0.8, (1 - f) * (q.big ? 0.95 : 0.6));
      const sp = speck(q.big ? COL.S : '#ffc24a'); c.globalAlpha = Math.min(1, (1 - f) * 1.4);
      for (let i = 0; i < nE; i++) { const an = h(q.seed, i + 30) * TAU, d = dR * (0.2 + 0.8 * e) * (0.55 + 0.45 * h(q.seed, i + 40)), sz = 5.6 * (1 - f * 0.6); c.drawImage(sp, q.x + Math.cos(an) * d - sz / 2, q.y + Math.sin(an) * d - 12 * e + 16 * f * f - sz / 2, sz, sz); }
    },
    /* bullet impact: three short sparks thrown back along the shot */
    hit(c, q, f) {
      const a0 = q.a + Math.PI, d0 = 2 + 9 * f, L = 3 + 6 * (1 - f);
      c.globalAlpha = 1 - f; c.strokeStyle = q.col; c.lineWidth = 1.7; c.lineCap = 'round'; c.beginPath();
      for (let i = 0; i < 3; i++) { const an = a0 + (i - 1) * 0.8 + (h(q.seed, i) - 0.5) * 0.5, ux = Math.cos(an), uy = Math.sin(an); c.moveTo(q.x + ux * d0, q.y + uy * d0); c.lineTo(q.x + ux * (d0 + L), q.y + uy * (d0 + L)); }
      c.stroke(); const s = 11 * (1 - f * 0.5); c.globalAlpha = (1 - f) * 0.9; c.drawImage(glow('#ffffff'), q.x - s / 2, q.y - s / 2, s, s);
    },
    muzzle(c, q, f, g) {
      const p = g.player, x = p ? p.x : q.x, y = (p ? p.y : q.y) - 4, m = SP.muzzle, k = 0.75 + 0.45 * f;
      c.globalAlpha = 1 - f * f; c.translate(x + Math.cos(q.a) * 15, y + Math.sin(q.a) * 15); c.rotate(q.a); c.drawImage(m.c, -m.ox * k, -m.oy * k, m.w * k, m.h * k);
    },
    /* a single brass twinkle on the hero for gems and coins */
    twinkle(c, q, f, g) {
      const p = g.player, x = (p ? p.x : q.x) + q.ox, y = (p ? p.y : q.y) + q.oy - 7 * f, k = Math.sin(Math.min(1, f) * Math.PI);
      c.globalAlpha = Math.min(1, k * 1.5); put(c, q.n ? SP.starW : SP.starB, x, y, q.r * (0.45 + 0.55 * k));
    },
    /* chest opened: brass ring and a ring of sparkles */
    burst(c, q, f) {
      const e = eo2(f);
      ringStroke(c, q.x, q.y, 8 + q.r * e, q.col, 4 * (1 - f) + 0.6, 1 - f);
      c.globalAlpha = Math.min(1, (1 - f) * 1.6);
      for (let i = 0; i < q.n; i++) { const an = i * TAU / q.n + h(q.seed, 1) * 6, d = 10 + q.r * 0.95 * e * (0.7 + 0.3 * h(q.seed, i + 3)); put(c, i % 2 ? SP.starW : SP.starB, q.x + Math.cos(an) * d, q.y + Math.sin(an) * d - 8 * e, (0.95 - 0.5 * f) * (0.7 + 0.5 * h(q.seed, i + 12))); }
    },
    heal(c, q, f, g) {
      const p = g.player, x = p ? p.x : q.x, y = p ? p.y : q.y;
      for (let i = 0, n = cnt(3); i < n; i++) { const u = (f - i * 0.14) / 0.72; if (u <= 0 || u >= 1) continue; c.globalAlpha = u < 0.2 ? u / 0.2 : Math.min(1, (1 - u) * 2.2); put(c, SP.plus, x + (i - 1) * 11 + Math.sin(u * 5 + i) * 1.5, y - 8 - 30 * eo2(u) - i * 2, 0.7 + 0.5 * Math.min(1, u * 4)); }
    },
    hurt(c, q, f, g) {
      const p = g.player, x = (p ? p.x : q.x) + q.ox, y = (p ? p.y : q.y) + q.oy, s = SP.impact, k = f < 0.35 ? 0.4 + 0.62 * (f / 0.35) : 1.02 - 0.17 * ((f - 0.35) / 0.65);
      c.globalAlpha = f < 0.55 ? 1 : Math.max(0, 1 - (f - 0.55) / 0.45); c.translate(x, y); c.rotate(q.seed); c.drawImage(s.c, -s.ox * k, -s.oy * k, s.w * k, s.h * k);
    },
    /* level-up: a brass ring and a little helix of sparkles rising around the hero */
    levelup(c, q, f, g) {
      const p = g.player, x = p ? p.x : q.x, y = p ? p.y : q.y, e = eo3(f);
      if (f < 0.5) { const s = 96 * (0.6 + 0.4 * e); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - f / 0.5) * 0.45; c.drawImage(glow('#ffd77a'), x - s / 2, y - 6 - s / 2, s, s); c.globalCompositeOperation = 'source-over'; }
      ringStroke(c, x, y + 4, 12 + 56 * e, '#ffd77a', 4.4 * (1 - f) + 0.5, (1 - f) * 0.95);
      if (f > 0.12) { const f2 = (f - 0.12) / 0.88; ringStroke(c, x, y + 4, 8 + 40 * eo3(f2), '#fff3cf', 2.2 * (1 - f2) + 0.4, (1 - f2) * 0.7); }
      for (let i = 0, n = cnt(8); i < n; i++) { const u = f * 1.5 - i * 0.07; if (u <= 0 || u >= 1) continue; const an = i * 0.9 + u * 4 + q.seed, rad = 14 + 11 * u; c.globalAlpha = Math.sin(u * Math.PI); put(c, i % 2 ? SP.starW : SP.starB, x + Math.cos(an) * rad, y + 14 - 60 * u + Math.sin(an) * 4, 0.5 + 0.55 * Math.sin(u * Math.PI)); }
    },
    /* brass ping: an elite is on its way */
    ping(c, q, f) { const e = eo2(f); ringStroke(c, q.x, q.y, q.r * (0.3 + 0.7 * e), q.col, 4 * (1 - f) + 0.6, (1 - f) * 0.9); if (f > 0.25) { const f2 = (f - 0.25) / 0.75; ringStroke(c, q.x, q.y, q.r * (0.2 + 0.6 * eo2(f2)), '#fff3cf', 2.4 * (1 - f2) + 0.4, (1 - f2) * 0.7); } },
    /* boss lands: ground ring and a skirt of dust, half a second after it starts to drop */
    slam(c, q, f) {
      const u = (q.t - 0.5) / (q.life - 0.5); if (u <= 0 || u >= 1) return; const e = eo3(u), R = q.r;
      c.globalAlpha = (1 - u) * 0.72;
      for (let i = 0, n = cnt(9); i < n; i++) { const an = i * TAU / n + h(q.seed, i) * 0.5, d = R * (0.9 + 1.5 * e), s = R * (0.45 + 0.5 * e) * (0.7 + 0.5 * h(q.seed, i + 7)); c.drawImage(SP.dust, q.x + Math.cos(an) * d - s / 2, q.y + R * 0.75 + Math.sin(an) * d * 0.42 - 8 * e - s / 2, s, s); }
      c.save(); c.translate(q.x, q.y + R * 0.8); c.scale(1, 0.42);
      ringStroke(c, 0, 0, R * (1 + 2.5 * e), q.col, 11 * (1 - u) + 1.5, (1 - u) * 0.95); ringStroke(c, 0, 0, R * (0.8 + 1.8 * e), '#ffffff', 5 * (1 - u) + 0.8, (1 - u) * 0.75);
      c.restore();
    },
    /* boss defeated: big, bright, over in under a second */
    bossdie(c, q, f) {
      const R = q.r, e = eo3(f);
      if (f > 0.16) { const u = (f - 0.16) / 0.84; c.globalAlpha = Math.sin(u * Math.PI) * 0.4; for (let i = 0, n = cnt(5); i < n; i++) { const an = h(q.seed, i) * TAU, d = R * (0.5 + 1.5 * e), sz = R * (0.9 + 0.9 * u); c.drawImage(SP.smoke, q.x + Math.cos(an) * d - sz / 2, q.y + Math.sin(an) * d - 12 * u - sz / 2, sz, sz); } }
      if (f < 0.6) { const u = f / 0.6, fr = R * (1.1 + 1.3 * eo3(u)); c.globalAlpha = (1 - u) * 0.95; c.drawImage(SP.fire, q.x - fr, q.y - fr, fr * 2, fr * 2); }
      if (f < 0.4) { const u = f / 0.4, fr = R * (1.5 + 1.7 * u); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - u) * 0.8; c.drawImage(glow(q.col), q.x - fr, q.y - fr, fr * 2, fr * 2); c.globalAlpha = (1 - u) * 0.9; c.drawImage(SP.flash, q.x - fr * 0.6, q.y - fr * 0.6, fr * 1.2, fr * 1.2); c.globalCompositeOperation = 'source-over'; }
      ringStroke(c, q.x, q.y, R * (1 + 4 * e), '#ffffff', 10 * (1 - f) + 1, 1 - f);
      if (f > 0.1) { const f2 = (f - 0.1) / 0.9; ringStroke(c, q.x, q.y, R * (0.6 + 3.2 * eo3(f2)), q.col, 8 * (1 - f2) + 1, (1 - f2) * 0.95); }
      shards(c, q, f, R * 0.5, R * 3.4, R * 0.36, cnt(14), q.col, '#ffffff', 30);
      for (let i = 0, n = cnt(10); i < n; i++) { const u = f * 1.3 - i * 0.045; if (u <= 0 || u >= 1) continue; const an = h(q.seed, i + 50) * TAU, d = R * (0.5 + 2.4 * h(q.seed, i + 60)); c.globalAlpha = Math.sin(u * Math.PI); put(c, i % 2 ? SP.starW : SP.starB, q.x + Math.cos(an) * d, q.y + Math.sin(an) * d - 14 * u, 0.9 + 1.0 * Math.sin(u * Math.PI)); }
    },
    /* the shield snaps on: two rings close in on the bubble */
    shieldup(c, q, f) {
      const e = eo3(f);
      { const sz = q.r * 2.7; c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 * (1 - f); c.drawImage(glow('#7fe3ff'), q.x - sz / 2, q.y - sz / 2, sz, sz); c.globalCompositeOperation = 'source-over'; }
      ringStroke(c, q.x, q.y, q.r * (1.9 - 0.9 * e), '#d9f7ff', 1.5 + 3.5 * f, 0.25 + 0.75 * f * (1 - f * f));
      if (f > 0.2) { const f2 = (f - 0.2) / 0.8; ringStroke(c, q.x, q.y, q.r * (2.4 - 1.4 * eo3(f2)), '#7fe3ff', 1 + 2 * f2, 0.8 * f2 * (1 - f2 * f2)); }
    },
    /* the shield shatters: glass shards and a clean ring */
    shatter(c, q, f) {
      const e = eo3(f), R = q.r;
      if (f < 0.3) { const ff = f / 0.3, s = R * (1.6 + 0.8 * ff); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - ff) * 0.55; c.drawImage(glow('#9fe8ff'), q.x - s, q.y - s, s * 2, s * 2); c.globalCompositeOperation = 'source-over'; }
      ringStroke(c, q.x, q.y, R * (1 + 1.25 * e), '#e6fbff', 5 * (1 - f) + 0.6, 1 - f);
      shards(c, q, f, R * 0.95, R * 1.5, R * 0.2, cnt(11), '#9fe8ff', '#ffffff', 18);
      for (let i = 0, n = cnt(6); i < n; i++) { const u = f * 1.3 - i * 0.06; if (u <= 0 || u >= 1) continue; const an = h(q.seed, i + 50) * TAU, d = R * (0.5 + 0.9 * h(q.seed, i + 60)); c.globalAlpha = Math.sin(u * Math.PI); put(c, SP.starC, q.x + Math.cos(an) * d, q.y + Math.sin(an) * d, 0.7 + 0.6 * Math.sin(u * Math.PI)); }
    },
    nuke(c, q, f) { const e = eo2(f), R = 20 + (q.r - 20) * e; ringStroke(c, q.x, q.y, R, '#ffffff', 11 * (1 - f) + 2, (1 - f) * 0.9); ringStroke(c, q.x, q.y, R * 0.86, '#fff1c4', 3 * (1 - f) + 0.6, (1 - f) * 0.45); },
    /* dust kicked up behind a charging zealot */
    dust(c, q, f) {
      const e = eo2(f), bx = Math.cos(q.a + Math.PI), by = Math.sin(q.a + Math.PI);
      c.globalAlpha = (1 - f) * 0.55;
      for (let i = 0, n = cnt(3); i < n; i++) { const sp = (i - 1) * 0.6, d = 5 + (16 + i * 4) * e, ux = bx * Math.cos(sp) - by * Math.sin(sp), uy = bx * Math.sin(sp) + by * Math.cos(sp), s = 9 + 9 * e; c.drawImage(SP.dust, q.x + ux * d - s / 2, q.y + 9 + uy * d * 0.7 - 4 * e - s / 2, s, s); }
    },
    down(c, q, f) {
      const e = eo3(f);
      ringStroke(c, q.x, q.y, 10 + 150 * e, '#ffffff', 6 * (1 - f) + 0.8, 1 - f);
      if (f > 0.15) { const f2 = (f - 0.15) / 0.85; ringStroke(c, q.x, q.y, 10 + 105 * eo3(f2), '#ff8a80', 4.5 * (1 - f2) + 0.6, (1 - f2) * 0.9); }
      const sp = speck('#ffffff'); c.globalAlpha = 1 - f;
      for (let i = 0, n = cnt(8); i < n; i++) { const an = i * TAU / n + q.seed, d = 14 + 70 * e * (0.6 + 0.4 * h(q.seed, i)), s = 5 * (1 - f * 0.6); c.drawImage(sp, q.x + Math.cos(an) * d - s / 2, q.y + Math.sin(an) * d - s / 2, s, s); }
    },
    revive(c, q, f, g) {
      const p = g.player, x = p ? p.x : q.x, y = p ? p.y : q.y, e = eo3(f);
      if (f < 0.5) { const s = 120 * (0.6 + 0.4 * e); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - f / 0.5) * 0.5; c.drawImage(glow('#7dffb2'), x - s / 2, y - 6 - s / 2, s, s); c.globalCompositeOperation = 'source-over'; }
      ringStroke(c, q.x, q.y, 12 + (q.r - 12) * e, '#7dffb2', 7 * (1 - f) + 1, (1 - f) * 0.95);
      ringStroke(c, x, y + 4, 10 + 60 * e, '#e6fff1', 3.4 * (1 - f) + 0.5, (1 - f) * 0.8);
      for (let i = 0, n = cnt(8); i < n; i++) { const u = f * 1.25 - i * 0.045; if (u <= 0 || u >= 1) continue; const an = i * 0.785 + u * 3.2 + q.seed, rad = 16 + 10 * u; c.globalAlpha = Math.sin(u * Math.PI); put(c, i % 2 ? SP.starW : SP.starG, x + Math.cos(an) * rad, y + 12 - 54 * u + Math.sin(an) * 4, 0.55 + 0.5 * Math.sin(u * Math.PI)); }
    },
  };
  /* tumbling triangular shards flying out from radius r0 by `travel`; two fills, no transforms */
  function shards(c, q, f, r0, travel, size, n, colA, colB, fall) {
    const e = eo3(f), sz = size * (1 - f * 0.55);
    for (let pass = 0; pass < 2; pass++) {
      c.beginPath();
      for (let i = pass; i < n; i += 2) {
        const an = i * TAU / n + (h(q.seed, i) - 0.5) * 0.5, d = r0 + travel * e * (0.55 + 0.45 * h(q.seed, i + 13)), cx = q.x + Math.cos(an) * d, cy = q.y + Math.sin(an) * d + fall * f * f, rot = h(q.seed, i + 21) * TAU + f * (5 + 7 * h(q.seed, i + 31));
        c.moveTo(cx + Math.cos(rot) * sz, cy + Math.sin(rot) * sz); c.lineTo(cx + Math.cos(rot + 2.2) * sz * 0.75, cy + Math.sin(rot + 2.2) * sz * 0.75); c.lineTo(cx + Math.cos(rot + 4.3) * sz * 0.6, cy + Math.sin(rot + 4.3) * sz * 0.6); c.closePath();
      }
      c.globalAlpha = (1 - f * f) * (pass ? 0.95 : 0.9); c.fillStyle = pass ? colB : colA; c.fill();
    }
  }
  function effect(c, q, t, g) {
    if (q.dead) return; if (!SP) boot();
    const fn = DRAW[q.kind]; if (!fn) return;
    const f = q.life > 0 ? q.t / q.life : 1; if (f < 0 || f >= 1) return;
    fn(c, q, f, g);
  }

  ART.fx = { emit, effect, zone, aura, orbs, bullet, ebullet, arcs, rings, parts, texts, telegraph };
  function warm() { try { if (!SP) boot(); ebSprite(6); ebSprite(7); glow('#ffffff'); glow('#bfe3ff'); glow('#ffd77a'); glow('#7fe3ff'); glow('#9fe8ff'); glow('#7dffb2'); for (const k of ['M', 'A', 'I', 'N', 'S']) { speck(COL[k]); glow(COL[k]); } speck('#ffffff'); speck('#ffc24a'); warmText(); } catch (e) {} }
  try { if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 1500 }); else setTimeout(warm, 400); } catch (e) {}
})();
