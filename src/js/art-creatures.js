/* art-creatures.js — the ten monsters. Registers PK.art.enemy = { draw, corpse, links }.
   Every monster is painted ONCE into an offscreen canvas (3 device px per world unit, plus a white-tinted copy for the
   hit flash and a faintly cool copy for "slowed") and from then on only blitted: hop, squash-and-stretch, sway, flip, pop-in and state poses are canvas
   transforms. The stage draws the ground shadow and the elite health bar. Reads only the documented monster fields. */
(function () {
  'use strict';
  const PK = (window.PK = window.PK || {});
  const ART = (PK.art = PK.art || {});
  const COL = PK.COL || { M: '#a3b85e', A: '#4da8ff', I: '#b77dff', N: '#ff5e4f', S: '#ffa01f', X: '#8fa0ad', brass: '#f2bb3d' };
  const TAU = Math.PI * 2, PI = Math.PI, OUT = '#0a1118', BRASS = COL.brass || '#f2bb3d', CREAM = '#fff3d6';
  const RES = 3, BODY = 1.15;            /* device px per world unit · body radius as a multiple of the hit radius */
  const LW = (r) => Math.max(1.6, r * 0.14);

  /* ---------- colour ---------- */
  function rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(c) { let s = '#'; for (let i = 0; i < 3; i++) s += ('0' + Math.max(0, Math.min(255, Math.round(c[i]))).toString(16)).slice(-2); return s; }
  function mix(h, to, a) { const c = rgb(h), d = rgb(to); return hex([c[0] + (d[0] - c[0]) * a, c[1] + (d[1] - c[1]) * a, c[2] + (d[2] - c[2]) * a]); }
  const dark = (h, a) => mix(h, '#000000', a), light = (h, a) => mix(h, '#ffffff', a);
  const keyCol = (k) => COL[k] || COL.X || '#8fa0ad';

  /* ---------- drawing vocabulary ---------- */
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
  function ell(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function rrect(c, x, y, w, h, rad) { c.beginPath(); c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad); c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath(); }
  function fill(c, col) { c.fillStyle = col; c.fill(); }
  function line(c, lw, col) { c.lineWidth = lw; c.strokeStyle = col || OUT; c.stroke(); }
  /* flat fill + ONE bottom-right shade band + ONE top-left highlight + outline. o = {R, cx, cy, band, hi, in(c)} */
  function solid(c, path, col, lw, o) {
    const R = o.R, cx = o.cx || 0, cy = o.cy || 0;
    c.save(); path(c); c.fillStyle = col; c.fill(); c.clip();
    if (o.band !== false) { c.beginPath(); c.rect(cx - R * 5, cy - R * 5, R * 10, R * 10); c.arc(cx - R * 0.26, cy - R * 0.3, R * (o.br || 1.1), 0, TAU, true); c.fillStyle = o.dark || dark(col, 0.28); c.fill(); }
    if (o.hi !== false) { c.beginPath(); c.ellipse(cx - R * 0.44, cy - R * 0.54, R * 0.27, R * 0.14, -0.62, 0, TAU); c.fillStyle = 'rgba(255,255,255,' + (o.hiA || 0.42) + ')'; c.fill(); }
    if (o.in) o.in(c);
    c.restore();
    if (lw) { path(c); c.lineWidth = lw; c.strokeStyle = OUT; c.stroke(); }
  }
  function ball(c, x, y, rad, col, lw) { solid(c, (c) => circ(c, x, y, rad), col, lw, { R: rad, cx: x, cy: y }); }
  function feet(c, R, lw, col, dx, rx, ry) {
    dx = (dx || 0.42) * R; rx = (rx || 0.3) * R; ry = (ry || 0.17) * R; const y = R * 0.99;
    ell(c, -dx, y, rx, ry); fill(c, col); line(c, lw * 0.85);
    ell(c, dx + R * 0.06, y, rx, ry); fill(c, col); line(c, lw * 0.85);
  }
  function eye(c, x, y, er, px, py, pup) {
    circ(c, x, y, er); fill(c, '#ffffff'); line(c, Math.max(0.8, er * 0.24));
    const pr = er * (pup || 0.58), ox = x + px * er, oy = y + py * er;
    circ(c, ox, oy, pr); fill(c, OUT);
    circ(c, ox - pr * 0.3, oy - pr * 0.38, pr * 0.36); fill(c, '#ffffff');
  }
  function lid(c, x, y, er, lw) { c.beginPath(); c.arc(x, y - er * 0.25, er * 0.85, 0.14 * PI, 0.86 * PI); line(c, lw); }
  function eyes(c, o, y, gap, er, px, py, lw, pup) {
    if (o.blink) { lid(c, -gap, y, er, lw); lid(c, gap, y, er, lw); } else { eye(c, -gap, y, er, px, py, pup); eye(c, gap, y, er, px, py, pup); }
  }
  function seg(c, x1, y1, x2, y2, lw, col) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); line(c, lw, col); }
  function angry(c, y, gap, er, lw, steep) { const s = steep || 1; seg(c, -gap - er * 1.05, y - er * (1.05 + 0.5 * s), -gap + er * 0.9, y - er * 0.72, lw); seg(c, gap + er * 1.05, y - er * (1.05 + 0.5 * s), gap - er * 0.9, y - er * 0.72, lw); }
  function curve(c, x, y, w, bend, lw) { c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x, y + bend, x + w, y); line(c, lw); }
  function shout(c, x, y, rx, ry, lw, teeth) {
    ell(c, x, y, rx, ry); fill(c, '#40121a'); c.save(); c.clip();
    ell(c, x, y + ry * 0.85, rx * 0.72, ry * 0.6); fill(c, '#ff7d8a');
    if (teeth) { c.fillStyle = '#ffffff'; c.fillRect(x - rx, y - ry, rx * 2, ry * 0.55); }
    c.restore(); ell(c, x, y, rx, ry); line(c, lw);
  }
  function grit(c, x, y, w, h, lw, n) {
    rrect(c, x - w / 2, y - h / 2, w, h, h * 0.32); fill(c, '#ffffff'); line(c, lw);
    c.beginPath(); for (let i = 1; i < n; i++) { const tx = x - w / 2 + (w * i) / n; c.moveTo(tx, y - h / 2); c.lineTo(tx, y + h / 2); }
    c.moveTo(x - w / 2, y); c.lineTo(x + w / 2, y); line(c, lw * 0.6);
  }
  function crown(c, x, y, w, lw, rot) {
    c.save(); c.translate(x, y); if (rot) c.rotate(rot); const h = w * 1.05;
    c.beginPath(); c.moveTo(-w, 0); c.lineTo(-w * 1.1, -h * 0.74); c.lineTo(-w * 0.5, -h * 0.36); c.lineTo(0, -h); c.lineTo(w * 0.5, -h * 0.36); c.lineTo(w * 1.1, -h * 0.74); c.lineTo(w, 0); c.closePath();
    fill(c, BRASS); line(c, lw);
    rrect(c, -w, -h * 0.28, w * 2, h * 0.28, h * 0.07); fill(c, '#d9981c'); line(c, lw * 0.85);
    circ(c, 0, -h * 0.14, w * 0.17); fill(c, '#ff5e7a'); line(c, lw * 0.6);
    for (const p of [[-w * 1.1, -h * 0.74], [0, -h], [w * 1.1, -h * 0.74]]) { circ(c, p[0], p[1], w * 0.16); fill(c, '#fff3c4'); line(c, lw * 0.7); }
    c.restore();
  }
  /* spiked helmet (Pickelhaube): dome whose front rim dips into an angry "V" over the eyes */
  function helmet(c, R, lw, col, o, y0, rad, dip) {
    const hp = (c) => { c.beginPath(); c.arc(0, y0, rad, PI * 1.03, PI * 1.97); c.quadraticCurveTo(R * 0.08, y0 + dip, -rad * 0.996, y0 - rad * 0.094); c.closePath(); };
    solid(c, hp, col, lw, { R: rad * 0.95, cy: y0 - rad * 0.35, in: (c) => {
      c.beginPath(); c.moveTo(rad, y0 - rad * 0.094); c.quadraticCurveTo(R * 0.08, y0 + dip, -rad, y0 - rad * 0.094); c.lineWidth = rad * 0.3; c.strokeStyle = light(col, 0.22); c.stroke();
    } });
    const top = y0 - rad;
    if (o.crown) crown(c, 0, top + rad * 0.1, rad * 0.56, lw, 0);
    else {
      c.beginPath(); c.moveTo(-rad * 0.15, top + rad * 0.04); c.lineTo(rad * 0.01, top - rad * 0.6); c.lineTo(rad * 0.17, top + rad * 0.04); c.closePath(); fill(c, BRASS); line(c, lw * 0.9);
      rrect(c, -rad * 0.26, top - rad * 0.06, rad * 0.54, rad * 0.2, rad * 0.08); fill(c, BRASS); line(c, lw * 0.9);
    }
    circ(c, rad * 0.34, y0 - rad * 0.44, rad * 0.15); fill(c, BRASS); line(c, lw * 0.75);
  }

  /* ---------- the ten monsters. Each paints itself facing RIGHT, centred on (0,0), body radius R = r * BODY ---------- */
  const MON = {};
  MON.recruit = function (c, r, o) {
    const R = r * BODY, lw = LW(r);
    /* rifle with a bayonet over the shoulder */
    seg(c, -R * 0.72, R * 0.7, -R * 1.24, -R * 1.2, R * 0.3); seg(c, -R * 0.72, R * 0.7, -R * 1.24, -R * 1.2, R * 0.14, '#b0733c');
    seg(c, -R * 1.24, -R * 1.2, -R * 1.36, -R * 1.66, R * 0.24); seg(c, -R * 1.24, -R * 1.2, -R * 1.36, -R * 1.66, R * 0.09, '#e3ecf2');
    feet(c, R, lw, '#2a3216');
    ball(c, 0, 0, R, COL.M, lw);
    eyes(c, o, R * 0.27, R * 0.38, R * 0.28, 0.28, 0.1, lw);
    curve(c, R * 0.06, R * 0.72, R * 0.17, -R * 0.07, lw * 0.85);
    helmet(c, R, lw, '#56662a', o, -R * 0.2, R * 1.04, R * 0.42);
  };
  MON.brute = function (c, r, o) {
    const R = r * BODY, lw = LW(r), col = dark(COL.M, 0.07), fc = dark(COL.M, 0.2);
    ball(c, -R * 1.0, R * 0.36, R * 0.36, fc, lw);
    feet(c, R, lw, '#2a3216', 0.5, 0.37, 0.2);
    const bp = (c) => rrect(c, -R * 0.98, -R * 0.84, R * 1.96, R * 1.82, R * 0.52);
    solid(c, bp, col, lw, { R, in: (c) => {
      c.beginPath(); c.rect(-R * 1.1, R * 0.5, R * 2.2, R * 0.28); fill(c, '#4d5a25');
      c.beginPath(); c.moveTo(-R * 1.1, R * 0.5); c.lineTo(R * 1.1, R * 0.5); c.moveTo(-R * 1.1, R * 0.78); c.lineTo(R * 1.1, R * 0.78); line(c, lw * 0.6);
      for (const k of [-0.56, 0, 0.56]) { circ(c, R * k, R * 0.64, R * 0.075); fill(c, BRASS); line(c, lw * 0.45); }
    } });
    const ey = -R * 0.1, gap = R * 0.3, er = R * 0.2;
    eyes(c, o, ey, gap, er, 0.3, 0.12, lw);
    c.beginPath(); c.moveTo(-gap - er * 1.5, ey - er * 1.85); c.lineTo(R * 0.04, ey - er * 0.9); c.lineTo(gap + er * 1.5, ey - er * 1.85); line(c, lw * 1.35);
    curve(c, R * 0.02, R * 0.25, R * 0.5, R * 0.1, lw);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(R * (0.02 + s * 0.38), R * 0.3); c.lineTo(R * (0.02 + s * 0.28), R * 0.06); c.lineTo(R * (0.02 + s * 0.17), R * 0.33); c.closePath(); fill(c, '#ffffff'); line(c, lw * 0.7); }
    helmet(c, R, lw, '#4c5a22', o, -R * 0.62, R * 0.8, R * 0.2);
    ball(c, R * 1.04, R * 0.32, R * 0.38, fc, lw);
    c.beginPath(); c.moveTo(R * 0.92, R * 0.2); c.lineTo(R * 0.92, R * 0.5); c.moveTo(R * 1.1, R * 0.18); c.lineTo(R * 1.1, R * 0.52); line(c, lw * 0.55);
  };
  MON.gunboat = function (c, r, o) {
    const R = r * BODY, lw = LW(r), hull = dark(COL.M, 0.32), steel = '#465257';
    for (const p of [[-0.64, -1.5, 0.23], [-1.0, -1.72, 0.17], [-1.27, -1.86, 0.11]]) { circ(c, R * p[0], R * p[1], R * p[2]); fill(c, '#cdd7dc'); line(c, lw * 0.7); }
    rrect(c, -R * 0.54, -R * 1.24, R * 0.38, R * 0.76, R * 0.06); fill(c, steel); line(c, lw);
    c.beginPath(); c.rect(-R * 0.54, -R * 1.12, R * 0.38, R * 0.13); fill(c, BRASS); line(c, lw * 0.6);
    solid(c, (c) => rrect(c, -R * 0.78, -R * 0.64, R * 1.02, R * 0.58, R * 0.1), COL.M, lw, { R: R * 0.5, cx: -R * 0.27, cy: -R * 0.35 });
    for (const px of [-0.52, -0.16]) { circ(c, R * px, -R * 0.36, R * 0.1); fill(c, '#1c2a30'); line(c, lw * 0.5); circ(c, R * px - R * 0.03, -R * 0.39, R * 0.03); fill(c, '#bfe9ff'); }
    seg(c, R * 0.56, -R * 0.36, R * 1.36, -R * 0.66, R * 0.32); seg(c, R * 0.56, -R * 0.36, R * 1.36, -R * 0.66, R * 0.17, '#7c8a90');
    c.beginPath(); c.arc(R * 0.5, -R * 0.1, R * 0.33, PI, TAU); c.closePath(); fill(c, dark(COL.M, 0.2)); line(c, lw);
    const hp = (c) => { c.beginPath(); c.moveTo(-R * 1.24, -R * 0.12); c.lineTo(R * 1.44, -R * 0.12); c.quadraticCurveTo(R * 1.2, R * 0.6, R * 0.72, R * 0.68); c.lineTo(-R * 0.88, R * 0.68); c.quadraticCurveTo(-R * 1.26, R * 0.52, -R * 1.24, -R * 0.12); c.closePath(); };
    solid(c, hp, hull, lw, { R, cy: R * 0.2, hi: false, in: (c) => {
      c.beginPath(); c.rect(-R * 1.5, R * 0.44, R * 3.1, R * 0.4); fill(c, '#8f3d2f');
      c.beginPath(); c.moveTo(-R * 1.5, R * 0.44); c.lineTo(R * 1.6, R * 0.44); line(c, lw * 0.55, CREAM);
    } });
    const ey = R * 0.14, er = R * 0.2;
    if (o.blink) { lid(c, R * 0.22, ey, er, lw); lid(c, R * 0.78, ey, er, lw); } else { eye(c, R * 0.22, ey, er, 0.3, 0.1); eye(c, R * 0.78, ey, er, 0.3, 0.1); }
    seg(c, R * 0.0, ey - er * 1.5, R * 0.42, ey - er * 0.8, lw * 1.1); seg(c, R * 1.0, ey - er * 1.5, R * 0.62, ey - er * 0.8, lw * 1.1);
    if (o.crown) crown(c, -R * 0.27, -R * 0.62, R * 0.4, lw, -0.08);
    const wp = (c) => { c.beginPath(); c.moveTo(-R * 1.42, R * 0.96); c.quadraticCurveTo(-R * 1.36, R * 0.5, -R * 0.98, R * 0.7); c.quadraticCurveTo(-R * 0.62, R * 0.46, -R * 0.26, R * 0.7); c.quadraticCurveTo(R * 0.1, R * 0.46, R * 0.46, R * 0.7); c.quadraticCurveTo(R * 0.86, R * 0.44, R * 1.2, R * 0.66); c.quadraticCurveTo(R * 1.62, R * 0.34, R * 1.62, R * 0.96); c.closePath(); };
    wp(c); fill(c, '#bfe4f4'); c.save(); c.clip(); c.fillStyle = '#ffffff'; for (const b of [-0.98, -0.26, 0.46, 1.24]) { c.beginPath(); c.ellipse(R * b, R * 0.62, R * 0.3, R * 0.12, 0, 0, TAU); c.fill(); } c.restore(); wp(c); line(c, lw * 0.8);
  };
  /* the ally's belt: a chunky chain drawn link by link around the waist (back half first, front half last) */
  function chainRing(c, R, lw, back) {
    const cy = R * 0.36, rx = R * 1.2, ry = R * 0.4, rot = -0.1, n = 7, a0 = back ? PI : 0, da = PI / n, cr = Math.cos(rot), sr = Math.sin(rot), s = R * 0.215, w = Math.max(1.1, R * 0.09);
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
      if ((i % 2 === 0) !== (pass === 1)) continue;
      const a = a0 + (i + 0.5) * da, ex = rx * Math.cos(a), ey = ry * Math.sin(a), tx = -rx * Math.sin(a), ty = ry * Math.cos(a);
      c.save(); c.translate(ex * cr - ey * sr, cy + ex * sr + ey * cr); c.rotate(Math.atan2(tx * sr + ty * cr, tx * cr - ty * sr));
      if (pass === 0) { rrect(c, -s * 1.1, -s * 0.34, s * 2.2, s * 0.68, s * 0.3); fill(c, back ? '#7893b1' : '#aec3da'); line(c, w); }
      else { ell(c, 0, 0, s * 1.16, s * 0.78); fill(c, back ? '#93adc9' : '#eef6ff'); line(c, w); ell(c, 0, 0, s * 0.56, s * 0.25); fill(c, OUT); }
      c.restore();
    }
  }
  MON.link = function (c, r, o) {
    const R = r * BODY, lw = LW(r), col = COL.A, mitt = light(col, 0.22);
    chainRing(c, R, lw, true);
    feet(c, R, lw, '#12325a');
    ball(c, -R * 1.03, R * 0.12, R * 0.24, mitt, lw);
    ball(c, 0, 0, R, col, lw);
    const ey = -R * 0.14, gap = R * 0.37, er = R * 0.28;
    if (o.rage) {
      for (const s of [-1, 1]) { circ(c, s * R * 0.66, R * 0.12, R * 0.17); fill(c, 'rgba(255,94,79,.55)'); }
      eyes(c, o, ey, gap, er, 0.3, 0.12, lw, 0.44); angry(c, ey, gap, er, lw * 1.35, 1.5);
      shout(c, R * 0.05, R * 0.22, R * 0.3, R * 0.2, lw, true);
      c.save(); c.translate(R * 0.66, -R * 0.82); c.lineCap = 'round';
      for (const a of [0, PI / 2, PI, PI * 1.5]) { c.save(); c.rotate(a + 0.35); c.beginPath(); c.moveTo(R * 0.1, -R * 0.26); c.quadraticCurveTo(R * 0.1, -R * 0.1, R * 0.26, -R * 0.1); line(c, lw * 2.1); c.beginPath(); c.moveTo(R * 0.1, -R * 0.26); c.quadraticCurveTo(R * 0.1, -R * 0.1, R * 0.26, -R * 0.1); line(c, lw * 0.95, '#ff5e4f'); c.restore(); }
      c.restore();
    } else {
      eyes(c, o, ey, gap, er, 0.3, 0.1, lw); angry(c, ey, gap, er, lw * 1.1, 0.35);
      curve(c, R * 0.05, R * 0.28, R * 0.2, -R * 0.05, lw);
    }
    chainRing(c, R, lw, false);
    ball(c, R * 1.06, R * 0.1, R * 0.25, mitt, lw);
    if (o.crown) crown(c, -R * 0.04, -R * 0.9, R * 0.5, lw, -0.1);
  };
  MON.envoy = function (c, r, o) {
    const R = r * BODY, lw = LW(r), col = light(COL.A, 0.24);
    feet(c, R, lw, '#12325a');
    ball(c, 0, 0, R, col, lw);
    const ey = R * 0.08, gap = R * 0.37, er = R * 0.27;
    if (o.blink) { lid(c, -gap, ey, er, lw); lid(c, gap, ey, er, lw); }
    else for (const s of [-1, 1]) { eye(c, s * gap, ey, er, 0.25, 0.25, 0.5); c.save(); circ(c, s * gap, ey, er); c.clip(); c.fillStyle = dark(col, 0.16); c.fillRect(s * gap - er, ey - er, er * 2, er * 0.78); c.restore(); seg(c, s * gap - er * 0.95, ey - er * 0.24, s * gap + er * 0.95, ey - er * 0.24, lw * 0.9); circ(c, s * gap, ey, er); line(c, Math.max(0.8, er * 0.24)); }
    circ(c, gap, ey, er * 1.34); line(c, R * 0.21); circ(c, gap, ey, er * 1.34); line(c, R * 0.1, BRASS);
    c.beginPath(); c.moveTo(gap + er * 0.9, ey + er * 1.0); c.quadraticCurveTo(gap + er * 1.5, R * 0.66, gap * 0.9, R * 0.82); line(c, R * 0.13); line(c, R * 0.05, BRASS);
    c.beginPath(); c.moveTo(R * 0.04, R * 0.5); c.quadraticCurveTo(-R * 0.22, R * 0.64, -R * 0.46, R * 0.47); c.moveTo(R * 0.04, R * 0.5); c.quadraticCurveTo(R * 0.3, R * 0.64, R * 0.54, R * 0.47); line(c, lw * 1.15);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(R * 0.04, R * 0.84); c.lineTo(R * (0.04 + s * 0.3), R * 0.7); c.lineTo(R * (0.04 + s * 0.3), R * 0.98); c.closePath(); fill(c, CREAM); line(c, lw * 0.75); }
    circ(c, R * 0.04, R * 0.84, R * 0.08); fill(c, CREAM); line(c, lw * 0.7);
    c.save(); c.translate(-R * 0.06, -R * 0.8); c.rotate(-0.13);
    solid(c, (c) => rrect(c, -R * 0.62, -R * 1.1, R * 1.24, R * 1.06, R * 0.1), '#1b2632', lw, { R: R * 0.7, cy: -R * 0.6, dark: '#111a23', hiA: 0.22, in: (c) => { c.fillStyle = COL.A; c.fillRect(-R * 0.7, -R * 0.4, R * 1.4, R * 0.24); } });
    rrect(c, -R * 0.96, -R * 0.14, R * 1.92, R * 0.27, R * 0.11); fill(c, '#1b2632'); line(c, lw);
    if (o.crown) crown(c, 0, -R * 1.08, R * 0.58, lw * 0.72, 0);
    c.restore();
  };
  function hand(c, x, y, rad, col, lw, a) {
    for (const k of [-0.75, 0, 0.75]) { circ(c, x + Math.cos(a + k) * rad * 0.95, y + Math.sin(a + k) * rad * 0.95, rad * 0.42); fill(c, col); line(c, lw * 0.8); }
    ball(c, x, y, rad, col, lw);
  }
  function arm(c, x1, y1, x2, y2, R, col) { seg(c, x1, y1, x2, y2, R * 0.42); seg(c, x1, y1, x2, y2, R * 0.24, col); }
  MON.grabber = function (c, r, o) {
    const R = r * BODY, lw = LW(r), col = COL.I, hc = light(col, 0.28);
    if (o.loot) {
      const sx = -R * 1.0, sy = R * 0.2;
      c.beginPath(); c.moveTo(sx - R * 0.5, sy - R * 1.06); c.lineTo(sx - R * 0.26, sy - R * 0.74); c.lineTo(sx - R * 0.02, sy - R * 1.02); c.closePath(); fill(c, '#58e6c9'); line(c, lw * 0.8);
      circ(c, sx + R * 0.16, sy - R * 0.8, R * 0.17); fill(c, BRASS); line(c, lw * 0.8);
      solid(c, (c) => { c.beginPath(); c.moveTo(sx - R * 0.3, sy - R * 0.62); c.quadraticCurveTo(sx - R * 0.86, sy - R * 0.1, sx - R * 0.58, sy + R * 0.6); c.quadraticCurveTo(sx, sy + R * 0.86, sx + R * 0.56, sy + R * 0.6); c.quadraticCurveTo(sx + R * 0.82, sy - R * 0.1, sx + R * 0.22, sy - R * 0.62); c.closePath(); }, '#a87440', lw, { R: R * 0.6, cx: sx, cy: sy });
      seg(c, sx - R * 0.34, sy - R * 0.6, sx + R * 0.26, sy - R * 0.6, lw * 2.1); seg(c, sx - R * 0.34, sy - R * 0.6, sx + R * 0.26, sy - R * 0.6, lw * 0.9, CREAM);
    }
    arm(c, -R * 0.55, R * 0.1, -R * 1.16, -R * 0.66, R, dark(col, 0.12)); hand(c, -R * 1.2, -R * 0.74, R * 0.27, hc, lw, -2.2);
    feet(c, R, lw, '#3b1c66');
    solid(c, (c) => ell(c, 0, R * 0.02, R * 1.04, R * 0.99), col, lw, { R });
    const ey = -R * 0.22, gap = R * 0.4, er = R * 0.31;
    eyes(c, o, ey, gap, er, 0.26, -0.06, lw, 0.42);
    c.beginPath(); c.arc(-gap, ey - er * 0.2, er * 1.42, PI * 1.2, PI * 1.72); line(c, lw); c.beginPath(); c.arc(gap, ey - er * 0.2, er * 1.42, PI * 1.28, PI * 1.8); line(c, lw);
    const mp = (c) => { c.beginPath(); c.moveTo(-R * 0.62, R * 0.24); c.quadraticCurveTo(R * 0.02, R * 0.4, R * 0.66, R * 0.24); c.quadraticCurveTo(R * 0.4, R * 0.94, R * 0.02, R * 0.9); c.quadraticCurveTo(-R * 0.36, R * 0.94, -R * 0.62, R * 0.24); c.closePath(); };
    mp(c); fill(c, '#40121a'); c.save(); c.clip();
    ell(c, R * 0.04, R * 0.92, R * 0.3, R * 0.2); fill(c, '#ff7d8a');
    c.beginPath(); c.moveTo(-R * 0.7, R * 0.2); c.quadraticCurveTo(R * 0.02, R * 0.4, R * 0.7, R * 0.2); c.lineTo(R * 0.7, R * 0.46); c.quadraticCurveTo(R * 0.02, R * 0.62, -R * 0.7, R * 0.46); c.closePath(); fill(c, '#ffffff');
    c.beginPath(); for (const k of [-0.36, -0.12, 0.14, 0.4]) { c.moveTo(R * k, R * 0.22); c.lineTo(R * k, R * 0.6); } line(c, lw * 0.55);
    c.restore(); mp(c); line(c, lw);
    crown(c, -R * 0.04, -R * 0.84, R * (o.crown ? 0.66 : 0.5), lw, -0.12);
    arm(c, R * 0.6, R * 0.16, R * 1.3, -R * 0.44, R, dark(col, 0.12)); hand(c, R * 1.36, -R * 0.52, R * 0.29, hc, lw, -0.7);
  };
  MON.scout = function (c, r, o) {
    const R = r * BODY, lw = LW(r), col = light(COL.I, 0.2), tan = '#e4cf9a';
    feet(c, R, lw, '#3b1c66');
    ball(c, 0, 0, R, col, lw);
    lid(c, -R * 0.36, R * 0.16, R * 0.25, lw);
    curve(c, -R * 0.1, R * 0.62, R * 0.16, R * 0.1, lw * 0.9);
    c.save(); c.translate(R * 0.3, R * 0.1); c.rotate(-0.16);
    solid(c, (c) => rrect(c, R * 0.86, -R * 0.33, R * 0.46, R * 0.66, R * 0.1), '#c98a1c', lw, { R: R * 0.4, cx: R * 1.08, cy: 0, hi: false });
    solid(c, (c) => rrect(c, R * 0.4, -R * 0.25, R * 0.56, R * 0.5, R * 0.08), '#dba225', lw, { R: R * 0.36, cx: R * 0.66, cy: 0, hi: false });
    solid(c, (c) => rrect(c, -R * 0.2, -R * 0.18, R * 0.7, R * 0.36, R * 0.08), BRASS, lw, { R: R * 0.4, cx: R * 0.12, cy: 0 });
    ell(c, R * 1.33, 0, R * 0.09, R * 0.3); fill(c, '#c9efff'); line(c, lw * 0.8);
    c.restore();
    ball(c, R * 0.6, R * 0.36, R * 0.2, light(col, 0.2), lw);
    c.save(); c.rotate(-0.08);
    solid(c, (c) => { c.beginPath(); c.arc(0, -R * 0.44, R * 0.88, PI, TAU); c.closePath(); }, tan, lw, { R: R * 0.85, cy: -R * 0.85, in: (c) => { c.fillStyle = COL.I; c.fillRect(-R, -R * 0.7, R * 2, R * 0.2); } });
    rrect(c, -R * 1.16, -R * 0.58, R * 2.36, R * 0.27, R * 0.12); fill(c, tan); line(c, lw);
    if (o.crown) crown(c, 0, -R * 1.24, R * 0.6, lw * 0.72, 0); else { circ(c, 0, -R * 1.34, R * 0.11); fill(c, tan); line(c, lw * 0.8); }
    c.restore();
  };
  /* the zealot's banner, painted with its hoist (pole side) at (0,0) and the cloth trailing to the LEFT */
  function cloth(c, R, lw) {
    const w = R * 1.08, h = R * 0.84;
    solid(c, (c) => { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-w * 0.5, -h * 0.12, -w, h * 0.06); c.lineTo(-w * 0.72, h * 0.5); c.lineTo(-w, h * 0.94); c.quadraticCurveTo(-w * 0.5, h * 0.82, 0, h); c.closePath(); }, CREAM, lw, { R: h * 0.9, cx: -w * 0.45, cy: h * 0.5, hi: false, dark: '#e0c79c' });
    const fx = -w * 0.44, fy = h * 0.5, fs = h * 0.3;
    c.beginPath(); c.moveTo(fx + fs * 0.1, fy - fs * 1.05); c.bezierCurveTo(fx + fs * 0.9, fy - fs * 0.3, fx + fs * 0.85, fy + fs * 0.8, fx, fy + fs * 0.8); c.bezierCurveTo(fx - fs * 0.85, fy + fs * 0.8, fx - fs * 0.8, fy, fx - fs * 0.3, fy - fs * 0.45); c.bezierCurveTo(fx - fs * 0.1, fy - fs * 0.2, fx + fs * 0.05, fy - fs * 0.6, fx + fs * 0.1, fy - fs * 1.05); c.closePath(); fill(c, COL.N); line(c, lw * 0.7);
  }
  MON.zealot = function (c, r, o) {
    const R = r * BODY, lw = LW(r), col = COL.N, fc = dark(col, 0.16);
    if (o.cloth) { c.save(); c.translate(-R * 0.99, -R * 1.78); cloth(c, R, lw); c.restore(); }
    seg(c, -R * 0.8, R * 0.84, -R * 1.0, -R * 1.86, R * 0.27); seg(c, -R * 0.8, R * 0.84, -R * 1.0, -R * 1.86, R * 0.13, '#c9a36a');
    circ(c, -R * 1.0, -R * 1.9, R * 0.14); fill(c, BRASS); line(c, lw * 0.8);
    feet(c, R, lw, '#5a1410');
    ball(c, 0, 0, R, col, lw);
    for (const s of [-1, 1]) { circ(c, s * R * 0.68, R * 0.3, R * 0.18); fill(c, 'rgba(160,20,10,.42)'); }
    const ey = -R * 0.1, gap = R * 0.37, er = R * 0.28;
    eyes(c, o, ey, gap, er, 0.3, 0.14, lw, 0.46); angry(c, ey, gap, er, lw * 1.45, 1.35);
    grit(c, R * 0.05, R * 0.5, R * 0.8, R * 0.3, lw, 4);
    if (o.crown) crown(c, -R * 0.02, -R * 0.9, R * 0.52, lw, -0.1);
    else solid(c, (c) => { c.beginPath(); c.moveTo(-R * 0.46, -R * 0.86); c.lineTo(-R * 0.36, -R * 1.42); c.lineTo(-R * 0.1, -R * 1.06); c.lineTo(R * 0.1, -R * 1.62); c.lineTo(R * 0.28, -R * 1.04); c.lineTo(R * 0.52, -R * 1.34); c.lineTo(R * 0.52, -R * 0.82); c.quadraticCurveTo(R * 0.02, -R * 1.06, -R * 0.46, -R * 0.86); c.closePath(); }, '#ff9a3c', lw, { R: R * 0.5, cy: -R * 1.1, hi: false, dark: '#f26a1b' });
    ball(c, -R * 0.86, R * 0.22, R * 0.25, fc, lw);
    ball(c, R * 1.0, R * 0.12, R * 0.27, fc, lw);
  };
  MON.patriot = function (c, r, o) {
    const R = r * BODY, lw = LW(r), col = light(COL.N, 0.14);
    for (const p of [[-1.56, -0.86], [-1.62, -0.34]]) { c.beginPath(); c.moveTo(-R * 0.86, -R * 0.52); c.quadraticCurveTo(-R * 1.2, -R * 0.4 + p[1] * R * 0.3, R * p[0], R * p[1]); line(c, R * 0.38); c.beginPath(); c.moveTo(-R * 0.86, -R * 0.52); c.quadraticCurveTo(-R * 1.2, -R * 0.4 + p[1] * R * 0.3, R * p[0], R * p[1]); line(c, R * 0.2, CREAM); }
    seg(c, R * 0.66, -R * 0.2, R * 0.98, -R * 0.74, R * 0.4); seg(c, R * 0.66, -R * 0.2, R * 0.98, -R * 0.74, R * 0.22, dark(col, 0.14));
    feet(c, R, lw, '#5a1410');
    solid(c, (c) => circ(c, 0, 0, R), col, lw, { R, in: (c) => { c.fillStyle = CREAM; c.fillRect(-R * 1.1, -R * 0.74, R * 2.2, R * 0.34); c.beginPath(); c.moveTo(-R * 1.1, -R * 0.74); c.lineTo(R * 1.1, -R * 0.74); c.moveTo(-R * 1.1, -R * 0.4); c.lineTo(R * 1.1, -R * 0.4); line(c, lw * 0.7); } });
    circ(c, -R * 0.9, -R * 0.54, R * 0.16); fill(c, CREAM); line(c, lw * 0.8);
    const ey = R * 0.0, gap = R * 0.36, er = R * 0.27;
    eyes(c, o, ey, gap, er, 0.28, 0.12, lw, 0.5); angry(c, ey, gap, er, lw * 1.2, 1.0);
    shout(c, R * 0.06, R * 0.58, R * 0.25, R * 0.2, lw, false);
    ball(c, R * 1.02, -R * 0.82, R * 0.26, dark(col, 0.1), lw);
    if (o.crown) crown(c, 0, -R * 0.9, R * 0.6, lw * 0.72, -0.08);
  };
  MON.spark = function (c, r, o) {
    const R = r * BODY, lw = Math.max(1.4, r * 0.15);
    if (!o.bare) { const gl = c.createRadialGradient(0, R * 0.1, R * 0.4, 0, R * 0.1, R * 2.4); gl.addColorStop(0, 'rgba(255,170,40,.5)'); gl.addColorStop(1, 'rgba(255,150,30,0)'); circ(c, 0, R * 0.1, R * 2.4); fill(c, gl); }
    const fp = (c) => { c.beginPath(); c.moveTo(R * 0.14, -R * 1.86); c.bezierCurveTo(R * 0.24, -R * 1.2, R * 1.1, -R * 0.76, R * 1.03, R * 0.16); c.bezierCurveTo(R * 0.98, R * 0.86, R * 0.46, R * 1.12, 0, R * 1.12); c.bezierCurveTo(-R * 0.5, R * 1.12, -R * 1.03, R * 0.86, -R * 1.03, R * 0.2); c.bezierCurveTo(-R * 1.03, -R * 0.44, -R * 0.52, -R * 0.64, -R * 0.44, -R * 1.16); c.bezierCurveTo(-R * 0.2, -R * 0.9, R * 0.06, -R * 1.3, R * 0.14, -R * 1.86); c.closePath(); };
    const gr = c.createRadialGradient(0, R * 0.4, R * 0.1, 0, R * 0.2, R * 1.5); gr.addColorStop(0, '#fff6b0'); gr.addColorStop(0.42, '#ffc533'); gr.addColorStop(1, '#ff6e1a');
    fp(c); fill(c, gr);
    c.save(); fp(c); c.clip(); c.translate(R * 0.02, R * 0.46); c.scale(0.56, 0.56); fp(c); fill(c, 'rgba(255,250,205,.82)'); c.restore();
    fp(c); line(c, lw);
    const ey = R * 0.3, gap = R * 0.35;
    if (o.blink) { lid(c, -gap, ey, R * 0.2, lw * 0.9); lid(c, gap, ey, R * 0.2, lw * 0.9); }
    else for (const s of [-1, 1]) { ell(c, s * gap + R * 0.05, ey, R * 0.15, R * 0.21); fill(c, OUT); circ(c, s * gap, ey - R * 0.08, R * 0.065); fill(c, '#ffffff'); }
    curve(c, R * 0.06, R * 0.66, R * 0.17, R * 0.12, lw * 0.9);
    if (!o.bare) { circ(c, -R * 1.0, -R * 1.18, R * 0.11); fill(c, '#ffd66b'); circ(c, R * 0.92, -R * 1.46, R * 0.08); fill(c, '#fff3a8'); }
    if (o.crown) crown(c, R * 0.1, -R * 1.62, R * 0.62, lw * 0.72, 0.06);
  };
  /* unknown type: a plain blob in its cause colour, so a new monster never draws as nothing */
  MON._blob = function (c, r, o, key) {
    const R = r * BODY, lw = LW(r);
    feet(c, R, lw, '#1b232c'); ball(c, 0, 0, R, keyCol(key), lw);
    eyes(c, o, -R * 0.05, R * 0.37, R * 0.28, 0.28, 0.1, lw); angry(c, -R * 0.05, R * 0.37, R * 0.28, lw * 1.1, 0.8);
    curve(c, R * 0.05, R * 0.5, R * 0.2, -R * 0.06, lw);
    if (o.crown) crown(c, 0, -R * 0.9, R * 0.5, lw, -0.08);
  };

  /* ---------- per-type tables ---------- */
  /* canvas half-extent in r · sprite resolution boost · animation {style 0 hop / 1 bob / 2 flame, hz, hop, squash, sway, float} · alt pose */
  const EXT = { recruit: 2.5, brute: 2.55, gunboat: 2.6, link: 2.4, envoy: 2.65, grabber: 2.6, scout: 2.5, zealot: 2.95, patriot: 2.5, spark: 2.9 };
  const BOOST = { grabber: 1.35 };
  const ANIM = {
    recruit: [0, 2.7, 0.24, 0.1, 0.07, 0], brute: [0, 1.55, 0.09, 0.07, 0.05, 0], gunboat: [1, 0.85, 0.07, 0.03, 0.07, 0.08],
    link: [0, 2.2, 0.26, 0.11, 0.06, 0], envoy: [0, 3.1, 0.2, 0.09, 0.08, 0], grabber: [0, 1.9, 0.16, 0.13, 0.05, 0],
    scout: [0, 3.0, 0.24, 0.1, 0.07, 0], zealot: [0, 2.6, 0.24, 0.1, 0.08, 0], patriot: [0, 3.2, 0.28, 0.1, 0.09, 0],
    spark: [2, 1.6, 0.14, 0.09, 0.1, 0.32], _: [0, 2.4, 0.2, 0.1, 0.06, 0],
  };
  const ALT = { link: 'rage', grabber: 'loot' };

  /* ---------- sprite cache ---------- */
  function canvas(px) { const cv = document.createElement('canvas'); cv.width = cv.height = px; return cv; }
  function tint(src, col) { const w = canvas(src.width), x = w.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, w.width, w.height); return w; }
  function paint(r, ext, res, fn) {
    const half = r * ext, px = Math.ceil(half * 2 * res), cv = canvas(px), c = cv.getContext('2d');
    c.scale(res, res); c.translate(half, half); c.lineJoin = 'round'; c.lineCap = 'round'; fn(c);
    return { img: cv, flash: null, cool: null, half };
  }
  const SETS = {};
  function setOf(type) {
    let S = SETS[type]; if (S !== undefined) return S;
    const def = PK.ENEMIES && PK.ENEMIES[type], r = (def && def.r) || 10, fn = MON[type], key = (def && def.key) || 'X';
    const a = ANIM[type] || ANIM._;
    S = { type, key, r, foot: r * BODY, ext: EXT[type] || 2.5, res: RES * (BOOST[type] || 1), alt: ALT[type] || null, zeal: type === 'zealot', halo: type === 'spark',
      style: a[0], hz: a[1], hop: a[2], sq: a[3], sway: a[4], flt: a[5], v: {}, cloth: null,
      fn: fn ? fn : (c, rr, o) => MON._blob(c, rr, o, key) };
    return (SETS[type] = S);
  }
  /* variants: n normal · b blink · a alt (rage / loot) · f zealot with banner baked in · e ea ef = the same, elite */
  function make(S, name) {
    const elite = name.charCodeAt(0) === 101, o = { blink: name === 'b', rage: S.alt === 'rage' && (name === 'a' || name === 'ea'), loot: S.alt === 'loot' && (name === 'a' || name === 'ea'), cloth: name === 'f' || name === 'ef', crown: elite };
    const bare = S.halo ? Object.assign({ bare: true }, o) : null;
    let V;
    if (!elite) { V = paint(S.r, S.ext, S.res, (c) => S.fn(c, S.r, o)); V.flash = flashOf(V.img); }
    else {
      /* elite: a little sharper (it is drawn 1.55x bigger), crowned, with a brass rim and a faint brass halo that follow the
         silhouette. The rim is grown at half resolution (it sits under the crisp body), which keeps this cheap to build. */
      const res = S.res * 1.3, ext = S.ext + 0.55, B = paint(S.r, ext, res, (c) => S.fn(c, S.r, o)), sil = bare ? paint(S.r, ext, res, (c) => S.fn(c, S.r, bare)).img : B.img;
      const W = B.img.width, hw = Math.ceil(W / 2), small = canvas(hw), q = small.getContext('2d'), rim = tint(sil, BRASS), d = LW(S.r) * res * 0.39;
      q.globalAlpha = 0.1; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; q.drawImage(rim, Math.cos(a) * d * 2.5, Math.sin(a) * d * 2.5, W / 2, W / 2); }
      q.globalAlpha = 1; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; q.drawImage(rim, Math.cos(a) * d, Math.sin(a) * d, W / 2, W / 2); }
      const out = canvas(W), x = out.getContext('2d'); x.drawImage(small, 0, 0, hw * 2, hw * 2); x.drawImage(B.img, 0, 0);
      V = { img: out, flash: flashOf(out), cool: null, half: B.half };
    }
    return (S.v[name] = V);
  }
  function clothOf(S) {
    if (S.cloth) return S.cloth;
    const R = S.r * BODY, w = R * 1.35, h = R * 1.2, res = S.res, cv = document.createElement('canvas');
    cv.width = Math.ceil(w * res); cv.height = Math.ceil(h * res);
    const c = cv.getContext('2d'); c.scale(res, res); c.translate(w - R * 0.1, R * 0.12); c.lineJoin = 'round'; c.lineCap = 'round'; cloth(c, R, LW(S.r));
    return (S.cloth = { img: cv, flash: flashOf(cv), cool: null, w, h, ox: w - R * 0.1, oy: R * 0.12, ax: -R * 0.99, ay: -R * 1.78 });
  }
  /* Hit flash: the same painting with its colours pushed most of the way to white, while the dark outline, pupils and
     mouth stay dark, so a monster that is hit still has its face (never a flat white cut-out). Built once per sprite. */
  const FLASH = 0.6;
  function flashOf(src) {
    const w = src.width, h = src.height, tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    const x = tmp.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0);
    let im = null; try { im = x.getImageData(0, 0, w, h); } catch (err) { im = null; }
    if (!im) return wash(src, '#ffffff', 0.42);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2]; let k = ((r * 0.3 + g * 0.59 + b * 0.11) / 255 - 0.1) / 0.2;
      if (k <= 0) continue; k = (k >= 1 ? 1 : k * k * (3 - 2 * k)) * FLASH;
      d[i] = r + (255 - r) * k; d[i + 1] = g + (255 - g) * k; d[i + 2] = b + (255 - b) * k;
    }
    x.putImageData(im, 0, 0);
    const out = document.createElement('canvas'); out.width = w; out.height = h; out.getContext('2d').drawImage(tmp, 0, 0); return out;
  }
  /* a flat colour wash over the painted pixels only */
  function wash(src, col, a) { const o = document.createElement('canvas'); o.width = src.width; o.height = src.height; const x = o.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = a; x.fillStyle = col; x.fillRect(0, 0, o.width, o.height); return o; }
  /* Slowed: nothing but a very subtle cool tint (the Neutral Zone slows dozens of monsters at once). */
  function coolOf(V) { return V.cool || (V.cool = wash(V.img, '#7fc4ff', 0.15)); }

  /* ---------- small shared sprites ---------- */
  const SH = {};
  function bang() {                              /* the "!" an ally shouts when its squad is attacked */
    if (SH.bang) return SH.bang; const cv = canvas(72), c = cv.getContext('2d'); c.scale(3, 3); c.translate(12, 12); c.lineJoin = 'round';
    circ(c, 0, 0, 9.4); fill(c, '#ff4433'); line(c, 2.2);
    c.beginPath(); c.ellipse(-3.2, -4.4, 3, 1.5, -0.6, 0, TAU); fill(c, 'rgba(255,255,255,.45)');
    rrect(c, -1.9, -6.2, 3.8, 7.4, 1.6); fill(c, '#ffffff'); circ(c, 0, 4.4, 2.1); fill(c, '#ffffff');
    return (SH.bang = cv);
  }
  function streak() {                            /* speed lines behind a charging zealot: painted trailing to the LEFT of x = 96 */
    if (SH.streak) return SH.streak; const cv = canvas(96), c = cv.getContext('2d'); c.lineCap = 'round';
    const g = c.createLinearGradient(0, 0, 96, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,238,220,.92)');
    c.strokeStyle = g; for (const q of [[20, 22, 8], [2, 48, 11], [28, 74, 8]]) { c.lineWidth = q[2]; c.beginPath(); c.moveTo(q[0] + 6, q[1]); c.lineTo(88, q[1]); c.stroke(); }
    return (SH.streak = cv);
  }
  function pow(key) {                            /* small comic pop in the monster's cause colour (no white) */
    const id = 'pow' + key; if (SH[id]) return SH[id]; const cv = canvas(132), c = cv.getContext('2d'), col = light(keyCol(key), 0.12); c.translate(66, 66); c.lineJoin = 'round';
    const burst = (R0, R1, n) => { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU - PI / 2, rad = i % 2 ? R1 : R0; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad); } c.closePath(); };
    burst(58, 37, 8); fill(c, col); line(c, 5);
    burst(31, 18, 8); fill(c, light(col, 0.4));
    return (SH[id] = cv);
  }
  function bit(key) {                            /* little cause-coloured bead that flies out of the pop */
    const id = 'bit' + key; if (SH[id]) return SH[id]; const cv = canvas(36), c = cv.getContext('2d'); c.translate(18, 18);
    circ(c, 0, 0, 13); fill(c, keyCol(key)); line(c, 4.2); circ(c, -4, -4.5, 4); fill(c, 'rgba(255,255,255,.6)');
    return (SH[id] = cv);
  }
  function star(key) {                           /* four-point twinkle */
    const id = 'star' + key; if (SH[id]) return SH[id]; const cv = canvas(60), c = cv.getContext('2d'), col = key === 'E' ? '#ffe9a6' : light(keyCol(key), 0.35); c.translate(30, 30); c.lineJoin = 'round';
    c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU - PI / 2, rad = i % 2 ? 7 : 25; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad); } c.closePath();
    fill(c, col); line(c, 4); circ(c, 0, 0, 5); fill(c, '#ffffff');
    return (SH[id] = cv);
  }

  /* ================= draw one monster ================= */
  const CALLED = new WeakMap();                  /* ally -> moment its squad was called in (the "!" pops once, then goes) */
  function draw(c, e, t, g) {
    const S = setOf(e.type), sd = e.seed || 0, r = e.r || S.r, k = r / S.r, face = e.face < 0 ? -1 : 1, st = e.st;
    const rage = !!e.rage, flash = e.flash > 0, elite = !!e.elite;
    /* pop-in during the first quarter second */
    let pop = 1;
    if (g && e.born !== undefined) { const age = g.t - e.born; if (age >= 0 && age < 0.25) { const f = age * 4 - 1; pop = Math.max(0.06, 1 + 2.3 * f * f * f + 1.3 * f * f); } }
    /* zealot charging: speed streaks along the true heading, body stretched and tipped into the charge */
    if (S.zeal && st === 'dash') {
      const a = Math.atan2(e.dy || 0, e.dx || face), dir = Math.cos(a) < 0 ? -1 : 1, nm = elite ? 'ef' : 'f', V = S.v[nm] || make(S, nm), L = S.r * 2.7 * k, W = S.r * 2.3 * k;
      let tilt = dir > 0 ? a : a - PI; if (tilt > PI) tilt -= TAU; if (tilt < -PI) tilt += TAU; tilt = Math.max(-0.75, Math.min(0.75, tilt));
      const ca = Math.cos(a), sa = Math.sin(a);
      c.save(); c.globalAlpha = 0.8; c.transform(ca, sa, -sa, ca, e.x, e.y); c.drawImage(streak(), -S.r * 0.5 * k - L, -W * 0.5, L, W); c.restore();
      const ct = Math.cos(tilt), sn = Math.sin(tilt), ax = dir * 1.26 * k * pop, ay = 0.82 * k * pop;
      c.save(); c.transform(ct * ax, sn * ax, -sn * ay, ct * ay, e.x, e.y); c.drawImage(flash ? V.flash : e.slowed ? coolOf(V) : V.img, -V.half, -V.half, V.half * 2, V.half * 2); c.restore();
      return;
    }
    /* which painting */
    const alt = S.alt !== null && ((rage && S.alt === 'rage') || (e.loot > 0 && S.alt === 'loot'));
    let name;
    if (elite) name = alt ? 'ea' : 'e';
    else if (alt) name = 'a';
    else { const b = t * 0.31 + sd * 1.31; name = b - Math.floor(b) < 0.034 ? 'b' : 'n'; }
    /* motion: hop / bob / flicker */
    const cyc = t * S.hz * (e.slowed ? 0.6 : 1) * (rage ? 1.5 : 1) + sd * 0.37, u = cyc - Math.floor(cyc);
    let lift, sx, sy, rot, lean = rage ? 0.16 : 0, jit = 0, wave = S.zeal;
    if (S.style === 0) { const arc = Math.sin(PI * u), q = arc - 0.42; lift = S.hop * arc * r; sy = 1 + S.sq * q; sx = 1 - S.sq * 0.75 * q; rot = S.sway * Math.sin(PI * cyc); }
    else if (S.style === 1) { const w = Math.sin(TAU * u); lift = (S.flt + S.hop * w) * r; sy = 1 + S.sq * w; sx = 1 - S.sq * 0.5 * w; rot = S.sway * Math.sin(TAU * u + 1.1); }
    else { const fl = Math.sin(t * 15 + sd * 3.1); lift = (S.flt + S.hop * Math.sin(TAU * u)) * r; sy = 1 + S.sq * fl; sx = 1 - S.sq * 0.7 * fl; rot = S.sway * Math.sin(t * 9.3 + sd * 1.7); }
    if (S.zeal && st === 'aim') { lift = 0; sy = 0.9; sx = 1.08; rot = 0; lean = -0.34; jit = Math.sin(t * 70 + sd) * 0.9; name = elite ? 'ef' : 'f'; wave = false; }
    const V = S.v[name] || make(S, name);
    const ro = rot + lean * face, cs = Math.cos(ro), sn = Math.sin(ro), ax = face * sx * k * pop, ay = sy * k * pop;
    c.save();
    c.transform(cs * ax, sn * ax, -sn * ay, cs * ay, e.x + jit, e.y + r * BODY - lift);
    if (wave) {                                  /* the banner waves on its own behind the body */
      const C = clothOf(S), w = 1 + 0.14 * Math.sin(t * 9 + sd * 2);
      c.save(); c.translate(C.ax, C.ay - S.foot); c.rotate(0.1 * Math.sin(t * 6.2 + sd)); c.scale(w, 2 - w);
      c.drawImage(flash ? C.flash : e.slowed ? coolOf(C) : C.img, -C.ox, -C.oy, C.w, C.h); c.restore();
    }
    c.drawImage(flash ? V.flash : e.slowed ? coolOf(V) : V.img, -V.half, -V.half - S.foot, V.half * 2, V.half * 2);
    c.restore();
    if (rage) {                                  /* a bold "!" pops for a moment when the squad is called in */
      let t0 = CALLED.get(e); if (t0 === undefined) { t0 = t; CALLED.set(e, t0); }
      const a = t - t0;
      if (a < 0.85) {
        const pp = a < 0.12 ? 0.55 + (a / 0.12) * 0.75 : a < 0.22 ? 1.3 - ((a - 0.12) / 0.1) * 0.3 : 1, bs = r * 1.15 * pp;
        if (a > 0.65) c.globalAlpha = 1 - (a - 0.65) / 0.2;
        c.drawImage(bang(), e.x - bs * 0.5 + face * r * 0.15, e.y - r * 1.36 - lift - bs, bs, bs); c.globalAlpha = 1;
      }
    } else if (S.alt === 'rage' && CALLED.has(e)) CALLED.delete(e);
    if (elite) {                                 /* a slow twinkle off the crown */
      const w = Math.sin(t * 2.4 + sd * 2); if (w > 0.25) { const ts = r * 0.95 * (w - 0.25) * 1.33; c.drawImage(star('E'), e.x + face * r * 0.62 - ts * 0.5, e.y - r * 1.95 - lift - ts * 0.5, ts, ts); }
    }
  }

  /* ================= death pop (0.3 s, small): the monster squashes flat and shrinks away in its own colours with one
     blink of light, a small cause-coloured pop, three beads. Never a white silhouette. ================= */
  function corpse(c, d, t, g) {
    const T = Math.min(d.life || 0.34, 0.3), f = (d.t || 0) / T; if (!(f >= 0 && f < 1)) return;
    const S = setOf(d.type), r = d.r || S.r, face = d.face < 0 ? -1 : 1, sd = d.seed || 0, key = d.key || S.key, big = d.elite ? 1.25 : 1;
    if (f < 0.6) {
      const nm = d.elite ? 'e' : 'n', V = S.v[nm] || make(S, nm), k = r / S.r; let sx, sy, al = 1;
      if (f < 0.2) { const q = f / 0.2; sx = 1 + 0.42 * q; sy = 1 - 0.46 * q; } else { const q = (f - 0.2) / 0.4, m = 1 - q; sx = 1.42 * m + 0.12 * q; sy = 0.54 * m * m + 0.04; al = m; }
      c.save(); c.globalAlpha = al; c.transform(face * sx * k, 0, 0, sy * k, d.x, d.y + r * BODY);
      c.drawImage(f < 0.16 ? V.flash : V.img, -V.half, -V.half - S.foot, V.half * 2, V.half * 2); c.restore();
    }
    if (f > 0.12) {
      const q = (f - 0.12) / 0.88, E = 1 - (1 - q) * (1 - q), s = r * (1.0 + 0.9 * E) * big;
      c.globalAlpha = q < 0.3 ? 0.92 : 0.92 * (1 - (q - 0.3) / 0.7); c.drawImage(pow(key), d.x - s * 0.5, d.y - r * 0.1 - s * 0.5, s, s);
    }
    if (f < 0.18) { c.globalAlpha = 1; return; }
    const E = 1 - (1 - f) * (1 - f), B = bit(key), n = d.elite ? 5 : 3, bs = r * (0.38 * (1 - f * f) + 0.05) * big;
    c.globalAlpha = Math.min(1, 2.6 * (1 - f));
    for (let i = 0; i < n; i++) { const a = sd * 2.4 + (i * TAU) / n + 0.5, dist = r * (0.45 + 1.1 * E) * big; c.drawImage(B, d.x + Math.cos(a) * dist - bs * 0.5, d.y + Math.sin(a) * dist * 0.8 - r * 0.2 + r * 0.7 * f * f - bs * 0.5, bs, bs); }
    c.globalAlpha = 1;
  }

  /* ================= alliance chains ================= */
  function trace(c, g, t, vis, hot) {
    const es = g.enemies; let n = 0; c.beginPath();
    for (let i = 0; i < es.length; i++) {
      const e = es[i], m = e.buddy; if (!m || !!e.rage !== hot || !(e.hp > 0) || !(m.hp > 0) || e.dead || m.dead || !vis(e.x, e.y, 80)) continue;
      const x1 = e.x, y1 = e.y + e.r * 0.42, x2 = m.x, y2 = m.y + m.r * 0.42, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
      c.moveTo(x1, y1);
      if (hot) { const j = Math.sin(t * 46 + (e.seed || 0) * 9) * 1.7; c.quadraticCurveTo((x1 + x2) / 2 - (dy / L) * j, (y1 + y2) / 2 + (dx / L) * j, x2, y2); }
      else c.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + Math.min(18, L * 0.22), x2, y2);
      n++;
    }
    return n;
  }
  function links(c, g, t, vis) {
    if (!g || !g.enemies) return;
    if (typeof vis !== 'function') vis = () => true;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (let hot = 0; hot < 2; hot++) {
      if (!trace(c, g, t, vis, !!hot)) continue;
      const w = hot ? 1.15 : 1;
      c.setLineDash([5, 9]); c.lineDashOffset = 0; c.lineWidth = 5.8 * w; c.strokeStyle = OUT; c.stroke();
      c.lineWidth = 3.1 * w; c.strokeStyle = hot ? '#ff7a6b' : '#dcecff'; c.stroke();
      c.setLineDash([2.4, 11.6]); c.lineDashOffset = -1.3; c.lineWidth = 1.2; c.strokeStyle = hot ? '#7a1108' : '#35679e'; c.stroke();
    }
    c.setLineDash([]); c.restore();
  }

  ART.enemy = { draw, corpse, links };

  /* paint the sprites a few at a time after load, so the first wave (and the first elite) never hitches */
  (function warm() {
    if (typeof document === 'undefined' || !PK.ENEMIES) return;
    const todo = []; for (const type in EXT) todo.push([type, 'n'], [type, 'b']);
    todo.push(['link', 'a'], ['grabber', 'a'], ['zealot', 'f'], ['zealot', 'c'], ['brute', 'e'], ['link', 'e'], ['grabber', 'e'], ['zealot', 'e'], ['spark', 'e'], ['link', 'ea'], ['grabber', 'ea'], ['zealot', 'ef']);
    const step = () => {
      const job = todo.shift(); if (!job) { try { bang(); streak(); for (const k of ['M', 'A', 'I', 'N', 'S']) { pow(k); bit(k); } star('E'); } catch (e) {} return; }
      try { const S = setOf(job[0]); if (job[1] === 'c') clothOf(S); else if (!S.v[job[1]]) make(S, job[1]); } catch (e) {}
      later(step);
    };
    const later = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 120 }) : setTimeout(fn, 30));
    setTimeout(step, 250);
  })();
})();
