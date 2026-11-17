/* art-world.js — the five places of a run, one per act. GROUND ONLY: a seamless pre-rendered tile, a couple of big
   world-space features (carpet runners, map borders, tram rails, lamplight) and sparse flat decals placed by a stable
   hash of the world cell, so the world never pops or swims as the camera moves. Registers PK.art.world.
     0 MILITARISM  battleship deck      1 ALLIANCES  conference-hall parquet    2 IMPERIALISM  colonial map sand
     3 NATIONALISM cobbled city square  4 THE SPARK  a Sarajevo street at night
   Everything is mid-dark and low-contrast on purpose: the actors, gems and bullets are the bright things. */
(function () {
  'use strict';
  const PK = (window.PK = window.PK || {});
  const ART = (PK.art = PK.art || {});
  const TAU = Math.PI * 2, S = 512, PX = 2;            /* tile size in world units; baked device px per world unit */

  /* ================= deterministic randomness ================= */
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(x, y, s) { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const mod = (n, m) => ((n % m) + m) % m;
  const hsl = (h, s, l, a) => (a === undefined ? 'hsl(' + h + ',' + s + '%,' + l + '%)' : 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')');

  /* ================= canvas helpers ================= */
  function mk(w, h, px) { px = px || PX; const cv = document.createElement('canvas'); cv.width = Math.ceil(w * px); cv.height = Math.ceil(h * px); const x = cv.getContext('2d'); x.scale(px, px); x.lineJoin = 'round'; x.lineCap = 'round'; return { cv, x, w, h }; }
  function free(cv) { if (cv) { cv.width = 0; cv.height = 0; } }
  function rr(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function dot(x, px, py, r, col) { x.beginPath(); x.arc(px, py, r, 0, TAU); if (col) x.fillStyle = col; x.fill(); }
  /* draw something that may straddle the tile edge: repeats it on the far side so the tile stays seamless */
  function wrap(px, py, rad, fn) { for (let dx = -S; dx <= S; dx += S) { if (px + dx + rad < 0 || px + dx - rad > S) continue; for (let dy = -S; dy <= S; dy += S) { if (py + dy + rad < 0 || py + dy - rad > S) continue; fn(px + dx, py + dy); } } }
  function pattern(c, cv, scale, ox, oy) {
    const p = c.createPattern(cv, 'repeat'), k = scale || 1 / PX;
    try { p.setTransform(new DOMMatrix([k, 0, 0, k, ox || 0, oy || 0])); return p; } catch (e) { return null; }
  }

  /* ================= shared soft textures (tiny, built once) ================= */
  let SH = null;
  function noiseCanvas(n, cells, seed, v, lo, hi) {
    const cv = document.createElement('canvas'); cv.width = cv.height = n; const x = cv.getContext('2d'), im = x.createImageData(n, n), d = im.data, R = rng(seed), oct = [];
    for (let o = 0; o < 3; o++) { const c = cells << o, lat = new Float32Array(c * c); for (let i = 0; i < lat.length; i++) lat[i] = R(); oct.push({ c, lat }); }
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
      let val = 0, amp = 0.57, tot = 0;
      for (let o = 0; o < 3; o++) {
        const c = oct[o].c, lat = oct[o].lat, fx = px / n * c, fy = py / n * c, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), x1 = (x0 + 1) % c, y1 = (y0 + 1) % c;
        const a = lat[y0 * c + x0], b = lat[y0 * c + x1], e = lat[y1 * c + x0], f = lat[y1 * c + x1];
        val += amp * (a + (b - a) * sx + (e - a + (a - b - e + f) * sx) * sy); tot += amp; amp *= 0.5;
      }
      let al = (val / tot - lo) / (hi - lo); al = al < 0 ? 0 : al > 1 ? 1 : al; al = al * al * (3 - 2 * al);
      const k = (py * n + px) * 4; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = Math.round(al * 255);
    }
    x.putImageData(im, 0, 0); return cv;
  }
  /* big soft clouds, darker AND lighter in one texture: laid over the whole view at a period that does not divide the
     512-unit tile, so the ground never visibly repeats (one extra fill instead of a pile of blended sprites) */
  function macroCanvas(n, cells, seed) {
    const src = noiseCanvas(n, cells, seed, 0, 0, 1).getContext('2d').getImageData(0, 0, n, n).data, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const x = cv.getContext('2d'), im = x.createImageData(n, n), d = im.data;
    for (let i = 0; i < n * n; i++) {
      const k = i * 4, v = src[k + 3] / 255, a = Math.min(1, Math.abs(v - 0.5) * 2.6), e = a * a * (3 - 2 * a), dark = v < 0.5;
      d[k] = d[k + 1] = d[k + 2] = dark ? 0 : 255; d[k + 3] = Math.round(e * (dark ? 150 : 62));
    }
    x.putImageData(im, 0, 0); return cv;
  }
  function speckCanvas(n, seed, v, p) {
    const cv = document.createElement('canvas'); cv.width = cv.height = n; const x = cv.getContext('2d'), im = x.createImageData(n, n), d = im.data, R = rng(seed);
    for (let i = 0; i < n * n; i++) { const k = i * 4; d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = R() < p ? 50 + R() * 190 : 0; }
    x.putImageData(im, 0, 0); return cv;
  }
  function softDisc(rgb, stops) {
    const n = 128, cv = document.createElement('canvas'); cv.width = cv.height = n; const x = cv.getContext('2d'), gr = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    for (const s of stops) gr.addColorStop(s[0], 'rgba(' + rgb + ',' + s[1] + ')');
    x.fillStyle = gr; x.fillRect(0, 0, n, n); return cv;
  }
  function shared() {
    if (SH) return SH;
    SH = {
      nD: noiseCanvas(128, 4, 11, 0, 0.36, 0.72), nL: noiseCanvas(128, 4, 29, 255, 0.4, 0.76),
      sD: speckCanvas(128, 5, 0, 0.34), sL: speckCanvas(128, 7, 255, 0.2),
      macro: macroCanvas(128, 4, 71),
      glow: softDisc('255,178,92', [[0, 1], [0.18, 0.78], [0.42, 0.4], [0.7, 0.12], [1, 0]]),
    };
    return SH;
  }
  /* tile a small periodic texture across the whole 512-unit tile (device-pixel space) */
  function mottle(T, src, tiles, alpha, smooth) {
    const x = T.x, n = T.cv.width / tiles; x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = alpha; x.imageSmoothingEnabled = smooth !== false;
    for (let i = 0; i < tiles; i++) for (let j = 0; j < tiles; j++) x.drawImage(src, i * n, j * n, n, n);
    x.restore();
  }
  /* knock little chips out of fresh paint so stencils look walked-on */
  function wear(x, w, h, R, n, big) {
    x.save(); x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < n; i++) { x.globalAlpha = 0.35 + R() * 0.65; dot(x, R() * w, R() * h, 0.5 + R() * R() * (big || 2.6), '#000'); }
    x.globalAlpha = 0.5; x.lineWidth = 0.7; x.strokeStyle = '#000';
    for (let i = 0; i < n / 6; i++) { const px = R() * w, py = R() * h, a = R() * TAU, l = 6 + R() * 16; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
    x.restore();
  }
  function fontOK(fam) { try { return !document.fonts || document.fonts.check('16px "' + fam + '"'); } catch (e) { return true; } }
  /* stencil lettering, letter by letter (canvas letter-spacing is not available everywhere) */
  function stencil(x, str, cx, cy, size, fam, gap, col) {
    x.font = '400 ' + size + 'px "' + fam + '", Georgia, serif'; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillStyle = col;
    let w = 0; for (const ch of str) w += x.measureText(ch).width + gap; w -= gap;
    let px = cx - w / 2; for (const ch of str) { x.fillText(ch, px, cy); px += x.measureText(ch).width + gap; }
    return w;
  }

  /* =====================================================================================================
     ACT 1 — MILITARISM: battleship deck
     ===================================================================================================== */
  function tileDeck(T) {
    const x = T.x, R = rng(1914), sh = shared(), PW = 128, PH = S / 6;
    x.fillStyle = '#19252c'; x.fillRect(0, 0, S, S);
    for (let row = -1; row <= 6; row++) for (let col = -1; col <= 4; col++) {
      const px = col * PW + ((row & 1) ? PW / 2 : 0), py = row * PH, a = mod(col, 4), b = mod(row, 6), k = hash(a, b, 101), k2 = hash(a, b, 102);
      x.fillStyle = hsl(196 + k2 * 9, 21 + k * 5, 21.2 + k * 3.6); x.fillRect(px + 1, py + 1, PW - 2, PH - 2);
      x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(px + 1, py + 1, PW - 2, 1.1); x.fillRect(px + 1, py + 1, 1.1, PH - 2);
      x.fillStyle = 'rgba(0,0,0,.17)'; x.fillRect(px + 1, py + PH - 2.4, PW - 2, 1.4); x.fillRect(px + PW - 2.4, py + 1, 1.4, PH - 2);
      const riv = (cx, cy) => { dot(x, cx + 0.55, cy + 0.65, 1.7, 'rgba(0,0,0,.3)'); dot(x, cx, cy, 1.45, hsl(197, 20, 26 + k * 3)); dot(x, cx - 0.45, cy - 0.45, 0.55, 'rgba(255,255,255,.2)'); };
      for (let q = 0; q < 6; q++) { const cx = px + PW * (q + 0.5) / 6; riv(cx, py + 6.5); riv(cx, py + PH - 6.5); }
      for (let q = 1; q < 3; q++) { const cy = py + PH * (q + 0.5) / 4; riv(px + 6.5, cy); riv(px + PW - 6.5, cy); }
    }
    mottle(T, sh.nD, 4, 0.065); mottle(T, sh.nL, 8, 0.035); mottle(T, sh.sD, 4, 0.05, false);
    for (let i = 0; i < 34; i++) {                                  /* scuffs from years of boots and gun carriages */
      const px = R() * S, py = R() * S, a = (R() < 0.5 ? 0 : Math.PI / 2) + (R() - 0.5) * 0.24, l = 30 + R() * 110, light = R() < 0.5;
      x.strokeStyle = light ? 'rgba(205,225,235,.045)' : 'rgba(0,0,0,.075)'; x.lineWidth = 0.8 + R() * 1.2;
      wrap(px, py, l, (qx, qy) => { x.beginPath(); x.moveTo(qx, qy); x.lineTo(qx + Math.cos(a) * l, qy + Math.sin(a) * l); x.stroke(); });
    }
  }
  const PAINT = '#c3d2d8';
  function dAnchor(x, R, w, h) {
    x.translate(w / 2, h / 2); x.strokeStyle = PAINT; x.fillStyle = PAINT; x.lineWidth = 4.4;
    x.beginPath(); x.arc(0, -29, 5.6, 0, TAU); x.stroke();
    x.beginPath(); x.moveTo(0, -22.5); x.lineTo(0, 27); x.moveTo(-14, -13.5); x.lineTo(14, -13.5); x.stroke();
    x.beginPath(); x.arc(0, 3, 24, 0.1 * Math.PI, 0.9 * Math.PI); x.stroke();
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * 29.5, 4); x.lineTo(s * 17.5, 9.5); x.lineTo(s * 25.5, 17); x.closePath(); x.fill(); }
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';             /* stencil bridges */
    x.fillRect(-1.2, -4, 2.4, 2.2); x.fillRect(-1.2, 14, 2.4, 2.2); x.fillRect(-8.2, -15.8, 2, 4.6); x.fillRect(6.2, -15.8, 2, 4.6);
    x.globalCompositeOperation = 'source-over'; x.translate(-w / 2, -h / 2); wear(x, w, h, R, 90);
  }
  function dHazard(x, R, w, h) {
    x.save(); rr(x, 3, 3, w - 6, h - 6, 3); x.clip();
    x.fillStyle = '#12191d'; x.fillRect(0, 0, w, h); x.fillStyle = hsl(45, 46, 40);
    for (let i = -h; i < w + h; i += 22) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + 11, h); x.lineTo(i + 11 + h, 0); x.lineTo(i + h, 0); x.closePath(); x.fill(); }
    x.restore(); wear(x, w, h, R, 150, 3.4);
  }
  function dRope(x, R, w, h) {
    x.translate(w / 2, h / 2);
    const coil = (lw, col) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); for (let a = 0; a <= TAU * 3.55; a += 0.16) { const r = 3.5 + a * 1.02, px = Math.cos(a) * r, py = Math.sin(a) * r; if (a === 0) x.moveTo(px, py); else x.lineTo(px, py); } x.quadraticCurveTo(30, 4, 30, 18); x.stroke(); };
    coil(6.6, 'rgba(8,12,15,.7)'); coil(4.6, hsl(36, 20, 29));
    x.strokeStyle = 'rgba(20,14,8,.42)'; x.lineWidth = 0.9;
    for (let a = 0.3; a <= TAU * 3.55; a += 0.34 / (1 + a * 0.16)) { const r = 3.5 + a * 1.02, px = Math.cos(a) * r, py = Math.sin(a) * r, nx = Math.cos(a + 0.9), ny = Math.sin(a + 0.9); x.beginPath(); x.moveTo(px - nx * 1.9, py - ny * 1.9); x.lineTo(px + nx * 1.9, py + ny * 1.9); x.stroke(); }
    x.strokeStyle = 'rgba(255,240,210,.09)'; x.lineWidth = 1; x.beginPath(); for (let a = 2; a <= TAU * 3.5; a += 0.16) { const r = 2.4 + a * 1.02, px = Math.cos(a) * r, py = Math.sin(a) * r; if (a === 2) x.moveTo(px, py); else x.lineTo(px, py); } x.stroke();
  }
  function dHatch(x, R, w, h) {
    x.fillStyle = 'rgba(0,0,0,.28)'; rr(x, 5.5, 6, w - 9, h - 9, 7); x.fill();
    x.fillStyle = hsl(198, 22, 15.5); rr(x, 4, 4, w - 8, h - 8, 7); x.fill();
    x.fillStyle = hsl(198, 20, 20.5); rr(x, 8, 8, w - 16, h - 16, 4.5); x.fill();
    x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(11, 8.6, w - 22, 1.1); x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(11, h - 9.8, w - 22, 1.2);
    for (const cx of [13, w - 13]) for (const cy of [13, h - 13]) { dot(x, cx + 0.5, cy + 0.6, 2, 'rgba(0,0,0,.35)'); dot(x, cx, cy, 1.7, hsl(198, 18, 27)); }
    x.translate(w / 2, h / 2); x.strokeStyle = hsl(198, 20, 12.5); x.lineWidth = 3.4; x.beginPath(); x.arc(0, 0, 11.5, 0, TAU); x.stroke();
    x.lineWidth = 2.6; x.beginPath(); for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.5; x.moveTo(0, 0); x.lineTo(Math.cos(a) * 11.5, Math.sin(a) * 11.5); } x.stroke();
    dot(x, 0, 0, 3, hsl(198, 18, 25)); x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 1; x.beginPath(); x.arc(0, 0, 11.5, Math.PI * 1.05, Math.PI * 1.6); x.stroke();
  }
  function dRails(x, R, w, h) {
    const y0 = h / 2 - 15, y1 = h / 2 + 15;
    x.fillStyle = hsl(200, 20, 15); for (let px = 9; px < w - 6; px += 21) { rr(x, px - 3.4, y0 - 7, 6.8, 44, 1.6); x.fill(); }
    for (const py of [y0, y1]) {
      x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(3, py - 1.3, w - 6, 4.6); x.fillStyle = hsl(200, 18, 12.5); x.fillRect(3, py - 2.4, w - 6, 4.8);
      x.fillStyle = hsl(200, 14, 35); x.fillRect(3, py - 1.5, w - 6, 1.3);
    }
    x.fillStyle = hsl(200, 20, 12); rr(x, 1, y0 - 6, 4.4, 42, 1.4); x.fill(); rr(x, w - 5.4, y0 - 6, 4.4, 42, 1.4); x.fill();
  }
  function dBalls(x, R, w, h) {
    x.translate(w / 2, h / 2 + 3); x.strokeStyle = hsl(200, 18, 14.5); x.lineWidth = 2.6; x.fillStyle = 'rgba(8,13,17,.22)';
    x.beginPath(); x.moveTo(0, -27); x.lineTo(26.5, 19); x.lineTo(-26.5, 19); x.closePath(); x.fill(); x.stroke();
    const row = [[0, -13.5], [-7.4, -0.7], [7.4, -0.7], [-14.8, 12], [0, 12], [14.8, 12]];
    for (const p of row) { dot(x, p[0], p[1], 6.3, hsl(200, 16, 12)); x.strokeStyle = 'rgba(190,215,225,.11)'; x.lineWidth = 1.2; x.beginPath(); x.arc(p[0], p[1], 4.3, Math.PI * 1.05, Math.PI * 1.6); x.stroke(); }
  }
  function dTextDeck(x, R, w, h) { stencil(x, 'DREADNOUGHT', w / 2, h / 2 + 1, 15, 'Alfa Slab One', 2.6, PAINT); wear(x, w, h, R, 130); }

  /* =====================================================================================================
     ACT 2 — ALLIANCES: grand conference hall, herringbone parquet
     ===================================================================================================== */
  function tileParquet(T) {
    const x = T.x, R = rng(1907), sh = shared(), K = 4, N = 6, w = S / (Math.SQRT2 * K * N), L = w * K, OX = 372, OY = 10, E = 744;
    const P = mk(E, E), q = P.x;                                    /* scratch canvas in the floor's own (unrotated) axes */
    q.fillStyle = '#22150c'; q.fillRect(0, 0, E, E); q.translate(OX, OY);
    const plank = (lx, ly, pw, ph, a, b, v) => {
      if (lx + pw < -OX || lx > E - OX || ly + ph < -OY || ly > E - OY) return;
      const k = hash(a, b, 200 + v), k2 = hash(a, b, 210 + v), k3 = hash(a, b, 220 + v), long = pw > ph;
      q.fillStyle = hsl(21 + k2 * 8, 37 + k3 * 9, 18.6 + k * 6.6); q.fillRect(lx + 0.42, ly + 0.42, pw - 0.84, ph - 0.84);
      for (let i = 0; i < 3; i++) {                                 /* grain */
        const o = 2.2 + hash(a * 7 + i, b, 230 + v) * (w - 4.4), g0 = 2 + hash(a + i, b, 250 + v) * 14, gl = L - g0 - 2 - hash(a, b + i, 260 + v) * 16;
        q.fillStyle = hash(a, b * 5 + i, 240 + v) < 0.66 ? 'rgba(18,9,3,.15)' : 'rgba(255,214,160,.045)';
        if (long) q.fillRect(lx + g0, ly + o, gl, 0.6); else q.fillRect(lx + o, ly + g0, 0.6, gl);
      }
      q.fillStyle = 'rgba(255,225,180,.045)'; if (long) q.fillRect(lx + 0.5, ly + 0.5, pw - 1, 0.9); else q.fillRect(lx + 0.5, ly + 0.5, 0.9, ph - 1);
    };
    for (let n = -6; n <= 54; n++) for (let m = Math.ceil((-OX - L - n * w) / (2 * K * w)) - 1; m <= Math.floor((E - OX - n * w) / (2 * K * w)) + 1; m++) {
      const a = mod(n, K * N), b = mod(m, N);
      plank(n * w + m * 2 * K * w, n * w, L, w, a, b, 0);
      plank((n + K) * w + m * 2 * K * w, (n + 1 - K) * w, w, L, a, b, 1);
    }
    x.save(); x.rotate(-Math.PI / 4); x.drawImage(P.cv, -OX, -OY, E, E); x.restore(); free(P.cv);
    mottle(T, sh.nD, 4, 0.065); mottle(T, sh.nL, 8, 0.03);
    for (let i = 0; i < 16; i++) { const px = R() * S, py = R() * S, a = R() * TAU, l = 20 + R() * 60; x.strokeStyle = 'rgba(255,225,190,.035)'; x.lineWidth = 0.7 + R(); wrap(px, py, l, (qx, qy) => { x.beginPath(); x.moveTo(qx, qy); x.lineTo(qx + Math.cos(a) * l, qy + Math.sin(a) * l); x.stroke(); }); }
  }
  function runnerStrip() {                                            /* 64 units long, 76 wide; repeats along its length */
    const T = mk(64, 76), x = T.x;
    x.fillStyle = hsl(350, 40, 13.5); x.fillRect(0, 0, 64, 76); x.fillStyle = hsl(351, 39, 19.5); x.fillRect(0, 3.2, 64, 69.6);
    x.fillStyle = hsl(42, 34, 30); x.fillRect(0, 6.2, 64, 1.3); x.fillRect(0, 68.5, 64, 1.3);
    x.fillStyle = hsl(42, 30, 25); x.fillRect(0, 10, 64, 0.8); x.fillRect(0, 65.2, 64, 0.8);
    x.fillStyle = hsl(351, 37, 23.5);
    const dia = (cx, cy, a, b) => { x.beginPath(); x.moveTo(cx - a, cy); x.lineTo(cx, cy - b); x.lineTo(cx + a, cy); x.lineTo(cx, cy + b); x.closePath(); x.fill(); };
    dia(32, 38, 15, 12); for (const cx of [0, 64]) { dia(cx, 38, 6, 5); dia(cx, 21, 4, 3.2); dia(cx, 55, 4, 3.2); }
    x.fillStyle = hsl(351, 40, 15.5); dia(32, 38, 6.5, 5.2);
    return T;
  }
  function runnerCap() {
    const T = mk(9, 76), x = T.x; x.fillStyle = hsl(350, 40, 13); x.fillRect(0, 0, 3, 76);
    x.strokeStyle = hsl(42, 30, 29); x.lineWidth = 1.2; for (let py = 3.6; py < 74; py += 4.1) { x.beginPath(); x.moveTo(2.6, py); x.lineTo(8, py + 0.5); x.stroke(); }
    return T;
  }
  const PAPER = hsl(40, 22, 37), PAPER2 = hsl(38, 20, 31), INK = 'rgba(40,28,14,.5)';
  function sheet(x, cx, cy, w, h, rot, R, seal) {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(-w / 2 + 1.6, -h / 2 + 2.2, w, h);
    x.fillStyle = PAPER; x.beginPath(); x.moveTo(-w / 2, -h / 2); x.lineTo(w / 2 - 7, -h / 2); x.lineTo(w / 2, -h / 2 + 7); x.lineTo(w / 2, h / 2); x.lineTo(-w / 2, h / 2); x.closePath(); x.fill();
    x.fillStyle = PAPER2; x.beginPath(); x.moveTo(w / 2 - 7, -h / 2); x.lineTo(w / 2, -h / 2 + 7); x.lineTo(w / 2 - 7, -h / 2 + 7); x.closePath(); x.fill();
    x.fillStyle = INK; x.fillRect(-w / 2 + 6, -h / 2 + 6.5, w * 0.46, 2);
    x.fillStyle = 'rgba(40,28,14,.3)'; for (let py = -h / 2 + 13; py < h / 2 - 15; py += 4.6) x.fillRect(-w / 2 + 6, py, (w - 12) * (0.72 + R() * 0.28), 1.1);
    x.strokeStyle = INK; x.lineWidth = 1; x.beginPath(); x.moveTo(-w / 2 + 6, h / 2 - 8); x.quadraticCurveTo(-w / 2 + 12, h / 2 - 13, -w / 2 + 17, h / 2 - 8); x.quadraticCurveTo(-w / 2 + 21, h / 2 - 4, -w / 2 + 26, h / 2 - 9); x.stroke();
    if (seal) {
      x.fillStyle = hsl(2, 44, 17); x.beginPath(); x.moveTo(w / 2 - 12, h / 2 - 9); x.lineTo(w / 2 - 15, h / 2 + 3); x.lineTo(w / 2 - 11, h / 2); x.lineTo(w / 2 - 7.5, h / 2 + 3.5); x.closePath(); x.fill();
      dot(x, w / 2 - 11, h / 2 - 10, 5.6, hsl(2, 46, 24)); dot(x, w / 2 - 11, h / 2 - 10, 3.3, hsl(2, 44, 19)); dot(x, w / 2 - 12.6, h / 2 - 11.6, 1.2, 'rgba(255,200,190,.2)');
    }
    x.restore();
  }
  function dTreaty(x, R, w, h) { sheet(x, w / 2, h / 2, 38, 50, 0, R, true); }
  function dPapers(x, R, w, h) { sheet(x, w / 2 - 9, h / 2 + 2, 34, 44, -0.34, R, false); sheet(x, w / 2 + 8, h / 2 - 1, 36, 46, 0.2, R, true); }
  function dBlot(x, R, w, h) {
    x.translate(w / 2, h / 2); x.fillStyle = 'rgba(12,10,20,.62)';
    x.beginPath(); for (let i = 0; i <= 22; i++) { const a = i / 22 * TAU, r = 9 + Math.sin(a * 3 + 1) * 2.2 + Math.sin(a * 7) * 1.6 + (i % 5 === 0 ? 5 : 0); const px = Math.cos(a) * r, py = Math.sin(a) * r; if (!i) x.moveTo(px, py); else x.lineTo(px, py); } x.closePath(); x.fill();
    for (let i = 0; i < 9; i++) { const a = R() * TAU, d = 13 + R() * 8; dot(x, Math.cos(a) * d, Math.sin(a) * d, 0.7 + R() * 1.7); }
    x.strokeStyle = 'rgba(150,160,220,.09)'; x.lineWidth = 1.2; x.beginPath(); x.arc(-1, -1, 6.4, Math.PI * 1.05, Math.PI * 1.6); x.stroke();
  }
  function dQuill(x, R, w, h) {
    x.translate(w / 2, h / 2); x.rotate(-0.32);
    x.fillStyle = 'rgba(0,0,0,.26)'; x.beginPath(); x.moveTo(-25, 3.4); x.quadraticCurveTo(-4, -9, 26, -2.4); x.quadraticCurveTo(-2, 13, -25, 3.4); x.fill();
    x.fillStyle = hsl(40, 12, 39); x.beginPath(); x.moveTo(-25, 1.6); x.quadraticCurveTo(-4, -11, 26, -4); x.quadraticCurveTo(-2, 11, -25, 1.6); x.fill();
    x.fillStyle = hsl(38, 12, 31); x.beginPath(); x.moveTo(-25, 1.6); x.quadraticCurveTo(-2, 11, 26, -4); x.lineTo(-25, 1.6); x.fill();
    x.strokeStyle = hsl(36, 14, 22); x.lineWidth = 1.2; x.beginPath(); x.moveTo(-33, 2.6); x.lineTo(26, -4); x.stroke();
    x.strokeStyle = 'rgba(24,16,8,.3)'; x.lineWidth = 0.6; for (let i = 0; i < 8; i++) { const px = -18 + i * 5.4; x.beginPath(); x.moveTo(px, 0.8 - i * 0.55); x.lineTo(px + 5, -5.5 - i * 0.2); x.moveTo(px, 0.8 - i * 0.55); x.lineTo(px + 5.5, 4.6 - i * 0.6); x.stroke(); }
    dot(x, -37, 4.6, 2.3, 'rgba(12,10,20,.6)'); dot(x, -41.5, 2.4, 1, 'rgba(12,10,20,.6)');
  }
  function dEnvelope(x, R, w, h) {
    x.translate(w / 2, h / 2); x.rotate(0.14); x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(-19.5, -11.2, 42, 27);
    x.fillStyle = PAPER; x.fillRect(-21, -13.5, 42, 27); x.fillStyle = PAPER2; x.beginPath(); x.moveTo(-21, -13.5); x.lineTo(0, 3); x.lineTo(21, -13.5); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(40,28,14,.3)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(-21, 13.5); x.lineTo(-5, 0); x.moveTo(21, 13.5); x.lineTo(5, 0); x.stroke();
    dot(x, 0, 2.6, 4.6, hsl(2, 46, 24)); dot(x, 0, 2.6, 2.6, hsl(2, 44, 19));
  }
  function dRing(x, R, w, h) {
    x.translate(w / 2, h / 2); x.strokeStyle = 'rgba(14,10,18,.42)'; x.lineWidth = 2.2; x.beginPath(); x.arc(0, 0, 11.5, 0.5, TAU - 0.4); x.stroke();
    x.lineWidth = 1; x.strokeStyle = 'rgba(14,10,18,.24)'; x.beginPath(); x.arc(4.5, 3.5, 12, 2.4, 5.2); x.stroke(); dot(x, 15, -9, 1.5, 'rgba(14,10,18,.42)'); dot(x, 18.2, -4.5, 0.9);
  }

  /* =====================================================================================================
     ACT 3 — IMPERIALISM: the colonial map of Africa come to life
     ===================================================================================================== */
  function tileSand(T) {
    const x = T.x, R = rng(1884), sh = shared();
    x.fillStyle = hsl(36, 37, 31.5); x.fillRect(0, 0, S, S);
    mottle(T, sh.nD, 4, 0.05); mottle(T, sh.nL, 8, 0.04); mottle(T, sh.nD, 8, 0.04);
    for (let i = 0; i < 70; i++) {                                  /* wind ripples */
      const px = R() * S, py = R() * S, l = 26 + R() * 62, a = (R() - 0.5) * 0.5, bend = (R() - 0.5) * 9, ex = Math.cos(a) * l, ey = Math.sin(a) * l, al = 0.5 + R() * 0.5;
      wrap(px, py, l, (qx, qy) => {
        x.strokeStyle = 'rgba(40,24,8,' + (0.085 * al) + ')'; x.lineWidth = 1.3; x.beginPath(); x.moveTo(qx, qy + 1.5); x.quadraticCurveTo(qx + ex / 2, qy + ey / 2 + bend + 1.5, qx + ex, qy + ey + 1.5); x.stroke();
        x.strokeStyle = 'rgba(255,232,180,' + (0.06 * al) + ')'; x.lineWidth = 1.1; x.beginPath(); x.moveTo(qx, qy); x.quadraticCurveTo(qx + ex / 2, qy + ey / 2 + bend, qx + ex, qy + ey); x.stroke();
      });
    }
    mottle(T, sh.sD, 4, 0.075, false); mottle(T, sh.sL, 4, 0.045, false);
    for (let i = 0; i < 44; i++) { const px = R() * S, py = R() * S, r = 0.7 + R() * 1.1, d = R() < 0.5; wrap(px, py, 3, (qx, qy) => { dot(x, qx + 0.5, qy + 0.6, r, 'rgba(30,18,6,.14)'); dot(x, qx, qy, r, d ? 'rgba(60,42,22,.24)' : 'rgba(225,200,160,.14)'); }); }
  }
  function dTuft(x, R, w, h, wide) {
    x.translate(w / 2, h - 7); x.fillStyle = 'rgba(22,13,4,.24)'; x.beginPath(); x.ellipse(0, 1.5, wide ? 15 : 10, 3.4, 0, 0, TAU); x.fill();
    const n = wide ? 11 : 7;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n - 0.5, a = -Math.PI / 2 + f * (wide ? 2.2 : 1.7) + (R() - 0.5) * 0.2, l = (wide ? 17 : 20) + R() * 9, bx = f * (wide ? 15 : 8), ex = bx + Math.cos(a) * l, ey = Math.sin(a) * l, cxp = bx + Math.cos(a) * l * 0.5 + f * 8, cyp = Math.sin(a) * l * 0.62;
      x.fillStyle = hsl(44 + R() * 8, 27 + R() * 8, i % 3 === 0 ? 24.5 : 31 + R() * 6);
      x.beginPath(); x.moveTo(bx - 1.5, 0); x.quadraticCurveTo(cxp - 1, cyp, ex, ey); x.quadraticCurveTo(cxp + 1.6, cyp, bx + 1.5, 0); x.closePath(); x.fill();
    }
  }
  function dStones(x, R, w, h) {
    const st = [[w * 0.36, h * 0.56, 12.5, 8.4, -0.2], [w * 0.68, h * 0.42, 8.6, 6, 0.3], [w * 0.64, h * 0.74, 6, 4.2, 0.1]];
    for (const s of st) {
      x.save(); x.translate(s[0], s[1]); x.rotate(s[4]); x.fillStyle = 'rgba(20,12,4,.26)'; x.beginPath(); x.ellipse(1.5, 2.2, s[2], s[3], 0, 0, TAU); x.fill();
      x.beginPath(); x.ellipse(0, 0, s[2], s[3], 0, 0, TAU); x.fillStyle = hsl(31, 13, 23.5); x.fill(); x.clip();
      x.fillStyle = hsl(33, 12, 33); x.beginPath(); x.ellipse(-s[2] * 0.14, -s[3] * 0.22, s[2] * 0.98, s[3] * 0.94, 0, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,240,215,.1)'; x.beginPath(); x.ellipse(-s[2] * 0.34, -s[3] * 0.42, s[2] * 0.36, s[3] * 0.22, -0.3, 0, TAU); x.fill(); x.restore();
    }
  }
  function dPalm(x, R, w, h) {                                       /* the shadow of a palm crown standing just off the path */
    x.translate(w * 0.5, h * 0.5); x.strokeStyle = '#150d04'; x.fillStyle = '#150d04';
    for (let pass = 0; pass < 2; pass++) {
      x.globalAlpha = pass ? 0.75 : 0.3; const grow = pass ? 0 : 2.2;
      for (let f = 0; f < 7; f++) {
        const a = f / 7 * TAU + 0.3 + Math.sin(f * 2.1) * 0.16, l = 50 + (f % 3) * 9, bend = (f % 2 ? 1 : -1) * 0.34;
        x.lineWidth = 2.4 + grow; x.beginPath(); x.moveTo(0, 0);
        const cx = Math.cos(a + bend) * l * 0.55, cy = Math.sin(a + bend) * l * 0.55, ex = Math.cos(a) * l, ey = Math.sin(a) * l; x.quadraticCurveTo(cx, cy, ex, ey); x.stroke();
        for (let q = 0.2; q < 0.98; q += 0.085) {
          const bx = (1 - q) * (1 - q) * 0 + 2 * (1 - q) * q * cx + q * q * ex, by = 2 * (1 - q) * q * cy + q * q * ey, ta = Math.atan2(ey - cy * (1 - q), ex - cx * (1 - q)), ll = (15 + grow) * Math.sin(q * Math.PI) + 4;
          for (const s of [-1, 1]) { const la = ta + s * 1.0; x.lineWidth = 2.5 + grow; x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + Math.cos(la) * ll, by + Math.sin(la) * ll); x.stroke(); }
        }
      }
      dot(x, 0, 0, 7 + grow);
    }
    x.globalAlpha = 1;
  }
  const MAPINK = '#22160a';
  function dCompass(x, R, w, h) {
    x.translate(w / 2, h / 2 + 3); x.strokeStyle = MAPINK; x.fillStyle = MAPINK; x.lineWidth = 1.3;
    x.beginPath(); x.arc(0, 0, 30, 0, TAU); x.stroke(); x.lineWidth = 0.8; x.beginPath(); x.arc(0, 0, 26.5, 0, TAU); x.stroke();
    for (let i = 0; i < 32; i++) { const a = i / 32 * TAU, r0 = i % 4 === 0 ? 22.5 : 24.5; x.beginPath(); x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); x.lineTo(Math.cos(a) * 26.5, Math.sin(a) * 26.5); x.stroke(); }
    const star = (len, wd, rot, fillHalf) => { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + rot; x.beginPath(); x.moveTo(Math.cos(a) * len, Math.sin(a) * len); x.lineTo(Math.cos(a + Math.PI / 2) * wd, Math.sin(a + Math.PI / 2) * wd); x.lineTo(0, 0); x.closePath(); if (fillHalf) x.fill(); x.beginPath(); x.moveTo(Math.cos(a) * len, Math.sin(a) * len); x.lineTo(Math.cos(a - Math.PI / 2) * wd, Math.sin(a - Math.PI / 2) * wd); x.lineTo(0, 0); x.closePath(); x.stroke(); } };
    x.lineWidth = 0.9; star(17, 3.6, Math.PI / 4, true); star(39, 5.4, -Math.PI / 2, true);
    x.lineWidth = 2; x.beginPath(); x.moveTo(-3.6, -41.5); x.lineTo(-3.6, -50); x.lineTo(3.6, -41.5); x.lineTo(3.6, -50); x.stroke();
    x.translate(-w / 2, -h / 2 - 3); wear(x, w, h, R, 60, 2);
  }
  function dStamp(word) {
    return function (x, R, w, h) {
      x.translate(w / 2, h / 2); x.rotate(-0.07); x.strokeStyle = '#3a160c'; x.lineWidth = 2; rr(x, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 4); x.stroke();
      x.lineWidth = 0.8; rr(x, -w / 2 + 8.4, -h / 2 + 8.4, w - 16.8, h - 16.8, 2.4); x.stroke();
      stencil(x, word, 0, 1, word.length > 6 ? 12.5 : 14.5, 'Alfa Slab One', 1.8, '#3a160c');
      x.rotate(0.07); x.translate(-w / 2, -h / 2); wear(x, w, h, R, 110, 2.2);
    };
  }
  function dAfrica(x, R, w, h) { stencil(x, 'AFRICA', w / 2, h / 2 + 1, 23, 'Alfa Slab One', 13, MAPINK); wear(x, w, h, R, 90, 2); }

  /* =====================================================================================================
     ACT 4 — NATIONALISM: the city square, cobbles laid in fans
     ===================================================================================================== */
  function tileFan(T) {
    const x = T.x, sh = shared(), W = 128, RR = 64, RINGS = 7, s = RR / RINGS, GROUT = hsl(222, 20, 16), H = RR + 1, V = 5, discs = [];
    for (let v = 0; v < V; v++) {                                   /* one fan of setts: concentric rings of stones */
      const dsc = mk(H * 2, H * 2), q = dsc.x; q.translate(H, H); dot(q, 0, 0, RR + 0.7, GROUT);
      for (let m = 0; m < RINGS; m++) {
        const rho = RR - s * (m + 0.5), n = Math.max(3, Math.round(TAU * rho / (s * 1.12))), off = hash(v, m, 300) * TAU, dth = Math.PI / n - 0.56 / rho;
        for (let i = 0; i < n; i++) {
          const th = off + i / n * TAU, k = hash(v * 29 + m, i, 310), k2 = hash(v * 29 + m, i, 311);
          q.fillStyle = k2 > 0.94 ? hsl(30, 6, 23 + k * 3) : hsl(215 + k2 * 10, 15 + k * 5, 24.2 + k * 5.6);
          q.beginPath(); q.arc(0, 0, rho + s / 2 - 0.56, th - dth, th + dth); q.arc(0, 0, Math.max(0.4, rho - s / 2 + 0.56), th + dth, th - dth, true); q.closePath(); q.fill();
        }
      }
      discs.push(dsc.cv);
    }
    x.fillStyle = GROUT; x.fillRect(0, 0, S, S);
    for (let j = -1; j <= 9; j++) for (let i = -1; i <= 4; i++) {    /* rows top to bottom: each fan overlaps the row above */
      const a = mod(i, 4), b = mod(j, 8); x.save(); x.translate(i * W + ((j & 1) ? W / 2 : 0), j * RR); x.rotate(hash(a, b, 320) * TAU);
      x.drawImage(discs[(hash(a, b, 321) * V) | 0], -H, -H, H * 2, H * 2); x.restore();
    }
    discs.forEach(free);
    mottle(T, sh.nD, 4, 0.07); mottle(T, sh.nL, 8, 0.03); mottle(T, sh.sD, 4, 0.045, false);
  }
  function dManhole(x, R, w, h) {
    x.translate(w / 2, h / 2); dot(x, 1, 1.4, 24.5, 'rgba(0,0,0,.3)'); dot(x, 0, 0, 24, hsl(222, 18, 13)); dot(x, 0, 0, 20.5, hsl(222, 15, 20));
    x.strokeStyle = hsl(222, 18, 13.5); x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 14, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, 7, 0, TAU); x.stroke();
    x.lineWidth = 2.2; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; x.beginPath(); x.moveTo(Math.cos(a) * 8.5, Math.sin(a) * 8.5); x.lineTo(Math.cos(a) * 18.5, Math.sin(a) * 18.5); x.stroke(); }
    x.strokeStyle = 'rgba(200,215,255,.09)'; x.lineWidth = 1.2; x.beginPath(); x.arc(0, 0, 22.3, Math.PI * 1.02, Math.PI * 1.62); x.stroke(); dot(x, -15.5, 0, 1.6, hsl(222, 18, 12)); dot(x, 15.5, 0, 1.6);
  }
  const DIM = [hsl(350, 22, 40), hsl(44, 26, 41), hsl(205, 20, 44), hsl(40, 16, 50), hsl(160, 16, 38)];
  function dConfetti(x, R, w, h) {
    for (let i = 0; i < 26; i++) { const px = 6 + R() * (w - 12), py = 6 + R() * (h - 12), d = Math.hypot(px - w / 2, (py - h / 2) * 1.2); if (d > w * 0.46 && R() < 0.7) continue; x.save(); x.translate(px, py); x.rotate(R() * TAU); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(-1.2, -0.4, 3.8, 2.4); x.fillStyle = DIM[(R() * DIM.length) | 0]; x.fillRect(-1.9, -1.2, 3.8, 2.4); x.restore(); }
  }
  function dBunting(x, R, w, h) {
    const P = (q) => [8 + q * (w - 16), h * 0.34 + Math.sin(q * Math.PI * 1.25 + 0.3) * 9 + q * 6];
    x.strokeStyle = 'rgba(8,10,16,.55)'; x.lineWidth = 1.3; x.beginPath(); for (let q = 0; q <= 1.001; q += 0.05) { const p = P(q); if (!q) x.moveTo(p[0], p[1]); else x.lineTo(p[0], p[1]); } x.stroke();
    for (let i = 0; i < 6; i++) {
      const q = 0.07 + i * 0.165, p = P(q), p2 = P(q + 0.1), a = Math.atan2(p2[1] - p[1], p2[0] - p[0]) + (R() - 0.5) * 0.5;
      x.save(); x.translate(p[0], p[1]); x.rotate(a); x.fillStyle = 'rgba(0,0,0,.26)'; x.beginPath(); x.moveTo(1.4, 2); x.lineTo(15.4, 2); x.lineTo(8.4, 18); x.closePath(); x.fill();
      x.fillStyle = DIM[i % 4]; x.beginPath(); x.moveTo(0, 0); x.lineTo(14, 0); x.lineTo(7, 16); x.closePath(); x.fill();
      x.fillStyle = 'rgba(0,0,0,.14)'; x.beginPath(); x.moveTo(7, 0); x.lineTo(14, 0); x.lineTo(7, 16); x.closePath(); x.fill(); x.restore();
    }
  }
  function chalk(x, R, pts, lw) {
    x.strokeStyle = '#dfe6f2'; x.lineWidth = lw || 2.2;
    for (let pass = 0; pass < 2; pass++) { x.globalAlpha = pass ? 0.55 : 0.8; x.beginPath(); pts.forEach((p, i) => { const px = p[0] + (R() - 0.5) * 1.2, py = p[1] + (R() - 0.5) * 1.2; if (!i) x.moveTo(px, py); else x.lineTo(px, py); }); x.stroke(); }
    x.globalAlpha = 1;
  }
  function dChalkGame(x, R, w, h) {
    const a = 9, b = w - 9, c = 9, d = h - 9, u = (b - a) / 3, v = (d - c) / 3;
    chalk(x, R, [[a + u, c], [a + u, d]]); chalk(x, R, [[a + 2 * u, c], [a + 2 * u, d]]); chalk(x, R, [[a, c + v], [b, c + v]]); chalk(x, R, [[a, c + 2 * v], [b, c + 2 * v]]);
    chalk(x, R, [[a + 3, c + 3], [a + u - 3, c + v - 3]]); chalk(x, R, [[a + u - 3, c + 3], [a + 3, c + v - 3]]);
    const ring = []; for (let i = 0; i <= 14; i++) { const q = i / 14 * TAU; ring.push([a + 1.5 * u + Math.cos(q) * (u / 2 - 3.4), c + 1.5 * v + Math.sin(q) * (v / 2 - 3.4)]); } chalk(x, R, ring);
    wear(x, w, h, R, 170, 2);
  }
  function dChalkArrow(x, R, w, h) { chalk(x, R, [[9, h / 2 + 2], [w - 13, h / 2 - 1]], 2.6); chalk(x, R, [[w - 26, h / 2 - 11], [w - 11, h / 2 - 1], [w - 25, h / 2 + 10]], 2.6); wear(x, w, h, R, 110, 2); }
  function dDrain(x, R, w, h) {
    x.fillStyle = 'rgba(0,0,0,.3)'; rr(x, 5, 5.6, w - 8, h - 8, 3); x.fill(); x.fillStyle = hsl(222, 16, 19.5); rr(x, 4, 4, w - 8, h - 8, 3); x.fill();
    x.fillStyle = hsl(222, 22, 9.5); for (let px = 9; px < w - 9; px += 5.4) { rr(x, px, 8, 2.6, h - 16, 1.2); x.fill(); }
    x.fillStyle = 'rgba(200,215,255,.08)'; x.fillRect(6.5, 4.8, w - 13, 1);
  }
  function dLeaflet(x, R, w, h) {
    x.translate(w / 2, h / 2); x.rotate(0.22); x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(-13.4, -17.2, 30, 38); x.fillStyle = hsl(42, 14, 41); x.fillRect(-15, -19, 30, 38);
    x.fillStyle = 'rgba(30,26,22,.5)'; x.fillRect(-11, -15, 22, 5.4); x.fillStyle = 'rgba(30,26,22,.28)'; for (let py = -6; py < 15; py += 4) x.fillRect(-11, py, 22 * (0.7 + R() * 0.3), 1.2);
    x.fillStyle = 'rgba(0,0,0,.1)'; x.beginPath(); x.moveTo(15, -19); x.lineTo(15, 19); x.lineTo(2, 19); x.closePath(); x.fill();
  }

  /* =====================================================================================================
     ACT 5 — THE SPARK: a Sarajevo street at night
     ===================================================================================================== */
  function tileSetts(T) {
    const x = T.x, sh = shared(), ROWS = 36, RH = S / ROWS, PER = 30, SW = S / PER;
    x.fillStyle = hsl(232, 32, 11.5); x.fillRect(0, 0, S, S);
    const joint = (i, j) => i * SW + ((j & 1) ? SW / 2 : 0) + (hash(mod(i, PER), j, 400) - 0.5) * 6.4;
    for (let j = 0; j < ROWS; j++) for (let i = -1; i <= PER; i++) {
      const a = mod(i, PER), x0 = joint(i, j), x1 = joint(i + 1, j), k = hash(a, j, 401), k2 = hash(a, j, 402), k3 = hash(a, j, 403), wet = k2 > 0.9;
      const y0 = j * RH + 0.7 + k3 * 0.9, hgt = RH - 1.4 - k3 * 0.9 - hash(a, j, 404) * 0.8, wdt = x1 - x0 - 1.5;
      x.fillStyle = hsl(226 + k2 * 10, 25 + k * 7, 20.6 + k * 4.8 + (wet ? 2.2 : 0)); rr(x, x0 + 0.75, y0, wdt, hgt, Math.min(4.8, wdt / 2.3, hgt / 2.3)); x.fill();
      x.fillStyle = wet ? 'rgba(175,195,255,.1)' : 'rgba(175,195,255,.04)'; x.beginPath(); x.ellipse(x0 + 0.75 + wdt * 0.36, y0 + hgt * 0.3, wdt * 0.26, hgt * 0.16, -0.2, 0, TAU); x.fill();
      x.fillStyle = 'rgba(0,0,12,.16)'; x.beginPath(); x.ellipse(x0 + 0.75 + wdt * 0.6, y0 + hgt * 0.8, wdt * 0.3, hgt * 0.14, 0, 0, TAU); x.fill();
    }
    mottle(T, sh.nD, 4, 0.07); mottle(T, sh.nL, 8, 0.025); mottle(T, sh.sD, 4, 0.04, false);
  }
  function puddle(x, R, w, h, lobes) {
    x.translate(w / 2, h / 2);
    const P = (i, g) => { const a = i / 48 * TAU, r = (1 + Math.sin(a * lobes + 0.6) * 0.15 + Math.sin(a * (lobes + 3) + 2) * 0.07) * g; return [Math.cos(a) * (w / 2 - 9) * r, Math.sin(a) * (h / 2 - 9) * r]; };
    const shape = (g) => { x.beginPath(); for (let i = 0; i <= 48; i++) { const p = P(i, g); if (!i) x.moveTo(p[0], p[1]); else x.lineTo(p[0], p[1]); } x.closePath(); };
    x.fillStyle = 'rgba(6,8,22,.42)'; shape(1.07); x.fill();                 /* damp rim */
    x.fillStyle = hsl(229, 46, 12.5); shape(1); x.fill();                    /* still water: darker and bluer than the stones */
    x.save(); shape(1); x.clip();
    x.fillStyle = 'rgba(140,165,245,.11)'; x.beginPath(); x.ellipse(-w * 0.08, -h * 0.15, w * 0.3, h * 0.07, -0.12, 0, TAU); x.fill();
    x.fillStyle = 'rgba(140,165,245,.07)'; x.beginPath(); x.ellipse(w * 0.1, h * 0.09, w * 0.22, h * 0.05, -0.12, 0, TAU); x.fill();
    x.restore();
    x.strokeStyle = 'rgba(175,195,255,.2)'; x.lineWidth = 1.1; x.beginPath(); for (let i = 26; i <= 37; i++) { const p = P(i, 0.985); if (i === 26) x.moveTo(p[0], p[1]); else x.lineTo(p[0], p[1]); } x.stroke();
  }
  function dPuddleA(x, R, w, h) { puddle(x, R, w, h, 3); }
  function dPuddleB(x, R, w, h) { puddle(x, R, w, h, 2); }
  function dFuse(x, R, w, h) {
    const path = () => { x.beginPath(); x.moveTo(12, h * 0.68); x.bezierCurveTo(w * 0.28, h * 0.02, w * 0.42, h * 1.02, w * 0.62, h * 0.52); x.bezierCurveTo(w * 0.74, h * 0.22, w * 0.86, h * 0.3, w - 14, h * 0.42); };
    x.strokeStyle = 'rgba(255,150,60,.1)'; x.lineWidth = 9; path(); x.stroke(); x.strokeStyle = 'rgba(255,170,80,.12)'; x.lineWidth = 4.6; path(); x.stroke();
    x.strokeStyle = 'rgba(6,8,18,.85)'; x.lineWidth = 2.5; path(); x.stroke(); x.strokeStyle = hsl(30, 26, 27); x.lineWidth = 1.4; x.setLineDash([3.4, 2.4]); path(); x.stroke(); x.setLineDash([]);
    x.strokeStyle = hsl(30, 26, 27); x.lineWidth = 1; for (const a of [-0.7, -0.1, 0.5]) { x.beginPath(); x.moveTo(w - 14, h * 0.42); x.lineTo(w - 14 + Math.cos(a) * 6, h * 0.42 + Math.sin(a) * 6); x.stroke(); }
  }
  const NPAINT = '#aab6dc';
  function dKeg(x, R, w, h) {
    x.translate(w / 2, h / 2 + 4); x.fillStyle = NPAINT; x.beginPath(); x.moveTo(-15, -22); x.quadraticCurveTo(-23, 0, -15, 22); x.lineTo(15, 22); x.quadraticCurveTo(23, 0, 15, -22); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(0, -23); x.quadraticCurveTo(7, -31, 12.5, -29.5); x.lineTo(12, -27); x.quadraticCurveTo(7, -28, 2.4, -22.5); x.closePath(); x.fill();
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.fillRect(-24, -14.5, 48, 2.6); x.fillRect(-24, 11.9, 48, 2.6); x.fillRect(-24, -1.3, 48, 2.6); x.fillRect(-1.2, -24, 2.4, 9.6); x.fillRect(-1.2, 14.4, 2.4, 9);
    x.globalCompositeOperation = 'source-over'; x.translate(-w / 2, -h / 2 - 4); wear(x, w, h, R, 110, 2.4);
  }
  function dTextCity(x, R, w, h) { stencil(x, 'SARAJEVO', w / 2, h / 2 + 1, 17, 'Alfa Slab One', 4.2, NPAINT); wear(x, w, h, R, 130, 2.2); }
  function dTextDate(x, R, w, h) { stencil(x, 'JUNE 28, 1914', w / 2, h / 2 + 1, 13.5, 'Alfa Slab One', 2.8, NPAINT); wear(x, w, h, R, 120, 2); }
  function dGrate(x, R, w, h) {
    x.fillStyle = 'rgba(0,0,0,.34)'; rr(x, 5, 5.6, w - 8, h - 8, 3); x.fill(); x.fillStyle = hsl(232, 26, 14); rr(x, 4, 4, w - 8, h - 8, 3); x.fill();
    x.fillStyle = hsl(234, 40, 5.5); for (let py = 9; py < h - 9; py += 5.2) { rr(x, 8, py, w - 16, 2.6, 1.2); x.fill(); } x.fillStyle = 'rgba(170,190,255,.08)'; x.fillRect(6.5, 4.8, w - 13, 1);
  }
  function dLampBase(x, R, w, h) {
    x.translate(w / 2, h / 2); dot(x, 0.8, 1.2, 9.4, 'rgba(0,0,0,.4)'); dot(x, 0, 0, 9, hsl(232, 24, 11)); dot(x, 0, 0, 6.4, hsl(232, 20, 17)); dot(x, 0, 0, 3.4, hsl(232, 24, 9));
    x.strokeStyle = 'rgba(255,200,140,.2)'; x.lineWidth = 1.1; x.beginPath(); x.arc(0, 0, 7.8, Math.PI * 1.05, Math.PI * 1.65); x.stroke();
  }

  /* ================= act table ================= */
  /* decal: [draw fn, w, h, weight, rotation mode, alpha, flags]   rotation: any | tilt (±0.4) | quad (90° steps) | hv (0/90°) | flat (±0.05)
     flags: t = needs the display font, m = may be mirrored, s = sways a little (shadows), l = baked at low resolution (soft things) */
  const D = (fn, w, h, wt, rot, alpha, flags) => ({ fn, w, h, wt, rot, alpha, flags: flags || '', reach: Math.hypot(w, h) * 0.6, spr: null });
  const ACTS = [
    { tone: '#2f3f47', tile: tileDeck, cell: 196, density: 0.56, seed: 510, clouds: 0.62,
      decals: [D(dAnchor, 72, 84, 1.5, 'quad', 0.17, 'm'), D(dHazard, 124, 34, 1.4, 'hv', 0.5, 'm'), D(dRope, 72, 72, 1.5, 'any', 0.9, 'm'), D(dHatch, 72, 72, 1.3, 'quad', 0.95), D(dRails, 176, 52, 1.2, 'hv', 0.92), D(dBalls, 64, 64, 1, 'quad', 0.95), D(dTextDeck, 168, 28, 0.3, 'flat', 0.16, 't')] },
    { tone: '#4b3424', tile: tileParquet, cell: 200, density: 0.5, seed: 520, clouds: 0.6,
      decals: [D(dTreaty, 60, 70, 1.7, 'any', 0.9, 'm'), D(dPapers, 84, 70, 1.3, 'any', 0.9, 'm'), D(dBlot, 56, 56, 1.2, 'any', 0.9, 'm'), D(dQuill, 92, 44, 1.3, 'any', 0.92, 'm'), D(dEnvelope, 60, 48, 1.1, 'any', 0.9, 'm'), D(dRing, 48, 48, 1, 'any', 0.9, 'm')] },
    { tone: '#665234', tile: tileSand, cell: 186, density: 0.6, seed: 530, clouds: 0.62,
      decals: [D((x, R, w, h) => dTuft(x, R, w, h, false), 48, 44, 2.2, 'flat', 0.95, 'm'), D((x, R, w, h) => dTuft(x, R, w, h, true), 60, 40, 1.8, 'flat', 0.95, 'm'), D(dStones, 60, 44, 1.9, 'any', 0.95, 'm'), D(dPalm, 150, 150, 0.62, 'any', 0.26, 'msl'), D(dCompass, 108, 112, 0.3, 'flat', 0.3),
        D(dStamp('RUBBER'), 96, 40, 0.26, 'tilt', 0.36, 't'), D(dStamp('GOLD'), 76, 40, 0.26, 'tilt', 0.36, 't'), D(dStamp('DIAMONDS'), 112, 40, 0.26, 'tilt', 0.36, 't'), D(dAfrica, 232, 40, 0.22, 'flat', 0.2, 't')] },
    { tone: '#343b47', tile: tileFan, cell: 200, density: 0.52, seed: 540, clouds: 0.55,
      decals: [D(dManhole, 56, 56, 1.1, 'any', 0.95), D(dConfetti, 84, 68, 2, 'any', 0.9, 'm'), D(dBunting, 150, 56, 1.3, 'any', 0.8, 'm'), D(dChalkGame, 64, 64, 0.9, 'tilt', 0.2), D(dChalkArrow, 88, 40, 0.9, 'any', 0.2, 'm'), D(dDrain, 48, 34, 0.9, 'hv', 0.95), D(dLeaflet, 52, 60, 1.1, 'any', 0.9, 'm')] },
    { tone: '#26293f', tile: tileSetts, cell: 204, density: 0.5, seed: 550, clouds: 0.46,
      decals: [D(dPuddleA, 104, 70, 1.8, 'any', 0.9, 'm'), D(dPuddleB, 76, 56, 1.6, 'any', 0.9, 'm'), D(dFuse, 200, 72, 1.1, 'any', 0.95, 'm'), D(dKeg, 64, 80, 0.7, 'tilt', 0.17), D(dTextCity, 152, 30, 0.32, 'flat', 0.17, 't'), D(dTextDate, 168, 28, 0.3, 'flat', 0.17, 't'), D(dGrate, 40, 40, 1, 'quad', 0.95)] },
  ];
  /* lettering lives on its own sparse lattice of cells (1 in 7), so two stencils can never sit side by side */
  for (const A of ACTS) { A.plain = []; A.texts = []; A.total = 0; A.decals.forEach((d, i) => { d.idx = i; if (d.flags.indexOf('t') >= 0) A.texts.push(d); else { A.plain.push(d); A.total += d.wt; } }); }

  /* ================= cache: one act's art in memory at a time ================= */
  const MACRO = 704;                  /* world period of the cloud layer (704 vs 512: the pair repeats every 5632 units) */
  const live = [];                    /* built acts, most recent first */
  let keep = 1, switches = 0, lastSwitch = 0;
  function evict(B) { free(B.tile); B.pat = null; B.macro = null; if (B.extra) for (const k in B.extra) if (B.extra[k] && B.extra[k].cv) free(B.extra[k].cv); for (const d of ACTS[B.act].decals) { if (d.spr) free(d.spr); d.spr = null; } }
  function build(act, c) {
    const A = ACTS[act], T = mk(S, S); A.tile(T);
    const B = { act, warm: 0, tile: T.cv, pat: pattern(c, T.cv), macro: pattern(c, shared().macro, MACRO / 128, act * 173, act * 97), extra: {} };
    if (act === 1) { const st = runnerStrip(); B.extra.strip = st; B.extra.stripPat = pattern(c, st.cv); B.extra.cap = runnerCap(); }
    if (act === 4) { const lb = mk(24, 24); dLampBase(lb.x, rng(5), 24, 24); B.extra.lamp = lb; }
    return B;
  }
  function ensure(act, c) {
    for (let i = 0; i < live.length; i++) if (live[i].act === act) { if (i) { const B = live.splice(i, 1)[0]; live.unshift(B); } return live[0]; }
    const now = Date.now(); if (now - lastSwitch < 1500) { if (++switches >= 3) keep = 2; } else switches = 0; lastSwitch = now;
    const B = build(act, c); live.unshift(B); while (live.length > keep) evict(live.pop()); return B;
  }
  function sprite(A, d, i) {
    if (d.spr) return d.spr;
    if (d.flags.indexOf('t') >= 0 && !fontOK('Alfa Slab One')) return null;   /* wait for the display font; drawn once it arrives */
    const T = mk(d.w, d.h, d.flags.indexOf('l') >= 0 ? 1 : PX); T.x.save(); d.fn(T.x, rng(A.seed * 31 + i * 7 + 3), d.w, d.h); T.x.restore(); return (d.spr = T.cv);
  }

  /* ================= per-frame drawing ================= */
  function decals(c, act, v, t) {
    const A = ACTS[act], cell = A.cell, M = 150, s = A.seed, i0 = Math.floor((v.x - M) / cell), i1 = Math.floor((v.x + v.w + M) / cell), j0 = Math.floor((v.y - M) / cell), j1 = Math.floor((v.y + v.h + M) / cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      let d;
      if (A.texts.length && mod(i * 3 + j * 5, 7) === 0 && hash(i, j, s + 8) < 0.3) d = A.texts[(hash(i, j, s + 9) * A.texts.length) | 0];
      else {
        if (hash(i, j, s) > A.density) continue;
        let pick = hash(i, j, s + 1) * A.total, k = 0; for (; k < A.plain.length - 1; k++) { pick -= A.plain[k].wt; if (pick <= 0) break; }
        d = A.plain[k];
      }
      const px = (i + 0.2 + 0.6 * hash(i, j, s + 2)) * cell, py = (j + 0.2 + 0.6 * hash(i, j, s + 3)) * cell;
      if (px + d.reach < v.x || px - d.reach > v.x + v.w || py + d.reach < v.y || py - d.reach > v.y + v.h) continue;
      const spr = sprite(A, d, d.idx); if (!spr) continue;
      const h4 = hash(i, j, s + 4), sc = 0.9 + 0.2 * hash(i, j, s + 5), flip = d.flags.indexOf('m') >= 0 && hash(i, j, s + 6) < 0.5;
      let rot = d.rot === 'any' ? h4 * TAU : d.rot === 'tilt' ? (h4 - 0.5) * 0.8 : d.rot === 'quad' ? Math.floor(h4 * 4) * Math.PI / 2 + (hash(i, j, s + 7) - 0.5) * 0.06 : d.rot === 'hv' ? (h4 < 0.5 ? 0 : Math.PI / 2) : (h4 - 0.5) * 0.1;
      if (d.flags.indexOf('s') >= 0) rot += Math.sin(t * 0.55 + h4 * 9) * 0.035;
      const cs = Math.cos(rot) * sc, sn = Math.sin(rot) * sc;
      c.save(); c.transform(flip ? -cs : cs, flip ? -sn : sn, -sn, cs, px, py); c.globalAlpha = d.alpha; c.drawImage(spr, -d.w / 2, -d.h / 2, d.w, d.h); c.restore();
    }
  }
  /* act 2: carpet runners */
  function runners(c, B, v) {
    const CW = 860, CH = 620, i0 = Math.floor((v.x - 1010) / CW), i1 = Math.floor((v.x + v.w + 20) / CW), j0 = Math.floor((v.y - 1070) / CH), j1 = Math.floor((v.y + v.h + 20) / CH), ex = B.extra;
    if (!ex.stripPat) return;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (hash(i, j, 601) > 0.46) continue;
      const horiz = hash(i, j, 602) < 0.62, len = 64 * Math.round(5 + hash(i, j, 603) * 5), px = (i + 0.1 + 0.3 * hash(i, j, 604)) * CW, py = (j + 0.15 + 0.5 * hash(i, j, 605)) * CH;
      const bw = horiz ? len : 76, bh = horiz ? 76 : len;
      if (px + bw + 12 < v.x || px - 12 > v.x + v.w || py + bh + 12 < v.y || py - 12 > v.y + v.h) continue;
      c.save(); c.translate(px, py); if (!horiz) { c.translate(76, 0); c.rotate(Math.PI / 2); }
      c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(1.5, 2.5, len, 76);
      c.fillStyle = ex.stripPat; c.fillRect(0, 0, len, 76);
      c.drawImage(ex.cap.cv, len - 0.5, 0, 9, 76); c.scale(-1, 1); c.drawImage(ex.cap.cv, -0.5, 0, 9, 76); c.restore();
    }
  }
  /* act 3: dotted colonial borders (a wobbly network between hashed nodes) + faint map graticule */
  const BW = 410;
  const nodeX = (i, j) => (i + 0.5 + (hash(i, j, 631) - 0.5) * 0.64) * BW, nodeY = (i, j) => (j + 0.5 + (hash(i, j, 632) - 0.5) * 0.64) * BW;
  function borders(c, v) {
    c.fillStyle = 'rgba(24,15,5,.1)'; const G = 340;
    for (let gx = Math.ceil(v.x / G) * G; gx < v.x + v.w; gx += G) c.fillRect(gx, v.y, 1.1, v.h);
    for (let gy = Math.ceil(v.y / G) * G; gy < v.y + v.h; gy += G) c.fillRect(v.x, gy, v.w, 1.1);
    const i0 = Math.floor(v.x / BW) - 1, i1 = Math.floor((v.x + v.w) / BW) + 1, j0 = Math.floor(v.y / BW) - 1, j1 = Math.floor((v.y + v.h) / BW) + 1;
    c.beginPath();
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ax = nodeX(i, j), ay = nodeY(i, j);
      for (let e = 0; e < 2; e++) {
        if (hash(i, j, 633 + e) > 0.58) continue;
        const bx = e ? nodeX(i, j + 1) : nodeX(i + 1, j), by = e ? nodeY(i, j + 1) : nodeY(i + 1, j), k = (hash(i, j, 635 + e) - 0.5) * 0.5;
        c.moveTo(ax, ay); c.quadraticCurveTo((ax + bx) / 2 - (by - ay) * k, (ay + by) / 2 + (bx - ax) * k, bx, by);
      }
    }
    c.lineCap = 'butt'; c.setLineDash([7, 5.5]); c.strokeStyle = 'rgba(30,19,8,.46)'; c.lineWidth = 1.8; c.stroke(); c.setLineDash([]);
  }
  /* act 5: tram rails and pools of lamplight */
  function rails(c, v) {
    const CW = 1080, i0 = Math.floor((v.x - 40) / CW), i1 = Math.floor((v.x + v.w + 40) / CW), j0 = Math.floor((v.y - 40) / CW), j1 = Math.floor((v.y + v.h + 40) / CW);
    for (let i = i0; i <= i1; i++) if (hash(i, 7, 651) < 0.6) { const p = (i + 0.25 + 0.5 * hash(i, 7, 652)) * CW; rail(c, v, false, p - 17); rail(c, v, false, p + 17); }
    for (let j = j0; j <= j1; j++) if (hash(9, j, 653) < 0.42) { const p = (j + 0.25 + 0.5 * hash(9, j, 654)) * CW; rail(c, v, true, p - 17); rail(c, v, true, p + 17); }
  }
  const RAIL = hsl(230, 26, 27);
  function rail(c, v, horiz, p) {                                    /* one steel rail sunk into the cobbles */
    c.fillStyle = 'rgba(6,8,20,.7)'; if (horiz) c.fillRect(v.x, p - 3, v.w, 6); else c.fillRect(p - 3, v.y, 6, v.h);
    c.fillStyle = RAIL; if (horiz) c.fillRect(v.x, p - 1.5, v.w, 3); else c.fillRect(p - 1.5, v.y, 3, v.h);
    c.fillStyle = 'rgba(190,205,255,.2)'; if (horiz) c.fillRect(v.x, p - 1.5, v.w, 0.9); else c.fillRect(p - 1.5, v.y, 0.9, v.h);
  }
  function lamps(c, B, v, t, over) {
    const sh = shared(), cell = 660, M = 190, i0 = Math.floor((v.x - M) / cell), i1 = Math.floor((v.x + v.w + M) / cell), j0 = Math.floor((v.y - M) / cell), j1 = Math.floor((v.y + v.h + M) / cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const h = hash(i, j, 661); if (h > 0.52) continue;
      const r = 150 + hash(i, j, 662) * 40, px = (i + 0.15 + 0.7 * hash(i, j, 663)) * cell, py = (j + 0.15 + 0.7 * hash(i, j, 664)) * cell;
      if (px + r < v.x || px - r > v.x + v.w || py + r < v.y || py - r > v.y + v.h) continue;
      const fl = 1 + Math.sin(t * 2.3 + h * 40) * 0.035 + Math.sin(t * 7.1 + h * 13) * 0.02;
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = (over ? 0.05 : 0.25) * fl; c.drawImage(sh.glow, px - r, py - r * 0.86, r * 2, r * 1.72);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      if (!over && B.extra.lamp) c.drawImage(B.extra.lamp.cv, px - 12, py - 12, 24, 24);
    }
  }

  function draw(c, act, v, t) {
    act = act < 0 ? 0 : act > 4 ? 4 : act | 0;
    const B = ensure(act, c), A = ACTS[act];
    if (B.warm < A.decals.length) { sprite(A, A.decals[B.warm], B.warm); B.warm++; }
    if (B.pat) { c.fillStyle = B.pat; c.fillRect(v.x - 1, v.y - 1, v.w + 2, v.h + 2); }
    else { const x0 = Math.floor(v.x / S) * S, y0 = Math.floor(v.y / S) * S; for (let py = y0; py < v.y + v.h; py += S) for (let px = x0; px < v.x + v.w; px += S) c.drawImage(B.tile, px, py, S + 0.5, S + 0.5); }
    if (B.macro) { c.globalAlpha = A.clouds; c.fillStyle = B.macro; c.fillRect(v.x - 1, v.y - 1, v.w + 2, v.h + 2); c.globalAlpha = 1; }
    if (act === 1) runners(c, B, v); else if (act === 2) borders(c, v); else if (act === 4) rails(c, v);
    decals(c, act, v, t);
    if (act === 4) lamps(c, B, v, t, false);
  }
  /* atmosphere above the actors: only the lamplight of act 5, at a whisper, so characters under a lamp warm up */
  const NONE = { extra: {} };
  function over(c, act, v, t) { if (act === 4) lamps(c, NONE, v, t, true); }
  function tone(act) { const A = ACTS[act < 0 ? 0 : act > 4 ? 4 : act | 0]; return A.tone; }

  ART.world = { draw, over, tone, _tileOf(act, c) { return ensure(act, c).tile; }, _sprite(act, k) { return sprite(ACTS[act], ACTS[act].decals[k], k); }, _acts: ACTS };
})();
