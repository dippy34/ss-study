/* game-render.js — all canvas drawing for the action game. Internal: window.PK.R */
(function () {
  'use strict';
  const PK = (window.PK = window.PK || {});
  const COL = PK.COL, TAU = Math.PI * 2, OUT = '#0a1118';
  const R = (PK.R = {});
  let cv, ctx;

  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(h, a) { const c = hexRgb(h), f = a < 0 ? 0 : 255, t = Math.abs(a); return 'rgb(' + Math.round(c[0] + (f - c[0]) * t) + ',' + Math.round(c[1] + (f - c[1]) * t) + ',' + Math.round(c[2] + (f - c[2]) * t) + ')'; }
  function rgba(h, a) { const c = hexRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  PK.shade = shade; PK.rgba = rgba;

  function dot(c, x, y, r, col) { c.beginPath(); c.arc(x, y, r, 0, TAU); if (col) c.fillStyle = col; c.fill(); }
  function rr(c, x, y, w, h, rad) { c.beginPath(); c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad); c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath(); }
  function blob(c, r, col) {
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = shade(col, -0.3); c.fill();
    c.save(); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.clip();
    dot(c, -r * 0.12, -r * 0.18, r * 0.95, col);
    c.beginPath(); c.ellipse(-r * 0.35, -r * 0.48, r * 0.3, r * 0.16, -0.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,.3)'; c.fill();
    c.restore();
    c.lineWidth = Math.max(1.6, r * 0.14); c.strokeStyle = OUT; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
  }
  function eyes(c, r, mood, dy) {
    const ex = r * 0.36, ey = (dy || 0) - r * 0.06, er = Math.max(2, r * 0.25);
    dot(c, -ex, ey, er, '#fff'); dot(c, ex, ey, er, '#fff');
    dot(c, -ex + er * 0.25, ey + er * 0.15, er * 0.55, OUT); dot(c, ex + er * 0.25, ey + er * 0.15, er * 0.55, OUT);
    if (mood === 'angry') {
      c.strokeStyle = OUT; c.lineWidth = Math.max(1.5, r * 0.15); c.lineCap = 'round'; c.beginPath();
      c.moveTo(-ex - er, ey - er * 1.3); c.lineTo(-ex + er * 0.9, ey - er * 0.55);
      c.moveTo(ex + er, ey - er * 1.3); c.lineTo(ex - er * 0.9, ey - er * 0.55); c.stroke();
    }
  }
  function mouth(c, r, kind) {
    c.strokeStyle = OUT; c.lineWidth = Math.max(1.2, r * 0.1); c.lineCap = 'round'; c.beginPath();
    if (kind === 'frown') c.arc(0, r * 0.72, r * 0.3, Math.PI * 1.15, Math.PI * 1.85);
    else if (kind === 'grin') c.arc(0, r * 0.25, r * 0.36, Math.PI * 0.15, Math.PI * 0.85);
    else { c.moveTo(-r * 0.2, r * 0.48); c.lineTo(r * 0.2, r * 0.48); }
    c.stroke();
  }
  function helmet(c, r, col) {
    c.beginPath(); c.arc(0, -r * 0.28, r * 0.92, Math.PI * 1.02, Math.PI * 1.98); c.closePath();
    c.fillStyle = col; c.fill(); c.lineWidth = Math.max(1.5, r * 0.12); c.strokeStyle = OUT; c.stroke();
    c.beginPath(); c.moveTo(-r * 0.14, -r * 1.15); c.lineTo(0, -r * 1.62); c.lineTo(r * 0.14, -r * 1.15); c.closePath();
    c.fillStyle = COL.brass; c.fill(); c.stroke();
  }
  function crown(c, x, y, w) {
    const h = w * 0.7; c.beginPath(); c.moveTo(x - w, y + h * 0.45); c.lineTo(x - w, y - h * 0.5); c.lineTo(x - w * 0.5, y); c.lineTo(x, y - h * 0.8);
    c.lineTo(x + w * 0.5, y); c.lineTo(x + w, y - h * 0.5); c.lineTo(x + w, y + h * 0.45); c.closePath();
    c.fillStyle = COL.brass; c.fill(); c.lineWidth = Math.max(1.2, w * 0.14); c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke();
  }
  function flag(c, r, col) {
    c.strokeStyle = OUT; c.lineWidth = Math.max(1.5, r * 0.16); c.lineCap = 'round'; c.beginPath(); c.moveTo(r * 0.75, r * 0.6); c.lineTo(r * 0.95, -r * 1.7); c.stroke();
    c.beginPath(); c.moveTo(r * 0.95, -r * 1.7); c.quadraticCurveTo(r * 1.6, -r * 1.95, r * 2.0, -r * 1.45); c.quadraticCurveTo(r * 1.5, -r * 1.3, r * 0.9, -r * 0.95); c.closePath();
    c.fillStyle = '#fff3d6'; c.fill(); c.lineWidth = Math.max(1.2, r * 0.1); c.stroke();
    dot(c, r * 1.4, -r * 1.42, r * 0.2, col);
  }

  /* ---------- pre-rendered enemy sprites ---------- */
  const DRAW = {
    recruit(c, r) { blob(c, r, COL.M); eyes(c, r, 'angry', r * 0.16); helmet(c, r, '#5d6e2c'); },
    brute(c, r) {
      rr(c, -r, -r * 0.9, 2 * r, 1.9 * r, r * 0.4); c.fillStyle = shade(COL.M, -0.36); c.fill();
      c.save(); c.clip(); rr(c, -r * 1.06, -r * 1.02, 2 * r, 1.8 * r, r * 0.4); c.fillStyle = shade(COL.M, -0.1); c.fill(); c.restore();
      c.lineWidth = r * 0.13; c.strokeStyle = OUT; rr(c, -r, -r * 0.9, 2 * r, 1.9 * r, r * 0.4); c.stroke();
      eyes(c, r, 'angry', r * 0.12);
      c.fillStyle = '#fff'; rr(c, -r * 0.42, r * 0.44, r * 0.84, r * 0.24, 2); c.fill(); c.lineWidth = 1.2; c.strokeStyle = OUT; c.stroke();
      c.beginPath(); c.moveTo(-r * 0.14, r * 0.44); c.lineTo(-r * 0.14, r * 0.68); c.moveTo(r * 0.14, r * 0.44); c.lineTo(r * 0.14, r * 0.68); c.stroke();
      helmet(c, r * 1.05, '#4c5a22');
    },
    gunboat(c, r) {
      c.lineWidth = r * 0.12; c.strokeStyle = OUT; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-r * 1.2, -r * 0.05); c.lineTo(r * 1.3, -r * 0.05); c.lineTo(r * 0.85, r * 0.62); c.lineTo(-r * 0.95, r * 0.62); c.closePath();
      c.fillStyle = shade(COL.M, -0.38); c.fill(); c.stroke();
      rr(c, -r * 0.6, -r * 0.52, r * 0.95, r * 0.5, 2); c.fillStyle = shade(COL.M, -0.05); c.fill(); c.stroke();
      rr(c, -r * 0.32, -r * 1.05, r * 0.34, r * 0.58, 2); c.fillStyle = '#39434a'; c.fill(); c.stroke();
      c.lineWidth = r * 0.22; c.lineCap = 'round'; c.beginPath(); c.moveTo(r * 0.4, -r * 0.28); c.lineTo(r * 1.2, -r * 0.6); c.stroke();
      c.lineWidth = r * 0.1; dot(c, r * 0.4, -r * 0.25, r * 0.26, '#6b777d'); c.stroke();
      dot(c, r * 0.5, r * 0.24, r * 0.18, '#fff'); dot(c, r * 0.55, r * 0.26, r * 0.1, OUT);
      dot(c, r * 0.02, r * 0.24, r * 0.18, '#fff'); dot(c, r * 0.07, r * 0.26, r * 0.1, OUT);
    },
    link(c, r) {
      c.lineWidth = r * 0.22; c.strokeStyle = '#d7ecff'; c.beginPath(); c.ellipse(0, r * 0.15, r * 1.3, r * 0.45, -0.25, Math.PI, TAU); c.stroke();
      blob(c, r, COL.A); eyes(c, r, 'angry'); mouth(c, r, 'flat');
      c.lineWidth = r * 0.22; c.strokeStyle = '#d7ecff'; c.beginPath(); c.ellipse(0, r * 0.15, r * 1.3, r * 0.45, -0.25, 0, Math.PI); c.stroke();
    },
    envoy(c, r) {
      blob(c, r, shade(COL.A, 0.14)); eyes(c, r, 'dot', r * 0.2);
      c.fillStyle = '#16202b'; c.strokeStyle = OUT; c.lineWidth = 1.4;
      rr(c, -r * 0.5, -r * 1.75, r, r * 0.95, 1.5); c.fill(); c.stroke();
      rr(c, -r * 0.85, -r * 0.92, r * 1.7, r * 0.22, 2); c.fill(); c.stroke();
      c.fillStyle = COL.A; c.fillRect(-r * 0.5, -r * 1.12, r, r * 0.18);
    },
    grabber(c, r) {
      c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = r * 0.36; c.beginPath();
      c.moveTo(-r * 0.7, r * 0.1); c.lineTo(-r * 1.45, -r * 0.35); c.moveTo(r * 0.7, r * 0.1); c.lineTo(r * 1.45, -r * 0.35); c.stroke();
      c.strokeStyle = shade(COL.I, -0.1); c.lineWidth = r * 0.2; c.beginPath();
      c.moveTo(-r * 0.7, r * 0.1); c.lineTo(-r * 1.45, -r * 0.35); c.moveTo(r * 0.7, r * 0.1); c.lineTo(r * 1.45, -r * 0.35); c.stroke();
      c.strokeStyle = OUT; c.lineWidth = 1.4;
      dot(c, -r * 1.5, -r * 0.4, r * 0.27, shade(COL.I, 0.3)); c.stroke(); dot(c, r * 1.5, -r * 0.4, r * 0.27, shade(COL.I, 0.3)); c.stroke();
      blob(c, r, COL.I); eyes(c, r, 'wide', r * 0.08); mouth(c, r, 'grin'); crown(c, 0, -r * 0.84, r * 0.6);
    },
    scout(c, r) {
      blob(c, r, shade(COL.I, 0.12)); eyes(c, r, 'dot', r * 0.22);
      c.fillStyle = '#d9c08a'; c.strokeStyle = OUT; c.lineWidth = 1.4;
      c.beginPath(); c.arc(0, -r * 0.5, r * 0.78, Math.PI, TAU); c.closePath(); c.fill(); c.stroke();
      rr(c, -r * 1.05, -r * 0.6, r * 2.1, r * 0.24, 2); c.fill(); c.stroke();
    },
    zealot(c, r) { flag(c, r, COL.N); blob(c, r, COL.N); eyes(c, r, 'angry', r * 0.05); mouth(c, r, 'frown'); },
    patriot(c, r) {
      blob(c, r, shade(COL.N, 0.1));
      c.save(); c.beginPath(); c.arc(0, 0, r - 1, 0, TAU); c.clip(); c.fillStyle = '#fff3d6'; c.fillRect(-r, -r * 0.78, 2 * r, r * 0.32); c.restore();
      eyes(c, r, 'angry', r * 0.22);
    },
    spark(c, r) {
      const gr = c.createRadialGradient(0, r * 0.2, 1, 0, 0, r * 1.3); gr.addColorStop(0, '#fff6c2'); gr.addColorStop(0.45, '#ffc533'); gr.addColorStop(1, '#ff6a1a');
      c.beginPath(); c.moveTo(0, -r * 1.7); c.bezierCurveTo(r * 0.9, -r * 0.8, r * 1.15, -r * 0.1, r * 1.0, r * 0.35);
      c.bezierCurveTo(r * 0.8, r * 1.15, -r * 0.8, r * 1.15, -r * 1.0, r * 0.35); c.bezierCurveTo(-r * 1.15, -r * 0.1, -r * 0.5, -r * 0.5, 0, -r * 1.7); c.closePath();
      c.fillStyle = gr; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#7a2a00'; c.stroke();
      dot(c, -r * 0.33, r * 0.15, r * 0.18, OUT); dot(c, r * 0.33, r * 0.15, r * 0.18, OUT);
    },
  };
  const SPR = {};
  function sprite(type) {
    let s = SPR[type]; if (s) return s;
    const r = PK.ENEMIES[type].r, S = 2, half = r * 2.3 + 4;
    const c = document.createElement('canvas'); c.width = c.height = Math.ceil(half * 2 * S);
    const x = c.getContext('2d'); x.scale(S, S); x.translate(half, half); x.lineJoin = 'round'; DRAW[type](x, r);
    const w = document.createElement('canvas'); w.width = c.width; w.height = c.height;
    const wx = w.getContext('2d'); wx.drawImage(c, 0, 0); wx.globalCompositeOperation = 'source-in'; wx.fillStyle = '#fff'; wx.fillRect(0, 0, w.width, w.height);
    return (SPR[type] = { c, w, half, r });
  }
  let fireSpr = null;
  function fire() {
    if (fireSpr) return fireSpr;
    const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
    const gr = x.createRadialGradient(48, 48, 2, 48, 48, 48); gr.addColorStop(0, 'rgba(255,240,170,.95)'); gr.addColorStop(0.35, 'rgba(255,170,40,.75)'); gr.addColorStop(0.75, 'rgba(255,80,20,.3)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 96, 96); return (fireSpr = c);
  }

  /* ---------- atlas background tile, tinted per act ---------- */
  const TILES = {};
  function tile(col) {
    if (TILES[col]) return TILES[col];
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    x.fillStyle = COL.ink; x.fillRect(0, 0, S, S);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 14; i++) { x.fillStyle = rgba(col, 0.01 + rnd() * 0.014); const bx = rnd() * S, by = rnd() * S, br = 30 + rnd() * 90; for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { x.beginPath(); x.arc(bx + ox, by + oy, br, 0, TAU); x.fill(); } }
    x.strokeStyle = rgba(col, 0.08); x.lineWidth = 1; x.beginPath();
    for (let i = 0; i <= S; i += 128) { x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, S); x.moveTo(0, i + 0.5); x.lineTo(S, i + 0.5); } x.stroke();
    x.strokeStyle = rgba(col, 0.06); x.setLineDash([3, 7]); x.beginPath();
    for (let i = 64; i <= S; i += 128) { x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, S); x.moveTo(0, i + 0.5); x.lineTo(S, i + 0.5); } x.stroke(); x.setLineDash([]);
    x.strokeStyle = rgba(col, 0.09); x.lineWidth = 1.6; x.lineCap = 'round'; x.lineJoin = 'round';
    for (let i = 0; i < 9; i++) { const mx = 40 + rnd() * (S - 80), my = 40 + rnd() * (S - 80); x.beginPath(); x.moveTo(mx - 14, my + 8); x.lineTo(mx - 5, my - 7); x.lineTo(mx + 2, my + 3); x.lineTo(mx + 9, my - 10); x.lineTo(mx + 19, my + 8); x.stroke(); }
    for (let i = 0; i < 10; i++) { const mx = 30 + rnd() * (S - 60), my = 30 + rnd() * (S - 60); x.beginPath(); x.moveTo(mx - 10, my); x.quadraticCurveTo(mx - 5, my - 6, mx, my); x.quadraticCurveTo(mx + 5, my + 6, mx + 10, my); x.stroke(); }
    x.strokeStyle = rgba(col, 0.1); x.setLineDash([2, 6]); x.beginPath(); x.moveTo(0, 150); x.bezierCurveTo(140, 90, 250, 260, 512, 150); x.stroke(); x.setLineDash([]);
    const cx = 392, cy = 384; x.strokeStyle = rgba(col, 0.12); x.lineWidth = 1.2; x.beginPath(); x.arc(cx, cy, 26, 0, TAU); x.stroke();
    x.fillStyle = rgba(col, 0.12); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * 36, cy + Math.sin(a) * 36); x.lineTo(cx + Math.cos(a + 1.35) * 7, cy + Math.sin(a + 1.35) * 7); x.lineTo(cx + Math.cos(a - 1.35) * 7, cy + Math.sin(a - 1.35) * 7); x.closePath(); x.fill(); }
    for (let i = 0; i < 7; i++) dot(x, 20 + rnd() * (S - 40), 20 + rnd() * (S - 40), 2.2, rgba(col, 0.14));
    return (TILES[col] = ctx.createPattern(c, 'repeat'));
  }

  /* ---------- player ---------- */
  function hat(c, kind, hr, col) {
    c.strokeStyle = OUT; c.lineWidth = 1.5; c.lineJoin = 'round';
    switch (kind) {
      case 'helmet': helmet(c, hr * 1.15, shade(col, -0.25)); break;
      case 'tophat': c.fillStyle = '#141c26'; rr(c, -hr * 0.62, -hr * 2.0, hr * 1.24, hr * 1.3, 2); c.fill(); c.stroke(); rr(c, -hr * 1.05, -hr * 0.85, hr * 2.1, hr * 0.26, 2); c.fill(); c.stroke(); c.fillStyle = col; c.fillRect(-hr * 0.62, -hr * 1.15, hr * 1.24, hr * 0.24); break;
      case 'pith': c.fillStyle = '#e0c891'; c.beginPath(); c.arc(0, -hr * 0.45, hr * 0.95, Math.PI, TAU); c.closePath(); c.fill(); c.stroke(); rr(c, -hr * 1.3, -hr * 0.58, hr * 2.6, hr * 0.28, 2); c.fill(); c.stroke(); dot(c, 0, -hr * 1.4, hr * 0.14, col); break;
      case 'beret': c.fillStyle = col; c.beginPath(); c.ellipse(hr * 0.12, -hr * 0.82, hr * 1.12, hr * 0.5, -0.18, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.moveTo(hr * 0.1, -hr * 1.3); c.lineTo(hr * 0.2, -hr * 1.55); c.stroke(); break;
      case 'goggles': c.fillStyle = '#6b4a2b'; c.beginPath(); c.arc(0, -hr * 0.2, hr * 1.04, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); c.fill(); c.stroke(); dot(c, -hr * 0.42, -hr * 0.62, hr * 0.3, '#bfe9ff'); c.stroke(); dot(c, hr * 0.42, -hr * 0.62, hr * 0.3, '#bfe9ff'); c.stroke(); break;
      case 'bowler': c.fillStyle = '#1b232c'; c.beginPath(); c.arc(0, -hr * 0.6, hr * 0.85, Math.PI, TAU); c.closePath(); c.fill(); c.stroke(); rr(c, -hr * 1.2, -hr * 0.7, hr * 2.4, hr * 0.26, 3); c.fill(); c.stroke(); c.fillStyle = col; c.fillRect(-hr * 0.82, -hr * 0.86, hr * 1.64, hr * 0.16); break;
      case 'visor': c.fillStyle = 'rgba(70,200,120,.85)'; c.beginPath(); c.ellipse(hr * 0.25, -hr * 0.42, hr * 1.25, hr * 0.42, 0, Math.PI, TAU); c.closePath(); c.fill(); c.stroke(); c.strokeStyle = col; c.lineWidth = 2.4; c.beginPath(); c.arc(0, -hr * 0.1, hr * 1.02, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); break;
      default: c.fillStyle = shade(col, -0.2); rr(c, -hr * 0.82, -hr * 1.42, hr * 1.64, hr * 0.78, 2.5); c.fill(); c.stroke(); c.fillStyle = '#10161d'; rr(c, -hr * 0.2, -hr * 0.74, hr * 1.25, hr * 0.2, 2); c.fill(); c.stroke(); dot(c, 0, -hr * 1.02, hr * 0.15, COL.brass);
    }
  }
  function drawHero(c, x, y, r, ch, t, moving, face, alpha) {
    const col = (ch && ch.color) || '#e9b949', bob = moving ? Math.sin(t * 15) * 1.6 : Math.sin(t * 3) * 0.6;
    c.save(); c.translate(x, y); c.globalAlpha = alpha;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, r * 1.02, r * 0.95, r * 0.32, 0, 0, TAU); c.fill();
    const sw = moving ? Math.sin(t * 15) * r * 0.22 : 0;
    c.fillStyle = '#1a2430'; rr(c, -r * 0.5 + sw, r * 0.55, r * 0.4, r * 0.5, 2); c.fill(); rr(c, r * 0.1 - sw, r * 0.55, r * 0.4, r * 0.5, 2); c.fill();
    rr(c, -r * 0.78, -r * 0.2 + bob * 0.4, r * 1.56, r * 1.05, r * 0.36); c.fillStyle = shade(col, -0.18); c.fill();
    c.lineWidth = 1.8; c.strokeStyle = OUT; c.stroke();
    c.fillStyle = col; rr(c, -r * 0.78, -r * 0.2 + bob * 0.4, r * 1.56, r * 0.5, r * 0.3); c.fill();
    c.fillStyle = '#231a10'; c.fillRect(-r * 0.76, r * 0.38 + bob * 0.4, r * 1.52, r * 0.15);
    dot(c, 0, r * 0.455 + bob * 0.4, r * 0.13, COL.brass);
    const hy = -r * 0.72 + bob, hr = r * 0.66;
    dot(c, 0, hy, hr, '#f1c9a2'); c.lineWidth = 1.8; c.strokeStyle = OUT; c.stroke();
    const lx = Math.cos(face) * hr * 0.22, ly = Math.sin(face) * hr * 0.16;
    const blink = (t % 3.4) < 0.12;
    c.fillStyle = OUT;
    if (blink) { c.fillRect(-hr * 0.5 + lx, hy + ly, hr * 0.3, 1.5); c.fillRect(hr * 0.2 + lx, hy + ly, hr * 0.3, 1.5); }
    else { dot(c, -hr * 0.34 + lx, hy + hr * 0.05 + ly, hr * 0.15); dot(c, hr * 0.34 + lx, hy + hr * 0.05 + ly, hr * 0.15); }
    c.translate(0, hy); hat(c, ch && ch.hat, hr, col);
    c.restore();
  }
  PK.drawHero = drawHero;

  /* ---------- bosses (drawn live) ---------- */
  function drawBoss(c, b, g) {
    const t = g.t, r = b.r, key = b.def.key, col = COL[key];
    c.save(); c.translate(b.x, b.y);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, r * 0.95, r * 1.1, r * 0.3, 0, 0, TAU); c.fill();
    const fl = b.flash > 0;
    if (b.kind === 'dreadnought') {
      const bobb = Math.sin(t * 2) * 2; c.translate(0, bobb); c.lineWidth = 3; c.strokeStyle = OUT; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-r * 1.5, -r * 0.1); c.lineTo(r * 1.6, -r * 0.1); c.lineTo(r * 1.1, r * 0.7); c.lineTo(-r * 1.2, r * 0.7); c.closePath(); c.fillStyle = fl ? '#fff' : shade(col, -0.42); c.fill(); c.stroke();
      c.fillStyle = fl ? '#fff' : '#b23a2a'; c.fillRect(-r * 1.15, r * 0.45, r * 2.2, r * 0.14);
      rr(c, -r * 0.8, -r * 0.62, r * 1.3, r * 0.54, 4); c.fillStyle = fl ? '#fff' : shade(col, -0.12); c.fill(); c.stroke();
      rr(c, -r * 0.55, -r * 1.25, r * 0.3, r * 0.66, 3); c.fillStyle = '#39434a'; c.fill(); c.stroke();
      rr(c, -r * 0.1, -r * 1.12, r * 0.3, r * 0.54, 3); c.fill(); c.stroke();
      const p = g.player, a = Math.atan2(p.y - b.y, p.x - b.x);
      for (const tx of [-r * 1.0, r * 0.75, r * 1.2]) { c.save(); c.translate(tx, -r * 0.2); c.rotate(a); c.lineWidth = 7; c.lineCap = 'round'; c.strokeStyle = OUT; c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 0.5, 0); c.stroke(); c.lineWidth = 3.5; c.strokeStyle = '#8a969c'; c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 0.5, 0); c.stroke(); c.restore(); dot(c, tx, -r * 0.2, r * 0.17, '#6b777d'); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke(); }
      dot(c, r * 0.6, r * 0.2, r * 0.17, '#fff'); dot(c, r * 0.65, r * 0.22, r * 0.09, OUT); dot(c, r * 0.1, r * 0.2, r * 0.17, '#fff'); dot(c, r * 0.15, r * 0.22, r * 0.09, OUT);
      c.strokeStyle = OUT; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-r * 0.1, -0.02 * r); c.lineTo(r * 0.3, r * 0.08); c.moveTo(r * 0.85, -0.02 * r); c.lineTo(r * 0.5, r * 0.08); c.stroke();
    } else if (b.kind === 'pact') {
      const cc = b.side ? shade(col, -0.25) : shade(col, 0.1);
      c.lineWidth = r * 0.2; c.strokeStyle = '#d7ecff'; c.beginPath(); c.ellipse(0, r * 0.15, r * 1.3, r * 0.45, -0.25, Math.PI, TAU); c.stroke();
      blob(c, r, fl ? '#ffffff' : cc); eyes(c, r, 'angry'); mouth(c, r, b.rage > g.t || b.enr > 0 ? 'frown' : 'flat');
      c.lineWidth = r * 0.2; c.strokeStyle = '#d7ecff'; c.beginPath(); c.ellipse(0, r * 0.15, r * 1.3, r * 0.45, -0.25, 0, Math.PI); c.stroke();
      c.fillStyle = '#141c26'; c.strokeStyle = OUT; c.lineWidth = 2.5; rr(c, -r * 0.5, -r * 1.75, r, r * 0.9, 3); c.fill(); c.stroke(); rr(c, -r * 0.85, -r * 0.95, r * 1.7, r * 0.2, 3); c.fill(); c.stroke(); c.fillStyle = cc; c.fillRect(-r * 0.5, -r * 1.15, r, r * 0.16);
    } else if (b.kind === 'emperor') {
      const p = g.player, a = Math.atan2(p.y - b.y, p.x - b.x), reach = r * (1.5 + Math.sin(t * 3) * 0.12);
      for (const s of [-1, 1]) { const ax = Math.cos(a + s * 0.75) * reach, ay = Math.sin(a + s * 0.75) * reach; c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = r * 0.34; c.beginPath(); c.moveTo(0, 0); c.lineTo(ax, ay); c.stroke(); c.strokeStyle = shade(col, -0.1); c.lineWidth = r * 0.22; c.beginPath(); c.moveTo(0, 0); c.lineTo(ax, ay); c.stroke(); dot(c, ax, ay, r * 0.24, shade(col, 0.3)); c.lineWidth = 2.5; c.strokeStyle = OUT; c.stroke(); }
      blob(c, r, fl ? '#ffffff' : col); eyes(c, r, 'wide', r * 0.05); mouth(c, r, 'grin'); crown(c, 0, -r * 0.86, r * 0.62);
      dot(c, 0, -r * 0.98, r * 0.1, '#ff5e7a');
      if (b.vac > 0) { c.strokeStyle = rgba(col, 0.5); c.lineWidth = 2; for (let i = 0; i < 3; i++) { const rad = r * 1.4 + ((t * 120 + i * 60) % 180); c.globalAlpha = 1 - (rad - r * 1.4) / 180; c.beginPath(); c.arc(0, 0, r * 1.4 + 180 - (rad - r * 1.4), 0, TAU); c.stroke(); } c.globalAlpha = 1; }
    } else if (b.kind === 'general') {
      flag(c, r, col); blob(c, r, fl || b.st === 'aim' && (t * 16 % 2 < 1) ? '#ffffff' : col); eyes(c, r, 'angry', r * 0.08); mouth(c, r, 'frown');
      c.fillStyle = '#16202b'; c.strokeStyle = OUT; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-r * 1.15, -r * 0.62); c.quadraticCurveTo(0, -r * 1.75, r * 1.15, -r * 0.62); c.quadraticCurveTo(0, -r * 0.92, -r * 1.15, -r * 0.62); c.closePath(); c.fill(); c.stroke();
      dot(c, 0, -r * 1.0, r * 0.13, COL.brass);
      c.fillStyle = COL.brass; rr(c, -r * 1.12, r * 0.1, r * 0.36, r * 0.16, 3); c.fill(); c.stroke(); rr(c, r * 0.76, r * 0.1, r * 0.36, r * 0.16, 3); c.fill(); c.stroke();
    } else {
      const fk = 1 + Math.sin(t * 17) * 0.05 + Math.sin(t * 29) * 0.04;
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; c.drawImage(fire(), -r * 2.6, -r * 2.8, r * 5.2, r * 5.2); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.scale(fk, 2 - fk);
      const gr = c.createRadialGradient(0, r * 0.2, 2, 0, 0, r * 1.4); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, '#fff3a8'); gr.addColorStop(0.65, '#ffb21f'); gr.addColorStop(1, '#ff5a12');
      c.beginPath(); c.moveTo(0, -r * 1.8); c.bezierCurveTo(r * 0.9, -r * 0.8, r * 1.2, -r * 0.1, r * 1.05, r * 0.35); c.bezierCurveTo(r * 0.8, r * 1.15, -r * 0.8, r * 1.15, -r * 1.05, r * 0.35); c.bezierCurveTo(-r * 1.2, -r * 0.1, -r * 0.5, -r * 0.5, 0, -r * 1.8); c.closePath();
      c.fillStyle = fl ? '#fff' : gr; c.fill(); c.lineWidth = 3; c.strokeStyle = '#7a2a00'; c.stroke();
      eyes(c, r * 0.8, 'angry', r * 0.2); mouth(c, r * 0.8, 'grin');
    }
    if (b.shield) {
      c.globalAlpha = 0.28 + Math.sin(t * 8) * 0.08; dot(c, 0, 0, r * 1.75, '#7fe3ff'); c.globalAlpha = 1;
      c.strokeStyle = '#d9f7ff'; c.lineWidth = 3; c.setLineDash([10, 8]); c.lineDashOffset = -t * 40; c.beginPath(); c.arc(0, 0, r * 1.75, 0, TAU); c.stroke(); c.setLineDash([]);
    }
    if (b.stun > 0) { c.fillStyle = '#ffe066'; c.font = '900 ' + Math.round(r * 0.5) + 'px Nunito, sans-serif'; c.textAlign = 'center'; c.fillText('★ ★ ★', 0, -r * 2); }
    c.restore();
  }

  /* ---------- frame ---------- */
  R.init = function (canvas) { cv = canvas; ctx = cv.getContext('2d'); };
  R.resize = function (g) {
    const dpr = Math.min(window.devicePixelRatio || 1, PK.dprCap || 2), w = cv.clientWidth || 800, h = cv.clientHeight || 600;
    g.W = w; g.H = h; g.dpr = dpr; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    g.scale = Math.max(1.0, Math.min(1.55, Math.sqrt(w * h) / 740)); g.vw = w / g.scale; g.vh = h / g.scale;
  };
  const GEMC = ['#58e6c9', '#58b4ff', '#c58bff', '#ffd04d'];
  function gemTier(v) { return v >= 25 ? 3 : v >= 6 ? 2 : v >= 2 ? 1 : 0; }

  R.draw = function (g) {
    const c = ctx, k = g.dpr * g.scale, cx = g.cam.x + g.cam.sx, cy = g.cam.y + g.cam.sy, t = g.t + (g.idleT || 0);
    c.setTransform(k, 0, 0, k, g.W * g.dpr / 2 - cx * k, g.H * g.dpr / 2 - cy * k);
    const hw = g.vw / 2, hh = g.vh / 2, vl = cx - hw, vt = cy - hh;
    const vis = (x, y, m) => x > vl - m && x < vl + g.vw + m && y > vt - m && y < vt + g.vh + m;
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.fillStyle = tile(g.actDef ? g.actDef.color : COL.A); c.fillRect(vl - 2, vt - 2, g.vw + 4, g.vh + 4);

    if (g.state === 'idle') {
      for (const d of g.deco) { if (!vis(d.x, d.y, 60)) continue; const s = sprite(d.type); c.drawImage(s.c, d.x - s.half, d.y - s.half + Math.sin(t * 6 + d.seed) * 1.5, s.half * 2, s.half * 2); }
      c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); vignette(c, g, 0.6); return;
    }
    const p = g.player;

    /* ground zones */
    for (const z of g.zones) {
      if (!vis(z.x, z.y, z.r + 20)) continue;
      if (z.kind === 'fire') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, z.life * 2) * (0.55 + Math.sin(t * 20 + z.x) * 0.12); const s = z.r * 2.3; c.drawImage(fire(), z.x - s / 2, z.y - s / 2, s, s); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
      else if (z.kind === 'claim') {
        if (z.warn > 0) { c.strokeStyle = rgba(COL.I, 0.9); c.lineWidth = 2.5; c.setLineDash([8, 6]); c.beginPath(); c.arc(z.x, z.y, z.r * (1 - z.warn * 0.25), 0, TAU); c.stroke(); c.setLineDash([]); }
        else { c.fillStyle = rgba(COL.I, 0.2 + Math.sin(t * 6) * 0.04); c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.fill(); c.strokeStyle = rgba(COL.I, 0.9); c.lineWidth = 2.5; c.stroke();
          c.strokeStyle = OUT; c.lineWidth = 2.5; c.beginPath(); c.moveTo(z.x, z.y + 12); c.lineTo(z.x, z.y - 22); c.stroke(); c.fillStyle = COL.I; c.beginPath(); c.moveTo(z.x, z.y - 22); c.lineTo(z.x + 18, z.y - 15); c.lineTo(z.x, z.y - 8); c.closePath(); c.fill(); c.stroke(); }
      } else if (z.kind === 'blast') {
        const f = 1 - Math.max(0, z.warn) / z.w0; c.fillStyle = rgba(COL.S, 0.12); c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.fill();
        c.fillStyle = rgba(COL.S, 0.3); c.beginPath(); c.arc(z.x, z.y, z.r * f, 0, TAU); c.fill();
        c.strokeStyle = COL.S; c.lineWidth = 2.5; c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.stroke();
        c.fillStyle = '#fff'; c.font = '900 30px Nunito, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(z.n), z.x, z.y); c.textBaseline = 'alphabetic';
      }
    }
    /* aura */
    if (p.auraR > 0) { c.fillStyle = 'rgba(190,235,255,.07)'; c.beginPath(); c.arc(p.x, p.y, p.auraR, 0, TAU); c.fill(); c.strokeStyle = 'rgba(210,240,255,.5)'; c.lineWidth = 2; c.setLineDash([10, 9]); c.lineDashOffset = t * 30; c.beginPath(); c.arc(p.x, p.y, p.auraR, 0, TAU); c.stroke(); c.setLineDash([]); }

    /* gems + pickups */
    for (const gm of g.gems) {
      if (!vis(gm.x, gm.y, 12)) continue; const tr = gemTier(gm.v), s = 4.2 + tr * 1.5;
      c.fillStyle = GEMC[tr]; c.beginPath(); c.moveTo(gm.x, gm.y - s * 1.25); c.lineTo(gm.x + s, gm.y); c.lineTo(gm.x, gm.y + s * 1.25); c.lineTo(gm.x - s, gm.y); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,.65)'; c.beginPath(); c.moveTo(gm.x, gm.y - s * 1.25); c.lineTo(gm.x + s * 0.5, gm.y - s * 0.3); c.lineTo(gm.x - s * 0.4, gm.y - s * 0.2); c.closePath(); c.fill();
    }
    c.textAlign = 'center';
    for (const q of g.pickups) {
      if (!vis(q.x, q.y, 40)) continue; const by = q.y + Math.sin(t * 4 + q.x) * 2.5;
      if (q.kind === 'coin') { dot(c, q.x, by, 6.5, '#a87708'); dot(c, q.x - 0.6, by - 0.8, 5.4, COL.brass); dot(c, q.x - 2, by - 2.2, 1.7, '#fff6c9'); }
      else if (q.kind === 'chest') {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35 + Math.sin(t * 5) * 0.12; c.drawImage(fire(), q.x - 44, by - 46, 88, 88); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        c.lineWidth = 2.2; c.strokeStyle = OUT; rr(c, q.x - 15, by - 9, 30, 20, 3); c.fillStyle = '#8a5a2b'; c.fill(); c.stroke();
        rr(c, q.x - 16, by - 15, 32, 11, 5); c.fillStyle = '#a8703a'; c.fill(); c.stroke(); c.fillStyle = COL.brass; c.fillRect(q.x - 3, by - 9, 6, 9); c.strokeRect(q.x - 3, by - 9, 6, 9);
      } else { c.font = '20px sans-serif'; c.fillText(q.kind === 'heart' ? '❤️' : q.kind === 'magnet' ? '🧲' : '💣', q.x, by + 7); }
    }

    /* alliance chains */
    c.lineWidth = 2;
    for (const e of g.enemies) {
      const m = e.buddy; if (!m || m.hp <= 0 || e.hp <= 0) continue; if (!vis(e.x, e.y, 80)) continue;
      const hot = e.sq && e.sq.rageT > g.t; c.strokeStyle = hot ? 'rgba(255,120,110,.9)' : 'rgba(170,215,255,.55)'; c.setLineDash([5, 5]);
      c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(m.x, m.y); c.stroke();
    }
    c.setLineDash([]);
    if (g.bosses.length === 2 && g.bosses[0].hp > 0 && g.bosses[1].hp > 0) {
      const a = g.bosses[0], b = g.bosses[1]; c.strokeStyle = 'rgba(255,90,80,.9)'; c.lineWidth = 6; c.setLineDash([12, 8]); c.lineDashOffset = -t * 50; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.setLineDash([]);
    }

    /* enemies */
    for (const e of g.enemies) {
      if (e.boss || !vis(e.x, e.y, 60)) continue;
      const s = sprite(e.type), sc = e.r / s.r, hs = s.half * sc, by = Math.sin(t * 7 + e.seed) * 1.5;
      if (e.st === 'aim') { c.strokeStyle = 'rgba(255,90,80,.55)'; c.lineWidth = 3; c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.x + e.dx * 230, e.y + e.dy * 230); c.stroke(); }
      if (e.elite) { c.strokeStyle = COL.brass; c.lineWidth = 3; c.beginPath(); c.arc(e.x, e.y, e.r + 6 + Math.sin(t * 6) * 1.5, 0, TAU); c.stroke(); }
      c.drawImage(e.flash > 0 ? s.w : s.c, e.x - hs, e.y - hs + by, hs * 2, hs * 2);
      if (e.sq && e.sq.rageT > g.t) { c.fillStyle = '#ff5e4f'; c.font = '900 15px Nunito, sans-serif'; c.fillText('!', e.x, e.y - e.r - 6); }
      if (e.elite) { crown(c, e.x, e.y - e.r - 12, 8); const f = Math.max(0, e.hp / e.maxHp); c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(e.x - 18, e.y + e.r + 6, 36, 5); c.fillStyle = COL.brass; c.fillRect(e.x - 18, e.y + e.r + 6, 36 * f, 5); }
    }
    for (const b of g.bosses) if (b.hp > 0) {
      if (b.st === 'aim') { c.strokeStyle = 'rgba(255,90,80,.6)'; c.lineWidth = 8; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x + b.dx * 420, b.y + b.dy * 420); c.stroke(); }
      drawBoss(c, b, g);
    }

    /* orbs */
    for (const o of p.orbPos) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; dot(c, o.x, o.y, 15, COL.A); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; dot(c, o.x, o.y, 8.5, '#d9eeff'); c.lineWidth = 2; c.strokeStyle = '#1b5fa8'; c.stroke(); }

    /* player */
    const blinkA = p.iframes > 0 && (t * 20 % 2 < 1) ? 0.35 : 1;
    drawHero(c, p.x, p.y, p.r, p.char, t, p.moving, p.face, blinkA);

    /* bullets */
    for (const b of g.bullets) {
      if (!vis(b.x, b.y, 60)) continue;
      if (b.kind === 'bolt') { c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.strokeStyle = COL.brass; c.lineWidth = 6; c.beginPath(); c.moveTo(b.x - b.vx * 0.028, b.y - b.vy * 0.028); c.lineTo(b.x, b.y); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 2.4; c.stroke(); c.globalCompositeOperation = 'source-over'; }
      else if (b.kind === 'paper') { c.save(); c.translate(b.x, b.y); c.rotate(b.rot); c.fillStyle = '#f4ecd6'; c.fillRect(-7, -5, 14, 10); c.strokeStyle = OUT; c.lineWidth = 1.2; c.strokeRect(-7, -5, 14, 10); c.fillStyle = '#555'; c.fillRect(-5, -3, 10, 1.6); c.fillRect(-5, 0, 7, 1.2); c.fillRect(-5, 2.4, 9, 1.2); c.restore(); }
      else if (b.kind === 'shell') { c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(b.x, b.y, 7, 3.5, 0, 0, TAU); c.fill(); dot(c, b.x, b.y - b.z, 6.5, '#2c363d'); c.lineWidth = 1.5; c.strokeStyle = OUT; c.stroke(); dot(c, b.x - 2, b.y - b.z - 2, 2, '#aab7bd');
        c.strokeStyle = rgba(COL.M, 0.5); c.lineWidth = 1.5; c.setLineDash([4, 5]); c.beginPath(); c.arc(b.tx, b.ty, b.rad * (b.t / b.dur), 0, TAU); c.stroke(); c.setLineDash([]); }
      else if (b.kind === 'boom') { c.save(); c.translate(b.x, b.y); c.rotate(b.spin); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = OUT; c.lineWidth = b.r * 0.62; c.beginPath(); c.moveTo(-b.r, b.r * 0.5); c.lineTo(0, -b.r * 0.5); c.lineTo(b.r, b.r * 0.5); c.stroke(); c.strokeStyle = COL.I; c.lineWidth = b.r * 0.4; c.stroke(); c.restore(); }
    }
    for (const b of g.ebullets) { if (!vis(b.x, b.y, 20)) continue; dot(c, b.x, b.y, b.r + 2, OUT); dot(c, b.x, b.y, b.r, b.col || '#ff5a3c'); dot(c, b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.45, '#fff0c9'); }

    /* lightning, rings, particles, text */
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const a of g.arcs) {
      c.globalCompositeOperation = 'lighter'; c.strokeStyle = a.col || '#bfe3ff'; c.lineWidth = 3.2 * Math.min(1, a.life / 0.1); c.beginPath();
      for (let i = 0; i < a.pts.length - 1; i++) { const p0 = a.pts[i], p1 = a.pts[i + 1], dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len; c.moveTo(p0.x, p0.y); for (let s = 1; s < 4; s++) { const o = (Math.random() - 0.5) * 16; c.lineTo(p0.x + dx * s / 4 + nx * o, p0.y + dy * s / 4 + ny * o); } c.lineTo(p1.x, p1.y); }
      c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke(); c.globalCompositeOperation = 'source-over';
    }
    for (const q of g.rings) { const f = 1 - q.life / q.max; c.globalAlpha = 1 - f; c.strokeStyle = q.col; c.lineWidth = q.w * (1 - f) + 1; c.beginPath(); c.arc(q.x, q.y, q.r0 + (q.r1 - q.r0) * f, 0, TAU); c.stroke(); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'lighter';
    for (const q of g.parts) { const a = q.life / q.max; c.globalAlpha = a; c.fillStyle = q.col; const s = q.size * (0.4 + a * 0.6); c.fillRect(q.x - s / 2, q.y - s / 2, s, s); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.textAlign = 'center'; c.lineJoin = 'round';
    for (const q of g.texts) { const a = Math.min(1, q.life / 0.25); c.globalAlpha = a; c.font = '900 ' + q.size + 'px Nunito, system-ui, sans-serif'; c.lineWidth = 3; c.strokeStyle = 'rgba(8,14,20,.85)'; c.strokeText(q.str, q.x, q.y); c.fillStyle = q.col; c.fillText(q.str, q.x, q.y); }
    c.globalAlpha = 1;

    /* ---- screen space ---- */
    c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    const toS = (x, y) => [(x - cx) * g.scale + g.W / 2, (y - cy) * g.scale + g.H / 2];
    const arrow = (x, y, col) => {
      if (vis(x, y, -20)) return; const a = Math.atan2(y - cy, x - cx), m = 34, ex = g.W / 2 - m, ey = g.H / 2 - m - 30;
      const tt = Math.min(Math.abs(ex / (Math.cos(a) || 1e-6)), Math.abs(ey / (Math.sin(a) || 1e-6))), ax = g.W / 2 + Math.cos(a) * tt, ay = g.H / 2 + 20 + Math.sin(a) * tt;
      c.save(); c.translate(ax, ay); c.rotate(a); c.fillStyle = col; c.strokeStyle = OUT; c.lineWidth = 2; c.beginPath(); c.moveTo(14, 0); c.lineTo(-8, -10); c.lineTo(-3, 0); c.lineTo(-8, 10); c.closePath(); c.fill(); c.stroke(); c.restore();
    };
    for (const q of g.pickups) if (q.kind === 'chest') arrow(q.x, q.y, COL.brass);
    for (const b of g.bosses) if (b.hp > 0) arrow(b.x, b.y, COL[b.def.key]);
    if (g.joy.on) { c.globalAlpha = 0.35; c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(g.joy.ox, g.joy.oy, 50, 0, TAU); c.stroke(); let dx = g.joy.x - g.joy.ox, dy = g.joy.y - g.joy.oy; const d = Math.hypot(dx, dy) || 1, m = Math.min(50, d); dot(c, g.joy.ox + dx / d * m, g.joy.oy + dy / d * m, 22, '#fff'); c.globalAlpha = 1; }
    vignette(c, g, 0.5);
    if (g.flash > 0) { c.globalAlpha = Math.min(0.5, g.flash); c.fillStyle = g.flashCol; c.fillRect(0, 0, g.W, g.H); c.globalAlpha = 1; }
    if (p.hp < p.maxHp * 0.3 && g.state === 'play') { const gr = c.createRadialGradient(g.W / 2, g.H / 2, Math.min(g.W, g.H) * 0.35, g.W / 2, g.H / 2, Math.max(g.W, g.H) * 0.75); gr.addColorStop(0, 'rgba(255,40,30,0)'); gr.addColorStop(1, 'rgba(255,40,30,' + (0.28 + Math.sin(t * 6) * 0.1) + ')'); c.fillStyle = gr; c.fillRect(0, 0, g.W, g.H); }
  };
  let vig = null, vigKey = '';
  function vignette(c, g, a) {
    const key = g.W + 'x' + g.H + a;
    if (vigKey !== key) { vig = c.createRadialGradient(g.W / 2, g.H / 2, Math.min(g.W, g.H) * 0.3, g.W / 2, g.H / 2, Math.hypot(g.W, g.H) * 0.6); vig.addColorStop(0, 'rgba(4,9,14,0)'); vig.addColorStop(1, 'rgba(4,9,14,' + a + ')'); vigKey = key; }
    c.fillStyle = vig; c.fillRect(0, 0, g.W, g.H);
  }
  R.sprite = sprite; R._tile = tile; R._fire = fire; R._drawBoss = drawBoss; R._crown = crown;
})();
