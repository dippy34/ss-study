/* art-icons.js — the game's icon set, drawn in code (no emoji, no image files).

   PK.icon(name, px)      -> a NEW <canvas class="pk-icon" aria-hidden="true">, CSS size px × px, sharp on hi-dpi.
   PK.iconURL(name, px)   -> PNG data URL of the same icon (the bitmap is px × devicePixelRatio; give it
                             `background-size: <px>px <px>px` or width/height when you use it in CSS / <img>).
   PK.iconCanvas(name, devicePx) -> the shared cached bitmap (read-only!) for blitting onto another canvas.
   PK.ICON_NAMES          -> every name that resolves (art + aliases). Unknown names give a neutral dot, never throw.

   Style: chunky sticker — thick #0a1118 outline, flat colour, one shade band (bottom-right), one small highlight
   (top-left), plus a faint pale rim so every icon stays legible on dark ink panels and on pale paper cards.
   Every icon is designed on a 24 × 24 grid and rendered once per (name, device size), then blitted. */
(function () {
  'use strict';
  const PK = (window.PK = window.PK || {});
  const TAU = Math.PI * 2, OUT = '#0a1118';
  const C = Object.assign({ M: '#a3b85e', A: '#4da8ff', I: '#b77dff', N: '#ff5e4f', S: '#ffa01f', X: '#8fa0ad', brass: '#f2bb3d', paper: '#f4e7c6' }, PK.COL || {});
  const BRASS = '#f2bb3d', BRASS_D = '#cf8f17', BRASS_L = '#ffd866', STEEL = '#a9bccb', STEEL_D = '#7b91a4', STEEL_L = '#dbe6ee',
    WOOD = '#b0733c', WOOD_L = '#d19a5a', RED = '#f0483e', GREEN = '#3fc27a', GREEN_D = '#2a9a5c', CREAM = '#fff6dd', PAPER = '#f4e7c6',
    ROPE = '#dcc592', SKIN = '#f1c9a2', INKY = '#3b4654';
  const MED = {
    M: { c: C.M, d: '#6f8238', ink: '#1c2408' }, A: { c: C.A, d: '#2a74c4', ink: '#04213f' }, I: { c: C.I, d: '#8250c9', ink: '#230a45' },
    N: { c: C.N, d: '#c53a2d', ink: '#3d0700' }, S: { c: C.S, d: '#c97408', ink: '#3d2200' }, X: { c: C.X, d: '#62737f', ink: '#101a22' },
  };

  /* ---------- drawing kit (all coordinates are 24-grid units) ---------- */
  let UI = '#fff6dd', UI_D = '#e2d3ac';        // fill + shade of the plain UI glyphs (arrows, play, pause, speaker…)
  let LW = 1.6, TH = 1, K = 1, SMALL = false;   // outline width, thin-detail width (units), device px per unit, tiny-size variant
  const f = (n) => Math.round(n * 100) / 100;
  function rgb(h) {
    if (h.charAt(0) === '#') { if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    const m = h.match(/[\d.]+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]];
  }
  function mix(h, to, t) { const a = rgb(h); return 'rgb(' + Math.round(a[0] + (to - a[0]) * t) + ',' + Math.round(a[1] + (to - a[1]) * t) + ',' + Math.round(a[2] + (to - a[2]) * t) + ')'; }
  const dk = (h, t) => mix(h, 0, t === undefined ? 0.28 : t), lt = (h, t) => mix(h, 255, t === undefined ? 0.4 : t);
  const circ = (x, y, r) => 'M' + f(x - r) + ' ' + f(y) + 'a' + r + ' ' + r + ' 0 1 0 ' + f(2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + f(-2 * r) + ' 0Z';
  const ell = (x, y, rx, ry) => 'M' + f(x - rx) + ' ' + f(y) + 'a' + rx + ' ' + ry + ' 0 1 0 ' + f(2 * rx) + ' 0a' + rx + ' ' + ry + ' 0 1 0 ' + f(-2 * rx) + ' 0Z';
  const rrect = (x, y, w, h, r) => 'M' + f(x + r) + ' ' + f(y) + 'h' + f(w - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r + 'v' + f(h - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + (-r) + ' ' + r + 'h' + f(2 * r - w) + 'a' + r + ' ' + r + ' 0 0 1 ' + (-r) + ' ' + (-r) + 'v' + f(2 * r - h) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + (-r) + 'Z';
  function star(cx, cy, R, r, n, rot) { let d = ''; for (let i = 0; i < n * 2; i++) { const a = (rot || 0) + i * Math.PI / n, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * q) + ' ' + f(cy + Math.sin(a) * q); } return d + 'Z'; }
  function gear(cx, cy, R, r, n) {
    let d = ''; const st = TAU / n, a = st * 0.2, b = st * 0.31;
    for (let i = 0; i < n; i++) { const t = i * st, pts = [[r, t - b], [R, t - a], [R, t + a], [r, t + b]]; for (const q of pts) d += (d ? 'L' : 'M') + f(cx + Math.cos(q[1]) * q[0]) + ' ' + f(cy + Math.sin(q[1]) * q[0]); }
    return d + 'Z';
  }
  /* outline stroke */
  function O(c, p, w) { c.strokeStyle = OUT; c.lineWidth = w || LW; c.stroke(typeof p === 'string' ? new Path2D(p) : p); }
  /* sticker shape: dark fill, base colour shifted up-left inside the clip (leaves the shade band bottom-right), outline.
     o = {s: shade size (0 = flat), dark: shade colour, line: false to skip the outline, lw} */
  function S(c, d, col, o) {
    o = o || {}; const p = typeof d === 'string' ? new Path2D(d) : d, s = o.s === undefined ? 1.2 : o.s;
    if (s > 0) {
      c.fillStyle = o.dark || dk(col); c.fill(p);
      const m = c.getTransform(), det = m.a * m.d - m.b * m.c || 1, v = -s * K;   // keep the light top-left even inside rotated parts
      c.save(); c.clip(p); c.translate((m.d * v - m.c * v) / det, (-m.b * v + m.a * v) / det); c.fillStyle = col; c.fill(p); c.restore();
    } else { c.fillStyle = col; c.fill(p); }
    if (o.line !== false) O(c, p, o.lw);
    return p;
  }
  /* flat fill, thin detail line, outlined line-art stroke, highlight blob */
  function F(c, d, col, a) { if (a !== undefined) c.globalAlpha = a; c.fillStyle = col; c.fill(new Path2D(d)); c.globalAlpha = 1; }
  function T(c, d, w, col) { c.strokeStyle = col || OUT; c.lineWidth = w; c.stroke(new Path2D(d)); }
  function L(c, d, col, w) { const p = new Path2D(d); c.strokeStyle = OUT; c.lineWidth = w + LW * 1.5; c.stroke(p); c.strokeStyle = col; c.lineWidth = w; c.stroke(p); }
  function hi(c, x, y, rx, ry, rot, a) { c.save(); c.translate(x, y); c.rotate(rot || 0); c.globalAlpha = a === undefined ? 0.6 : a; c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.fill(); c.restore(); }
  /* run fn in a moved / rotated / scaled frame; outline widths stay visually constant */
  function at(c, x, y, rot, sc, fn) { const lw = LW, th = TH; c.save(); c.translate(x, y); if (rot) c.rotate(rot); if (sc) { c.scale(sc, sc); LW = lw / sc; TH = th / sc; } fn(); c.restore(); LW = lw; TH = th; }
  function clipTo(c, p, fn) { c.save(); c.clip(typeof p === 'string' ? new Path2D(p) : p); fn(); c.restore(); }

  /* ---------- shared shapes ---------- */
  const HEART = 'M12 20.7C5.6 16.1 2.6 12.4 2.6 8.5C2.6 5.4 4.9 3.2 7.6 3.2C9.5 3.2 11.1 4.2 12 5.9C12.9 4.2 14.5 3.2 16.4 3.2C19.1 3.2 21.4 5.4 21.4 8.5C21.4 12.4 18.4 16.1 12 20.7Z';
  const BOLT = 'M13.9 2.3L5.1 13.4H10.9L9 21.7L18.9 9.9H12.9Z';
  const SHIELD = 'M12 2.5L20.3 5.2V11.2C20.3 16 16.9 19.7 12 21.7C7.1 19.7 3.7 16 3.7 11.2V5.2Z';
  const FLAME = 'M12.2 2.2C13.2 6 18.8 8.8 18.8 14.2C18.8 18.4 15.8 21.6 12 21.6C8.2 21.6 5.2 18.4 5.2 14.2C5.2 11.6 6.6 9.9 7.9 8.2C8.4 10.2 9.2 11 10.3 11.4C9.9 7.8 10.9 4.6 12.2 2.2Z';
  const SPEAKER = 'M2.8 9.3H6.9L12.3 4.5V19.5L6.9 14.7H2.8Z';
  const LET = {
    M: 'M0 10V8.1H0.9V1.9H0V0H3.5L5 3.9L6.5 0H10V1.9H9.1V8.1H10V10H6.1V8.1H6.9V4.3L5.6 7.7H4.4L3.1 4.3V8.1H3.9V10Z',
    A: 'M0 10V8.1H0.8L3.3 0H6.7L9.2 8.1H10V10H6V8.1H6.6L6.3 7H3.7L3.4 8.1H4V10Z',
    I: 'M2.4 0H7.6V2H6.4V8H7.6V10H2.4V8H3.6V2H2.4Z',
    N: 'M0 10V8.1H0.9V1.9H0V0H3.4L6.9 5.6V1.9H6.1V0H10V1.9H9.1V10H6.6L3.1 4.4V8.1H3.9V10Z',
    X: 'M0 0H4.1V1.7H3.5L5 3.6L6.5 1.7H5.9V0H10V1.7H9.2L6.5 5L9.2 8.3H10V10H5.9V8.3H6.5L5 6.4L3.5 8.3H4.1V10H0V8.3H0.8L3.5 5L0.8 1.7H0Z',
  };
  function spark(c, x, y, R) { S(c, star(x, y, R, R * 0.45, 8, 0.2), C.S, { s: 0, lw: TH * 1.3 }); F(c, star(x, y, R * 0.5, R * 0.22, 8, 0.6), '#fff3a8'); }
  function heart(c, col) { S(c, HEART, col || RED); hi(c, 7.5, 7.6, 2.3, 1.35, -0.7); }
  function coinCyl(c, cx, cy) {
    const rx = 6.9, ry = 2.8, h = 2.6;
    S(c, 'M' + f(cx - rx) + ' ' + cy + 'A' + rx + ' ' + ry + ' 0 0 1 ' + f(cx + rx) + ' ' + cy + 'V' + f(cy + h) + 'A' + rx + ' ' + ry + ' 0 0 1 ' + f(cx - rx) + ' ' + f(cy + h) + 'Z', BRASS_D, { s: 0 });
    S(c, ell(cx, cy, rx, ry), BRASS_L, { s: 0.7, dark: BRASS });
  }
  function bookSide(c, x, y, w, h, col) {
    const p = S(c, rrect(x, y, w, h, 1.1), col, { line: false, s: 0.8 });
    F(c, 'M' + f(x + 3.4) + ' ' + f(y + 1.3) + 'H' + f(x + w + 0.2) + 'V' + f(y + h - 1.3) + 'H' + f(x + 3.4) + 'Z', CREAM);
    T(c, 'M' + f(x + 4.4) + ' ' + f(y + h / 2) + 'H' + f(x + w - 0.6), TH * 0.8, '#c9b98f');
    O(c, p);
  }
  function medalDisc(c, k) {
    const m = MED[k];
    if (SMALL) {   /* under 20 px: drop the ribbon so the letter can be as big as possible */
      S(c, circ(12, 12, 9.7), m.c);
      if (k === 'S') at(c, 12, 12.1, 0.08, 0.68, () => { c.translate(-12, -12); F(c, BOLT, m.ink); });
      else at(c, 12, 12, 0, 1.12, () => { c.translate(-5, -5); F(c, LET[k], m.ink); if (k === 'A') F(c, 'M4.2 5.3L5 2.6L5.8 5.3Z', m.c); });
      return;
    }
    S(c, 'M7 13.2L5 21.3L8.6 19.7L10.9 21.9L12.5 14.8Z', m.d, { s: 0.6, dark: dk(m.d, 0.25) });
    S(c, 'M17 13.2L19 21.3L15.4 19.7L13.1 21.9L11.5 14.8Z', m.d, { s: 0.6, dark: dk(m.d, 0.25) });
    S(c, circ(12, 10.1, 8.4), m.c);
    T(c, circ(12, 10.1, 6.5), TH * 0.75, lt(m.c, 0.5));
    if (k === 'S') at(c, 12, 10.2, 0.08, 0.56, () => { c.translate(-12, -12); F(c, BOLT, m.ink); });
    else at(c, 12, 10.2, 0, 0.86, () => { c.translate(-5, -5); F(c, LET[k], m.ink); if (k === 'A') F(c, 'M4.2 5.3L5 2.6L5.8 5.3Z', m.c); });
    hi(c, 7.6, 5.6, 1.9, 1, -0.7, 0.5);
  }

  /* ---------- the icons ---------- */
  const DRAW = {
    dot(c) { S(c, circ(12, 12, 3.8), C.X, { s: 0.7 }); },

    /* weapons */
    blaster(c) {
      { const r = new Path2D('M12 2.3V2.9M5 4.9L5.5 5.4M19 4.9L18.5 5.4M2.6 11.2H3.2M21.4 11.2H20.8'); c.strokeStyle = OUT; c.lineWidth = 1.1 + LW; c.stroke(r); c.strokeStyle = BRASS_L; c.lineWidth = 1.1; c.stroke(r); }
      S(c, 'M12 5C8.6 5 6.1 7.5 6.1 10.7C6.1 12.7 7.1 14 8.2 15.3C8.9 16 9.2 16.7 9.2 17.5H14.8C14.8 16.7 15.1 16 15.8 15.3C16.9 14 17.9 12.7 17.9 10.7C17.9 7.5 15.4 5 12 5Z', '#ffdc4a', { dark: '#f0a81f' });
      T(c, 'M10.3 11.6L11.2 13.9L12 12L12.8 13.9L13.7 11.6', TH * 0.9, '#c97408');
      S(c, 'M9.2 17.5H14.8V19.7C14.8 20.9 13.9 21.8 12.8 21.8H11.2C10.1 21.8 9.2 20.9 9.2 19.7Z', STEEL, { s: 0.6, dark: STEEL_D });
      T(c, 'M9.5 19.5H14.5', TH * 0.8, OUT);
      hi(c, 9.3, 8.6, 1.1, 1.9, 0.5, 0.75);
    },
    cannon(c) {
      at(c, 10.6, 12.8, -0.7, 0, () => { S(c, rrect(0, -2.5, 10.4, 5, 1), STEEL, { dark: STEEL_D }); S(c, rrect(8.6, -3.2, 2.7, 6.4, 0.9), STEEL_D, { s: 0.6, dark: '#5d7184' }); });
      S(c, 'M3.4 19.2V15C3.4 11.9 6 9.9 9.2 9.9H12.4C15.6 9.9 17.8 12.1 17.8 15V19.2Z', C.M, { dark: '#74873c' });
      F(c, circ(7, 14.8, 0.85), '#5a6a2c'); F(c, circ(14.2, 14.8, 0.85), '#5a6a2c');
      S(c, rrect(2.2, 18.4, 17, 3.2, 0.9), '#7b8d42', { s: 0.6, dark: '#56652a' });
      hi(c, 7.4, 12, 1.8, 0.8, -0.4, 0.45);
    },
    orbs(c) {
      /* two chain-linked rings: each passes through the middle of the other, so the link reads even when tiny */
      const R = 5.7, W = 2.3, ring = (cx, col) => { c.beginPath(); c.arc(cx, 12, R, 0, TAU); c.strokeStyle = OUT; c.lineWidth = W + LW; c.stroke(); c.strokeStyle = col; c.lineWidth = W; c.stroke(); };
      ring(9.2, C.A); ring(14.8, '#a8d8ff');
      c.save(); c.beginPath(); c.rect(9.2, 0, 9, 12); c.clip(); ring(9.2, C.A); c.restore();   /* left ring goes OVER at the top crossing, UNDER at the bottom */
      c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 0.75; c.beginPath(); c.arc(9.2, 12, R, 3.5, 4.3); c.stroke(); c.beginPath(); c.arc(14.8, 12, R, 4.9, 5.6); c.stroke();
    },
    chain(c) {
      S(c, circ(4.9, 18.9, 2.8), C.A, { s: 0.8 }); S(c, circ(19.1, 5.1, 2.8), C.A, { s: 0.8 });
      at(c, 12, 12, 0.6, 0.84, () => { c.translate(-12, -12); S(c, BOLT, '#ffe45e', { dark: '#f3a91c' }); });
      hi(c, 4.1, 18, 0.8, 0.55, -0.6); hi(c, 18.3, 4.2, 0.8, 0.55, -0.6);
    },
    boomerang(c) {
      S(c, circ(7.6, 7.7, 4.9), '#58b4ff', { s: 0.9 });
      F(c, 'M5.3 5.4C6.6 4.4 8.3 4.9 8.7 6.2C9 7.2 7.9 7.7 7.7 8.7C7.5 9.7 6.1 9.8 5.4 8.8C4.7 7.8 4.5 6.3 5.3 5.4Z', '#57cf7c');
      F(c, 'M9.6 9.4C10.4 9 11.2 9.6 11 10.5C10.8 11.2 9.8 11.4 9.4 10.7C9.1 10.2 9.2 9.7 9.6 9.4Z', '#57cf7c');
      L(c, 'M5.3 18.5L14.3 14.7L18.7 5.5', C.I, 4.4);
      T(c, 'M7.3 16.5L13.2 14L16.6 7', 1, lt(C.I, 0.5));
      T(c, 'M5.6 16.9L6.5 19.2M17.3 5.1L19.7 6.2', 1.1, '#fff');
    },
    trail(c) {
      at(c, 9.8, 14, -0.62, 0, () => {
        const p = S(c, rrect(-8, -3.3, 15.4, 6.6, 1.2), '#e9463b', { line: false });
        clipTo(c, p, () => { F(c, 'M-5.7 -4H-3.7V4H-5.7Z', '#f6dfb3'); F(c, 'M3.1 -4H5.1V4H3.1Z', '#f6dfb3'); });
        O(c, p);
      });
      L(c, 'M15.8 9.7C17.4 8.8 16.6 6.8 18.2 6', ROPE, 1.4);
      spark(c, 19, 4.9, 3.1);
    },
    aura(c) {
      at(c, -0.7, 0.4, 0, 0, () => {
        S(c, 'M7.6 13.4L2.6 11.2L3.6 14.3L2.4 17L7.8 16.5Z', '#ffffff', { s: 0.8, dark: '#c9d6e2' });
        S(c, 'M6.8 14.2C7.8 11.4 11.5 10.3 14.9 11.3C16.6 11.8 17.6 11 18.4 10.2C19.6 9 21.3 9.6 21.5 11C21.6 11.8 21.1 12.6 20.3 12.9C19.7 15.9 16.9 18.7 12.7 18.7C9.5 18.7 7.2 16.9 6.8 14.2Z', '#ffffff', { dark: '#c9d6e2' });
        S(c, 'M9.5 12.6C8.2 8.4 10.2 4.5 14.7 2.8C15.3 6.2 14.8 9.9 12.7 12.8C11.7 13.6 10.3 13.4 9.5 12.6Z', '#ffffff', { s: 0.9, dark: '#c9d6e2' });
        S(c, 'M21.1 10L23.3 11.1L21.1 12.3Z', C.S, { s: 0, lw: TH * 1.1 });
        F(c, circ(19.6, 10.6, 0.85), OUT);
      });
    },
    press(c) {
      S(c, rrect(6.2, 2.7, 15.1, 15.2, 0.8), '#d6c69c', { s: 0 });
      S(c, rrect(2.7, 5.5, 15.5, 15.8, 0.8), PAPER, { dark: '#d8c594' });
      F(c, 'M4.7 7.7H16.2V10.2H4.7Z', INKY);
      F(c, rrect(4.7, 12, 4.9, 4.4, 0.4), '#8fb3cc');
      T(c, 'M11.2 12.5H16.2M11.2 14.2H16.2M11.2 15.9H16.2M4.7 18.1H16.2M4.7 19.6H12.8', TH * 0.85, '#7c6f5b');
    },

    /* boosts */
    power(c) {
      const sword = () => { S(c, 'M-1.8 3.2V-7.4L0 -11L1.8 -7.4V3.2Z', '#f1f6fa', { s: 0.9, dark: '#a3b8c9' }); S(c, rrect(-4.1, 2.9, 8.2, 2.2, 0.8), BRASS, { s: 0.5, dark: BRASS_D }); S(c, rrect(-1.2, 4.9, 2.4, 3.3, 0.5), WOOD, { s: 0.4 }); S(c, circ(0, 9.2, 1.45), BRASS, { s: 0.4, dark: BRASS_D }); };
      at(c, 12, 12.1, 0.77, 1.03, sword); at(c, 12, 12.1, -0.77, 1.03, sword);
    },
    haste(c) {
      at(c, 18.2, 6.6, 0.78, 0, () => S(c, rrect(-1.5, -2.6, 3, 3, 0.7), STEEL, { s: 0 }));
      S(c, rrect(10.2, 1.8, 3.6, 3.6, 0.9), STEEL, { s: 0.5, dark: STEEL_D });
      S(c, circ(12, 13.5, 8.2), STEEL, { dark: STEEL_D });
      S(c, circ(12, 13.5, 5.7), CREAM, { s: 0.7, dark: '#e2d3ac', lw: TH * 1.3 });
      T(c, 'M12 13.5L15 9.9', 1.5, RED); F(c, circ(12, 13.5, 1.05), OUT);
      hi(c, 6.9, 8.6, 1.6, 0.8, -0.7, 0.5);
    },
    boots(c) {
      S(c, 'M7.2 3.4H13.9V11.3C16.1 11.7 20.7 12.9 21.1 16.3V18.4H6.3V11.8C6.3 9 7.2 6.4 7.2 3.4Z', WOOD, { dark: '#844f24' });
      S(c, rrect(5.9, 2.5, 9.2, 3.3, 0.9), WOOD_L, { s: 0.5, dark: WOOD });
      S(c, rrect(5.3, 17.9, 16.6, 3.3, 1), '#5e4838', { s: 0.6, dark: '#3c2d22' });
      T(c, 'M11.6 8.3H13.7M11.6 10.5H13.7', TH, CREAM);
      hi(c, 8.9, 9, 0.8, 2, 0.1, 0.35);
    },
    magnet(c) {
      at(c, 12, 12.6, 0.5, 0.86, () => {
        const p = S(c, 'M-8 -8.6V1A8 8 0 0 0 8 1V-8.6H3V1A3 3 0 0 1 -3 1V-8.6Z', RED, { line: false });
        clipTo(c, p, () => { F(c, 'M-9 -9.6H-2V-4.6H-9Z', CREAM); F(c, 'M2 -9.6H9V-4.6H2Z', CREAM); });
        O(c, p); T(c, 'M-8 -4.6H-3M3 -4.6H8', TH, OUT);
      });
    },
    armor(c) {
      const p = S(c, SHIELD, '#8fb4d6', { line: false, dark: '#5f89b0' });
      clipTo(c, p, () => F(c, 'M0 0H12V24H0Z', '#ffffff', 0.22));
      O(c, p); T(c, 'M12 3.4V20.6', TH * 0.8, '#5f89b0');
      S(c, star(12, 11.3, 3.9, 1.75, 5, -Math.PI / 2), BRASS, { s: 0, lw: TH * 1.2 });
      hi(c, 7.4, 6.6, 1.7, 0.8, -0.5, 0.5);
    },
    heart(c) { heart(c); },
    regen(c) {
      L(c, 'M12 7.3C12 5.5 12.6 4.1 13.8 3', '#8a5a2b', 1.3);
      S(c, 'M13.3 5.3C14.5 3 17.2 2.6 19.1 3.6C18.1 5.7 15.6 6.5 13.3 5.3Z', GREEN, { s: 0.5, dark: GREEN_D });
      S(c, 'M12 7.4C10.4 6 7.2 5.8 5.4 8C3.2 10.8 4.2 15.9 6.8 18.9C8.2 20.7 10.2 21.3 12 20.3C13.8 21.3 15.8 20.7 17.2 18.9C19.8 15.9 20.8 10.8 18.6 8C16.8 5.8 13.6 6 12 7.4Z', '#ee4b3e', { dark: '#b92c26' });
      hi(c, 7.8, 10.4, 1.3, 2.1, 0.5);
    },
    luck(c) {
      L(c, 'M12.4 12C13.2 15.6 14.6 18.4 16.7 20.9', GREEN_D, 1.5);
      const leaf = 'M0 0C-5 -2.6 -6 -6 -3.6 -7.6C-2 -8.6 -0.6 -7.8 0 -6.4C0.6 -7.8 2 -8.6 3.6 -7.6C6 -6 5 -2.6 0 0Z';
      for (let i = 0; i < 4; i++) at(c, 12, 10.9, Math.PI / 4 + i * Math.PI / 2, 0.98, () => { S(c, leaf, '#49c97f', { dark: GREEN_D, s: 1 }); T(c, 'M0 -1.6V-5', TH * 0.7, GREEN_D); });
    },
    area(c) {
      S(c, 'M3 6.4L9 4.1V17.8L3 20.1Z', PAPER, { s: 0 }); S(c, 'M9 4.1L15 6.4V20.1L9 17.8Z', '#dcc893', { s: 0 }); S(c, 'M15 6.4L21 4.1V17.8L15 20.1Z', PAPER, { s: 0 });
      c.setLineDash([1.6, 1.5]); T(c, 'M5.2 16C7 13.6 9.6 14.8 11.6 13.2C13.4 11.8 14.6 11.4 16.6 9.6', TH * 1.25, RED); c.setLineDash([]);
      T(c, 'M16.5 6.8L19.5 9.8M19.5 6.8L16.5 9.8', TH * 1.5, RED);
      F(c, 'M4.6 9.2C5.4 8.2 6.8 8.4 7.2 9.4C7.5 10.4 6.6 11.2 5.6 11C4.8 10.8 4.2 10 4.6 9.2Z', '#8fc98a');
    },
    scholar(c) {
      bookSide(c, 3, 15.5, 17.8, 5.2, '#e9463b'); bookSide(c, 4.8, 10.3, 15.4, 5.2, C.A);
      at(c, 12, 7.6, -0.07, 0, () => bookSide(c, -8.4, -2.6, 16.4, 5.2, GREEN));
    },
    greed(c) {
      S(c, 'M8.2 7.8L6.6 3.5C8.5 4.4 10.2 2.8 12 3.6C13.8 2.8 15.5 4.4 17.4 3.5L15.8 7.8Z', '#e0b062', { s: 0.6, dark: '#b9843a' });
      S(c, 'M8.2 7.7C4.6 10.5 3.1 14.1 3.5 17.1C3.9 20.1 6.6 21.6 12 21.6C17.4 21.6 20.1 20.1 20.5 17.1C20.9 14.1 19.4 10.5 15.8 7.7Z', '#e0b062', { dark: '#b9843a' });
      L(c, 'M8.4 7.8H15.6', '#8a5a2b', 1.3);
      S(c, circ(12, 14.8, 3.5), BRASS_L, { s: 0.6, dark: BRASS, lw: TH * 1.3 });
      F(c, star(12, 14.9, 1.9, 0.85, 5, -Math.PI / 2), BRASS_D);
      hi(c, 7.4, 12.2, 1, 1.8, 0.5, 0.4);
    },

    /* mastery + misc */
    flame(c) {
      S(c, FLAME, '#ff8a1f', { dark: '#e2531a' });
      F(c, 'M12 11.8C12.8 13.8 15.1 14.8 15.1 17.2C15.1 19.2 13.7 20.5 12 20.5C10.3 20.5 8.9 19.2 8.9 17.2C8.9 15.6 10.1 14.6 10.7 13.4C11.1 14.2 11.6 13.4 12 11.8Z', '#ffe066');
    },
    house(c) {
      S(c, rrect(15.2, 3.6, 2.8, 5.6, 0.4), '#c9553d', { s: 0 });
      S(c, 'M5 10.2H19V20.8H5Z', '#fff0cf', { dark: '#e3cd9c' });
      S(c, rrect(10.1, 14.2, 3.8, 6.6, 0.6), WOOD, { s: 0.5, lw: TH * 1.3 });
      S(c, 'M1.9 11.9L12 2.6L22.1 11.9Z', '#ef5b45', { dark: '#c23c2c' });
    },
    target(c) {
      S(c, circ(12, 12, 9.5), RED, { dark: '#c22f28' }); S(c, circ(12, 12, 6.5), CREAM, { s: 0, lw: TH * 1.2 });
      S(c, circ(12, 12, 3.6), RED, { s: 0, lw: TH * 1.2 }); F(c, circ(12, 12, 1.2), CREAM);
    },
    heal(c) { heart(c); S(c, 'M10.5 6.7H13.5V9.1H15.9V12.1H13.5V14.5H10.5V12.1H8.1V9.1H10.5Z', '#ffffff', { s: 0, lw: TH * 1.1 }); },
    revives(c) {
      const wing = 'M0 0C-2.4 -3.2 -5.4 -4.4 -7.4 -4C-7.2 -2 -6.2 -0.8 -5 -0.2C-5.8 0.2 -6.2 0.9 -6 1.9C-4.8 2.5 -3.6 2.3 -2.6 1.9C-3 2.7 -2.8 3.6 -2.2 4.3C-0.9 3.9 0.2 2.9 0.6 1.6Z';
      at(c, 9.2, 11.6, 0, 0, () => S(c, wing, '#ffffff', { s: 0.7, dark: '#c9d6e2' }));
      c.save(); c.translate(14.8, 11.6); c.scale(-1, 1); S(c, wing, '#ffffff', { s: 0, dark: '#c9d6e2' }); c.restore();
      at(c, 12, 13.2, 0, 0.62, () => { c.translate(-12, -12); S(c, HEART, RED); hi(c, 7.5, 7.6, 2.3, 1.35, -0.7); });
    },
    coins(c) { coinCyl(c, 11.4, 15.9); coinCyl(c, 12.8, 11.9); coinCyl(c, 11.5, 7.9); hi(c, 8.4, 7, 1.7, 0.7, -0.2, 0.6); },
    coin(c) {
      S(c, circ(12, 12, 9.3), BRASS, { dark: BRASS_D }); T(c, circ(12, 12, 6.3), TH * 0.95, '#b47f10');
      F(c, star(12, 12.2, 3.7, 1.65, 5, -Math.PI / 2), '#c58a14'); hi(c, 7.9, 7.4, 2.3, 1.1, -0.7);
    },
    xp(c) {
      const g = 'M7.2 4H16.8L21.4 9.6L12 20.9L2.6 9.6Z';
      F(c, g, '#35bfe6'); F(c, 'M7.2 4H12L9 9.6H2.6Z', '#a5ecfa'); F(c, 'M12 4H16.8L21.4 9.6H15Z', '#62d3f0');
      F(c, 'M2.6 9.6H9L12 20.9Z', '#5fd0ee'); F(c, 'M15 9.6H21.4L12 20.9Z', '#1b8fb8');
      T(c, 'M2.6 9.6H21.4', TH * 0.8, '#157a9e'); O(c, g);
      F(c, star(8.3, 6.9, 1.7, 0.6, 4, 0), '#ffffff');
    },
    clock(c) {
      S(c, circ(12, 12, 9.4), BRASS, { dark: BRASS_D }); S(c, circ(12, 12, 6.7), CREAM, { s: 0.8, dark: '#e2d3ac', lw: TH * 1.3 });
      T(c, 'M12 12V7.6M12 12L15.3 13.7', 1.5, OUT); F(c, circ(12, 12, 1), OUT);
    },
    skull(c) {
      S(c, 'M12 2.7C6.6 2.7 3 6.4 3 11.2C3 13.9 4.2 16 6.2 17.3V19.7C6.2 20.6 6.9 21.3 7.8 21.3H16.2C17.1 21.3 17.8 20.6 17.8 19.7V17.3C19.8 16 21 13.9 21 11.2C21 6.4 17.4 2.7 12 2.7Z', '#f4f0e3', { dark: '#cfc7b0' });
      F(c, ell(8.5, 11.5, 2.2, 2.5), OUT); F(c, ell(15.5, 11.5, 2.2, 2.5), OUT); F(c, 'M12 13.9L10.9 16.1H13.1Z', OUT);
      T(c, 'M9.7 18.6V21.1M12 18.6V21.1M14.3 18.6V21.1', TH * 0.9, OUT);
    },
    star(c) { S(c, star(12, 12.7, 10, 4.5, 5, -Math.PI / 2), BRASS, { dark: BRASS_D }); hi(c, 9.2, 9.4, 1.5, 0.8, -0.6); },
    crown(c) {
      S(c, 'M3 17.4V7L7.9 11.5L12 4.2L16.1 11.5L21 7V17.4Z', BRASS, { dark: BRASS_D });
      S(c, rrect(3, 16.2, 18, 4.4, 0.9), '#e3a224', { s: 0.6, dark: '#b87d12' });
      F(c, circ(12, 18.4, 1.35), RED); F(c, circ(7, 18.4, 1), C.A); F(c, circ(17, 18.4, 1), C.A);
      hi(c, 6, 10.4, 0.7, 1.5, 0.3, 0.5);
    },
    chest(c) {
      S(c, rrect(3, 10.4, 18, 10.4, 1.4), WOOD, { dark: '#844f24' });
      S(c, 'M3 11.2V8.6C3 5.7 5 4 7.6 4H16.4C19 4 21 5.7 21 8.6V11.2Z', WOOD_L, { dark: WOOD });
      S(c, rrect(3, 10, 18, 2.1, 0.5), BRASS, { s: 0, lw: TH * 1.2 });
      S(c, rrect(9.9, 8.9, 4.2, 5.4, 0.9), BRASS_L, { s: 0.6, dark: BRASS, lw: TH * 1.3 });
      F(c, circ(12, 11, 0.95), OUT); F(c, 'M11.5 11.3H12.5L12.9 13.2H11.1Z', OUT);
      hi(c, 6.6, 6.4, 1.8, 0.7, -0.3, 0.45);
    },
    lock(c) {
      L(c, 'M7.6 11V8.1A4.4 4.4 0 0 1 16.4 8.1V11', STEEL, 2.3);
      S(c, rrect(3.8, 10.3, 16.4, 10.8, 2.2), BRASS, { dark: BRASS_D });
      F(c, circ(12, 14.6, 1.7), OUT); F(c, 'M11.1 15H12.9L13.4 18.1H10.6Z', OUT); hi(c, 6.8, 12.6, 1.6, 0.7, -0.3, 0.5);
    },
    check(c) { L(c, 'M5 12.7L9.8 17.5L19.4 6.9', '#3fc97f', 3.5); },
    cross(c) { L(c, 'M6.3 6.3L17.7 17.7M17.7 6.3L6.3 17.7', RED, 3.5); },
    gear(c) { S(c, gear(12, 12, 9.7, 7.1, 8), STEEL, { dark: STEEL_D }); S(c, circ(12, 12, 3.2), '#1d2c39', { s: 0, lw: TH * 1.4 }); hi(c, 8, 7.6, 1.5, 0.8, -0.7, 0.5); },
    book(c) {
      S(c, rrect(1.9, 6.1, 20.2, 14.4, 1.2), '#4d7fd6', { dark: '#2f58a6' });
      S(c, 'M12 7.5C9.6 5.5 6.2 5.1 3.4 5.7V17.5C6.2 16.9 9.6 17.3 12 19.3Z', CREAM, { s: 0.6, dark: '#e2d3ac', lw: TH * 1.4 });
      S(c, 'M12 7.5C14.4 5.5 17.8 5.1 20.6 5.7V17.5C17.8 16.9 14.4 17.3 12 19.3Z', PAPER, { s: 0.6, dark: '#d8c594', lw: TH * 1.4 });
      T(c, 'M5.3 9.1C6.9 8.8 8.5 9 10 9.8M5.3 12C6.9 11.7 8.5 11.9 10 12.7M18.7 9.1C17.1 8.8 15.5 9 14 9.8M18.7 12C17.1 11.7 15.5 11.9 14 12.7', TH * 0.8, '#b29f76');
    },
    pencil(c) {
      at(c, 12, 12, -0.785, 0, () => {
        S(c, 'M-7.2 -2.7H6.2V2.7H-7.2Z', '#ffc93d', { dark: '#e39a16' }); T(c, 'M-7 0H6', TH * 0.7, '#d18a12');
        S(c, 'M-7.2 -2.7L-12.3 0L-7.2 2.7Z', SKIN, { s: 0.5 }); F(c, 'M-12.3 0L-10.3 -1.05V1.05Z', OUT);
        S(c, 'M6.2 -2.7H8.2V2.7H6.2Z', STEEL, { s: 0.5 });
        S(c, 'M8.2 -2.7H10.3C11.3 -2.7 11.9 -2 11.9 -1V1C11.9 2 11.3 2.7 10.3 2.7H8.2Z', '#ff8fa3', { s: 0.6, dark: '#e0607a' });
      });
    },
    trophy(c) {
      L(c, 'M6.8 5.5H4.5C3.5 5.5 3 6.1 3 7.1C3 9.7 4.7 11 7 11.2', BRASS, 1.6); L(c, 'M17.2 5.5H19.5C20.5 5.5 21 6.1 21 7.1C21 9.7 19.3 11 17 11.2', BRASS, 1.6);
      S(c, rrect(7.3, 17.7, 9.4, 3.2, 0.7), '#e3a224', { s: 0.6, dark: '#b87d12' });
      S(c, 'M10.6 13.8H13.4V18.1H10.6Z', BRASS, { s: 0.5, dark: BRASS_D });
      S(c, 'M6.4 3.1H17.6V8.6C17.6 12.4 15.2 14.9 12 14.9C8.8 14.9 6.4 12.4 6.4 8.6Z', BRASS_L, { dark: BRASS });
      hi(c, 8.9, 6.6, 0.8, 2.3, 0.1, 0.7);
    },
    chart(c) { S(c, rrect(3.1, 12.6, 4.8, 8.2, 0.9), GREEN, { dark: GREEN_D, s: 0.9 }); S(c, rrect(9.6, 8.2, 4.8, 12.6, 0.9), C.A, { s: 0.9 }); S(c, rrect(16.1, 3.4, 4.8, 17.4, 0.9), BRASS, { dark: BRASS_D, s: 0.9 }); },
    help(c) {
      S(c, circ(12, 12, 9.4), C.A, { dark: '#2a74c4' });
      T(c, 'M8.7 9.3C8.7 7 10.3 5.7 12.2 5.7C14.2 5.7 15.6 7 15.6 8.7C15.6 10.6 14.1 11.3 13 12.2C12.3 12.8 12.1 13.3 12.1 14.2', 2.5, '#ffffff'); F(c, circ(12.1, 17.8, 1.5), '#ffffff');
    },
    sound(c) { S(c, SPEAKER, UI, { dark: UI_D }); L(c, 'M15.4 8.9C16.8 10.7 16.8 13.3 15.4 15.1', BRASS_L, 1.5); L(c, 'M18.3 6.3C21.2 9.5 21.2 14.5 18.3 17.7', BRASS_L, 1.5); },
    mute(c) { S(c, SPEAKER, UI, { dark: UI_D }); L(c, 'M15.7 9.3L21 14.7M21 9.3L15.7 14.7', RED, 1.9); },
    back(c) { L(c, 'M19.4 12H6.6M11.6 6.3L5.7 12L11.6 17.7', UI, 2.7); },
    play(c) { S(c, 'M7.6 4.7L19.2 12L7.6 19.3Z', UI, { dark: UI_D }); },
    pause(c) { S(c, rrect(5.5, 4.4, 4.8, 15.2, 1.3), UI, { dark: UI_D }); S(c, rrect(13.7, 4.4, 4.8, 15.2, 1.3), UI, { dark: UI_D }); },
    shop(c) {
      at(c, 12, 12.2, 0.74, 0.92, () => { S(c, rrect(-1.6, -4, 3.2, 13.6, 1.4), STEEL_L, { dark: STEEL, s: 0.8 }); S(c, 'M-1.7 -9.93A4.1 4.1 0 1 0 1.7 -9.93V-6H-1.7Z', STEEL_L, { dark: STEEL, s: 0.9 }); });
      at(c, 12, 12.2, -0.74, 0.92, () => { S(c, rrect(-1.25, -5.4, 2.5, 15, 1.1), WOOD, { s: 0.6 }); S(c, 'M-5.8 -10.2H3.6L6 -8.4V-6.6L3.6 -4.8H-5.8Z', STEEL_D, { dark: '#5d7184', s: 0.9 }); });
    },
    fuse(c) { L(c, 'M3.6 19.6C3.6 14 8.6 17.4 10.6 13.6C12.4 10 8 9.4 10 7C11.4 5.4 13.6 5.9 14.6 7.4', ROPE, 2.3); spark(c, 17.2, 6.3, 4.3); },
    keg(c) {
      L(c, 'M12 6.8C12 4.9 13 3.8 14.6 3.9', ROPE, 1.4);
      const b = 'M6.4 6.8H17.6C19.4 10.6 19.4 16.8 17.6 21.2H6.4C4.6 16.8 4.6 10.6 6.4 6.8Z', p = S(c, b, WOOD, { line: false, dark: '#844f24' });
      clipTo(c, p, () => { T(c, 'M9.6 6.8C9 11 9 17 9.6 21.2M14.4 6.8C15 11 15 17 14.4 21.2', TH * 0.8, '#844f24'); F(c, 'M0 8.9H24V11H0Z', STEEL); F(c, 'M0 17H24V19.1H0Z', STEEL); T(c, 'M0 8.9H24M0 11H24M0 17H24M0 19.1H24', TH * 0.8, OUT); });
      O(c, p); spark(c, 16.6, 3.9, 2.5);
    },
    bolt(c) { S(c, BOLT, '#ffd93d', { dark: '#f0a01a' }); hi(c, 10.6, 7.6, 0.7, 1.9, 0.65, 0.6); },
    dice(c) { at(c, 12, 12, -0.2, 0, () => { S(c, rrect(-8, -8, 16, 16, 3.2), CREAM, { dark: '#e2d3ac' }); for (const q of [[-4.1, -4.1], [4.1, -4.1], [0, 0], [-4.1, 4.1], [4.1, 4.1]]) F(c, circ(q[0], q[1], 1.55), OUT); }); },
    medal(c) {
      S(c, 'M6.5 2.5H11.2L13.5 9.4L9.5 11.1Z', C.A, { s: 0.6, dark: '#2a74c4' }); S(c, 'M12.8 2.5H17.5L14.5 11.1L10.5 9.4Z', C.N, { s: 0.6, dark: '#c53a2d' });
      S(c, circ(12, 15.1, 6.4), BRASS, { dark: BRASS_D }); F(c, star(12, 15.3, 3.5, 1.55, 5, -Math.PI / 2), '#c58a14'); hi(c, 8.9, 12, 1.5, 0.75, -0.7);
    },
    calendar(c) {
      const p = S(c, rrect(3.2, 4.6, 17.6, 16.4, 1.9), CREAM, { line: false, dark: '#e2d3ac' });
      clipTo(c, p, () => { F(c, 'M0 0H24V9.6H0Z', RED); T(c, 'M0 9.6H24', TH, OUT); });
      O(c, p);
      S(c, rrect(6.5, 2.5, 2.3, 4.6, 1.1), STEEL, { s: 0.3 }); S(c, rrect(15.2, 2.5, 2.3, 4.6, 1.1), STEEL, { s: 0.3 });
      for (const q of [[6.3, 11.6], [10.9, 11.6], [15.5, 11.6], [6.3, 15.6], [10.9, 15.6]]) F(c, rrect(q[0], q[1], 2.3, 2.3, 0.5), '#b9a886');
      F(c, rrect(15.5, 15.6, 2.3, 2.3, 0.5), RED);
    },
    person(c) { S(c, 'M3.9 21.3C3.9 16.4 7.4 13.5 12 13.5C16.6 13.5 20.1 16.4 20.1 21.3Z', BRASS, { dark: BRASS_D }); S(c, circ(12, 8.1, 4.7), SKIN, { dark: '#d9a57a' }); hi(c, 10.2, 6.2, 1.2, 0.7, -0.6, 0.5); },
    swap(c) { L(c, 'M4.2 7.9H17.2M14.3 4.8L17.8 7.9L14.3 11', UI, 2); L(c, 'M19.8 16.1H6.8M9.7 13L6.2 16.1L9.7 19.2', UI, 2); },

    /* extras for menus */
    plus(c) { L(c, 'M12 5.4V18.6M5.4 12H18.6', UI, 3.1); },
    minus(c) { L(c, 'M5.4 12H18.6', UI, 3.1); },
    right(c) { L(c, 'M4.6 12H17.4M12.4 6.3L18.3 12L12.4 17.7', UI, 2.7); },
    up(c) { L(c, 'M12 19.4V6.6M6.3 12.4L12 5.7L17.7 12.4', UI, 2.7); },
    down(c) { L(c, 'M12 4.6V17.4M6.3 11.6L12 18.3L17.7 11.6', UI, 2.7); },
    warning(c) { S(c, 'M12 3L21.6 20.2H2.4Z', '#ffb52e', { dark: '#e0851a' }); T(c, 'M12 9.2V14.2', 2.3, OUT); F(c, circ(12, 17.3, 1.35), OUT); },
    trash(c) {
      L(c, 'M9.7 5.4V4.2C9.7 3.5 10.2 3 10.9 3H13.1C13.8 3 14.3 3.5 14.3 4.2V5.4', STEEL, 1.1);
      S(c, 'M5.9 8H18.1L17.1 20.3C17 21 16.5 21.4 15.8 21.4H8.2C7.5 21.4 7 21 6.9 20.3Z', STEEL, { dark: STEEL_D });
      T(c, 'M10 11V18.4M14 11V18.4', TH, STEEL_D);
      S(c, rrect(4.1, 5.3, 15.8, 3, 1), STEEL_L, { s: 0.6, dark: STEEL });
    },
    move(c) {
      S(c, rrect(3.2, 15.4, 17.6, 5.8, 1.8), STEEL_D, { dark: '#5d7184' }); S(c, ell(12, 15.6, 3.4, 1.3), '#22323f', { s: 0, lw: TH });
      L(c, 'M12 15.4V8.4', STEEL_L, 1.9); S(c, circ(12, 6.6, 4.1), RED, { dark: '#c22f28' }); hi(c, 10.5, 5.2, 1.2, 0.75, -0.6);
    },
    flag(c) {
      L(c, 'M5.6 21.2V3.2', WOOD_L, 1.3);
      S(c, 'M6.4 4.2C9.4 2.8 11.8 5.8 14.8 4.6C16.8 3.8 18.6 3.6 20.6 4.4V13.6C18.6 12.8 16.8 13 14.8 13.8C11.8 15 9.4 12 6.4 13.4Z', C.N, { dark: '#c53a2d' });
      hi(c, 9.2, 5.8, 1.6, 0.7, 0.2, 0.45);
    },
    globe(c) {
      const p = S(c, circ(12, 12, 9.4), '#58b4ff', { line: false, dark: '#2f86d6' });
      clipTo(c, p, () => { F(c, 'M10.2 4C12.5 3.5 14.8 4.6 15 6.5C15.2 8 13.5 8.2 13.1 9.4C12.7 10.8 14.7 11.6 15.3 13.4C16 15.7 14.7 18.8 12.8 19.6C11.2 18.4 11.4 15.9 10.4 14.3C9.4 12.7 7.8 12.7 7.6 10.7C7.4 8.7 8.2 4.8 10.2 4Z', '#57cf7c'); F(c, 'M17.4 8.6C18.6 8.2 19.8 9.2 19.6 10.6C19.4 11.8 18 12 17.2 11.2C16.6 10.5 16.6 9 17.4 8.6ZM3.2 9.4C4.2 9 5.4 9.8 5.2 11.2C5 12.4 3.6 13 2.8 12.2Z', '#57cf7c'); });
      O(c, p); hi(c, 7.6, 6.8, 1.9, 0.9, -0.7, 0.5);
    },
    anchor(c) {
      const d = 'M12 7.4V20.2M8.4 10.6H15.6M4.9 14.4C5.5 18.1 8.3 20.4 12 20.4C15.7 20.4 18.5 18.1 19.1 14.4';
      L(c, d + circ(12, 5.3, 1.9), '#dbe6ee', 1.9);
    },
    scroll(c) {
      S(c, rrect(5, 4.6, 14, 15, 0.8), PAPER, { dark: '#d8c594' });
      T(c, 'M8 9.8H16M8 12.2H16M8 14.6H13.4', TH * 0.9, '#7c6f5b');
      S(c, rrect(3.3, 2.9, 17.4, 3.5, 1.7), '#e6d3a3', { s: 0.6, dark: '#c7b07a' }); S(c, rrect(3.3, 17.6, 17.4, 3.5, 1.7), '#e6d3a3', { s: 0.6, dark: '#c7b07a' });
    },

    /* study-topic + quiz pictograms */
    spark(c) { S(c, star(12, 12, 10, 4.7, 8, 0.2), C.S, { dark: '#e2531a', s: 1 }); F(c, star(12, 12, 5.8, 2.7, 8, 0.59), '#ffe066'); F(c, circ(12, 12, 1.7), '#ffffff'); },
    sides(c) {
      at(c, 12, 12.6, -0.36, 0, () => { L(c, 'M0 9V-9.4', WOOD_L, 1.2); S(c, 'M-0.6 -9.4H-6.8L-5.2 -6.6L-6.8 -3.8H-0.6Z', C.A, { s: 0.7, dark: '#2a74c4' }); });
      at(c, 12, 12.6, 0.36, 0, () => { L(c, 'M0 9V-9.4', WOOD_L, 1.2); S(c, 'M0.6 -9.4H6.8L5.2 -6.6L6.8 -3.8H0.6Z', C.N, { s: 0.7, dark: '#c53a2d' }); });
    },
    allied(c) { S(c, SHIELD, '#27a898', { dark: '#17756a' }); S(c, star(12, 11.4, 4.6, 2.05, 5, -Math.PI / 2), '#ffffff', { s: 0, lw: TH * 1.2 }); hi(c, 7.4, 6.6, 1.7, 0.8, -0.5, 0.45); },
    central(c) { S(c, SHIELD, '#7a6352', { dark: '#4e3d31' }); S(c, 'M12 6.4L16.4 11.4L12 16.4L7.6 11.4Z', CREAM, { s: 0, lw: TH * 1.2 }); hi(c, 7.4, 6.6, 1.7, 0.8, -0.5, 0.35); },
    hourglass(c) {
      S(c, 'M7 5H17C17 9 13.6 10.4 13.6 12C13.6 13.6 17 15 17 19H7C7 15 10.4 13.6 10.4 12C10.4 10.4 7 9 7 5Z', '#d6eef9', { dark: '#9cc8de', s: 0.8 });
      F(c, 'M9 7.4H15C14.4 8.9 13.2 9.9 12 10.5C10.8 9.9 9.6 8.9 9 7.4Z', BRASS); F(c, 'M8.4 18.4C8.8 16.3 10.4 15.2 12 15.2C13.6 15.2 15.2 16.3 15.6 18.4Z', BRASS); T(c, 'M12 10.4V15.4', TH * 0.8, BRASS);
      S(c, rrect(5, 2.7, 14, 2.7, 1.1), WOOD, { s: 0.5 }); S(c, rrect(5, 18.6, 14, 2.7, 1.1), WOOD, { s: 0.5 });
    },

    /* cause medals */
    M(c) { medalDisc(c, 'M'); }, A(c) { medalDisc(c, 'A'); }, I(c) { medalDisc(c, 'I'); }, N(c) { medalDisc(c, 'N'); }, S(c) { medalDisc(c, 'S'); }, X(c) { medalDisc(c, 'X'); },
  };

  /* ---------- names ---------- */
  const ALIAS = {
    /* brief names that share art */
    odmg: 'flame', ohp: 'house', ocd: 'target', home: 'house', hp: 'heart', shield: 'armor', dove: 'aura',
    /* shop ids */
    maxHp: 'heart', dmgMult: 'power', speedMult: 'boots', magnetMult: 'magnet', xpMult: 'scholar', coinMult: 'greed', cooldownMult: 'haste', crit: 'target', rerolls: 'dice',
    /* friendly extras */
    settings: 'gear', options: 'gear', awards: 'trophy', achievements: 'trophy', stats: 'chart', notes: 'book', studynotes: 'book', codex: 'book', test: 'pencil', practice: 'pencil',
    upgrades: 'shop', tools: 'shop', wallet: 'coin', money: 'coins', gem: 'xp', time: 'clock', timer: 'clock', stopwatch: 'haste', kills: 'skull', ko: 'skull', boss: 'skull', danger: 'skull',
    level: 'star', elite: 'crown', bonus: 'chest', treasure: 'chest', locked: 'lock', yes: 'check', ok: 'check', correct: 'check', right: 'check', no: 'cross', wrong: 'cross', close: 'cross',
    music: 'sound', sfx: 'sound', menu: 'house', restart: 'swap', reroll: 'dice', resume: 'play', streak: 'flame', fire: 'flame', lightning: 'bolt', idea: 'blaster', bulb: 'blaster',
    hero: 'person', character: 'person', agent: 'person', date: 'calendar', info: 'help', howto: 'help', left: 'back', revive: 'revives', life: 'revives', extralife: 'revives',
    vocab: 'book', vocabulary: 'book', compete: 'globe', competition: 'globe', twosides: 'sides', versus: 'sides', neutral: 'aura', long: 'hourglass', longterm: 'hourglass', sand: 'hourglass',
    'true': 'check', 'false': 'cross', question: 'help', quiz: 'pencil', retry: 'swap', again: 'swap', done: 'check', exit: 'cross', quit: 'cross', win: 'trophy', victory: 'trophy', lose: 'skull', defeat: 'skull',
    grade: 'medal', rank: 'medal', burst: 'spark', sparkle: 'spark',
    next: 'right', forward: 'right', add: 'plus', remove: 'minus', reset: 'trash', delete: 'trash', warn: 'warning', alert: 'warning', joystick: 'move', controls: 'move',
    world: 'globe', earth: 'globe', africa: 'globe', navy: 'anchor', telegram: 'scroll', paper: 'scroll', note: 'scroll', banner: 'flag',
    swords: 'power', boot: 'boots', apple: 'regen', clover: 'luck', map: 'area', books: 'scholar', moneybag: 'greed', bag: 'greed', rings: 'orbs', dynamite: 'trail', newspaper: 'press',
    battleship: 'cannon', gun: 'cannon', barrel: 'keg', powderkeg: 'keg', m: 'M', a: 'A', i: 'I', n: 'N', s: 'S', x: 'X',
  };
  function resolve(name) {
    if (name == null) return 'dot'; name = String(name);
    if (DRAW.hasOwnProperty(name)) return name;
    if (ALIAS.hasOwnProperty(name)) return ALIAS[name];
    const low = name.toLowerCase();
    if (DRAW.hasOwnProperty(low)) return low;
    if (ALIAS.hasOwnProperty(low)) return ALIAS[low];
    return 'dot';
  }

  /* ---------- render + cache ---------- */
  const cache = new Map(), urls = new Map();
  function mk(s) { const c = document.createElement('canvas'); c.width = c.height = s; return c; }
  function render(base, S_, small, tone) {
    const ink = tone === 'ink', key = base + '@' + S_ + (small ? 's' : '') + (ink ? 'i' : ''); let out = cache.get(key); if (out) return out;
    SMALL = !!small; UI = ink ? '#2a2017' : '#fff6dd'; UI_D = ink ? '#15100b' : '#e2d3ac';
    const A = mk(S_), c = A.getContext('2d');
    K = S_ / 24; LW = Math.max(1.5, 28.8 / S_); TH = LW * 0.62;
    c.setTransform(K, 0, 0, K, 0, 0); c.lineJoin = 'round'; c.lineCap = 'round';
    try { DRAW[base](c); } catch (e) { (PK.iconErrors = PK.iconErrors || []).push(base + ': ' + (e && e.message)); try { c.setTransform(K, 0, 0, K, 0, 0); c.clearRect(0, 0, 24, 24); DRAW.dot(c); } catch (e2) {} }
    /* faint pale rim: the silhouette, dilated, under the art */
    const Mk = mk(S_), m = Mk.getContext('2d'); m.drawImage(A, 0, 0); m.globalCompositeOperation = 'source-in'; m.fillStyle = '#f6eedb'; m.fillRect(0, 0, S_, S_);
    const Un = mk(S_), u = Un.getContext('2d'), rad = Math.max(0.7, 0.5 * K);
    for (let i = 0; i < 12; i++) u.drawImage(Mk, Math.cos(i * TAU / 12) * rad, Math.sin(i * TAU / 12) * rad);
    out = mk(S_); const o = out.getContext('2d'); o.globalAlpha = S_ < 40 ? 0.4 : 0.5; o.drawImage(Un, 0, 0); o.globalAlpha = 1; o.drawImage(A, 0, 0);
    cache.set(key, out); return out;
  }
  function devSize(px) { return Math.max(8, Math.round(px * Math.min(window.devicePixelRatio || 1, 3))); }

  /* opts (optional): { tone: 'ink' } draws the plain UI glyphs (back, play, pause, plus, arrows, speaker…) dark for pale paper surfaces */
  PK.icon = function (name, px, opts) {
    px = Math.max(6, Math.round(+px || 24)); const dev = devSize(px), src = render(resolve(name), dev, px < 20 || dev < 40, opts && opts.tone), c = document.createElement('canvas');
    c.width = src.width; c.height = src.height; c.style.width = c.style.height = px + 'px'; c.style.flex = 'none'; c.style.verticalAlign = 'middle';
    c.className = 'pk-icon'; c.setAttribute('aria-hidden', 'true'); c.dataset.icon = String(name);
    c.getContext('2d').drawImage(src, 0, 0); return c;
  };
  PK.iconCanvas = function (name, devicePx, opts) { const s = Math.max(8, Math.round(devicePx || 48)); return render(resolve(name), s, s < 40, opts && opts.tone); };
  PK.iconURL = function (name, px, opts) {
    px = Math.max(6, Math.round(+px || 24)); const base = resolve(name), s = devSize(px), tone = opts && opts.tone, k = base + '@' + s + (tone || ''); let u = urls.get(k);
    if (!u) { u = render(base, s, px < 20 || s < 40, tone).toDataURL('image/png'); urls.set(k, u); } return u;
  };
  PK.iconHas = function (name) { return resolve(name) !== 'dot' || name === 'dot'; };
  PK.ICON_ART = Object.keys(DRAW);                                  /* names with their own drawing */
  PK.ICON_NAMES = Object.keys(DRAW).concat(Object.keys(ALIAS));       /* + aliases */
})();
