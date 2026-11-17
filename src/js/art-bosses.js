/* art-bosses.js — the five set-piece bosses, drawn live in the chunky sticker style.
   Registers PK.art.boss = { draw(c, b, t, g), corpse(c, d, t, g), tether(c, a, b, t, g), preload() }.
   Every boss is designed as if its hit radius were 40 units ("design units", du) and is scaled by b.r / 40.
   Bosses face +x in design space; the wrapper flips them with b.face. The stage draws the ground shadow.
   Menu portraits (g.state === 'menu') of 'pact' show BOTH twins; pass entity {solo: true} for a single one.
   The hit flash is a strong white tint (outlines stay) so a boss under constant fire keeps its face. */
(function () {
  'use strict';
  const PK = (window.PK = window.PK || {});
  const ART = (PK.art = PK.art || {});
  const COL = PK.COL || {};
  const TAU = Math.PI * 2, PI = Math.PI, OUT = '#0a1118', SS = 3, D = 40, GROUND = 36;
  const CM = COL.M || '#a3b85e', CA = COL.A || '#4da8ff', CI = COL.I || '#b77dff', CN = COL.N || '#ff5e4f', CS = COL.S || '#ffa01f', BRASS = COL.brass || '#f2bb3d';

  /* ---------- colour helpers (palettes are built once; nothing here runs per frame) ---------- */
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { const x = hexRgb(a), y = hexRgb(b), f = (i) => Math.round(x[i] + (y[i] - x[i]) * t); return '#' + ((1 << 24) + (f(0) << 16) + (f(1) << 8) + f(2)).toString(16).slice(1); }
  /* [normal, hit-flash] — the flash palette is the same art pushed most of the way to white, outlines stay dark */
  function pal(base) { const fl = {}; for (const k in base) fl[k] = mix(base[k], '#ffffff', 0.52); return [base, fl]; }

  /* ---------- tiny sprite cache: design-unit box -> offscreen canvas at 3 px per unit ---------- */
  const CACHE = {};
  function sprite(key, x0, y0, w, h, fn) {
    const cv = document.createElement('canvas'); cv.width = Math.ceil(w * SS); cv.height = Math.ceil(h * SS);
    const x = cv.getContext('2d'); x.scale(SS, SS); x.translate(-x0, -y0); x.lineJoin = 'round'; x.lineCap = 'round'; fn(x);
    return (CACHE[key] = { c: cv, x0, y0, w, h });
  }
  function put(c, s) { c.drawImage(s.c, s.x0, s.y0, s.w, s.h); }

  /* ---------- drawing primitives ---------- */
  function dot(c, x, y, r, col) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = col; c.fill(); }
  function line(c, lw, col) { c.lineWidth = lw; c.strokeStyle = col || OUT; c.stroke(); }
  function odot(c, x, y, r, col, lw) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = col; c.fill(); line(c, lw); }
  function rr(c, x, y, w, h, rad) { c.beginPath(); c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad); c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath(); }
  /* sticker body: flat fill, optional clipped decoration, ONE shade band bottom-right, ONE highlight top-left, thick outline */
  function blob(c, cx, cy, rx, ry, base, lw, deco) {
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); c.fillStyle = base; c.fill();
    c.save(); c.clip();
    if (deco) deco(c);
    c.beginPath(); c.rect(cx - rx * 2, cy - ry * 2, rx * 4, ry * 4); c.ellipse(cx - rx * 0.13, cy - ry * 0.15, rx * 0.98, ry * 0.98, 0, 0, TAU); c.fillStyle = 'rgba(10,14,40,.26)'; c.fill('evenodd');
    c.beginPath(); c.ellipse(cx - rx * 0.42, cy - ry * 0.55, rx * 0.25, ry * 0.11, -0.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,.32)'; c.fill();
    c.restore();
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, TAU); line(c, lw);
  }
  const hash = (i, k, s) => { const v = Math.sin(i * 127.1 + k * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };

  /* per-draw state shared by the paint routines (set once per boss, no allocation) */
  const S = { dmg: false, low: false, enr: false, stun: false, blink: false };
  let LA = 0, LX = 1, LY = 0, FACE = 1;   // angle / unit vector toward the hero in the boss's own (already flipped) space

  /* eyes: white ball + pupil that looks at the hero; dizzy spiral when stunned; a curved line when shut */
  function eye(c, x, y, r, t, shut) {
    if (shut || S.blink) { c.beginPath(); c.moveTo(x - r * 0.85, y); c.quadraticCurveTo(x, y + r * 0.6, x + r * 0.85, y); line(c, Math.max(2, r * 0.3)); return; }
    odot(c, x, y, r, '#ffffff', Math.max(1.8, r * 0.24));
    if (S.stun) {
      c.beginPath(); const a0 = t * 7;
      for (let i = 0; i <= 14; i++) { const a = a0 + i * 0.78, rad = r * 0.78 * i / 14, px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      line(c, Math.max(1.4, r * 0.17));
    } else {
      const px = x + LX * r * 0.36, py = y + LY * r * 0.36;
      if (S.enr) dot(c, px, py, r * 0.66, '#e4472c');
      dot(c, px, py, r * (S.enr ? 0.4 : 0.52), OUT); dot(c, px - r * 0.17, py - r * 0.19, r * 0.17, '#ffffff');
    }
  }
  function brow(c, x0, y0, x1, y1, lw, col) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); line(c, lw + 2.4); if (col) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); line(c, lw, col); } }
  function teeth(c, x, y, w, h) { rr(c, x, y, w, h, Math.min(h * 0.4, 4)); c.fillStyle = '#ffffff'; c.fill(); line(c, 2.4); c.beginPath(); for (let i = 1; i < 4; i++) { c.moveTo(x + w * i / 4, y + 1); c.lineTo(x + w * i / 4, y + h - 1); } c.moveTo(x + 1.5, y + h / 2); c.lineTo(x + w - 1.5, y + h / 2); line(c, 1.4); }
  function plaster(c, x, y, s, rot) { c.save(); c.translate(x, y); c.rotate(rot); for (let k = 0; k < 2; k++) { if (k) c.rotate(PI / 2); rr(c, -s, -s * 0.34, s * 2, s * 0.68, s * 0.3); c.fillStyle = '#f3dfb4'; c.fill(); line(c, 1.8); } c.restore(); }
  function poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); }
  function flamelet(c, x, y, h, t, ph) {
    const w = h * 0.42, sw = Math.sin(t * 13 + ph) * h * 0.12;
    c.beginPath(); c.moveTo(x + sw, y - h); c.quadraticCurveTo(x + w * 1.3, y - h * 0.3, x + w * 0.7, y); c.quadraticCurveTo(x, y + h * 0.18, x - w * 0.7, y); c.quadraticCurveTo(x - w * 1.3, y - h * 0.3, x + sw, y - h); c.closePath();
    c.fillStyle = '#ff7a1a'; c.fill(); line(c, 1.8, '#7a2a00');
    c.beginPath(); c.moveTo(x + sw * 0.6, y - h * 0.55); c.quadraticCurveTo(x + w * 0.6, y - h * 0.1, x, y - h * 0.02); c.quadraticCurveTo(x - w * 0.6, y - h * 0.1, x + sw * 0.6, y - h * 0.55); c.fillStyle = '#ffe27a'; c.fill();
  }
  function speedLines(c, t, x0, y0, n, gap) {
    c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i < n; i++) { const yy = y0 + i * gap, off = ((t * 3.1 + i * 0.37) % 1) * 22, len = 20 + (i % 2) * 12; c.moveTo(x0 - off, yy); c.lineTo(x0 - off - len, yy); }
    line(c, 5.2); line(c, 2.6, '#ffffff');
  }

  /* ---------- shared sprites ---------- */
  function soft(key, stops) {
    return CACHE[key] || sprite(key, -32, -32, 64, 64, (x) => { const gr = x.createRadialGradient(0, 0, 1, 0, 0, 32); for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); x.fillStyle = gr; x.fillRect(-32, -32, 64, 64); });
  }
  const puffW = () => soft('puffW', [0, 'rgba(255,255,255,.95)', 0.55, 'rgba(236,241,244,.7)', 1, 'rgba(230,236,240,0)']);
  const puffD = () => soft('puffD', [0, 'rgba(46,50,58,.9)', 0.55, 'rgba(46,50,58,.55)', 1, 'rgba(46,50,58,0)']);
  const glowRed = () => soft('glowRed', [0, 'rgba(255,70,50,0)', 0.42, 'rgba(255,70,50,.05)', 0.66, 'rgba(255,60,40,.5)', 0.82, 'rgba(255,50,40,.26)', 1, 'rgba(255,50,40,0)']);
  const glowFire = () => soft('glowFire', [0, 'rgba(255,214,120,.75)', 0.35, 'rgba(255,150,50,.42)', 0.7, 'rgba(255,90,20,.14)', 1, 'rgba(255,80,10,0)']);
  function starSpr() {
    return CACHE.star || sprite('star', -11, -11, 22, 22, (x) => {
      x.beginPath(); for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, r = i % 2 ? 3.9 : 8.6; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath();
      x.fillStyle = '#ffe066'; x.fill(); line(x, 2); dot(x, -1.6, -2, 1.5, '#ffffff');
    });
  }
  function qmark(x, s, col, lw) {
    x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(-0.34 * s, -0.42 * s); x.bezierCurveTo(-0.32 * s, -1.0 * s, 0.46 * s, -1.0 * s, 0.42 * s, -0.42 * s); x.bezierCurveTo(0.4 * s, -0.08 * s, 0.02 * s, -0.12 * s, 0, 0.26 * s); x.stroke();
    dot(x, 0, 0.72 * s, lw * 0.6, col);
  }
  function bubbleSpr() {
    return CACHE.bubble || sprite('bubble', -76, -76, 152, 152, (x) => {
      const gr = x.createRadialGradient(-16, -20, 6, 0, 0, 70); gr.addColorStop(0, 'rgba(200,244,255,.04)'); gr.addColorStop(0.72, 'rgba(120,215,255,.15)'); gr.addColorStop(1, 'rgba(96,205,255,.46)');
      x.beginPath(); x.arc(0, 0, 70, 0, TAU); x.fillStyle = gr; x.fill();
      x.lineWidth = 1.6; x.strokeStyle = 'rgba(10,17,24,.5)'; x.beginPath(); x.arc(0, 0, 72.6, 0, TAU); x.stroke();
      x.lineWidth = 3.4; x.strokeStyle = 'rgba(226,249,255,.96)'; x.beginPath(); x.arc(0, 0, 70, 0, TAU); x.stroke();
      x.lineCap = 'round'; x.lineWidth = 5.5; x.strokeStyle = 'rgba(255,255,255,.8)'; x.beginPath(); x.arc(0, 0, 59, PI * 1.1, PI * 1.4); x.stroke();
      x.beginPath(); x.arc(0, 0, 59, PI * 1.46, PI * 1.52); x.stroke();
      x.lineWidth = 2.6; x.strokeStyle = 'rgba(255,255,255,.38)'; x.beginPath(); x.arc(0, 0, 61, PI * 0.18, PI * 0.42); x.stroke();
    });
  }
  function badgeSpr() {
    return CACHE.badge || sprite('badge', -16, -16, 32, 32, (x) => { odot(x, 0, 0, 12.5, BRASS, 2.8); x.beginPath(); x.arc(0, 0, 9.6, PI * 1.05, PI * 1.6); line(x, 1.6, '#fff3c4'); qmark(x, 8.2, OUT, 3.4); });
  }
  function ghostQSpr() { return CACHE.ghostQ || sprite('ghostQ', -12, -14, 24, 28, (x) => { qmark(x, 10, 'rgba(10,17,24,.55)', 5.6); qmark(x, 10, 'rgba(235,251,255,.95)', 3); }); }

  /* ---------- states every boss shares ---------- */
  function aura(c, t) {   // enraged: a pulsing red halo behind the boss
    const s = glowRed(), k = 2.75 + Math.sin(t * 9) * 0.12; c.globalAlpha = 0.8 + Math.sin(t * 9) * 0.2; c.drawImage(s.c, -32 * k, -32 * k - 6, 64 * k, 64 * k); c.globalAlpha = 1;
  }
  function steam(c, t, hx, hy, face) {   // enraged: steam puffs + a throbbing anger mark by the head
    const p = puffW();
    for (let k = 0; k < 4; k++) { const ph = (t * 1.5 + k / 4) % 1, sd = k % 2 ? 1 : -1, sz = 9 + ph * 15; c.globalAlpha = (1 - ph) * 0.8; c.drawImage(p.c, hx + sd * (14 + 24 * ph) - sz / 2, hy - 2 - 30 * ph - sz / 2, sz, sz); }
    c.globalAlpha = 1;
    const ax = hx + 30 * face, ay = hy + 8, sc = 1 + Math.sin(t * 11) * 0.14;
    c.save(); c.translate(ax, ay); c.scale(sc, sc); c.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      c.beginPath(); for (let q = 0; q < 4; q++) { const sx = q & 1 ? 1 : -1, sy = q & 2 ? 1 : -1; c.moveTo(sx * 2.6, sy * 8.5); c.quadraticCurveTo(sx * 3, sy * 3, sx * 8.5, sy * 2.6); }
      if (pass) line(c, 2.8, '#ff3b2f'); else line(c, 5.6);
    }
    c.restore();
  }
  function stars(c, t, cx, cy, rx) {   // stunned: three stars circling the head
    const s = starSpr();
    for (let k = 0; k < 3; k++) { const a = t * 4.4 + k * TAU / 3, sc = 1 + Math.sin(a) * 0.22, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * 6.5; c.drawImage(s.c, x - 11 * sc, y - 11 * sc, 22 * sc, 22 * sc); }
  }
  function shield(c, t, rx, ry, cy) {   // a question is breaking this: glass bubble + "?" badge
    const s = bubbleSpr(), pul = 1 + Math.sin(t * 5) * 0.012;
    c.save(); c.translate(0, cy); c.scale(rx / 70 * pul, ry / 70 * pul); c.drawImage(s.c, s.x0, s.y0, s.w, s.h); c.restore();
    c.strokeStyle = 'rgba(224,248,255,.92)'; c.lineWidth = 2.8; c.setLineDash([10, 9]); c.lineDashOffset = -t * 34; c.beginPath(); c.ellipse(0, cy, rx + 6, ry + 6, 0, 0, TAU); c.stroke(); c.setLineDash([]);
    const q = ghostQSpr(), d1 = Math.sin(t * 2.2) * 3, d2 = Math.cos(t * 1.9) * 3;
    c.globalAlpha = 0.75; c.drawImage(q.c, -rx * 0.74 - 12, cy - ry * 0.2 - 14 + d1, 24, 28); c.drawImage(q.c, rx * 0.72 - 12, cy + ry * 0.3 - 14 + d2, 24, 28); c.globalAlpha = 1;
    const b = badgeSpr(), by = cy - ry - 2 + Math.sin(t * 4) * 2.5; c.drawImage(b.c, -19, by - 19, 38, 38);
  }

  /* =====================================================================================================
     1. THE DREADNOUGHT — Militarism: a scowling battleship; guns track the hero; one more gun per b.arms
     ===================================================================================================== */
  const P_DREAD = pal({ hull: '#93a651', hullD: '#647338', hullL: '#c2d37f', deck: '#3d4a22', sup: '#aebb72', supD: '#7f8c4c', steel: '#8894a0', steelD: '#565f6b', steelL: '#b8c2cc', funnel: '#3a444c', funnelL: '#56626c', red: '#d2452f', redD: '#9c2e1d', win: '#ffe08a', foam: '#eef8ff', foamD: '#a6d4ee', mouth: '#4a1210', brass: BRASS, flag: '#e4472c', wood: '#8a5a2b' });
  function hullPath(x) { x.beginPath(); x.moveTo(-63, -8); x.lineTo(46, -8); x.lineTo(73, -21); x.quadraticCurveTo(71, 10, 56, 32); x.lineTo(-52, 32); x.quadraticCurveTo(-66, 27, -68, 6); x.closePath(); }
  function dreadHull(fl) {
    const k = fl ? 'dHull~' : 'dHull', P = P_DREAD[fl];
    return CACHE[k] || sprite(k, -74, -26, 154, 64, (x) => {
      hullPath(x); x.fillStyle = P.hull; x.fill();
      x.save(); x.clip();
      x.fillStyle = P.hullL; x.fillRect(-80, -26, 170, 22.5);
      x.fillStyle = P.hullD; x.fillRect(-80, 11, 170, 30);
      x.fillStyle = P.red; x.fillRect(-80, 22, 170, 12); x.fillStyle = P.redD; x.fillRect(-80, 28, 170, 6);
      x.beginPath(); for (let i = -45; i <= 12; i += 19) { x.moveTo(i, -3); x.lineTo(i - 2, 22); } line(x, 1.3, P.hullD);
      x.fillStyle = P.deck; for (let i = -60; i <= 20; i += 7.2) { x.beginPath(); x.arc(i, 0.2, 1.1, 0, TAU); x.fill(); }
      x.restore();
      hullPath(x); line(x, 3.8);
      for (const px of [-53, -39, -25]) { odot(x, px, 15.5, 3.8, P.brass, 1.8); dot(x, px, 15.5, 2.1, P.win); }
      /* shark-mouth nose art: a white grin with a zigzag bite line */
      x.beginPath(); x.moveTo(21, 13); x.quadraticCurveTo(46, 35, 66.5, 6.5); x.quadraticCurveTo(47, 17.5, 21, 13); x.closePath(); x.fillStyle = '#ffffff'; x.fill(); line(x, 2.5);
      x.beginPath(); x.moveTo(25, 15); x.lineTo(29.5, 19.6); x.lineTo(34, 16.6); x.lineTo(39, 21.8); x.lineTo(44, 17.6); x.lineTo(49, 21.4); x.lineTo(53.5, 15.6); x.lineTo(58, 17.6); x.lineTo(62, 10.4); line(x, 1.8);
    });
  }
  function dreadSup(fl) {
    const k = fl ? 'dSup~' : 'dSup', P = P_DREAD[fl];
    return CACHE[k] || sprite(k, -66, -68, 112, 70, (x) => {
      /* funnels, raked back */
      const fun = (x0, top, w) => {
        x.beginPath(); x.moveTo(x0, -3); x.lineTo(x0 + w, -3); x.lineTo(x0 + w - 3, top); x.lineTo(x0 - 3, top); x.closePath(); x.fillStyle = P.funnel; x.fill();
        x.save(); x.clip(); x.fillStyle = P.funnelL; x.fillRect(x0 - 4, top, 4.2, 60); x.fillStyle = P.hull; x.fillRect(x0 - 6, top + 9, w + 8, 5.5); x.restore();
        x.beginPath(); x.moveTo(x0, -3); x.lineTo(x0 + w, -3); x.lineTo(x0 + w - 3, top); x.lineTo(x0 - 3, top); x.closePath(); line(x, 2.8);
        rr(x, x0 - 5, top - 4, w + 4, 5.5, 2.4); x.fillStyle = '#1d242a'; x.fill(); line(x, 2.4);
      };
      fun(-31, -33, 12); fun(-14, -41, 13);
      /* mast */
      x.beginPath(); x.moveTo(16, -34); x.lineTo(16, -62); x.moveTo(9, -53); x.lineTo(23, -53); line(x, 4.4); line(x, 2, P.steelL);
      rr(x, 12, -49, 8, 5, 1.5); x.fillStyle = P.steel; x.fill(); line(x, 2);
      /* bridge tower */
      rr(x, 1, -21, 29, 19, 3); x.fillStyle = P.sup; x.fill(); line(x, 2.8);
      x.fillStyle = P.supD; x.fillRect(2.5, -8, 26, 4.5);
      rr(x, 5, -17.5, 21, 5, 1.5); x.fillStyle = P.win; x.fill(); line(x, 1.6); x.beginPath(); x.moveTo(12, -17.5); x.lineTo(12, -12.5); x.moveTo(19, -17.5); x.lineTo(19, -12.5); line(x, 1.4);
      rr(x, 7, -35, 17, 15, 2.5); x.fillStyle = P.sup; x.fill(); line(x, 2.8);
      rr(x, 10, -31, 11, 4.5, 1.4); x.fillStyle = P.win; x.fill(); line(x, 1.6);
      rr(x, 4, -38.5, 23, 4.6, 2); x.fillStyle = P.supD; x.fill(); line(x, 2.2);
      /* barbette for the raised fore turret + aft deck house */
      rr(x, 25, -11, 16, 9, 2); x.fillStyle = P.steelD; x.fill(); line(x, 2.4);
      rr(x, -58, -9, 9, 7, 2); x.fillStyle = P.supD; x.fill(); line(x, 2.2);
    });
  }
  function gun(c, x, y, a, len, w, P, dome) {
    c.save(); c.translate(x, y); c.rotate(a);
    for (let k = -1; k <= 1; k += 2) {
      const oy = k * w * 0.62; c.lineCap = 'round';
      c.beginPath(); c.moveTo(2, oy); c.lineTo(len, oy); line(c, w + 3); c.beginPath(); c.moveTo(2, oy); c.lineTo(len, oy); line(c, w, k < 0 ? P.steelL : P.steel);
      c.lineCap = 'butt'; c.beginPath(); c.moveTo(len - 5, oy); c.lineTo(len - 1.4, oy); line(c, w + 0.4, P.steelD);
    }
    c.lineCap = 'round'; c.restore();
    c.beginPath(); c.moveTo(x - dome, y + 4); c.lineTo(x - dome * 0.86, y - dome * 0.42); c.quadraticCurveTo(x, y - dome * 1.05, x + dome * 0.86, y - dome * 0.42); c.lineTo(x + dome, y + 4); c.closePath(); c.fillStyle = P.steel; c.fill(); line(c, 2.8);
    c.beginPath(); c.moveTo(x - dome * 0.62, y - dome * 0.3); c.quadraticCurveTo(x - dome * 0.2, y - dome * 0.72, x + dome * 0.3, y - dome * 0.66); line(c, 1.8, P.steelL);
    dot(c, x - dome * 0.45, y + 0.6, 1.1, OUT); dot(c, x + dome * 0.45, y + 0.6, 1.1, OUT);
  }
  const CASE_X = [9, -9.5, -28, -46.5];
  function paintDread(c, b, t, fl) {
    const P = P_DREAD[fl], la = Math.max(-1.35, Math.min(0.16, LA)), lh = Math.max(-1.2, Math.min(1.2, LA));
    c.rotate(Math.sin(t * 1.7 + 1.2) * 0.028); c.translate(0, Math.sin(t * 1.7) * 1.7);
    /* funnel smoke drifting astern */
    const pf = (S.dmg || S.enr) ? puffD() : puffW();
    for (let f = 0; f < 2; f++) { const fx = f ? -10 : -28, fy = f ? -46 : -38; for (let i = 0; i < 3; i++) { const ph = (t * 0.6 + i / 3 + f * 0.17) % 1, sz = 11 + ph * 17; c.globalAlpha = (1 - ph) * 0.78; c.drawImage(pf.c, fx - 20 * ph - sz / 2 + Math.sin(t * 2 + i * 2.1) * 2, fy - 30 * ph - sz / 2, sz, sz); } }
    c.globalAlpha = 1;
    /* pennant */
    const pw = Math.sin(t * 7) * 2.6; c.beginPath(); c.moveTo(16, -63); c.lineTo(-5, -58 + pw); c.lineTo(16, -53.5); c.closePath(); c.fillStyle = P.flag; c.fill(); line(c, 2.1);
    c.translate(0, -4); put(c, dreadSup(fl));
    gun(c, -46, -10, la, 27, 4.4, P, 10.5); gun(c, 34, -18, la, 25, 4.2, P, 9.5); c.translate(0, 4); gun(c, 50, -13, la, 28, 4.4, P, 10.5);
    put(c, dreadHull(fl));
    /* b.arms extra guns bristle out of hull blisters */
    const arms = Math.max(0, Math.min(4, b.arms | 0));
    for (let i = 0; i < arms; i++) { const gx = CASE_X[i]; c.save(); c.translate(gx, 5); c.rotate(lh); c.beginPath(); c.moveTo(0, 0); c.lineTo(15, 0); line(c, 6.6); c.beginPath(); c.moveTo(0, 0); c.lineTo(15, 0); line(c, 3.8, P.steel); c.restore(); odot(c, gx, 5, 5.8, P.steelD, 2.4); dot(c, gx - 1.5, 3.4, 1.8, P.steelL); }
    /* the scowling face on the bow */
    eye(c, 35.5, 5, 8, t, false); eye(c, 55, 3, 7, t, false);
    brow(c, 26, -6, 43.5, -0.6, 3.6, P.deck); brow(c, 64.5, -7.6, 48.5, -1.6, 3.4, P.deck);
    /* bow wave + wake */
    const w1 = Math.sin(t * 6) * 2.2, w2 = Math.cos(t * 5) * 1.6;
    c.beginPath(); c.moveTo(30, 37.5); c.quadraticCurveTo(44, 31 + w2, 50, 34); c.quadraticCurveTo(60, 17 + w1, 78 + w2, 26 + w1); c.quadraticCurveTo(86 + w2, 34, 74, 38.5); c.closePath(); c.fillStyle = P.foam; c.fill(); line(c, 2.4);
    c.beginPath(); c.moveTo(58, 34.5); c.quadraticCurveTo(64, 27 + w1, 72 + w2, 31); line(c, 1.6, P.foamD);
    odot(c, 80 + w2, 20 - w1, 2.3, P.foam, 1.5); odot(c, 86 - w2, 27 + w1, 1.7, P.foam, 1.3);
    c.globalAlpha = 1;
    if (S.dmg) {
      poly(c, [-4, -7, -9, 3, -3, 8, -9, 19]); c.moveTo(-9, 3); c.lineTo(-16, 6); c.moveTo(14, -7); c.lineTo(18.5, 3); c.lineTo(13, 9); line(c, 2.1);
      rr(c, -19, 5, 16, 12, 2.2); c.fillStyle = P.steel; c.fill(); line(c, 2.2); for (let i = 0; i < 4; i++) dot(c, -16.5 + (i & 1) * 11, 7.5 + (i >> 1) * 7, 1.1, OUT);
      flamelet(c, -56, -11, 12 + Math.sin(t * 17) * 2, t, 0); flamelet(c, 20, -42, 10 + Math.sin(t * 15 + 2) * 2, t, 2);
    }
  }

  /* =====================================================================================================
     2. THE PACT TWINS — Alliances: a matched pair in top hats, joined by a chain that hurts to touch
     ===================================================================================================== */
  const P_PACT = [
    pal({ body: '#74bfff', ring: '#e2f1ff', hat: '#18222e', hatL: '#33475c', band: '#e4472c', tie: '#e4472c', foot: '#18222e', glove: '#ffffff', gold: BRASS, shirt: '#ffffff', stache: '#18222e', cheek: '#ff8d8d' }),
    pal({ body: '#3585e6', ring: '#cfe3f8', hat: '#18222e', hatL: '#33475c', band: BRASS, tie: BRASS, foot: '#18222e', glove: '#ffffff', gold: BRASS, shirt: '#f4e7c6', stache: '#101820', cheek: '#ff7d8a' }),
  ];
  function pactHat(side, fl) {
    const k = 'pHat' + side + (fl ? '~' : ''), P = P_PACT[side][fl];
    return CACHE[k] || sprite(k, -36, -48, 72, 56, (x) => {
      x.beginPath(); x.moveTo(-20, 0); x.lineTo(-23, -38); x.quadraticCurveTo(0, -44, 23, -38); x.lineTo(20, 0); x.closePath(); x.fillStyle = P.hat; x.fill();
      x.save(); x.clip(); x.fillStyle = P.band; x.fillRect(-26, -12, 52, 8.5); x.fillStyle = P.hatL; x.fillRect(-18, -36, 5, 22); x.restore();
      x.beginPath(); x.moveTo(-20, 0); x.lineTo(-23, -38); x.quadraticCurveTo(0, -44, 23, -38); x.lineTo(20, 0); x.closePath(); line(x, 3.2);
      rr(x, -32, -4, 64, 9.5, 4.7); x.fillStyle = P.hat; x.fill(); line(x, 3.2);
      x.beginPath(); x.moveTo(-26, -1); x.lineTo(-10, -1); line(x, 1.8, P.hatL);
    });
  }
  function paintPact(c, b, t, fl) {
    const side = b.side ? 1 : 0, P = P_PACT[side][fl], hot = b.raging || S.enr, step = Math.sin(t * 6.2 + side * 1.9);
    if (b.raging) speedLines(c, t, -58, -22, 4, 15);
    /* chain-ring belt: back half */
    c.save(); c.translate(0, 9); c.rotate(-0.1);
    c.beginPath(); c.ellipse(0, 0, 54, 17, 0, PI, TAU); line(c, 10); c.setLineDash([8, 6.5]); c.lineDashOffset = t * 12; c.beginPath(); c.ellipse(0, 0, 54, 17, 0, PI, TAU); line(c, 5.4, P.ring); c.setLineDash([]);
    c.restore();
    /* feet */
    c.beginPath(); c.ellipse(-17, 41.5 - Math.max(0, step) * 4, 12.5, 6.5, 0, 0, TAU); c.fillStyle = P.foot; c.fill(); line(c, 3);
    c.beginPath(); c.ellipse(17, 41.5 - Math.max(0, -step) * 4, 12.5, 6.5, 0, 0, TAU); c.fillStyle = P.foot; c.fill(); line(c, 3);
    /* body with a shirt front */
    blob(c, 0, 0, 44, 43, P.body, 3.8, (x) => { x.beginPath(); x.moveTo(-15, 25); x.lineTo(15, 25); x.lineTo(0, 50); x.closePath(); x.fillStyle = P.shirt; x.fill(); if (hot) { x.globalAlpha = 0.5; dot(x, -27, 6, 8, P.cheek); dot(x, 29, 6, 8, P.cheek); x.globalAlpha = 1; } });
    /* bow tie */
    c.beginPath(); c.moveTo(0, 34); c.lineTo(-12, 28); c.lineTo(-12, 40); c.closePath(); c.moveTo(0, 34); c.lineTo(12, 28); c.lineTo(12, 40); c.closePath(); c.fillStyle = P.tie; c.fill(); line(c, 2.4); odot(c, 0, 34, 3.4, P.tie, 2.2);
    /* face */
    eye(c, -14, -9, 10, t, false); eye(c, 14, -9, 10, t, false);
    if (hot) { brow(c, -26, -24, -5, -16, 3.4, null); brow(c, 26, -24, 5, -16, 3.4, null); }
    else if (side) { brow(c, -24, -22, -6, -21, 3, null); brow(c, 24, -22, 6, -21, 3, null); }
    else { brow(c, -24, -21, -7, -24, 2.6, null); brow(c, 25, -26, 7, -22, 2.6, null); }
    if (!side) {   /* monocle on the leading eye */
      c.beginPath(); c.arc(14, -9, 12.6, 0, TAU); line(c, 5); c.beginPath(); c.arc(14, -9, 12.6, 0, TAU); line(c, 2.4, P.gold);
      c.beginPath(); c.moveTo(24.5, -1.5); c.quadraticCurveTo(36, 8, 33, 19); line(c, 1.7, P.gold);
      if (hot) teeth(c, -11, 7, 22, 10); else { c.beginPath(); c.moveTo(-9, 10.5); c.quadraticCurveTo(1, 19, 11, 8.5); line(c, 3.2); }
    } else {   /* handlebar moustache */
      if (hot) teeth(c, -10, 11, 20, 9);
      for (let sd = -1; sd <= 1; sd += 2) { c.beginPath(); c.moveTo(0, 3.5); c.bezierCurveTo(sd * 7, 15, sd * 23, 15, sd * 28, -1); c.bezierCurveTo(sd * 23, 7, sd * 10, 4.5, 0, 3.5); c.closePath(); c.fillStyle = P.stache; c.fill(); line(c, 2); }
    }
    /* top hat, tipped at a jaunty angle */
    c.save(); c.translate(0, -39 + (S.dmg ? 2 : 0) + Math.sin(t * 2.6 + side * 1.6 - 0.9) * 1.1); c.rotate((side ? 0.1 : -0.1) + (S.dmg ? (side ? 0.2 : -0.2) : 0) + (b.raging ? Math.sin(t * 31) * 0.035 : 0)); put(c, pactHat(side, fl)); c.restore();
    /* belt: front half, then the gloves that hold it */
    c.save(); c.translate(0, 9); c.rotate(-0.1);
    c.beginPath(); c.ellipse(0, 0, 54, 17, 0, 0.05, PI - 0.05); line(c, 10); c.setLineDash([8, 6.5]); c.lineDashOffset = -t * 12; c.beginPath(); c.ellipse(0, 0, 54, 17, 0, 0.05, PI - 0.05); line(c, 5.4, P.ring); c.setLineDash([]);
    c.restore();
    const fist = b.raging ? Math.sin(t * 24) * 2 : 0;
    c.save(); c.translate(53, 2 - fist); c.rotate(side ? -0.45 : 0.42);
    if (side) {   /* quill */
      c.beginPath(); c.moveTo(0, 6); c.bezierCurveTo(-9, -6, -7, -24, 2, -33); c.bezierCurveTo(8, -22, 7, -6, 0, 6); c.closePath(); c.fillStyle = '#fff8e8'; c.fill(); line(c, 2.2);
      c.beginPath(); c.moveTo(0.4, 5); c.quadraticCurveTo(-1.5, -14, 1.6, -29); line(c, 1.4);
      c.beginPath(); c.moveTo(-1.6, 6); c.lineTo(0, 13); c.lineTo(1.8, 6); c.closePath(); c.fillStyle = OUT; c.fill();
    } else {      /* rolled treaty */
      rr(c, -5.5, -25, 11, 31, 4); c.fillStyle = '#fff3d6'; c.fill(); line(c, 2.4);
      c.fillStyle = P.band; c.fillRect(-5.5, -12, 11, 5.5); c.beginPath(); c.moveTo(-5.5, -12); c.lineTo(5.5, -12); c.moveTo(-5.5, -6.5); c.lineTo(5.5, -6.5); line(c, 1.5);
      c.beginPath(); c.ellipse(0, -25, 5.5, 2.4, 0, 0, TAU); c.fillStyle = '#e3d2a4'; c.fill(); line(c, 1.8);
    }
    c.restore();
    odot(c, -52, 14 + fist, 7.6, P.glove, 2.6); odot(c, 52, 3 - fist, 7.6, P.glove, 2.6);
    if (S.dmg) { plaster(c, -27, 12, 6.5, 0.5); c.beginPath(); c.moveTo(34, -22); c.lineTo(38, -15); c.lineTo(33, -12); line(c, 1.8); dot(c, 37, -30, 2.4, '#bfe9ff'); }
  }
  /* the chain between the twins: nearly straight (it IS the danger line), hot red pulses run along it */
  const LINK_COL = ['#8a2018', '#dc4630', '#ff9a52'];
  function tether(c, a, b, t, g) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const hot = a.raging || b.raging || a.enr > 0 || b.enr > 0, pulse = 0.5 + 0.5 * Math.sin(t * (hot ? 16 : 8));
    const x0 = a.x + ux * a.r * 0.9, y0 = a.y + uy * a.r * 0.9 + 3, x1 = b.x - ux * b.r * 0.9, y1 = b.y - uy * b.r * 0.9 + 3;
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 6) return;
    const sag = Math.sin(t * 3.1) * 2.5 + 3, mx = (x0 + x1) / 2 - uy * sag * 0.4, my = (y0 + y1) / 2 + sag;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    /* heat glow underneath */
    c.globalCompositeOperation = 'lighter';
    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, x1, y1); c.globalAlpha = 0.16 + 0.12 * pulse; line(c, 22, '#ff3b1f'); c.globalAlpha = 0.3 + 0.2 * pulse; line(c, 11, '#ff5a2a');
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    /* links: alternate open rings and edge-on bars, outlined in one pass */
    const n = Math.max(3, Math.round(L / 11.5)), ang = Math.atan2(y1 - y0, x1 - x0);
    const pt = (s, o) => { const k = 1 - s; o[0] = k * k * x0 + 2 * k * s * mx + s * s * x1; o[1] = k * k * y0 + 2 * k * s * my + s * s * y1; };
    const o = TMP;
    for (let pass = 0; pass < 4; pass++) {
      c.beginPath(); let any = false;
      for (let i = 0; i < n; i++) {
        const ci = pass ? ((i * 0.5 - t * (hot ? 14 : 7)) % 3 + 3) % 3 | 0 : -1;
        if (pass && ci !== pass - 1) continue;
        pt((i + 0.5) / n, o); any = true;
        if (i & 1) { c.moveTo(o[0] - ux * 5, o[1] - uy * 5); c.lineTo(o[0] + ux * 5, o[1] + uy * 5); }
        else { c.moveTo(o[0] + Math.cos(ang) * 6.8, o[1] + Math.sin(ang) * 6.8); c.ellipse(o[0], o[1], 6.8, 4.3, ang, 0, TAU); }
      }
      if (!any) continue;
      if (!pass) line(c, 6.4); else line(c, 3, LINK_COL[pass - 1]);
    }
    /* sparks racing along the chain */
    for (let k = 0; k < 2; k++) { const s = (t * (hot ? 1.5 : 0.8) + k * 0.5) % 1; pt(s, o); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.55; dot(c, o[0], o[1], 7, '#ff8a3c'); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; dot(c, o[0], o[1], 2.7, '#fff6d0'); }
    c.restore();
  }
  const TMP = [0, 0];

  /* =====================================================================================================
     3. EMPEROR GRAB — Imperialism: a greedy crowned giant whose gloved hands reach for the hero
     ===================================================================================================== */
  const P_EMP = pal({ body: CI, lid: '#8c59d6', arm: '#a56cf0', cape: '#9b2247', capeD: '#6e1431', fur: '#fff8e8', glove: '#ffffff', gold: BRASS, goldD: '#c28a12', goldL: '#ffe08a', ruby: '#e4472c', emer: '#38b876', saph: '#4da8ff', mouth: '#3a0f24', tongue: '#ff7d9c', white: '#ffffff' });
  function empCrown(fl) {
    const k = fl ? 'eCrown~' : 'eCrown', P = P_EMP[fl];
    return CACHE[k] || sprite(k, -36, -40, 72, 56, (x) => {
      const pts = [-27, 5, -28, -19, -19, -9, -13, -26, -6.5, -10, 0, -32, 6.5, -10, 13, -26, 19, -9, 28, -19, 27, 5];
      poly(x, pts); x.closePath(); x.fillStyle = P.gold; x.fill();
      x.save(); x.clip(); x.fillStyle = P.goldD; x.fillRect(4, -40, 40, 60); x.fillStyle = P.goldL; x.fillRect(-30, -40, 9, 60); x.restore();
      poly(x, pts); x.closePath(); line(x, 3);
      for (const q of [[-28, -19], [-13, -26], [0, -32], [13, -26], [28, -19]]) odot(x, q[0], q[1], 3.4, P.goldL, 2);
      odot(x, 0, -6, 5, P.ruby, 2); dot(x, -1.5, -7.6, 1.5, '#ffd0c8'); odot(x, -16, -4, 3.4, P.emer, 1.8); odot(x, 16, -4, 3.4, P.saph, 1.8);
      rr(x, -30, 2, 60, 9.5, 4.7); x.fillStyle = P.fur; x.fill(); line(x, 2.8);
      x.fillStyle = OUT; for (const fx of [-19, -6, 7, 20]) { x.beginPath(); x.ellipse(fx, 6.8, 1.5, 2.4, 0.3, 0, TAU); x.fill(); }
    });
  }
  function glove(c, x, y, ang, grab, P) {
    c.save(); c.translate(x, y); c.rotate(ang);
    rr(c, -17, -8.5, 9, 17, 3); c.fillStyle = P.gold; c.fill(); line(c, 2.4);
    const spread = 0.62 - grab * 0.34, ext = 14.5 - grab * 4;
    for (let i = -1; i <= 1; i++) { const a = i * spread; odot(c, Math.cos(a) * ext, Math.sin(a) * ext, 5, P.glove, 2.4); }
    odot(c, 1.5, -12 + grab * 2.5, 4.6, P.glove, 2.4);
    odot(c, 0, 0, 11, P.glove, 2.6);
    c.beginPath(); c.arc(0, 0, 7.2, 0.5, 1.9); line(c, 1.6, '#c9d4e2');
    c.restore();
  }
  function paintEmp(c, b, t, fl) {
    const P = P_EMP[fl], vac = b.vac > 0, w = Math.sin(t * 3.1) * 3, hot = S.enr;
    if (vac) {   /* suction streaks spiralling into the mouth */
      c.lineCap = 'round';
      for (let i = 0; i < 7; i++) { const p = (t * 1.15 + i / 7) % 1, rad = 122 - 80 * p, a0 = i * TAU / 7 + p * 2.6; c.globalAlpha = 0.22 + 0.6 * (1 - Math.abs(p - 0.5) * 2); c.beginPath(); c.arc(4, 12, rad, a0, a0 + 0.62 - p * 0.25); line(c, 3.6, '#ffffff'); }
      c.globalAlpha = 1;
    }
    /* royal mantle */
    const hem = (x) => { x.beginPath(); x.moveTo(-28, -30); x.quadraticCurveTo(-70, -8, -72 + w, 32); x.quadraticCurveTo(-56, 50 - w, -40, 40); x.quadraticCurveTo(-20, 56 + w, 0, 44); x.quadraticCurveTo(20, 56 - w, 40, 40); x.quadraticCurveTo(56, 50 + w, 72 - w, 32); x.quadraticCurveTo(70, -8, 28, -30); x.closePath(); };
    hem(c); c.fillStyle = P.cape; c.fill();
    c.beginPath(); c.moveTo(-38, -22); c.quadraticCurveTo(-66, -2, -65 + w, 30); c.moveTo(38, -22); c.quadraticCurveTo(66, -2, 65 - w, 30); line(c, 9, P.fur);
    c.fillStyle = OUT; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(-56 - i * 4 + w * i * 0.3, -6 + i * 13, 1.5, 2.5, 0.5, 0, TAU); c.fill(); c.beginPath(); c.ellipse(56 + i * 4 - w * i * 0.3, -6 + i * 13, 1.5, 2.5, -0.5, 0, TAU); c.fill(); }
    hem(c); line(c, 3.6);
    /* reaching arms (behind the body) */
    const reach = 71 + Math.sin(t * 3.3) * 5 + (vac ? 5 : 0), grab = vac ? 0.15 : 0.5 + 0.5 * Math.sin(t * 6.4);
    const a1 = LA - 0.6, a2 = LA + 0.6, h1x = Math.cos(a1) * reach, h1y = Math.sin(a1) * reach + 2, h2x = Math.cos(a2) * reach, h2y = Math.sin(a2) * reach + 2;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(12, -8); c.quadraticCurveTo(h1x * 0.6, h1y * 0.6 - 10, h1x, h1y); c.moveTo(12, 10); c.quadraticCurveTo(h2x * 0.6, h2y * 0.6 + 10, h2x, h2y); line(c, 16); line(c, 10.5, P.arm);
    /* body */
    blob(c, 0, 0, vac ? 47 : 45, 44, P.body, 3.9, null);
    /* gold chain + medallion */
    c.beginPath(); c.moveTo(-25, 24); c.quadraticCurveTo(0, 42, 25, 24); line(c, 5); line(c, 2.4, P.gold);
    odot(c, 0, 34.5, 6.6, P.gold, 2.3); dot(c, 0, 34.5, 3.4, P.saph); dot(c, -1, 33.4, 1.5, P.emer);
    /* face */
    if (vac) {
      eye(c, -15, -14, 10.5, t, true); eye(c, 15, -14, 10.5, t, true);
      c.beginPath(); c.ellipse(5, 10, 15, 17, 0, 0, TAU); c.fillStyle = P.mouth; c.fill(); line(c, 3.2);
      c.beginPath(); c.ellipse(5, 19, 8.5, 5, 0, 0, TAU); c.fillStyle = P.tongue; c.fill();
      c.beginPath(); c.ellipse(5, 10, 15, 17, 0, 0, TAU); line(c, 3.2);
    } else {
      eye(c, -15, -14, 10.5, t, false); eye(c, 15, -14, 10.5, t, false);
      if (hot || S.stun) { if (hot) { brow(c, -28, -29, -6, -21, 3.6, null); brow(c, 28, -29, 6, -21, 3.6, null); } }
      else if (!S.blink) for (let sd = -1; sd <= 1; sd += 2) { c.beginPath(); c.arc(sd * 15, -14, 11.2, PI * 1.07, PI * 1.93); c.closePath(); c.fillStyle = P.lid; c.fill(); line(c, 2.2); }
      /* the greedy grin, one gold tooth */
      c.beginPath(); c.moveTo(-23, 1); c.quadraticCurveTo(0, 11, 23, 1); c.quadraticCurveTo(19, 22, 0, 22); c.quadraticCurveTo(-19, 22, -23, 1); c.closePath(); c.fillStyle = P.mouth; c.fill();
      c.beginPath(); c.ellipse(0, 19.5, 9, 3.6, 0, 0, TAU); c.fillStyle = P.tongue; c.fill();
      c.beginPath(); c.moveTo(-20.5, 3); c.quadraticCurveTo(0, 12, 20.5, 3); c.lineTo(18, 8.5); c.quadraticCurveTo(0, 16.5, -18, 8.5); c.closePath(); c.fillStyle = P.white; c.fill();
      c.beginPath(); c.moveTo(5, 9.6); c.lineTo(11.5, 8); c.lineTo(11, 12.8); c.lineTo(5, 14.4); c.closePath(); c.fillStyle = P.gold; c.fill();
      c.beginPath(); c.moveTo(-8, 8.8); c.lineTo(-8, 13.6); c.moveTo(-1.5, 10); c.lineTo(-1.5, 14.8); c.moveTo(5, 9.6); c.lineTo(5, 14.4); c.moveTo(11.5, 8); c.lineTo(11, 12.8); line(c, 1.3);
      c.beginPath(); c.moveTo(-23, 1); c.quadraticCurveTo(0, 11, 23, 1); c.quadraticCurveTo(19, 22, 0, 22); c.quadraticCurveTo(-19, 22, -23, 1); c.closePath(); line(c, 3);
    }
    /* jewelled crown, slipping when he is hurt */
    c.save(); c.translate(S.dmg ? -6 : 0, -41 + (S.dmg ? 3 : 0)); c.rotate((S.dmg ? -0.34 : -0.12) + Math.sin(t * 2.2) * 0.02); put(c, empCrown(fl));
    if (S.dmg) { c.beginPath(); c.moveTo(8, -24); c.lineTo(5, -14); c.lineTo(11, -8); c.lineTo(7, 2); line(c, 1.9); dot(c, 0, -6, 4.6, OUT); }
    c.restore();
    /* the grabbing hands */
    glove(c, h1x, h1y, a1, grab, P); glove(c, h2x, h2y, a2, 1 - grab, P);
    if (S.dmg) { plaster(c, -30, -24, 7, -0.4); c.globalAlpha = 0.45; c.beginPath(); c.arc(15, -12, 13.5, 0.25, PI - 0.25); line(c, 4, '#4b2a7a'); c.globalAlpha = 1; }
  }

  /* =====================================================================================================
     4. GENERAL PRIDE — Nationalism: bicorne, epaulettes, medals, a huge flag; winds up and charges
     ===================================================================================================== */
  const P_GEN = pal({ body: CN, hat: '#18222e', hatL: '#33475c', gold: BRASS, goldD: '#c28a12', boot: '#18222e', flag: '#fff3d6', flagD: '#e3d2a4', red: '#e4472c', pole: '#9a6a36', stache: '#fff8e8', mouth: '#4a1210', belt: '#fff3d6', brow: '#5a1410', white: '#ffffff', plume: '#fff3d6', rib1: '#4da8ff', rib2: '#38b876', rib3: '#b77dff' });
  function genHat(fl) {
    const k = fl ? 'gHat~' : 'gHat', P = P_GEN[fl];
    return CACHE[k] || sprite(k, -60, -84, 120, 66, (x) => {
      const shape = () => { x.beginPath(); x.moveTo(-54, -27); x.quadraticCurveTo(-32, -64, 0, -73); x.quadraticCurveTo(32, -64, 54, -27); x.quadraticCurveTo(27, -44, 0, -43); x.quadraticCurveTo(-27, -44, -54, -27); x.closePath(); };
      shape(); x.fillStyle = P.hat; x.fill();
      x.save(); x.clip();
      x.beginPath(); x.moveTo(-54, -27); x.quadraticCurveTo(-27, -44, 0, -43); x.quadraticCurveTo(27, -44, 54, -27); line(x, 9, P.gold);
      x.beginPath(); x.moveTo(-50, -31); x.quadraticCurveTo(-30, -60, -4, -70); line(x, 3, P.hatL);
      x.restore();
      shape(); line(x, 3.4);
      odot(x, 0, -55, 8.6, P.gold, 2.4); dot(x, 0, -55, 5.6, '#ffffff'); dot(x, 0, -55, 3, P.red);
    });
  }
  function genMedals(fl) {
    const k = fl ? 'gMed~' : 'gMed', P = P_GEN[fl];
    return CACHE[k] || sprite(k, 8, 14, 40, 26, (x) => {
      const rib = [P.rib1, P.rib2, P.rib3];
      for (let i = 0; i < 3; i++) { const mx = 17 + i * 10.5, my = 20 + i * 1.2 - (i === 1 ? 1 : 0); rr(x, mx - 3.4, my - 4, 6.8, 8, 1.2); x.fillStyle = rib[i]; x.fill(); line(x, 1.7); odot(x, mx, my + 8, 4.2, P.gold, 1.8); dot(x, mx - 1, my + 7, 1.2, '#fff3c4'); }
    });
  }
  function paintGen(c, b, t, fl0) {
    const st = b.st, aim = st === 'aim', dash = st === 'dash';
    /* winding up strobes white so the charge is impossible to miss */
    const fl = fl0 || (aim && (t * 14 % 2) < 1) ? 1 : 0, P = P_GEN[fl];
    const ldx = (b.dx || 0) * FACE, ldy = b.dy || 0, fa = Math.abs(ldx) < 1e-3 && Math.abs(ldy) < 1e-3 ? 0 : Math.atan2(ldy, ldx);
    if (dash) { c.save(); c.rotate(fa); speedLines(c, t, -62, -32, 5, 16); const pf = puffW(); for (let i = 0; i < 3; i++) { const ph = (t * 3 + i / 3) % 1, sz = 14 + ph * 16; c.globalAlpha = (1 - ph) * 0.8; c.drawImage(pf.c, -48 - ph * 44 - sz / 2, (i - 1) * 16 - sz / 2, sz, sz); } c.globalAlpha = 1; c.restore(); }
    c.save();
    if (dash) { c.rotate(fa); c.scale(1.2, 0.86); c.rotate(-fa); c.rotate(0.16 * Math.cos(fa)); }
    else if (aim) { const sh = Math.sin(t * 46) * 1.4; c.translate(sh, 0); c.translate(0, GROUND); c.rotate(-0.2); c.scale(1.07, 0.92); c.translate(0, -GROUND); }
    /* the enormous flag, streaming behind */
    const fast = dash ? 2.2 : aim ? 1.8 : 1, amp = dash ? 7 : 5, px = -39, top = -98, hgt = 43, L = 42, N = 6;
    c.beginPath(); c.moveTo(-25, 38); c.lineTo(px, top - 5); line(c, 6.8); line(c, 3.8, P.pole);
    for (let k = 0; k <= N; k++) { FXB[k] = px - k * L / N; FYB[k] = Math.sin(t * 6 * fast - k * 0.95) * amp * (k / N); }
    c.beginPath(); c.moveTo(FXB[0], top); for (let k = 1; k <= N; k++) c.lineTo(FXB[k], top + FYB[k]);
    c.lineTo(FXB[N] + 10, top + hgt / 2 + FYB[N]); c.lineTo(FXB[N], top + hgt + FYB[N]); for (let k = N - 1; k >= 0; k--) c.lineTo(FXB[k], top + hgt + FYB[k]); c.closePath();
    c.fillStyle = P.flag; c.fill();
    c.beginPath(); c.moveTo(FXB[N - 1], top + FYB[N - 1]); c.lineTo(FXB[N], top + FYB[N]); c.lineTo(FXB[N] + 10, top + hgt / 2 + FYB[N]); c.lineTo(FXB[N], top + hgt + FYB[N]); c.lineTo(FXB[N - 1], top + hgt + FYB[N - 1]); c.lineTo(FXB[N - 1] + 8, top + hgt / 2 + FYB[N - 1]); c.closePath(); c.fillStyle = P.red; c.fill();
    c.save(); c.translate(FXB[2] - 2.5, top + hgt / 2 + (FYB[2] + FYB[3]) / 2); c.scale(FACE, 1); c.beginPath(); c.moveTo(-8.5, 11); c.lineTo(-8.5, -11); c.lineTo(8.5, 11); c.lineTo(8.5, -11); c.lineJoin = 'miter'; line(c, 6, P.red); c.lineJoin = 'round'; c.restore();
    if (S.dmg) { dot(c, FXB[4] + 2, top + 8 + FYB[4], 3.4, OUT); dot(c, FXB[1] - 1, top + 29 + FYB[1], 2.6, OUT); }
    c.beginPath(); c.moveTo(FXB[0], top); for (let k = 1; k <= N; k++) c.lineTo(FXB[k], top + FYB[k]);
    c.lineTo(FXB[N] + 10, top + hgt / 2 + FYB[N]); c.lineTo(FXB[N], top + hgt + FYB[N]); for (let k = N - 1; k >= 0; k--) c.lineTo(FXB[k], top + hgt + FYB[k]); c.closePath(); line(c, 3);
    c.beginPath(); c.moveTo(px - 4, top - 4); c.lineTo(px - 0.6, top - 14); c.lineTo(px + 3.6, top - 4); c.closePath(); c.fillStyle = P.gold; c.fill(); line(c, 2.2);
    /* boots */
    const step = dash ? Math.sin(t * 30) : aim ? 0 : Math.sin(t * 7);
    c.beginPath(); c.ellipse(-17, 41.5 - Math.max(0, step) * 5, 13, 7, 0, 0, TAU); c.fillStyle = P.boot; c.fill(); line(c, 3);
    c.beginPath(); c.ellipse(16, 41.5 - Math.max(0, -step) * 5, 13, 7, 0, 0, TAU); c.fillStyle = P.boot; c.fill(); line(c, 3);
    /* body: red coat, white belt, gold buckle */
    blob(c, 0, 0, 44, 43, P.body, 3.9, (x) => { x.fillStyle = P.belt; x.fillRect(-50, 27, 100, 7.5); x.fillStyle = OUT; x.fillRect(-50, 26, 100, 1.5); x.fillRect(-50, 34, 100, 1.5); });
    rr(c, -6, 25.5, 12, 10.5, 2.2); c.fillStyle = P.gold; c.fill(); line(c, 2.2);
    put(c, genMedals(fl));
    /* epaulettes with fringe */
    for (let sd = -1; sd <= 1; sd += 2) { c.save(); c.translate(sd * 36, -20); c.rotate(sd * 0.62); c.beginPath(); for (let i = -1; i <= 1; i++) { c.moveTo(i * 5.5, 3); c.lineTo(i * 6.5, 11); } line(c, 5.4); line(c, 2.6, P.gold); c.beginPath(); c.ellipse(0, 0, 13, 6.4, 0, 0, TAU); c.fillStyle = P.gold; c.fill(); line(c, 2.6); c.beginPath(); c.ellipse(-2, -1.4, 7, 2.2, 0, 0, TAU); c.fillStyle = '#ffe08a'; c.fill(); c.restore(); }
    /* face: fierce brows, walrus moustache, frown — or clenched teeth once he is under half health */
    eye(c, -13, -11, 9.6, t, false); eye(c, 14, -11, 9.6, t, false);
    brow(c, -26, -26, -5, -17, 4.2, P.brow); brow(c, 27, -26, 6, -17, 4.2, P.brow);
    if (S.low || S.enr || aim || dash) teeth(c, -12, 9, 25, 11); else { c.beginPath(); c.arc(1, 22, 11, PI * 1.17, PI * 1.83); line(c, 3.4); }
    for (let sd = -1; sd <= 1; sd += 2) { c.beginPath(); c.moveTo(0.5, 1); c.bezierCurveTo(sd * 8, -3, sd * 24, 2, sd * 25, 13); c.bezierCurveTo(sd * 17, 9, sd * 8, 10, 0.5, 6); c.closePath(); c.fillStyle = P.stache; c.fill(); line(c, 2.2); }
    /* bicorne + plume */
    c.save(); c.translate(0, S.dmg ? 2 : 0); c.rotate(S.dmg ? -0.12 : 0);
    const pw = Math.sin(t * 5 * fast) * 3;
    c.beginPath(); c.moveTo(-4, -67); c.bezierCurveTo(0, -99, 30, -103, 40 + pw, -84 + pw * 0.5); c.bezierCurveTo(26, -88, 12, -78, 4, -63); c.closePath(); c.fillStyle = P.plume; c.fill(); line(c, 2.6);
    c.beginPath(); c.moveTo(-1, -70); c.bezierCurveTo(6, -91, 24, -94, 34 + pw, -85 + pw * 0.5); line(c, 1.9, P.red);
    put(c, genHat(fl)); c.restore();
    if (S.low) {   /* refuses to back down: steam, a throbbing vein */
      const pf = puffW(); for (let k = 0; k < 4; k++) { const ph = (t * 1.7 + k / 4) % 1, sd = k % 2 ? 1 : -1, sz = 8 + ph * 13; c.globalAlpha = (1 - ph) * 0.8; c.drawImage(pf.c, sd * (46 + 18 * ph) - sz / 2, -18 - 30 * ph - sz / 2, sz, sz); } c.globalAlpha = 1;
    }
    if (S.dmg) { plaster(c, 30, 6, 6.5, 0.4); c.beginPath(); c.moveTo(-34, 4); c.lineTo(-29, 11); c.lineTo(-35, 16); line(c, 1.9); }
    c.restore();
  }
  const FXB = new Float32Array(8), FYB = new Float32Array(8);

  /* =====================================================================================================
     5. THE SPARK — the final boss: a living flame on the end of a fuse; whiter and wilder as the fuse burns down
     ===================================================================================================== */
  const HEAT = [];
  (function () {
    const cold = { outer: '#ff5a12', mid: CS, inner: '#ffd84a', core: '#fff3c4', rim: '#7a2a00', hand: '#ff7a1a' }, hotc = { outer: '#ffb23a', mid: '#ffe27a', inner: '#fff6cf', core: '#ffffff', rim: '#a8420a', hand: '#ffc04a' };
    for (let i = 0; i < 6; i++) { const o = {}; for (const k in cold) o[k] = mix(cold[k], hotc[k], i / 5); HEAT.push(pal(o)); }
  })();
  const FN = 60, FLX = new Float32Array(FN), FLY = new Float32Array(FN);
  /* a flame outline: round at the bottom, five flickering tongues across the top (a crown of fire) */
  function flamePath(c, cx, cy, R0, H0, H1, t, ph, speed) {
    for (let i = 0; i < FN; i++) {
      const th = i / FN * TAU, u = th - PI; let w = -Math.cos(th); w = w > 0 ? Math.pow(w, 0.55) : 0;
      const q = u * 5 / PI, k = Math.round(q), tri = 1 - Math.abs(q - k) * 2, tall = 1 - Math.abs(k) * 0.2;
      const R = R0 + w * (H0 + H1 * Math.pow(tri, 1.6) * tall * (0.76 + 0.24 * Math.sin(t * speed + k * 2.3 + ph))) + Math.sin(th * 3 + t * 4.2 + ph) * 1.1;
      const a = th + Math.sin(t * 3.4 + ph + k * 1.3) * 0.055 * w;
      FLX[i] = cx + Math.sin(a) * R; FLY[i] = cy + Math.cos(a) * R;
    }
    c.beginPath(); c.moveTo((FLX[FN - 1] + FLX[0]) / 2, (FLY[FN - 1] + FLY[0]) / 2);
    for (let i = 0; i < FN; i++) { const j = (i + 1) % FN; c.quadraticCurveTo(FLX[i], FLY[i], (FLX[i] + FLX[j]) / 2, (FLY[i] + FLY[j]) / 2); }
    c.closePath();
  }
  function paintSpark(c, b, t, fl) {
    const heat = b.fuseMax > 0 && typeof b.fuse === 'number' ? Math.max(0, Math.min(1, 1 - b.fuse / b.fuseMax)) : 0.2;
    const hi = Math.min(5, (heat * 6) | 0), P = HEAT[hi][fl], sp = 8 + heat * 9, big = (S.enr ? 1.22 : 1) * (S.stun ? 0.7 : 1) * (S.dmg ? 0.8 + 0.2 * Math.abs(Math.sin(t * 21)) : 1);
    /* the fuse it rides in on: rope tail, charred where it meets the flame */
    const wv = Math.sin(t * 4.2) * 5;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(-4, 40); c.bezierCurveTo(-28, 58 + wv, -52, 30 - wv, -80, 46 + wv * 0.6); line(c, 9); line(c, 5.6, '#b08a4f'); c.setLineDash([3.4, 5.4]); line(c, 5.6, '#7d5f33'); c.setLineDash([]);
    c.beginPath(); c.moveTo(-4, 40); c.quadraticCurveTo(-11, 46 + wv * 0.2, -17, 49 + wv * 0.4); line(c, 5.8, '#1b1410');
    /* halo */
    const gl = glowFire(), gk = (3.5 + heat * 0.7) * (1 + Math.sin(t * 9.5) * 0.04); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.55 + heat * 0.3; c.drawImage(gl.c, -32 * gk, -32 * gk - 8, 64 * gk, 64 * gk); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    /* hands: two little fireballs */
    for (let sd = -1; sd <= 1; sd += 2) { const hx = sd * 58, hy = 8 + Math.sin(t * 4 + sd) * 4; c.save(); c.translate(hx, hy); c.rotate(sd * 0.5); c.beginPath(); c.moveTo(Math.sin(t * 12 + sd) * 2, -17); c.quadraticCurveTo(13, -4, 9, 5); c.quadraticCurveTo(0, 12, -9, 5); c.quadraticCurveTo(-13, -4, Math.sin(t * 12 + sd) * 2, -17); c.closePath(); c.fillStyle = P.hand; c.fill(); line(c, 2.8, P.rim); dot(c, 0, 2, 4.6, P.inner); c.restore(); }
    /* the flame, four layers hot to hotter */
    flamePath(c, 0, 4, 40, 13 * big, 35 * big, t, 0, sp); c.fillStyle = P.outer; c.fill(); line(c, 3.8, P.rim);
    flamePath(c, 0, 9, 32, 9 * big, 25 * big, t, 1.7, sp * 1.15); c.fillStyle = P.mid; c.fill();
    flamePath(c, 0, 14, 24.5, 6 * big, 16 * big, t, 3.1, sp * 1.3); c.fillStyle = P.inner; c.fill();
    flamePath(c, 0, 19, 15 + heat * 5, 3 * big, 8 * big, t, 4.4, sp * 1.5); c.fillStyle = P.core; c.fill();
    /* face: slanted ember eyes with white-hot pupils, a jagged jack-o'-lantern grin */
    const dark = '#3a1200';
    if (S.stun) { for (let sd = -1; sd <= 1; sd += 2) { c.beginPath(); c.moveTo(sd * 20, -3); c.lineTo(sd * 9, 8); c.moveTo(sd * 9, -3); c.lineTo(sd * 20, 8); line(c, 4, dark); } }
    else for (let sd = -1; sd <= 1; sd += 2) {
      const sq = S.dmg && sd < 0 ? 0.55 : 1;
      c.beginPath(); c.moveTo(sd * 25, -6 * sq); c.quadraticCurveTo(sd * 13, -1 * sq - 4, sd * 5, 4); c.quadraticCurveTo(sd * 14, 12 * sq, sd * 25, -6 * sq); c.closePath(); c.fillStyle = dark; c.fill();
      if (!S.blink) dot(c, sd * 14 + LX * 3, 2.5 + LY * 2, 2.9, '#ffffff');
    }
    if (S.dmg || S.stun) { poly(c, [-17, 22, -11, 18, -5, 23, 1, 18, 7, 23, 13, 18, 18, 22]); line(c, 3.6, dark); }
    else { poly(c, [-20, 14, -13, 20, -7, 15, 0, 22, 7, 15, 13, 20, 20, 14]); c.quadraticCurveTo(0, 37, -20, 14); c.closePath(); c.fillStyle = dark; c.fill(); }
    /* embers lifting off */
    c.globalCompositeOperation = 'lighter'; c.fillStyle = '#ffd27a';
    for (let i = 0; i < 9; i++) { const ph = (t * (0.5 + heat * 0.5) + i * 0.137) % 1, ex = (hash(i, 1, 3) - 0.5) * 120 + Math.sin(t * 2.2 + i) * 7, ey = 34 - ph * 132, sz = 1.4 + 3.4 * (1 - ph); c.globalAlpha = (1 - ph) * 0.9; c.fillRect(ex - sz / 2, ey - sz / 2, sz, sz); }
    if (heat > 0.75) { c.globalAlpha = 0.9; c.beginPath(); for (let i = 0; i < 6; i++) { const a = hash(i, (t * 12) | 0, 7) * TAU, r0 = 52 + hash(i, (t * 12) | 0, 9) * 14; c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 - 6); c.lineTo(Math.cos(a) * (r0 + 11), Math.sin(a) * (r0 + 11) - 6); } line(c, 2.4, '#fff6d0'); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    if (S.dmg) { const pf = puffD(); for (let k = 0; k < 3; k++) { const ph = (t * 0.9 + k / 3) % 1, sz = 12 + ph * 18; c.globalAlpha = (1 - ph) * 0.7; c.drawImage(pf.c, (k - 1) * 20 + Math.sin(t * 2 + k) * 4 - sz / 2, -56 - ph * 42 - sz / 2, sz, sz); } c.globalAlpha = 1; }
  }

  /* =====================================================================================================
     the public draw: shared states around the per-boss paint
     ===================================================================================================== */
  const PAINT = { dreadnought: paintDread, pact: paintPact, emperor: paintEmp, general: paintGen, spark: paintSpark };
  const HEAD = { dreadnought: [16, -70, 26], pact: [0, -90, 28], emperor: [0, -86, 30], general: [0, -84, 30], spark: [0, -92, 28] };   // stun stars: x, y, orbit radius
  const SHIELD = { dreadnought: [88, 72, -12], pact: [68, 74, -18], emperor: [84, 76, -10], general: [74, 80, -22], spark: [72, 78, -16] };   // rx, ry, centre y
  const SEEN = { x0: 0, y0: 0, x1: 0, y1: 0, arms: 0 };
  function setState(b, t) {
    const f = b.maxHp > 0 ? b.hp / b.maxHp : 1;
    S.dmg = f < 0.33; S.low = f < 0.5; S.enr = b.enr > 0; S.stun = b.stun > 0; S.blink = ((t * 0.27 + (b.side ? 0.5 : 0)) % 1) < 0.035;
  }
  const PAIR_A = {}, PAIR_B = {}; let inPair = false;
  function drawPair(c, b, t, g) {   // menu portraits of the Pact: the matched pair, chained together
    inPair = true;
    try {
      const k = 0.78, f = b.face < 0 ? -1 : 1;
      Object.assign(PAIR_A, b); PAIR_A.side = 1; PAIR_A.r = b.r * k; PAIR_A.x = b.x - f * b.r * 0.7; PAIR_A.y = b.y - b.r * 0.16;
      Object.assign(PAIR_B, b); PAIR_B.side = 0; PAIR_B.r = b.r * k; PAIR_B.x = b.x + f * b.r * 0.62; PAIR_B.y = b.y + b.r * 0.24;
      tether(c, PAIR_A, PAIR_B, t, g); draw(c, PAIR_A, t, g); draw(c, PAIR_B, t, g);
    } finally { inPair = false; }
  }
  function draw(c, b, t, g) {
    const paint = PAINT[b.kind]; if (!paint) return;
    if (b.kind === 'pact' && !inPair && g && g.state === 'menu' && !b.solo && !b.mate) { drawPair(c, b, t, g); return; }
    const s = b.r / D, gt = g && typeof g.t === 'number' ? g.t : t, age = typeof b.born === 'number' ? gt - b.born : 9, face = b.face < 0 ? -1 : 1;
    setState(b, t);
    const a0 = typeof b.aimA === 'number' ? b.aimA : (face > 0 ? 0 : PI), a1 = face > 0 ? a0 : PI - a0;
    LA = Math.atan2(Math.sin(a1), Math.cos(a1)); LX = Math.cos(LA); LY = Math.sin(LA); FACE = face;
    if (!g || g.state !== 'menu') { if (b.kind === 'pact') { if (b.side) { SEEN.x1 = b.x; SEEN.y1 = b.y; } else { SEEN.x0 = b.x; SEEN.y0 = b.y; } } else if (b.kind === 'dreadnought') SEEN.arms = b.arms | 0; }
    c.save(); c.translate(b.x, b.y); c.scale(s, s); c.lineJoin = 'round'; c.lineCap = 'round';
    if (S.enr) aura(c, t);
    /* drop-in (first 0.6 s), then gentle breathing */
    let dy = 0, sx = 1, sy = 1;
    if (age >= 0 && age < 0.6) {
      if (b.kind === 'spark') { const f = age / 0.6, k = 1 + 2.2 * Math.pow(f - 1, 3) + 1.2 * Math.pow(f - 1, 2); sx = sy = Math.max(0.05, k); }
      else if (age < 0.32) { const f = age / 0.32; dy = -(1 - f * f) * 210; sx = 0.92; sy = 1.1; }
      else { const f = (age - 0.32) / 0.28, k = Math.exp(-4 * f) * Math.cos(f * 9); sx = 1 + 0.24 * k; sy = 1 - 0.24 * k; }
    } else { const br = Math.sin(t * 2.6 + (b.side ? 1.6 : 0)) * 0.022; sx = 1 - br; sy = 1 + br; }
    c.save(); c.translate(0, GROUND + dy); c.scale(sx * face, sy); c.translate(0, -GROUND);
    paint(c, b, t, b.flash > 0 ? 1 : 0);
    c.restore();
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    const hd = HEAD[b.kind];
    if (S.enr) steam(c, t, hd[0] * face, hd[1] + 22, face);
    if (S.stun) stars(c, t, hd[0] * face, hd[1], hd[2]);
    if (b.shield) { const sh = SHIELD[b.kind]; shield(c, t, sh[0], sh[1], sh[2]); }
    c.restore();
  }

  /* =====================================================================================================
     defeat: 1.1 s — shake and split with light, then burst into pieces, coins, stars and a flying hat
     ===================================================================================================== */
  const CB = { boss: true, kind: '', x: 0, y: 0, r: D, face: 1, flash: 0, hp: 0, maxHp: 1, shield: false, stun: 1, enr: 0, st: '', dx: 1, dy: 0, side: 0, raging: false, vac: 0, arms: 0, fuse: 2, fuseMax: 80, aimA: 0, born: -99, t: 0 };
  const SIDES = typeof WeakMap === 'function' ? new WeakMap() : null;
  const CRACKS = [[0, -6, -14, -24, -6, -40, -20, -56], [2, 0, 18, -10, 14, -26, 30, -36], [0, 4, -20, 10, -16, 26, -32, 34], [4, 6, 20, 14, 18, 30, 34, 36], [-2, 0, -26, -6, -36, 4, -50, -4], [2, 2, 28, 0, 38, 10, 52, 4]];
  const KEYCOL = { M: CM, A: CA, I: CI, N: CN, S: CS };
  function trophy(c, kind, side) {
    if (kind === 'pact') put(c, pactHat(side, 0));
    else if (kind === 'emperor') put(c, empCrown(0));
    else if (kind === 'general') { c.translate(0, 50); put(c, genHat(0)); }
    else if (kind === 'dreadnought') { c.beginPath(); c.moveTo(-7, 14); c.lineTo(7, 14); c.lineTo(5, -14); c.lineTo(-9, -14); c.closePath(); c.fillStyle = '#3a444c'; c.fill(); line(c, 2.8); c.fillStyle = CM; c.fillRect(-8.4, -6, 14.6, 5); rr(c, -11, -18, 18, 5.5, 2.4); c.fillStyle = '#1d242a'; c.fill(); line(c, 2.4); }
    else { const pf = puffD(); c.drawImage(pf.c, -22, -22, 44, 44); }
  }
  function corpse(c, d, t, g) {
    if (!PAINT[d.kind]) return;
    const kind = d.kind, life = d.life || 1.1, a = Math.max(0, Math.min(1, d.t / life)), s = (d.r || D) / D, col = KEYCOL[d.key] || CN, seed = (d.x * 0.013 + d.y * 0.007) % 1 + (d.seed || 0);
    let side = 0;
    if (kind === 'pact') { side = SIDES && SIDES.get(d); if (side === undefined) { side = Math.hypot(d.x - SEEN.x1, d.y - SEEN.y1) < Math.hypot(d.x - SEEN.x0, d.y - SEEN.y0) ? 1 : 0; if (SIDES) SIDES.set(d, side); } }
    const POP = 0.5;
    c.save(); c.translate(d.x, d.y); c.scale(s, s); c.lineJoin = 'round'; c.lineCap = 'round';
    if (a < POP) {
      const f = a / POP;
      /* light bursting out from behind */
      c.globalCompositeOperation = 'lighter'; c.fillStyle = '#fff1c2';
      const n = 5 + ((f * 8) | 0);
      for (let i = 0; i < n; i++) { const an = i * TAU / 13 * 2.3 + seed * 6 + d.t * 0.8, len = (58 + 96 * f) * (0.6 + 0.4 * hash(i, 2, seed)), wd = 0.06 + 0.05 * f; c.globalAlpha = 0.5 + 0.4 * f; c.beginPath(); c.moveTo(0, -4); c.lineTo(Math.cos(an - wd) * len, Math.sin(an - wd) * len - 4); c.lineTo(Math.cos(an + wd) * len, Math.sin(an + wd) * len - 4); c.closePath(); c.fill(); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      /* the boss itself: dizzy, shaking harder and harder, flashing */
      const j = 1.5 + 6 * f, k = f < 0.84 ? 1 + 0.14 * f * f : 1.1 - (f - 0.84) / 0.16 * 0.3;
      c.save(); c.translate(Math.sin(d.t * 73) * j, Math.cos(d.t * 57) * j * 0.6);
      CB.kind = kind; CB.side = side; CB.arms = SEEN.arms; CB.face = d.face < 0 ? -1 : 1; CB.t = d.t;
      S.dmg = true; S.low = true; S.enr = false; S.stun = true; S.blink = false; LA = 0; LX = 1; LY = 0; FACE = CB.face;
      c.translate(0, GROUND); c.scale(k * CB.face, k); c.translate(0, -GROUND);
      PAINT[kind](c, CB, t, (Math.sin(d.t * 44) > 0.2 || f > 0.82) ? 1 : 0);
      c.restore();
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      /* cracks of light across the body */
      const nc = Math.min(CRACKS.length, 1 + ((f * CRACKS.length) | 0));
      c.globalCompositeOperation = 'lighter';
      for (let pass = 0; pass < 2; pass++) { c.beginPath(); for (let i = 0; i < nc; i++) { const p = CRACKS[i]; c.moveTo(p[0], p[1] - 4); for (let q = 2; q < p.length; q += 2) c.lineTo(p[q], p[q + 1] - 4); } if (pass) line(c, 2.6, '#ffffff'); else { c.globalAlpha = 0.5; line(c, 8, '#ffd27a'); c.globalAlpha = 1; } }
      c.globalCompositeOperation = 'source-over';
    } else {
      const f = (a - POP) / (1 - POP), tau = (a - POP) * life;
      /* the pop: a starburst, then a ring */
      if (f < 0.3) { const q = f / 0.3; c.globalAlpha = (1 - q) * 0.9; dot(c, 0, -4, 46 + 44 * q, '#ffffff'); c.globalAlpha = 1; }
      if (f < 0.5) {
        const q = f / 0.5, R1 = 52 + 84 * Math.sqrt(q); c.globalAlpha = 1 - q * q;
        for (let pass = 0; pass < 2; pass++) { const R = pass ? R1 * 0.6 : R1; c.beginPath(); for (let i = 0; i < 28; i++) { const an = i * TAU / 28 + seed + pass * 0.11, r = i % 2 ? R * 0.56 : R; c.lineTo(Math.cos(an) * r, Math.sin(an) * r - 4); } c.closePath(); c.fillStyle = pass ? '#ffffff' : col; c.fill(); }
        c.globalAlpha = 1;
      }
      c.globalAlpha = Math.max(0, 1 - f * 1.15); c.beginPath(); c.arc(0, -4, 44 + 120 * Math.sqrt(f), 0, TAU); line(c, 9 * (1 - f) + 1.5, '#ffffff'); c.beginPath(); c.arc(0, -4, 34 + 104 * Math.sqrt(f), 0, TAU); line(c, 5 * (1 - f) + 1, col);
      /* pieces on little arcs */
      const fade = f > 0.7 ? 1 - (f - 0.7) / 0.3 : 1;
      for (let i = 0; i < 22; i++) {
        const an = i * TAU / 22 + (hash(i, 3, seed) - 0.5) * 0.5, v = 120 + 150 * hash(i, 4, seed), px = Math.cos(an) * v * tau, py = Math.sin(an) * v * tau * 0.8 - 70 * tau + 250 * tau * tau - 4, type = i % 4, spin = (hash(i, 5, seed) - 0.5) * 16 * tau, sz = 5.5 + 5 * hash(i, 6, seed);
        c.globalAlpha = fade; c.save(); c.translate(px, py); c.rotate(spin);
        if (type === 1) { c.scale(Math.abs(Math.cos(tau * 13 + i)) * 0.85 + 0.15, 1); odot(c, 0, 0, 5.4, BRASS, 2); dot(c, -1.4, -1.6, 1.5, '#fff3c4'); }
        else if (type === 2) { const r1 = sz * (1 + 0.3 * Math.sin(tau * 20 + i)); c.beginPath(); for (let q = 0; q < 8; q++) { const aa = q * PI / 4, r = q % 2 ? r1 * 0.32 : r1; c.lineTo(Math.cos(aa) * r, Math.sin(aa) * r); } c.closePath(); c.fillStyle = '#fff6c9'; c.fill(); line(c, 1.6); }
        else if (kind === 'spark') { c.beginPath(); c.moveTo(0, -sz * 1.5); c.quadraticCurveTo(sz, -sz * 0.2, sz * 0.6, sz * 0.5); c.quadraticCurveTo(0, sz, -sz * 0.6, sz * 0.5); c.quadraticCurveTo(-sz, -sz * 0.2, 0, -sz * 1.5); c.closePath(); c.fillStyle = type ? '#ffd84a' : CS; c.fill(); line(c, 1.8, '#7a2a00'); }
        else { c.beginPath(); c.moveTo(-sz, -sz * 0.5); c.lineTo(sz * 0.2, -sz); c.lineTo(sz, sz * 0.1); c.lineTo(sz * 0.1, sz); c.lineTo(-sz * 0.9, sz * 0.6); c.closePath(); c.fillStyle = type ? '#ffffff' : col; if (type === 3) c.fillStyle = kind === 'dreadnought' ? '#8894a0' : kind === 'emperor' ? BRASS : kind === 'general' ? '#fff3d6' : '#18222e'; c.fill(); line(c, 2.2); }
        c.restore();
      }
      /* its hat / crown / funnel tumbles away last */
      c.globalAlpha = fade; c.save(); c.translate((hash(1, 8, seed) - 0.5) * 30 * tau, -52 - 190 * tau + 300 * tau * tau); c.rotate(tau * 7 * (hash(2, 8, seed) > 0.5 ? 1 : -1)); trophy(c, kind, side); c.restore();
      c.globalAlpha = 1;
    }
    c.restore();
  }

  /* build the cached sprites during idle time (they are also built lazily on first use) */
  const JOBS = [puffW, puffD, glowRed, glowFire, starSpr, bubbleSpr, badgeSpr, ghostQSpr];
  for (let f = 0; f < 2; f++) JOBS.push(() => dreadHull(f), () => dreadSup(f), () => pactHat(0, f), () => pactHat(1, f), () => empCrown(f), () => genHat(f), () => genMedals(f));
  function preload(deadline) {
    try {
      while (JOBS.length) { JOBS.shift()(); if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 3) break; }
    } catch (e) { JOBS.length = 0; }
    if (JOBS.length) schedule();
  }
  function schedule() { if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(preload, { timeout: 3000 }); else setTimeout(preload, 120); }
  setTimeout(schedule, 700);

  ART.boss = { draw, corpse, tether, preload };
})();
