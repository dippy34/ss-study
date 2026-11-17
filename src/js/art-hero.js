/* art-hero.js — the eight heroes and every pickup. Registers PK.art.hero and PK.art.pickup. (HERO agent)

   PK.art.hero.draw(c, p, t, g)      one hero at (p.x, p.y). Reads p.char {id,color,hat,startWeapon}, p.moving, p.faceX,
                                     p.aim / p.aimT, p.iframes, p.hp / p.maxHp, p.r; g.t and g.state. No ground shadow.
   PK.art.pickup.gem(c, q, t, g)     q {x, y, v, born, pull}  — tier from PK.gemTier(q.v)
   PK.art.pickup.item(c, q, t, g)    q {kind: coin|heart|magnet|bomb|chest, x, y, born, pull}

   Hero local space: origin = centre of the hit circle (r 13); feet at y ≈ +15.7, hat tops at y ≈ -30.5; reach about
   ±25 sideways with the carried item (drawn facing right, mirrored with p.faceX). A roomy portrait frame is
   span ≈ 58 world units with the origin ≈ 9 units below the centre.
   The static parts (head + hat + face variants, coat, carried item, back gear) are rasterised once per character per
   resolution bucket and blitted; limbs, scarf, glows and sparks are live. Buckets follow the context's real pixel
   density, so a 220 px menu portrait is as crisp as the 44 px in-run hero. ~0.3 ms per hero.
   The "ouch" face shows only when health really dropped; plain i-frames just shimmer.
   Pickups: sprites baked once at 3 device px per world unit, one drawImage each (the chest adds a glow + sparkles). */
(function () {
  'use strict';
  const PK = (window.PK = window.PK || {});
  const ART = (PK.art = PK.art || {});
  const TAU = Math.PI * 2, PI = Math.PI;
  const OUT = '#0a1118', BRASS = '#f2bb3d', BRASS_D = '#b9861a', BRASS_L = '#ffe9a6', HI = 'rgba(255,255,255,.3)';
  const LW = 1.9;                      /* hero outline, world units */
  const AW = 4.6;                      /* arm thickness */
  const HX = 0.6, HY = -12.6;          /* head centre */
  const SHX = 1.2, SHY = 1.4;          /* offset of the lit layer: leaves ONE dark band bottom-right */

  /* ---------------- colour helpers (cached; nothing allocated per frame) ---------------- */
  const mixCache = {};
  function mix(hex, amt) {
    const k = hex + amt; let v = mixCache[k]; if (v) return v;
    const n = parseInt(hex.slice(1), 16), f = amt < 0 ? 0 : 255, t = Math.abs(amt);
    const r = Math.round(((n >> 16) & 255) + (f - ((n >> 16) & 255)) * t), g = Math.round(((n >> 8) & 255) + (f - ((n >> 8) & 255)) * t), b = Math.round((n & 255) + (f - (n & 255)) * t);
    return (mixCache[k] = '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1));
  }
  const glows = {};
  function glowSpr(col) {
    let s = glows[col]; if (s) return s;
    s = document.createElement('canvas'); s.width = s.height = 96; const x = s.getContext('2d'), n = parseInt(col.slice(1), 16), rgb = ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
    const gr = x.createRadialGradient(48, 48, 1, 48, 48, 48); gr.addColorStop(0, 'rgba(' + rgb + ',.95)'); gr.addColorStop(0.35, 'rgba(' + rgb + ',.5)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = gr; x.fillRect(0, 0, 96, 96); return (glows[col] = s);
  }
  function glow(c, x, y, r, col, a) { const pa = c.globalAlpha, po = c.globalCompositeOperation; c.globalCompositeOperation = 'lighter'; c.globalAlpha = pa * a; c.drawImage(glowSpr(col), x - r, y - r, r * 2, r * 2); c.globalAlpha = pa; c.globalCompositeOperation = po; }

  /* ---------------- tiny path helpers ---------------- */
  function dot(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
  function ell(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function ol(c, lw) { c.strokeStyle = OUT; c.lineWidth = lw; c.stroke(); }
  function fs(c, fill, lw) { c.fillStyle = fill; c.fill(); if (lw) ol(c, lw); }
  /* outlined capsule from a to b */
  function limb(c, x0, y0, x1, y1, w, col, lw) { c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.strokeStyle = OUT; c.lineWidth = w + 2 * (lw || LW * 0.8); c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
  function stick(c, x0, x1, w, col) { limb(c, x0, 0, x1, 0, w, col, 0.75); }
  /* two-tone fill (lit layer over a dark base) + small highlight + outline. `path` is a module-level function. */
  function shadeFill(c, path, base, dark, hx, hy, hr, lw) {
    path(c); c.fillStyle = dark; c.fill();
    c.save(); c.clip(); c.translate(-SHX, -SHY); path(c); c.fillStyle = base; c.fill(); c.translate(SHX, SHY);
    if (hr) { c.fillStyle = HI; ell(c, hx, hy, hr, hr * 0.5, -0.5); c.fill(); }
    c.restore(); path(c); ol(c, lw || LW);
  }
  function shadeRR(c, x, y, w, h, r, base, dark, lw) {
    rr(c, x, y, w, h, r); c.fillStyle = dark; c.fill();
    c.save(); c.clip(); rr(c, x - SHX * 0.8, y - SHY * 0.8, w, h, r); c.fillStyle = base; c.fill(); c.restore();
    rr(c, x, y, w, h, r); ol(c, lw || LW);
  }
  function lerpA(a, b, k) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; }

  /* ---------------- who they are ---------------- */
  const SPEC = {
    cadet:     { hat: 'cap',     weapon: 'blaster',   skin: '#f7cfa4', hair: '#7a4a26', brow: '#4a2c17', pants: '#2a3b52', boot: '#3a2a1e', seed: 0.3 },
    admiral:   { hat: 'helmet',  weapon: 'cannon',    skin: '#ecbd90', hair: '#eef1f3', brow: '#eef1f3', pants: '#34432c', boot: '#22272b', seed: 1.1 },
    diplomat:  { hat: 'tophat',  weapon: 'orbs',      skin: '#93603f', hair: '#1c1a1f', brow: '#141216', pants: '#1f2b3f', boot: '#14181e', seed: 2.2 },
    explorer:  { hat: 'pith',    weapon: 'boomerang', skin: '#d39b6c', hair: '#4f2d1a', brow: '#3a2012', pants: '#7a6842', boot: '#4a3020', seed: 3.4 },
    firebrand: { hat: 'beret',   weapon: 'trail',     skin: '#fbdcc4', hair: '#ff8a1f', brow: '#b84a0a', pants: '#2b2433', boot: '#1c191f', seed: 4.0 },
    sparky:    { hat: 'goggles', weapon: 'chain',     skin: '#ad7248', hair: '#231815', brow: '#1a1210', pants: '#3d3644', boot: '#4a3020', seed: 5.3 },
    neutral:   { hat: 'bowler',  weapon: 'aura',      skin: '#f3c9a7', hair: '#f6f6f3', brow: '#f6f6f3', pants: '#2c3743', boot: '#14181e', seed: 6.1 },
    editor:    { hat: 'visor',   weapon: 'press',     skin: '#bd8256', hair: '#20181a', brow: '#141012', pants: '#2b323b', boot: '#3a2a1e', seed: 7.2 },
  };
  const HAT_TO_ID = { cap: 'cadet', helmet: 'admiral', tophat: 'diplomat', pith: 'explorer', beret: 'firebrand', goggles: 'sparky', bowler: 'neutral', visor: 'editor' };
  const LOOKS = {};
  let banked = 0;
  function look(ch) {
    ch = ch || {};
    let col = typeof ch.color === 'string' ? ch.color : BRASS;
    if (/^#[0-9a-f]{3}$/i.test(col)) col = '#' + col[1] + col[1] + col[2] + col[2] + col[3] + col[3]; else if (!/^#[0-9a-f]{6}$/i.test(col)) col = BRASS;
    const key = (ch.id || '') + '|' + col + '|' + (ch.hat || '') + '|' + (ch.startWeapon || '');
    let L = LOOKS[key]; if (L) return L;
    const id = SPEC[ch.id] ? ch.id : (HAT_TO_ID[ch.hat] || 'cadet'), s = SPEC[id];
    L = { id, hat: HATS[ch.hat] ? ch.hat : s.hat, weapon: ITEMS[ch.startWeapon] ? ch.startWeapon : s.weapon, seed: s.seed, bank: {},
      coat: col, coatD: mix(col, -0.28), coatDD: mix(col, -0.48), coatL: mix(col, 0.4),
      skin: s.skin, skinD: mix(s.skin, -0.2), hair: s.hair, hairD: mix(s.hair, -0.28), brow: s.brow, whiteBrow: id === 'admiral' || id === 'neutral',
      pants: s.pants, pantsD: mix(s.pants, -0.3), boot: s.boot, bootD: mix(s.boot, -0.3) };
    L.sleeve = id === 'editor' ? '#f6f1e6' : col; L.sleeveD = mix(L.sleeve, -0.3); L.ring = mix(col, 0.8);
    return (LOOKS[key] = L);
  }

  /* ---------------- sprite bank ---------------- */
  const BUCKETS = [2, 3.3, 5, 7.5, 11, 16, 24];
  function bucketFor(px) { for (let i = 0; i < BUCKETS.length; i++) if (px <= BUCKETS[i] + 0.02) return BUCKETS[i]; return 24; }
  function mk(B, x0, y0, x1, y1, fn, L, a) {
    const cv = document.createElement('canvas'); cv.width = Math.ceil((x1 - x0) * B); cv.height = Math.ceil((y1 - y0) * B);
    const x = cv.getContext('2d'); x.scale(B, B); x.translate(-x0, -y0); x.lineJoin = 'round'; x.lineCap = 'round'; fn(x, L, a);
    if (++banked > 260) { for (const k in LOOKS) LOOKS[k].bank = {}; banked = 0; }
    return { cv, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function put(c, s) { c.drawImage(s.cv, s.x, s.y, s.w, s.h); }

  /* ---------------- carried items (item space: origin = hand, +x = where the item points) ---------------- */
  function bWand(c) {
    stick(c, -2.4, 6.2, 2.0, '#9a6a35');
    rr(c, 5.4, -1.9, 2.4, 3.8, 0.7); fs(c, '#aeb9bf', 1.0);
    dot(c, 10.2, 0, 3.8); fs(c, '#fff3a8', 1.25);
    c.strokeStyle = '#ff9a1f'; c.lineWidth = 0.85; c.beginPath(); c.moveTo(8.5, 1.0); c.lineTo(9.4, -1.0); c.lineTo(10.3, 1.0); c.lineTo(11.2, -1.0); c.lineTo(11.9, 0.6); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.95)'; dot(c, 9.0, -1.7, 0.85); c.fill();
  }
  function lWand(c, L, t, k) { glow(c, 10.2, 0, 9.5 + k * 6 + Math.sin(t * 6) * 0.6, '#ffe27a', 0.55 + k * 0.4); if (k > 0.2) { const pa = c.globalAlpha; c.globalAlpha = pa * Math.min(1, k * 1.3); c.fillStyle = '#ffffff'; dot(c, 10.2, 0, 3.2 + k * 1.3); c.fill(); c.globalAlpha = pa; } }
  function bGun(c) {                                            /* deck gun carried across the shoulders; origin = behind the neck */
    shadeRR(c, -15.5, -3.3, 31.5, 6.6, 3.1, '#6f7d86', '#434e55', 1.7);
    c.fillStyle = 'rgba(255,255,255,.28)'; rr(c, 9.4, -2.3, 4.6, 1.2, 0.6); c.fill(); rr(c, -11.6, -2.3, 3.2, 1.2, 0.6); c.fill();
    rr(c, 14.6, -4.3, 4.2, 8.6, 1.6); fs(c, '#4d5961', 1.6);
    c.fillStyle = OUT; ell(c, 18.2, 0, 0.9, 2.8); c.fill();
    rr(c, 10.4, -3.7, 2.5, 7.4, 0.8); fs(c, BRASS, 1.15); rr(c, -13.2, -3.7, 2.5, 7.4, 0.8); fs(c, BRASS, 1.15);
    dot(c, -16.6, 0, 2.0); fs(c, BRASS, 1.2);
  }
  function ringO(c, x, y, r, col) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.strokeStyle = OUT; c.lineWidth = 3.2; c.stroke(); c.strokeStyle = col; c.lineWidth = 1.7; c.stroke(); }
  function bRings(c) {
    stick(c, -5.6, 8.0, 2.0, '#9a6a35');
    rr(c, 6.8, -1.7, 2.0, 3.4, 0.7); fs(c, BRASS, 1.0);
    ringO(c, 10.9, -1.8, 3.2, '#4da8ff'); ringO(c, 13.9, 1.8, 3.2, '#f1f8ff');
    c.save(); c.beginPath(); c.rect(10.6, -6.2, 4.4, 4.4); c.clip(); ringO(c, 10.9, -1.8, 3.2, '#4da8ff'); c.restore();
  }
  function lRings(c, L, t, k) { glow(c, 12.4, 0, 8.5 + k * 4, '#4da8ff', 0.28 + k * 0.4 + Math.sin(t * 3 + L.seed) * 0.06); }
  function bRod(c) {
    stick(c, -4.8, 8.4, 1.8, '#b6c1c7');
    for (let i = 0; i < 3; i++) { rr(c, 3.4 + i * 1.8, -2.0, 1.1, 4.0, 0.5); fs(c, BRASS, 0.85); }
    dot(c, 10.4, 0, 2.2); fs(c, '#e6eef2', 1.2);
  }
  function lRod(c, L, t, k) {
    const f = (t * 13 + L.seed * 3) | 0; if (f % 3 === 0 && k <= 0) return;
    glow(c, 10.4, 0, 7.5 + k * 5, '#bfe6ff', 0.5 + k * 0.4);
    const po = c.globalCompositeOperation, a = (f % 4) * 1.57 + 0.4, cs = Math.cos(a), sn = Math.sin(a);
    c.globalCompositeOperation = 'lighter'; c.strokeStyle = '#fff7b0'; c.lineWidth = 1.2; c.beginPath();
    c.moveTo(10.4 + cs * 2.4, sn * 2.4); c.lineTo(10.4 + cs * 4.4 - sn * 1.4, sn * 4.4 + cs * 1.4); c.lineTo(10.4 + cs * 4.9 + sn * 1.0, sn * 4.9 - cs * 1.0); c.lineTo(10.4 + cs * 7.8, sn * 7.8); c.stroke();
    c.globalCompositeOperation = po;
  }
  function bBoom(c) {                                            /* held by one tip, arching forward */
    c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); c.moveTo(0.3, 0.2); c.lineTo(4.7, -5.7); c.lineTo(9.9, -1.5);
    c.strokeStyle = OUT; c.lineWidth = 5.7; c.stroke(); c.strokeStyle = '#b77dff'; c.lineWidth = 3.6; c.stroke();
    c.strokeStyle = '#e9d8ff'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(1.5, -1.5); c.lineTo(2.9, -3.4); c.moveTo(7.0, -3.9); c.lineTo(8.7, -2.5); c.stroke();
    c.fillStyle = BRASS; dot(c, 4.7, -5.5, 1.0); c.fill();
  }
  function bSparkler(c) { stick(c, -1.8, 9.2, 1.4, '#6a747b'); c.fillStyle = '#3a4248'; c.fillRect(5.2, -0.7, 3.4, 1.4); }
  function lSparkler(c, L, t) {
    const f = t * 22, st = Math.floor(f / 3);
    glow(c, 9.8, 0, 8.5 + Math.sin(f) * 1.2, '#ffb347', 0.8);
    const po = c.globalCompositeOperation; c.globalCompositeOperation = 'lighter'; c.strokeStyle = '#fff3b0'; c.lineWidth = 1.05; c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + st * 1.3, len = 2.6 + ((i * 7 + st * 3) % 5) * 0.8; c.moveTo(9.8 + Math.cos(a) * 1.3, Math.sin(a) * 1.3); c.lineTo(9.8 + Math.cos(a) * len, Math.sin(a) * len); }
    c.stroke(); c.globalCompositeOperation = po;
    c.fillStyle = '#ffffff'; dot(c, 9.8, 0, 1.5); c.fill();
  }
  function bUmbrella(c) {                                        /* a gentleman's umbrella, used as a cane */
    c.lineCap = 'round'; c.beginPath(); c.moveTo(0.5, 0); c.lineTo(-3.2, 0); c.arc(-3.2, -2.0, 2.0, PI / 2, PI * 1.5, false);
    c.strokeStyle = OUT; c.lineWidth = 3.6; c.stroke(); c.strokeStyle = '#a66c3a'; c.lineWidth = 1.9; c.stroke();
    stick(c, 0.5, 9.2, 1.2, '#3a2a1e');
    c.beginPath(); c.moveTo(1.9, 0); c.quadraticCurveTo(3.9, -3.4, 8.0, -1.1); c.lineTo(9.0, 0); c.lineTo(8.0, 1.1); c.quadraticCurveTo(3.9, 3.4, 1.9, 0); c.closePath(); fs(c, '#1f2833', 1.35);
    c.strokeStyle = '#55657a'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(3.0, -1.2); c.quadraticCurveTo(5.6, -1.8, 7.9, -0.5); c.stroke();
    c.strokeStyle = BRASS; c.lineWidth = 1.2; c.beginPath(); c.moveTo(1.9, -1.0); c.lineTo(1.9, 1.0); c.stroke();
    stick(c, 9.4, 10.4, 0.9, BRASS);
  }
  function bPaper(c) {                                           /* +x = top of the page */
    rr(c, 0.4, -5.0, 12.0, 10.0, 1.1); fs(c, '#f6eedb', 1.4);
    c.fillStyle = '#ddd2b4'; c.fillRect(1.2, 2.6, 10.4, 1.5);
    c.fillStyle = '#2c2c30'; c.fillRect(9.2, -3.9, 1.9, 6.0);
    c.fillStyle = '#6d6a66'; c.fillRect(6.9, -3.9, 0.9, 6.0); c.fillRect(5.2, -3.9, 0.9, 4.2); c.fillRect(3.5, -3.9, 0.9, 6.0);
    c.fillStyle = '#b9483a'; c.fillRect(1.9, -3.9, 0.9, 2.6);
  }
  /* arm = rest angle of the holding arm, item = rest angle of the item (radians, 0 = forward, + = down) */
  const ITEMS = {
    blaster:   { arm: 0.95, item: -1.12, swing: 0.5, aims: true, box: [-4.6, -5.6, 15.8, 5.6], bake: bWand, live: lWand },
    cannon:    { arm: 0.1, item: -0.09, swing: 0, aims: true, gun: true, box: [-20, -6, 20.6, 6], bake: bGun },
    orbs:      { arm: 1.02, item: -1.2, swing: 0.2, aims: true, box: [-7.8, -7.4, 19.2, 7.4], bake: bRings, live: lRings },
    chain:     { arm: 0.95, item: -1.08, swing: 0.4, aims: true, box: [-7, -4.4, 14.6, 4.4], bake: bRod, live: lRod },
    boomerang: { arm: 1.0, item: -0.22, swing: 0.22, aims: false, box: [-3.2, -9.4, 13.4, 3.6], bake: bBoom },
    trail:     { arm: 2.0, item: 2.42, swing: 0.3, aims: false, back: true, box: [-4, -3, 12, 3], bake: bSparkler, live: lSparkler },
    aura:      { arm: 1.08, item: 1.5, swing: 0.22, aims: false, box: [-7.6, -6.4, 14.6, 5.6], bake: bUmbrella },
    press:     { arm: -0.5, item: -1.18, swing: 0.14, aims: false, wave: 5, box: [-1.4, -7, 14.6, 7], bake: bPaper },
  };

  /* ---------------- hats (head space: head centre 0,0, radius ≈ 10.5) ---------------- */
  function pCapCrown(c) { c.beginPath(); c.moveTo(-9.5, -5.5); c.lineTo(-9.0, -12.4); c.quadraticCurveTo(-8.8, -15.0, -6.2, -15.1); c.lineTo(6.9, -14.1); c.quadraticCurveTo(9.3, -13.9, 9.4, -11.6); c.lineTo(9.9, -6.0); c.quadraticCurveTo(0.4, -8.6, -9.5, -5.5); c.closePath(); }
  function pCapVisor(c) { c.beginPath(); c.moveTo(1.4, -7.7); c.quadraticCurveTo(8.8, -7.8, 13.8, -3.8); c.quadraticCurveTo(7.6, -5.0, 2.0, -4.8); c.closePath(); }
  function pHelmet(c) { c.beginPath(); c.moveTo(-11.0, -4.0); c.bezierCurveTo(-11.8, -11.6, -5.8, -15.0, 0.2, -15.0); c.bezierCurveTo(6.4, -15.0, 12.0, -11.3, 11.4, -4.4); c.quadraticCurveTo(0.5, -7.5, -11.0, -4.0); c.closePath(); }
  function pTopCrown(c) { c.beginPath(); c.moveTo(-7.0, -7.7); c.lineTo(-7.8, -15.7); c.quadraticCurveTo(0.3, -17.3, 8.4, -15.7); c.lineTo(7.6, -7.7); c.quadraticCurveTo(0.3, -6.4, -7.0, -7.7); c.closePath(); }
  function pPithDome(c) { c.beginPath(); c.moveTo(-9.7, -5.5); c.bezierCurveTo(-10.2, -12.5, -5.0, -15.6, 0.2, -15.6); c.bezierCurveTo(5.7, -15.6, 10.6, -12.3, 10.5, -6.0); c.quadraticCurveTo(0.4, -8.1, -9.7, -5.5); c.closePath(); }
  function pBeret(c) { c.beginPath(); c.moveTo(-10.0, -4.7); c.bezierCurveTo(-15.6, -8.0, -12.8, -15.5, -3.6, -15.7); c.bezierCurveTo(4.8, -15.9, 11.9, -12.7, 10.5, -6.3); c.quadraticCurveTo(0.2, -8.5, -10.0, -4.7); c.closePath(); }
  function pAviator(c) { c.beginPath(); c.moveTo(-10.9, -3.4); c.bezierCurveTo(-11.8, -11.2, -5.7, -14.7, 0.3, -14.7); c.bezierCurveTo(6.3, -14.7, 12.1, -11.0, 11.3, -4.5); c.quadraticCurveTo(0.4, -7.7, -10.9, -3.4); c.closePath(); }
  function pFlap(c) { c.beginPath(); c.moveTo(-11.0, -4.6); c.lineTo(-5.4, -5.8); c.quadraticCurveTo(-4.0, 2.4, -6.2, 5.9); c.quadraticCurveTo(-9.8, 7.6, -10.9, 3.2); c.closePath(); }
  function pBowler(c) { c.beginPath(); c.moveTo(-8.7, -5.8); c.bezierCurveTo(-9.8, -13.1, -4.9, -16.3, 0.3, -16.3); c.bezierCurveTo(5.5, -16.3, 10.2, -13.1, 9.3, -6.1); c.quadraticCurveTo(0.3, -4.9, -8.7, -5.8); c.closePath(); }
  const HATS = {
    cap(c, L) {
      shadeFill(c, pCapCrown, '#2f5078', '#1d3454', -4.8, -12.6, 2.4);
      c.save(); pCapCrown(c); c.clip(); c.fillStyle = L.coat; c.fillRect(-11, -9.4, 22, 3.8); c.fillStyle = L.coatD; c.fillRect(4.8, -9.4, 7, 3.8); c.restore(); pCapCrown(c); ol(c, LW);
      dot(c, 4.2, -11.4, 1.75); fs(c, BRASS, 1.0); c.fillStyle = BRASS_L; dot(c, 3.8, -11.8, 0.6); c.fill();
      pCapVisor(c); fs(c, '#141a22', 1.6);
      c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(4.4, -6.5); c.quadraticCurveTo(8.8, -6.3, 11.6, -4.6); c.stroke();
    },
    helmet(c) {
      shadeFill(c, pHelmet, '#5b6b3d', '#3c4928', -4.8, -11.8, 3.0);
      c.lineCap = 'round'; c.beginPath(); c.moveTo(-11.0, -4.0); c.quadraticCurveTo(0.5, -7.5, 11.4, -4.4); c.strokeStyle = OUT; c.lineWidth = 3.5; c.stroke(); c.strokeStyle = BRASS; c.lineWidth = 1.6; c.stroke();
      c.beginPath(); c.moveTo(6.4, -5.9); c.quadraticCurveTo(11.6, -5.3, 13.6, -2.7); c.quadraticCurveTo(10.0, -3.7, 6.9, -3.8); c.closePath(); fs(c, '#2c3620', 1.4);
      c.beginPath(); c.moveTo(4.4, -12.7); c.lineTo(6.4, -10.3); c.lineTo(4.4, -7.9); c.lineTo(2.4, -10.3); c.closePath(); fs(c, BRASS, 1.0);
      c.beginPath(); c.moveTo(-1.9, -14.4); c.lineTo(0.1, -17.2); c.lineTo(2.1, -14.4); c.closePath(); fs(c, BRASS, 1.3);
      rr(c, -2.6, -15.2, 5.4, 1.8, 0.8); fs(c, BRASS_D, 1.0);
    },
    tophat(c, L) {
      c.save(); c.rotate(-0.06);
      shadeFill(c, pTopCrown, '#283340', '#121922', -4.4, -13.6, 2.2);
      c.save(); pTopCrown(c); c.clip(); c.fillStyle = L.coat; c.fillRect(-9, -10.8, 18, 2.8); c.fillStyle = L.coatD; c.fillRect(3.8, -10.8, 6, 2.8); c.restore(); pTopCrown(c); ol(c, LW);
      ell(c, 0.4, -7.5, 12.4, 2.4); fs(c, '#283340', 1.7);
      c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 0.8; c.beginPath(); c.ellipse(0.4, -7.5, 10.4, 1.3, 0, PI * 1.08, PI * 1.5); c.stroke();
      c.restore();
    },
    pith(c, L) {
      shadeFill(c, pPithDome, '#ead4a0', '#c2a770', -4.4, -12.2, 3.0);
      c.save(); pPithDome(c); c.clip(); c.fillStyle = L.coat; c.fillRect(-11, -9.0, 22, 2.5); c.strokeStyle = 'rgba(10,17,24,.22)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(0.2, -15.6); c.quadraticCurveTo(3.0, -12, 2.8, -8.6); c.stroke(); c.restore(); pPithDome(c); ol(c, LW);
      c.save(); c.translate(0.6, -5.9); c.rotate(0.09); ell(c, 0, 0, 13.6, 2.7); fs(c, '#dcc48c', 1.7); c.fillStyle = 'rgba(255,255,255,.32)'; ell(c, -4.4, -0.9, 5, 0.75); c.fill(); c.restore();
      dot(c, 0.2, -15.6, 1.3); fs(c, '#c2a770', 1.0);
    },
    beret(c, L) {
      shadeFill(c, pBeret, '#2f3643', '#181c25', -6.8, -12.6, 2.8);
      c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = 1.8; c.beginPath(); c.moveTo(-2.7, -15.5); c.lineTo(-2.0, -17.1); c.stroke();
      c.beginPath(); c.moveTo(-9.9, -4.5); c.quadraticCurveTo(0.2, -8.3, 10.3, -6.1); c.strokeStyle = OUT; c.lineWidth = 3.2; c.stroke(); c.strokeStyle = '#4a5364'; c.lineWidth = 1.4; c.stroke();
      dot(c, 5.4, -10.3, 1.45); fs(c, L.coat, 1.0);
    },
    goggles(c) {
      shadeFill(c, pFlap, '#8f5a32', '#603b1f', 0, 0, 0, 1.6);
      shadeFill(c, pAviator, '#8f5a32', '#603b1f', -4.8, -11.4, 3.0);
      c.strokeStyle = 'rgba(10,17,24,.3)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(0.3, -14.7); c.quadraticCurveTo(1.2, -11, 0.8, -8.2); c.stroke();
      c.lineCap = 'round'; c.beginPath(); c.moveTo(-10.7, -6.0); c.quadraticCurveTo(0.3, -10.3, 11.1, -6.5); c.strokeStyle = OUT; c.lineWidth = 3.3; c.stroke(); c.strokeStyle = '#3b2616'; c.lineWidth = 1.6; c.stroke();
      for (let i = 0; i < 2; i++) { const x = i ? 6.9 : -0.5, y = i ? -8.5 : -9.0, r = i ? 3.5 : 3.3; dot(c, x, y, r); c.fillStyle = '#bfe9ff'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 3.0; c.stroke(); c.strokeStyle = BRASS; c.lineWidth = 1.4; c.stroke(); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 0.9; c.beginPath(); c.arc(x, y, r - 1.5, PI * 1.05, PI * 1.5); c.stroke(); }
    },
    bowler(c, L) {
      shadeFill(c, pBowler, '#2b3541', '#151a22', -4.2, -12.6, 2.6);
      c.save(); pBowler(c); c.clip(); c.fillStyle = mix(L.coat, 0.2); c.fillRect(-10, -8.9, 20, 2.4); c.restore(); pBowler(c); ol(c, LW);
      c.lineCap = 'round'; c.beginPath(); c.moveTo(-11.7, -6.7); c.quadraticCurveTo(0.4, -4.3, 12.3, -7.0); c.strokeStyle = OUT; c.lineWidth = 4.7; c.stroke(); c.strokeStyle = '#2b3541'; c.lineWidth = 2.6; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-9.6, -6.9); c.quadraticCurveTo(-4, -5.7, 0.4, -5.6); c.stroke();
    },
    visor(c) {
      c.lineCap = 'round'; c.beginPath(); c.moveTo(-10.5, -4.3); c.quadraticCurveTo(0.2, -8.1, 10.7, -5.5); c.strokeStyle = OUT; c.lineWidth = 3.5; c.stroke(); c.strokeStyle = '#2a4a38'; c.lineWidth = 1.7; c.stroke();
      c.beginPath(); c.moveTo(-0.8, -7.1); c.quadraticCurveTo(8.8, -8.2, 14.6, -2.5); c.quadraticCurveTo(7.6, -4.8, 0.0, -4.1); c.closePath();
      c.fillStyle = 'rgba(64,208,128,.84)'; c.fill(); ol(c, 1.5);
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(3.0, -6.5); c.quadraticCurveTo(8.6, -6.7, 12.2, -4.2); c.stroke();
    },
  };

  /* ---------------- head (baked per face variant) ---------------- */
  function pHead(c) { c.beginPath(); c.ellipse(0, 0, 10.8, 10.3, 0, 0, TAU); }
  function pHairSide(c) { c.beginPath(); c.moveTo(-12, -12); c.lineTo(-1.0, -12); c.quadraticCurveTo(-6.8, -5.0, -5.6, 0.4); c.quadraticCurveTo(-5.2, 4.6, -8.4, 7.6); c.lineTo(-12, 9); c.closePath(); }
  function pHairLow(c) { c.beginPath(); c.moveTo(-12, -1.4); c.quadraticCurveTo(-7.0, -1.2, -6.4, 2.6); c.quadraticCurveTo(-6.6, 6.2, -9.2, 7.7); c.lineTo(-12, 9); c.closePath(); }
  function pHairTop(c) { c.beginPath(); c.moveTo(-12, -12); c.lineTo(12, -12); c.lineTo(12, -5.6); c.quadraticCurveTo(6.6, -9.6, 1.2, -6.2); c.quadraticCurveTo(-3.6, -3.6, -5.6, 0.4); c.quadraticCurveTo(-5.2, 4.6, -8.4, 7.6); c.lineTo(-12, 9); c.closePath(); }
  const EX0 = -1.6, EX1 = 5.5, EY = 0.9;
  /* mood 0 calm · 1 worried · 2 hurt */
  function face(c, L, mood, blink, happy) {
    c.fillStyle = 'rgba(255,105,105,.3)'; ell(c, EX0 - 2.7, EY + 4.0, 2.2, 1.35); c.fill(); ell(c, EX1 + 1.8, EY + 3.8, 2.0, 1.35); c.fill();
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (mood === 3) {                                                          /* dazed: spiral eyes */
      ell(c, EX0, EY, 2.6, 3.3); fs(c, '#ffffff', 0.9); ell(c, EX1, EY, 2.9, 3.5); fs(c, '#ffffff', 0.9);
      c.strokeStyle = OUT; c.lineWidth = 0.95;
      for (let n = 0; n < 2; n++) { const ex = n ? EX1 : EX0, er = n ? 2.3 : 2.1; c.beginPath(); for (let i = 0; i <= 24; i++) { const a = i * 0.52 + n, q = er * i / 24; if (i) c.lineTo(ex + Math.cos(a) * q, EY + Math.sin(a) * q * 1.15); else c.moveTo(ex, EY); } c.stroke(); }
    } else if (mood === 4) {                                                   /* cheer: eyes squeezed shut with joy */
      c.strokeStyle = OUT; c.lineWidth = 1.7; c.beginPath(); c.arc(EX0, EY + 1.5, 2.5, PI * 1.12, PI * 1.88); c.stroke(); c.beginPath(); c.arc(EX1, EY + 1.5, 2.7, PI * 1.12, PI * 1.88); c.stroke();
    } else if (mood === 2) {
      c.strokeStyle = OUT; c.lineWidth = 1.5; c.beginPath(); c.moveTo(EX0 - 2.1, EY - 2.1); c.lineTo(EX0 + 1.6, EY); c.lineTo(EX0 - 2.1, EY + 2.1); c.moveTo(EX1 + 2.3, EY - 2.1); c.lineTo(EX1 - 1.4, EY); c.lineTo(EX1 + 2.3, EY + 2.1); c.stroke();
    } else if (blink) {
      c.strokeStyle = OUT; c.lineWidth = 1.45; c.beginPath(); c.arc(EX0, EY - 0.8, 2.3, 0.15 * PI, 0.85 * PI); c.stroke(); c.beginPath(); c.arc(EX1, EY - 0.8, 2.5, 0.15 * PI, 0.85 * PI); c.stroke();
    } else {
      ell(c, EX0, EY, 2.5, 3.2); fs(c, '#ffffff', 0.9); ell(c, EX1, EY, 2.8, 3.4); fs(c, '#ffffff', 0.9);
      c.fillStyle = OUT; dot(c, EX0 + 0.55, EY + 0.45, 1.95); c.fill(); dot(c, EX1 + 0.6, EY + 0.45, 2.1); c.fill();
      c.fillStyle = '#ffffff'; dot(c, EX0 - 0.05, EY - 0.5, 0.72); c.fill(); dot(c, EX1 - 0.05, EY - 0.55, 0.78); c.fill();
    }
    const fierce = mood === 0 && L.id === 'firebrand', worried = mood === 1;
    const bi = fierce ? 1.5 : worried || mood === 3 ? -1.3 : 0.25, by = EY - (mood === 4 ? 6.0 : 5.2);
    if (L.whiteBrow) { c.strokeStyle = OUT; c.lineWidth = 3.0; c.beginPath(); c.moveTo(EX0 - 2.3, by - bi * 0.3); c.lineTo(EX0 + 1.9, by + bi * 0.6); c.moveTo(EX1 - 1.9, by + bi * 0.6); c.lineTo(EX1 + 2.6, by - bi * 0.3); c.stroke(); c.lineWidth = 1.6; } else c.lineWidth = 1.55;
    c.strokeStyle = L.brow; c.beginPath(); c.moveTo(EX0 - 2.3, by - bi * 0.3); c.lineTo(EX0 + 1.9, by + bi * 0.6); c.moveTo(EX1 - 1.9, by + bi * 0.6); c.lineTo(EX1 + 2.6, by - bi * 0.3); c.stroke();
    const mx = 2.3, my = EY + 3.6;
    if (L.id === 'admiral') return;                                           /* hidden by the moustache */
    if (mood === 4) { c.beginPath(); c.moveTo(mx - 3.5, my + 0.1); c.quadraticCurveTo(mx, my + 1.2, mx + 3.5, my); c.quadraticCurveTo(mx + 0.3, my + 6.6, mx - 3.5, my + 0.1); c.closePath(); fs(c, '#5a1f24', 1.2); c.fillStyle = '#ff7f86'; ell(c, mx + 0.1, my + 3.7, 1.7, 0.95); c.fill(); }
    else if (mood === 3) { c.strokeStyle = OUT; c.lineWidth = 1.4; c.beginPath(); c.moveTo(mx - 2.8, my + 1.7); c.quadraticCurveTo(mx - 1.4, my + 0.2, mx, my + 1.7); c.quadraticCurveTo(mx + 1.4, my + 3.2, mx + 2.8, my + 1.5); c.stroke(); }
    else if (mood === 2) { ell(c, mx, my + 1.8, 1.5, 1.9); fs(c, '#5a1f24', 1.0); }
    else if (worried) { c.strokeStyle = OUT; c.lineWidth = 1.3; c.beginPath(); c.moveTo(mx - 2.2, my + 2.2); c.quadraticCurveTo(mx - 1.1, my + 0.9, mx, my + 1.9); c.quadraticCurveTo(mx + 1.1, my + 2.9, mx + 2.2, my + 1.6); c.stroke(); }
    else if (happy) { c.beginPath(); c.moveTo(mx - 2.6, my + 0.6); c.quadraticCurveTo(mx, my + 1.3, mx + 2.6, my + 0.5); c.quadraticCurveTo(mx + 0.2, my + 4.8, mx - 2.6, my + 0.6); c.closePath(); fs(c, '#5a1f24', 1.15); c.fillStyle = '#ff7f86'; ell(c, mx + 0.1, my + 2.9, 1.2, 0.7); c.fill(); }
    else { c.strokeStyle = OUT; c.lineWidth = 1.3; c.beginPath(); c.arc(mx, my - 0.6, 2.7, 0.2 * PI, 0.8 * PI); c.stroke(); }
  }
  /* variant: 0 calm · 1 calm+happy · 2 blink · 3 blink+happy · 4 worried · 5 hurt · 6 dazed (hat askew) · 7 cheer */
  function bakeHead(c, L, v) {
    const id = L.id, mood = v === 5 ? 2 : v === 4 ? 1 : v === 6 ? 3 : v === 7 ? 4 : 0;
    if (id === 'editor') {                                                    /* bun + pencil behind the ear */
      dot(c, -6.6, -9.6, 4.1); fs(c, L.hair, 1.6);
      c.save(); c.translate(-8.4, 0.2); c.rotate(-2.15); stick(c, 0, 7.6, 1.5, '#ffd23f'); stick(c, 7.4, 8.8, 1.5, '#ff8f9c'); c.fillStyle = '#b8c2c8'; c.fillRect(6.6, -0.75, 0.9, 1.5); c.restore();
    }
    pHead(c); c.fillStyle = L.skinD; c.fill();
    c.save(); c.clip();
    c.translate(-1.3, -1.5); pHead(c); c.fillStyle = L.skin; c.fill(); c.translate(1.3, 1.5);
    const hp = id === 'admiral' ? pHairLow : id === 'editor' ? pHairTop : pHairSide;
    hp(c); c.fillStyle = L.hair; c.fill(); c.strokeStyle = 'rgba(10,17,24,.4)'; c.lineWidth = 0.9; c.stroke();
    c.restore();
    pHead(c); ol(c, LW);
    if (L.hat !== 'goggles') { dot(c, -6.5, 2.5, 2.15); fs(c, L.skin, 1.2); c.strokeStyle = L.skinD; c.lineWidth = 0.85; c.beginPath(); c.arc(-6.3, 2.6, 0.9, 1.0, 4.0); c.stroke(); }
    face(c, L, mood, v === 2 || v === 3, v === 1 || v === 3);
    if (id === 'admiral') {                                                   /* walrus moustache */
      c.beginPath(); c.moveTo(2.3, 3.9); c.bezierCurveTo(0.4, 3.1, -3.9, 4.4, -3.6, 7.5); c.bezierCurveTo(-1.0, 7.8, 1.7, 6.8, 2.3, 5.5); c.bezierCurveTo(2.9, 6.8, 5.9, 8.0, 8.6, 7.3); c.bezierCurveTo(8.8, 4.2, 4.2, 3.1, 2.3, 3.9); c.closePath(); fs(c, '#f3f5f6', 1.15);
    } else if (id === 'neutral') {                                            /* goatee */
      c.beginPath(); c.moveTo(-0.5, 7.2); c.quadraticCurveTo(2.3, 6.3, 5.0, 7.2); c.quadraticCurveTo(4.2, 10.6, 2.3, 12.4); c.quadraticCurveTo(0.2, 10.6, -0.5, 7.2); c.closePath(); fs(c, '#f6f6f3', 1.15);
    } else if (id === 'editor') {                                             /* round glasses */
      c.fillStyle = 'rgba(255,255,255,.14)'; dot(c, EX0, EY, 3.6); c.fill(); dot(c, EX1, EY, 3.9); c.fill();
      c.strokeStyle = OUT; c.lineWidth = 1.05; dot(c, EX0, EY, 3.6); c.stroke(); dot(c, EX1, EY, 3.9); c.stroke(); c.beginPath(); c.moveTo(EX0 + 3.5, EY - 0.6); c.lineTo(EX1 - 3.8, EY - 0.6); c.moveTo(EX0 - 3.5, EY - 0.4); c.lineTo(-6.2, 1.2); c.stroke();
    } else if (id === 'diplomat') {                                           /* monocle */
      dot(c, EX1, EY, 4.0); c.strokeStyle = OUT; c.lineWidth = 2.1; c.stroke(); c.strokeStyle = BRASS; c.lineWidth = 0.95; c.stroke();
      c.strokeStyle = BRASS_D; c.lineWidth = 0.7; c.beginPath(); c.moveTo(EX1 + 3.2, EY + 2.6); c.quadraticCurveTo(EX1 + 4.2, EY + 7, EX1 + 1.2, EY + 9.2); c.stroke();
    } else if (id === 'firebrand') {                                          /* fiery fringe + freckles */
      c.beginPath(); c.moveTo(-3.4, -6.8); c.lineTo(0.9, -2.9); c.lineTo(2.5, -6.9); c.lineTo(6.3, -3.3); c.lineTo(7.3, -7.2); c.lineTo(10.6, -4.6); c.lineTo(10.4, -8.4); c.lineTo(-3.4, -9.4); c.closePath(); fs(c, L.hair, 1.25);
      c.fillStyle = 'rgba(190,96,48,.6)'; dot(c, EX0 - 2.2, EY + 3.1, 0.42); c.fill(); dot(c, EX0 - 0.9, EY + 3.9, 0.42); c.fill(); dot(c, EX1 + 1.0, EY + 3.3, 0.42); c.fill(); dot(c, EX1 + 2.3, EY + 4.0, 0.42); c.fill();
    } else if (id === 'cadet') {                                              /* fringe under the cap */
      c.beginPath(); c.moveTo(0.6, -7.2); c.quadraticCurveTo(3.8, -3.4, 7.2, -3.8); c.quadraticCurveTo(7.0, -5.4, 8.6, -7.0); c.closePath(); fs(c, L.hair, 1.2);
    } else if (id === 'sparky') {                                             /* curls under the flying cap */
      dot(c, 3.4, -5.6, 1.7); fs(c, L.hair, 1.0); dot(c, 6.2, -5.9, 1.6); fs(c, L.hair, 1.0); dot(c, 8.6, -5.0, 1.4); fs(c, L.hair, 1.0);
    } else if (id === 'explorer') {                                           /* side-swept fringe */
      c.beginPath(); c.moveTo(-0.6, -6.6); c.quadraticCurveTo(4.6, -3.2, 9.6, -4.8); c.quadraticCurveTo(6.0, -6.6, 5.0, -7.6); c.closePath(); fs(c, L.hair, 1.2);
    }
    if (v === 6) { c.save(); c.rotate(-0.34); c.translate(-0.8, -1.6); HATS[L.hat](c, L); c.restore(); } else HATS[L.hat](c, L);
  }

  /* ---------------- coat (baked) ---------------- */
  function pCoat(c) {
    c.beginPath(); c.moveTo(-5.4, -8.2); c.lineTo(5.4, -8.2); c.quadraticCurveTo(8.7, -8.2, 9.0, -4.6); c.lineTo(10.2, 5.2);
    c.quadraticCurveTo(10.4, 8.0, 7.6, 8.0); c.lineTo(-7.6, 8.0); c.quadraticCurveTo(-10.4, 8.0, -10.2, 5.2); c.lineTo(-9.0, -4.6); c.quadraticCurveTo(-8.7, -8.2, -5.4, -8.2); c.closePath();
  }
  function band(c, x0, y0, x1, y1, w, col) { c.lineCap = 'butt'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.strokeStyle = OUT; c.lineWidth = w + 1.5; c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); c.lineCap = 'round'; }
  function bow(c, x, y, col) { c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3.0, y - 1.7); c.lineTo(x - 3.0, y + 1.7); c.closePath(); fs(c, col, 0.95); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 3.0, y - 1.7); c.lineTo(x + 3.0, y + 1.7); c.closePath(); fs(c, col, 0.95); dot(c, x, y, 0.95); fs(c, col, 0.9); }
  function bakeCoat(c, L) {
    const id = L.id;
    pCoat(c); c.fillStyle = L.coatD; c.fill();
    c.save(); c.clip();
    c.translate(-SHX, -SHY); pCoat(c); c.fillStyle = L.coat; c.fill(); c.translate(SHX, SHY);
    if (id === 'editor') {                                                    /* waistcoat over a white shirt + red tie */
      c.beginPath(); c.moveTo(-3.6, -9); c.lineTo(7.2, -9); c.lineTo(2.0, 3.6); c.closePath(); c.fillStyle = '#f6f1e6'; c.fill(); c.strokeStyle = 'rgba(10,17,24,.45)'; c.lineWidth = 0.9; c.stroke();
      c.beginPath(); c.moveTo(0.9, -3.6); c.lineTo(3.1, -3.6); c.lineTo(3.4, 1.4); c.lineTo(2.0, 3.2); c.lineTo(0.6, 1.4); c.closePath(); fs(c, '#e4472c', 0.9);
    } else if (id === 'neutral') {                                            /* dark waistcoat V */
      c.beginPath(); c.moveTo(-3.8, -9); c.lineTo(7.4, -9); c.lineTo(2.0, 3.4); c.closePath(); c.fillStyle = '#4b5966'; c.fill(); c.strokeStyle = 'rgba(10,17,24,.5)'; c.lineWidth = 0.9; c.stroke();
    } else if (id === 'diplomat') {                                           /* sash of office */
      c.lineCap = 'butt'; c.beginPath(); c.moveTo(8.6, -9.4); c.lineTo(-11.4, 3.6); c.strokeStyle = OUT; c.lineWidth = 5.2; c.stroke(); c.strokeStyle = '#e4472c'; c.lineWidth = 3.8; c.stroke(); c.strokeStyle = '#fff6e0'; c.lineWidth = 1.1; c.stroke(); c.lineCap = 'round';
    } else if (id === 'explorer') {                                           /* satchel strap */
      band(c, 8.2, -9.4, -11.4, 4.6, 2.3, '#8a5a30');
    } else if (id === 'sparky') {                                             /* harness */
      band(c, -4.6, -9.4, -5.6, 2.9, 1.9, '#6b4226'); band(c, 6.2, -9.4, 7.0, 2.9, 1.9, '#6b4226');
    } else if (id === 'firebrand') {                                          /* turned-up collar flap */
      c.beginPath(); c.moveTo(-2.6, -9); c.lineTo(8.6, -9); c.lineTo(6.6, -1.4); c.lineTo(2.0, 1.6); c.closePath(); c.fillStyle = L.coatDD; c.fill();
    }
    c.fillStyle = '#231a12'; c.fillRect(-11, 2.7, 22, 2.6);                    /* belt */
    c.strokeStyle = 'rgba(10,17,24,.55)'; c.lineWidth = 1.0; c.beginPath(); c.moveTo(2.0, 5.6); c.lineTo(2.0, 8.4); c.stroke();
    c.fillStyle = HI; ell(c, -5.6, -3.6, 2.6, 1.3, -0.5); c.fill();
    c.restore();
    pCoat(c); ol(c, LW);
    rr(c, 0.2, 2.2, 3.7, 3.6, 0.9); fs(c, BRASS, 1.0);
    if (id === 'admiral') { c.fillStyle = BRASS; dot(c, -1.2, 0.1, 0.95); c.fill(); dot(c, 5.0, 0.1, 0.95); c.fill(); c.fillStyle = '#e4472c'; c.fillRect(-6.4, -1.6, 2.4, 1.6); dot(c, -5.2, 1.0, 1.35); fs(c, BRASS, 0.9); }
    else if (id === 'explorer') { dot(c, 6.6, 4.0, 2.0); fs(c, BRASS, 1.0); c.strokeStyle = '#e4472c'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(5.8, 4.8); c.lineTo(7.4, 3.2); c.stroke(); }
    else if (id === 'neutral') {                                              /* dove pin + bow tie */
      c.save(); c.translate(-5.0, 0.2); ell(c, 0, 0, 2.4, 1.5, -0.2); fs(c, '#ffffff', 0.85); c.beginPath(); c.moveTo(-0.6, -0.6); c.lineTo(-2.8, -3.2); c.lineTo(1.0, -1.0); c.closePath(); fs(c, '#ffffff', 0.85); dot(c, 2.3, -1.0, 1.05); fs(c, '#ffffff', 0.85); c.fillStyle = BRASS; c.fillRect(3.1, -1.2, 1.0, 0.6); c.restore();
      bow(c, 2.0, -2.5, '#e4472c');
    } else if (id === 'diplomat') bow(c, 2.0, -2.5, '#fff6e0');
    else if (id === 'cadet') {                                                /* scarf round the neck */
      c.beginPath(); c.moveTo(-8.4, -6.0); c.quadraticCurveTo(0.6, -1.4, 9.2, -6.0); c.lineTo(9.4, -2.6); c.quadraticCurveTo(0.6, 2.0, -8.6, -2.4); c.closePath(); fs(c, '#ef5038', 1.5);
      c.strokeStyle = 'rgba(10,17,24,.3)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-6, -2.9); c.quadraticCurveTo(0.6, 0.2, 7.2, -3.2); c.stroke();
    } else if (id !== 'editor') { c.fillStyle = BRASS; dot(c, 2.0, 0.3, 0.95); c.fill(); }
  }
  /* static back gear */
  function bakeGear(c, L) {
    if (L.id === 'sparky') {                                                  /* time device: brass tank + dial */
      c.strokeStyle = OUT; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-13.2, -8.0); c.lineTo(-15.0, -12.6); c.stroke();
      rr(c, -14.4, 6.0, 5.2, 2.8, 0.9); fs(c, '#5d6a72', 1.3);
      shadeRR(c, -15.8, -8.2, 8.0, 14.8, 3.3, BRASS, BRASS_D, LW * 0.85);
      dot(c, -11.9, -2.8, 2.3); fs(c, '#9ff6ff', 1.1);
      c.fillStyle = 'rgba(255,255,255,.35)'; rr(c, -14.6, -6.6, 1.3, 7, 0.6); c.fill();
    } else {                                                                  /* explorer's satchel */
      shadeRR(c, -16.6, 0.6, 8.6, 7.8, 2.2, '#a66c3a', '#75471f', LW * 0.85);
      c.strokeStyle = 'rgba(10,17,24,.5)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-16.4, 3.8); c.quadraticCurveTo(-12.3, 5.6, -8.2, 3.8); c.stroke(); dot(c, -12.3, 5.0, 0.95); fs(c, BRASS, 0.8);
    }
  }
  function boot(c, x, y, col) { rr(c, x - 3.0, y - 1.0, 7.8, 4.5, 2.1); fs(c, col, LW * 0.82); }
  function hand(c, x, y, L) { dot(c, x, y, 2.7); fs(c, L.skin, 1.3); }

  function sprItem(bank, B, W, L) { return bank.item || (bank.item = mk(B, W.box[0], W.box[1], W.box[2], W.box[3], W.bake, L)); }
  function sprCoat(bank, B, L) { return bank.coat || (bank.coat = mk(B, -12.6, -11.4, 12.6, 11.4, bakeCoat, L)); }
  function sprHead(bank, B, L, hv) { return bank.head[hv] || (bank.head[hv] = mk(B, -19.8, -22.8, 17.2, 14.6, bakeHead, L, hv)); }
  function sprGear(bank, B, L) { return bank.gear || (bank.gear = L.id === 'sparky' ? mk(B, -17.4, -14.4, -6.4, 9.8, bakeGear, L) : mk(B, -18.2, -1, -6.4, 10, bakeGear, L)); }
  function scarf(c, w1, w2, lift) {
    c.beginPath(); c.moveTo(-5.8, -3.4); c.quadraticCurveTo(-11.4, -3.6 + w1 + lift * 0.4, -15.2, 1.6 + w2 + lift * 1.3);
    c.moveTo(-5.8, -4.0); c.quadraticCurveTo(-11.8, -6.2 + w1 + lift * 0.5, -17.0, -2.6 + w2 + lift * 1.5);
    c.strokeStyle = OUT; c.lineWidth = 5.4; c.stroke(); c.strokeStyle = '#ef5038'; c.lineWidth = 3.5; c.stroke();
    c.strokeStyle = 'rgba(10,17,24,.35)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-8.2, -3.9); c.quadraticCurveTo(-11.6, -4.9 + w1 + lift * 0.45, -14.6, -1.2 + w2 + lift * 1.4); c.stroke();
  }
  function braid(c, L, sway) {
    for (let i = 0; i < 3; i++) { ell(c, -10.2 - i * 0.7 - sway * (i + 1) * 0.55, -5.8 + i * 3.7, 2.5 - i * 0.3, 2.3, 0.25); fs(c, L.hair, 1.25); }
    rr(c, -13.0 - sway * 1.7, 3.7, 2.8, 1.7, 0.7); fs(c, L.coat, 0.9);
  }
  function epaulette(c) {
    rr(c, 7.0, -7.9, 6.4, 3.1, 1.4); fs(c, BRASS, 1.3);
    c.strokeStyle = BRASS_D; c.lineWidth = 0.9; c.beginPath(); c.moveTo(9.0, -4.6); c.lineTo(9.0, -3.0); c.moveTo(10.7, -4.6); c.lineTo(10.7, -3.0); c.moveTo(12.4, -4.6); c.lineTo(12.4, -3.0); c.stroke();
  }
  function star5(c, x, y, r, rot) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = rot + i * PI / 5, q = i & 1 ? r * 0.46 : r; if (i) c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); else c.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); }
  function bootUp(c, x, y, col) { rr(c, x - 2.3, y - 4.6, 4.7, 7.8, 2.1); fs(c, col, LW * 0.82); }
  /* knocked out: sits dazed on the ground, hat askew, spiral eyes, stars circling, gear dropped beside him */
  function poseDown(c, L, W, bank, B, rt, age) {
    const id = L.id, u = age < 0.45 ? age / 0.45 : 1, drop = (1 - u) * (1 - u) * -7, wob = Math.sin(rt * 3.6) * 0.06;
    c.save();
    if (W.gun) { c.translate(-1.5, 13.4); c.rotate(-0.04); } else if (W.back) { c.translate(-11, 14.4); c.rotate(PI - 0.12); } else { c.translate(13.8, 14.6); c.rotate(-0.1); }
    put(c, sprItem(bank, B, W, L)); c.restore();
    limb(c, -1.2, 12.0 + drop, 7.6, 12.3, 5.1, L.pantsD); bootUp(c, 9.2, 11.4, L.bootD);
    limb(c, 2.6, 12.6 + drop, 10.8, 13.2, 5.1, L.pants); bootUp(c, 12.4, 12.2, L.boot);
    c.translate(0, 6.2 + drop); c.rotate(-0.14 + wob * 0.4);
    if (id === 'cadet') scarf(c, 2.4, 5.0, 0); else if (id === 'sparky' || id === 'explorer') { put(c, sprGear(bank, B, L)); if (id === 'explorer') braid(c, L, 0); }
    limb(c, -7.2, -2.0, -10.4, 5.0, AW, L.sleeveD); hand(c, -10.4, 5.0, L);
    put(c, sprCoat(bank, B, L));
    const hx = HX - 1.4, hy = HY + 0.8;
    for (let i = 0; i < 3; i++) { const a = rt * 3.4 + i * TAU / 3; if (Math.sin(a) < 0) { star5(c, hx - 1 + Math.cos(a) * 11.5, hy - 17 + Math.sin(a) * 3.2, 2.9, a); fs(c, BRASS, 1.0); } }
    c.save(); c.translate(hx, hy); c.rotate(-0.2 + wob); put(c, sprHead(bank, B, L, 6)); c.restore();
    if (id === 'admiral') epaulette(c);
    limb(c, 7.4, -1.8, 10.2, 5.2, AW, L.sleeve); hand(c, 10.2, 5.2, L);
    for (let i = 0; i < 3; i++) { const a = rt * 3.4 + i * TAU / 3; if (Math.sin(a) >= 0) { star5(c, hx - 1 + Math.cos(a) * 11.5, hy - 17 + Math.sin(a) * 3.2, 3.6, a); fs(c, BRASS_L, 1.0); } }
  }

  /* ---------------- the hero ---------------- */
  const SEEN = new WeakMap();           /* live player -> {hp, ouch}: lets us tell a real hit from mere invulnerability */
  function draw(c, p, t, g) {
    const L = look(p.char), W = ITEMS[L.weapon], down = !!p.down, won = !down && !!p.won, moving = !!p.moving && !down && !won, id = L.id;
    const run = !!(g && g.state && g.state !== 'menu'), rt = down || won ? performance.now() / 1000 : 0;
    const gt = g && typeof g.t === 'number' ? g.t : t, flip = p.faceX < 0, sc = (p.r || 13) / 13;
    const m = c.getTransform(), B = bucketFor(Math.hypot(m.a, m.b) * sc), bank = L.bank[B] || (L.bank[B] = { head: [], coat: null, item: null, gear: null });
    const ph = t * 10.6, sw = moving ? Math.sin(ph) : 0, cw = moving ? Math.cos(ph) : 0, br = Math.sin(t * 2.5 + L.seed);
    const dip = moving ? Math.abs(sw) * 1.25 : won ? 0 : 0.45 + br * 0.45;   /* never rises above the rest pose */
    const hb = moving ? 0.3 + cw * 0.3 : 0.3 + Math.sin(t * 2.5 + L.seed - 0.7) * 0.3;
    const inv = p.iframes > 0, low = p.maxHp > 0 && p.hp < p.maxHp * 0.3;
    let hurt = false, st = null;
    if (run) { st = SEEN.get(p); if (!st) { st = { hp: p.hp, ouch: -9, downT: -1 }; SEEN.set(p, st); } if (p.hp < st.hp - 0.01) st.ouch = gt + 0.4; st.hp = p.hp; hurt = gt < st.ouch && gt > st.ouch - 0.5; if (down && st.downT < 0) st.downT = rt; }
    else hurt = inv;
    let k = 0, aim = 0;
    if (W.aims && !down && !won && p.aim != null && p.aimT !== undefined) { const d = gt - p.aimT; if (d >= 0 && d < 0.25) { k = 1 - d / 0.25; aim = flip ? PI - p.aim : p.aim; aim = Math.atan2(Math.sin(aim), Math.cos(aim)); if (aim > 2.0) aim = 2.0; else if (aim < -2.0) aim = -2.0; } }
    const e = k * k * (3 - 2 * k);
    c.save(); c.translate(p.x, p.y); c.scale(flip ? -sc : sc, sc);
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (run) {                                                                 /* "this is you": a steady light ring with a dark edge, gently breathing */
      const rs = 1 + Math.sin(t * 2.6) * 0.04, pa = c.globalAlpha;
      c.beginPath(); c.ellipse(0, 15.0, 21 * rs, 7.8 * rs, 0, 0, TAU);
      c.globalAlpha = pa * 0.13; c.fillStyle = L.ring; c.fill();
      c.globalAlpha = pa * 0.7; c.strokeStyle = OUT; c.lineWidth = 4.4; c.stroke();
      c.globalAlpha = pa; c.strokeStyle = L.ring; c.lineWidth = 2.2; c.stroke();
    }
    if (down) { poseDown(c, L, W, bank, B, rt, st ? rt - st.downT : 9); c.restore(); return; }
    if (inv && !won && (t * 18 % 2) < 1) c.globalAlpha *= hurt ? 0.45 : 0.62;
    let air = 0;
    if (won) { let jp = rt * 2.3 + L.seed; jp -= Math.floor(jp); air = 4 * jp * (1 - jp); const sq = 1 + (air - 0.45) * 0.08; c.translate(0, 15.7 - air * 6.5); c.scale(2 - sq, sq); c.translate(0, -15.7); }

    /* legs: far then near */
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1, hx = i ? 3.4 : -3.2, fx = hx + (won ? s * air * 1.8 : sw * s * 4.5), fy = 12.2 - (won ? air * 1.4 : Math.max(0, cw * s) * 3.3);
      limb(c, hx, 5.6, fx, fy, 5.1, i ? L.pants : L.pantsD);
      boot(c, fx, fy, i ? L.boot : L.bootD);
    }
    c.translate(0, dip); if (moving) { c.translate(0, 8); c.rotate(0.07); c.translate(0, -8); }

    /* worn on the back */
    if (id === 'cadet') {                                                     /* scarf tails streaming behind */
      const a = moving || won ? 1.7 : 0.7, ts = won ? rt * 2 : t; scarf(c, Math.sin(ts * 5.4) * a, Math.sin(ts * 5.4 - 1.2) * a * 1.5, moving ? -3.0 : won ? 1.5 - air * 4 : 0);
    } else if (id === 'sparky') {
      if (moving) { const fl = 2.4 + Math.sin(t * 40) * 0.9; glow(c, -11.8, 10.4, 6, '#7fd8ff', 0.7); c.beginPath(); c.moveTo(-13.6, 8.4); c.quadraticCurveTo(-11.8, 9.4 + fl * 2.2, -10.0, 8.4); c.closePath(); fs(c, '#d9f6ff', 0.9); }
      put(c, sprGear(bank, B, L));
      const bl = (t * 2 + L.seed) % 1 < 0.5; dot(c, -15.0, -12.8, 1.25); fs(c, bl ? '#7ff3ff' : '#2a6f78', 0.9);
      glow(c, -11.9, -2.8, 5.5, '#7ff3ff', 0.42 + Math.sin(t * 4) * 0.15);
      c.strokeStyle = OUT; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-11.9, -2.8); c.lineTo(-11.9 + Math.cos(t * 3) * 1.5, -2.8 + Math.sin(t * 3) * 1.5); c.stroke();
    } else if (id === 'explorer') {                                           /* satchel + braid */
      const sway = moving ? sw : Math.sin(t * 2.2) * 0.3;
      c.translate(sway * 0.4, 0); put(c, sprGear(bank, B, L)); c.translate(-sway * 0.4, 0); braid(c, L, sway);
    }

    /* far arm (it carries the sparkler for the trail weapon) */
    const cheer = won ? Math.sin(rt * 10) * 0.2 : 0;
    const bsx = -7.2, bsy = -2.0, ba = won ? -2.36 + cheer : (W.back ? W.arm : 1.75) - sw * (W.back ? W.swing : 0.55) + (moving ? 0 : br * 0.03);
    const bhx = bsx + Math.cos(ba) * 7.8, bhy = bsy + Math.sin(ba) * 7.8;
    const item = sprItem(bank, B, W, L);
    if (W.back) { c.save(); c.translate(bhx, bhy); c.rotate(won ? -1.95 + cheer : W.item - sw * 0.12); put(c, item); if (W.live) W.live(c, L, t, 0); c.restore(); }
    limb(c, bsx, bsy, bhx, bhy, AW, L.sleeveD); hand(c, bhx, bhy, L);

    put(c, sprCoat(bank, B, L));

    /* the deck gun rides across the shoulders, behind the head */
    let ga = 0;
    if (W.gun) { ga = k > 0 ? lerpA(W.item, aim, e) : W.item + (moving ? sw * 0.035 : br * 0.012); c.save(); c.translate(0.6 - k * k * 2.8 * Math.cos(ga), -5.4 - k * k * 2.8 * Math.sin(ga)); c.rotate(ga); put(c, item); c.restore(); }

    /* head */
    const hv = won ? 7 : hurt ? 5 : low ? 4 : ((t + L.seed * 1.7) % 3.6 < 0.13 ? 2 : 0) + (moving ? 1 : 0);
    c.translate(HX, HY + hb);
    put(c, sprHead(bank, B, L, hv));
    if (low && !hurt && !won) { const u = (t * 1.5 + L.seed) % 1, sx0 = -8.6, sy0 = -5 + u * 5.5, pa = c.globalAlpha; c.globalAlpha = pa * (1 - u * u); c.beginPath(); c.moveTo(sx0, sy0 - 2.5); c.quadraticCurveTo(sx0 + 2.3, sy0 + 0.6, sx0, sy0 + 1.6); c.quadraticCurveTo(sx0 - 2.3, sy0 + 0.6, sx0, sy0 - 2.5); c.closePath(); fs(c, '#a9e2ff', 0.9); c.globalAlpha = pa; }
    if (id === 'diplomat') { const gp = (t * 0.3 + L.seed) % 1; if (gp < 0.1 && !hurt) { const pa = c.globalAlpha; c.globalAlpha = pa * Math.sin(gp * 10 * PI) * 0.95; c.strokeStyle = '#ffffff'; c.lineWidth = 1.0; c.beginPath(); c.moveTo(EX1 - 2.6, EY + 0.8); c.lineTo(EX1 - 0.2, EY - 2.6); c.moveTo(EX1 - 1.0, EY + 2.2); c.lineTo(EX1 + 2.2, EY - 2.0); c.stroke(); c.globalAlpha = pa; } }
    c.translate(-HX, -HY - hb);
    if (id === 'admiral') epaulette(c);

    /* near arm + whatever they carry */
    const sx = 7.4, sy = -1.8;
    if (W.gun && !won) {
      const hx = 0.6 + Math.cos(ga) * 12.8 - Math.sin(ga) * 3.5, hy = -5.4 + Math.sin(ga) * 12.8 + Math.cos(ga) * 3.5;
      limb(c, sx, sy - 0.6, hx, hy, AW, L.sleeve); hand(c, hx, hy, L);
    } else if (W.back || W.gun) {
      const fa = won ? -0.78 - cheer : 1.25 + sw * 0.5 + (moving ? 0 : br * 0.03), hx = sx + Math.cos(fa) * 7.8, hy = sy + Math.sin(fa) * 7.8;
      limb(c, sx, sy, hx, hy, AW, L.sleeve);
      if (id === 'firebrand') { c.lineCap = 'butt'; c.beginPath(); c.moveTo(sx + (hx - sx) * 0.34, sy + (hy - sy) * 0.34); c.lineTo(sx + (hx - sx) * 0.62, sy + (hy - sy) * 0.62); c.strokeStyle = '#fff6e0'; c.lineWidth = AW; c.stroke(); c.lineCap = 'round'; }
      hand(c, hx, hy, L);
    } else {
      let aa = W.arm + (moving ? sw * W.swing : br * 0.03), ia = W.item + (W.wave ? Math.sin(t * W.wave) * 0.13 : 0) + (moving ? sw * 0.1 : 0);
      if (won) { aa = -0.78 - cheer; ia = -1.3 - cheer * 1.2; } else if (k > 0) { aa = lerpA(aa, aim, e); ia = lerpA(ia, aim, e); }
      let hx = sx + Math.cos(aa) * 8.0, hy = sy + Math.sin(aa) * 8.0;
      if (k > 0) { hx -= Math.cos(aim) * 2.3 * k * k; hy -= Math.sin(aim) * 2.3 * k * k; }
      limb(c, sx, sy, hx, hy, AW, L.sleeve);
      if (id === 'editor') { c.lineCap = 'butt'; c.beginPath(); c.moveTo(sx + (hx - sx) * 0.42, sy + (hy - sy) * 0.42); c.lineTo(sx + (hx - sx) * 0.54, sy + (hy - sy) * 0.54); c.strokeStyle = '#2b323b'; c.lineWidth = AW; c.stroke(); c.lineCap = 'round'; }
      c.save(); c.translate(hx, hy); c.rotate(ia); put(c, item); if (W.live) W.live(c, L, t, k); c.restore();
      hand(c, hx, hy, L);
    }
    c.restore();
  }
  ART.hero = { draw };

  /* ================= pickups: sprites baked at 3 px per world unit ================= */
  const S = 3;
  function bake(w, h, fn) { const cv = document.createElement('canvas'); cv.width = Math.ceil(w * S); cv.height = Math.ceil(h * S); const x = cv.getContext('2d'); x.scale(S, S); x.translate(w / 2, h / 2); x.lineJoin = 'round'; x.lineCap = 'round'; fn(x); return { cv, w, h }; }
  function poly(x, p) { x.beginPath(); x.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]); x.closePath(); }
  function pf(x, p, col) { poly(x, p); x.fillStyle = col; x.fill(); }
  function spark4(x, cx, cy, r, col) { x.beginPath(); x.moveTo(cx, cy - r); x.quadraticCurveTo(cx, cy, cx + r, cy); x.quadraticCurveTo(cx, cy, cx, cy + r); x.quadraticCurveTo(cx, cy, cx - r, cy); x.quadraticCurveTo(cx, cy, cx, cy - r); x.closePath(); x.fillStyle = col || '#ffffff'; x.fill(); }
  function halo(x, r, rgb, a) { const gr = x.createRadialGradient(0, 0, 0.5, 0, 0, r); gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)'); x.fillStyle = gr; x.fillRect(-r, -r, r * 2, r * 2); }

  const GEM_DRAW = [
    function (x) {                                                            /* tier 0 — teal chip */
      const P = [0.2, -5.8, 4.2, -2.4, 3.4, 3.8, 0, 6.0, -3.9, 2.9, -3.6, -2.9];
      pf(x, P, '#3fd9bb'); pf(x, [0, 6.0, 3.4, 3.8, 4.2, -2.4, -0.2, 0.6], '#1f9e86'); pf(x, [0, 6.0, -3.9, 2.9, -3.6, -2.9, -0.2, 0.6], '#35c4a8');
      pf(x, [0.2, -5.8, 4.2, -2.4, -0.2, 0.6, -3.6, -2.9], '#a5fbe9'); pf(x, [0.1, -4.6, 2.2, -2.7, -0.2, -1.2, -2.0, -2.9], 'rgba(255,255,255,.7)');
      poly(x, P); x.strokeStyle = OUT; x.lineWidth = 1.35; x.stroke();
    },
    function (x) {                                                            /* tier 1 — blue cut gem */
      const P = [0, -7.0, 5.4, -3.6, 5.4, 3.2, 0, 7.2, -5.4, 3.2, -5.4, -3.6], T = [0, -3.3, 2.6, -1.7, 2.6, 1.5, 0, 3.4, -2.6, 1.5, -2.6, -1.7];
      const C = ['#9bd6ff', '#63b8ff', '#3b8fe8', '#2a6fc7', '#3b8fe8', '#77c4ff'];
      for (let i = 0; i < 6; i++) { const a = ((6 - i) % 6) * 2, b = ((5 - i) % 6) * 2; pf(x, [P[a], P[a + 1], P[b], P[b + 1], T[b], T[b + 1], T[a], T[a + 1]], C[i]); }
      pf(x, T, '#cfeaff'); pf(x, [-1.6, -1.5, 0, -2.5, 1.0, -1.7, -0.6, -0.5], 'rgba(255,255,255,.85)');
      poly(x, P); x.strokeStyle = OUT; x.lineWidth = 1.45; x.stroke();
    },
    function (x) {                                                            /* tier 2 — big purple brilliant */
      const P = [-7.6, -2.5, -4.5, -7.3, 4.5, -7.3, 7.6, -2.5, 0, 8.7];
      pf(x, P, '#b77dff'); pf(x, [-4.5, -7.3, 4.5, -7.3, 2.9, -2.5, -2.9, -2.5], '#f0dcff'); pf(x, [-7.6, -2.5, -4.5, -7.3, -2.9, -2.5], '#d5abff'); pf(x, [7.6, -2.5, 4.5, -7.3, 2.9, -2.5], '#a468f2');
      pf(x, [-7.6, -2.5, -2.9, -2.5, 0, 8.7], '#bd86ff'); pf(x, [-2.9, -2.5, 2.9, -2.5, 0, 8.7], '#cfa0ff'); pf(x, [2.9, -2.5, 7.6, -2.5, 0, 8.7], '#8748dc');
      x.strokeStyle = 'rgba(10,17,24,.35)'; x.lineWidth = 0.7; x.beginPath(); x.moveTo(-7.6, -2.5); x.lineTo(7.6, -2.5); x.moveTo(-2.9, -2.5); x.lineTo(0, 8.7); x.lineTo(2.9, -2.5); x.stroke();
      pf(x, [-3.4, -6.4, -0.4, -6.4, -1.4, -3.6, -2.6, -3.6], 'rgba(255,255,255,.8)');
      poly(x, P); x.strokeStyle = OUT; x.lineWidth = 1.55; x.stroke();
    },
    function (x) {                                                            /* tier 3 — golden star gem */
      halo(x, 13.5, '255,208,77', 0.5);
      const R0 = 9.6, R1 = 4.5, O = [], I = [];
      for (let i = 0; i < 5; i++) { const a = -PI / 2 + i * TAU / 5, b = a + TAU / 10; O.push(Math.cos(a) * R0, Math.sin(a) * R0); I.push(Math.cos(b) * R1, Math.sin(b) * R1); }
      const P = []; for (let i = 0; i < 5; i++) P.push(O[i * 2], O[i * 2 + 1], I[i * 2], I[i * 2 + 1]);
      pf(x, P, '#ffcf45');
      for (let i = 0; i < 5; i++) { const j = (i + 4) % 5; pf(x, [0, 0, O[i * 2], O[i * 2 + 1], I[i * 2], I[i * 2 + 1]], i === 1 || i === 2 ? '#de9712' : '#f2b22a'); pf(x, [0, 0, O[i * 2], O[i * 2 + 1], I[j * 2], I[j * 2 + 1]], i === 0 || i === 4 || i === 3 ? '#fff0a8' : '#ffd95e'); }
      x.fillStyle = '#fffbe0'; x.beginPath(); x.arc(-0.6, -0.8, 2.0, 0, TAU); x.fill();
      poly(x, P); x.strokeStyle = OUT; x.lineWidth = 1.65; x.stroke();
    },
  ];
  const GEM_BOX = [[13, 16, 3.4, -4.4], [16, 19, 4.6, -5.6], [20, 22, 6.2, -6.4], [30, 30, 7.4, -7.6]];
  const GEMS = [];
  function gemSpr(tr) {
    let f = GEMS[tr]; if (f) return f;
    const b = GEM_BOX[tr]; f = [];
    for (let i = 0; i < 3; i++) f.push(bake(b[0], b[1], (x) => { GEM_DRAW[tr](x); if (i) spark4(x, b[2], b[3], i === 1 ? 2.0 : 3.3, '#ffffff'); }));
    return (GEMS[tr] = f);
  }
  function gem(c, q, t, g) {
    const tr = PK.gemTier ? PK.gemTier(q.v) : (q.v >= 25 ? 3 : q.v >= 6 ? 2 : q.v >= 2 ? 1 : 0), fr = gemSpr(tr);
    let ph = t * 0.5 + q.x * 0.0137 + q.y * 0.0071; ph -= Math.floor(ph);
    const s = fr[ph < 0.06 ? 1 : ph < 0.14 ? 2 : ph < 0.2 ? 1 : 0];
    let y = q.y, sc = 1; const age = q.born !== undefined && g ? g.t - q.born : 9;
    if (age >= 0 && age < 0.35) { const u = age / 0.35; y -= 36 * u * (1 - u); sc = 0.55 + 0.45 * Math.min(1, u * 2.4); }
    else if (!q.pull) y += Math.sin(t * 3 + q.x * 0.05) * 0.9;
    const w = s.w * sc, h = s.h * sc; c.drawImage(s.cv, q.x - w / 2, y - h / 2, w, h);
  }

  let COIN = null, HEART = null, MAGNET = null, BOMB = null, CHEST = null, CGLOW = null, STAR = null;
  function coinSpr() {
    if (COIN) return COIN; COIN = [];
    for (let i = 0; i < 8; i++) COIN.push(bake(17, 17, (x) => {
      const a = i * PI / 8, wf = Math.abs(Math.cos(a)), rx = 1.9 + wf * 4.6, ry = 6.5, sh = Math.sin(a) * 1.1;
      x.beginPath(); x.ellipse(sh, 0, rx, ry, 0, 0, TAU); x.fillStyle = '#a87708'; x.fill(); x.strokeStyle = OUT; x.lineWidth = 1.45; x.stroke();
      if (rx > 2.4) {
        x.beginPath(); x.ellipse(-sh * 0.5 - 0.3, -0.4, rx - 1.0, ry - 1.0, 0, 0, TAU); x.fillStyle = BRASS; x.fill();
        if (rx > 3.4) { x.beginPath(); x.ellipse(-sh * 0.5 - 0.3, -0.4, rx - 2.5, ry - 2.5, 0, 0, TAU); x.strokeStyle = '#c7921a'; x.lineWidth = 0.9; x.stroke(); pf(x, [-sh * 0.5 - 0.3, -3.0, -sh * 0.5 - 0.3 + wf * 1.5, -0.4, -sh * 0.5 - 0.3, 2.2, -sh * 0.5 - 0.3 - wf * 1.5, -0.4], '#c7921a'); }
        x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 0.95; x.beginPath(); x.ellipse(-sh * 0.5 - 0.3, -0.4, Math.max(0.4, rx - 1.9), ry - 1.9, 0, PI * 1.05, PI * 1.45); x.stroke();
      } else { x.fillStyle = BRASS; x.fillRect(sh - 0.9, -5.0, 1.0, 10.0); x.fillStyle = BRASS_L; x.fillRect(sh - 0.6, -4.6, 0.6, 4.4); }
    }));
    return COIN;
  }
  function pHeart(x) { x.beginPath(); x.moveTo(0, 7.0); x.bezierCurveTo(-10.6, 0.6, -8.4, -8.2, -3.7, -6.7); x.bezierCurveTo(-1.8, -6.1, -0.5, -4.8, 0, -3.3); x.bezierCurveTo(0.5, -4.8, 1.8, -6.1, 3.7, -6.7); x.bezierCurveTo(8.4, -8.2, 10.6, 0.6, 0, 7.0); x.closePath(); }
  function heartSpr() {
    return HEART || (HEART = bake(22, 21, (x) => {
      x.translate(0, 0.4); pHeart(x); x.fillStyle = '#c4283c'; x.fill(); x.save(); x.clip(); x.translate(-1.2, -1.4); pHeart(x); x.fillStyle = '#ff5266'; x.fill(); x.translate(1.2, 1.4);
      x.fillStyle = 'rgba(255,255,255,.75)'; x.beginPath(); x.ellipse(-3.9, -3.6, 2.0, 1.2, -0.6, 0, TAU); x.fill(); x.restore(); pHeart(x); x.strokeStyle = OUT; x.lineWidth = 1.6; x.stroke();
    }));
  }
  function pMagnet(x) { x.beginPath(); x.moveTo(-7.4, -5.8); x.lineTo(-7.4, 1); x.arc(0, 1, 7.4, PI, 0, true); x.lineTo(7.4, -5.8); x.lineTo(3.0, -5.8); x.lineTo(3.0, 1); x.arc(0, 1, 3.0, 0, PI, false); x.lineTo(-3.0, -5.8); x.closePath(); }
  function magnetSpr() {
    if (MAGNET) return MAGNET; MAGNET = [];
    for (let i = 0; i < 2; i++) MAGNET.push(bake(24, 24, (x) => {
      x.rotate(-0.5); x.translate(0, 0.6);
      pMagnet(x); x.fillStyle = '#b2261c'; x.fill(); x.save(); x.clip(); x.translate(-1.0, -1.1); pMagnet(x); x.fillStyle = '#ef4636'; x.fill(); x.translate(1.0, 1.1);
      x.fillStyle = '#e8eef2'; x.fillRect(-9, -7, 18, 4.4); x.fillStyle = '#aebac2'; x.fillRect(-9, -3.4, 18, 0.8); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(-6.6, 0, 1.2, 4.4); x.restore();
      pMagnet(x); x.strokeStyle = OUT; x.lineWidth = 1.55; x.stroke();
      if (i) { x.strokeStyle = '#ffe27a'; x.lineWidth = 1.0; x.beginPath(); x.moveTo(-6.6, -7.6); x.lineTo(-6.6, -9.4); x.moveTo(-3.8, -7.6); x.lineTo(-3.8, -9.4); x.moveTo(3.8, -7.6); x.lineTo(3.8, -9.4); x.moveTo(6.6, -7.6); x.lineTo(6.6, -9.4); x.stroke(); }
    }));
    return MAGNET;
  }
  function bombSpr() {
    if (BOMB) return BOMB; BOMB = [];
    for (let i = 0; i < 3; i++) BOMB.push(bake(26, 28, (x) => {
      x.translate(-1, 1.6);
      x.beginPath(); x.moveTo(0.4, -6.4); x.quadraticCurveTo(1.6, -10.6, 5.4, -9.8); x.strokeStyle = OUT; x.lineWidth = 2.7; x.stroke(); x.strokeStyle = '#c9a26a'; x.lineWidth = 1.3; x.stroke();
      x.save(); x.translate(5.9, -9.9); halo(x, 6.5, '255,190,70', 0.75); spark4(x, 0, 0, [2.6, 3.8, 3.0][i], '#ffe066'); x.rotate(0.78); spark4(x, 0, 0, [1.9, 2.4, 2.9][i], '#ff9a1f'); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(0, 0, 0.9, 0, TAU); x.fill(); x.restore();
      x.beginPath(); x.arc(0, 2.4, 7.4, 0, TAU); x.fillStyle = '#12161b'; x.fill(); x.save(); x.clip(); x.beginPath(); x.arc(-1.3, 0.9, 7.4, 0, TAU); x.fillStyle = '#2f3944'; x.fill();
      x.fillStyle = 'rgba(255,255,255,.4)'; x.beginPath(); x.ellipse(-3.0, -0.6, 2.3, 1.3, -0.6, 0, TAU); x.fill(); x.restore(); x.beginPath(); x.arc(0, 2.4, 7.4, 0, TAU); x.strokeStyle = OUT; x.lineWidth = 1.65; x.stroke();
      rr(x, -2.4, -6.9, 5.4, 3.0, 1.0); x.fillStyle = '#9aa6ad'; x.fill(); x.strokeStyle = OUT; x.lineWidth = 1.3; x.stroke();
    }));
    return BOMB;
  }
  function pLid(x) { x.beginPath(); x.moveTo(-12.6, -0.8); x.lineTo(-12.6, -5.6); x.quadraticCurveTo(-12.6, -11.8, -6.4, -11.8); x.lineTo(6.4, -11.8); x.quadraticCurveTo(12.6, -11.8, 12.6, -5.6); x.lineTo(12.6, -0.8); x.closePath(); }
  function chestSpr() {
    return CHEST || (CHEST = bake(32, 30, (x) => {
      x.translate(0, 1.4);
      rr(x, -11.6, -1.4, 23.2, 11.8, 2.5); x.fillStyle = '#6a421d'; x.fill(); x.save(); x.clip(); rr(x, -12.8, -2.8, 23.2, 11.8, 2.5); x.fillStyle = '#9c6431'; x.fill();
      x.strokeStyle = 'rgba(10,17,24,.3)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(-12, 3.4); x.lineTo(12, 3.4); x.moveTo(-12, 6.9); x.lineTo(12, 6.9); x.stroke(); x.restore();
      rr(x, -11.6, -1.4, 23.2, 11.8, 2.5); x.strokeStyle = OUT; x.lineWidth = 1.75; x.stroke();
      pLid(x); x.fillStyle = '#84531f'; x.fill(); x.save(); x.clip(); x.translate(-1.3, -1.5); pLid(x); x.fillStyle = '#bb7c3c'; x.fill(); x.translate(1.3, 1.5);
      x.fillStyle = 'rgba(255,255,255,.3)'; x.beginPath(); x.ellipse(-5.4, -8.8, 4.2, 1.2, -0.12, 0, TAU); x.fill(); x.restore(); pLid(x); x.strokeStyle = OUT; x.lineWidth = 1.75; x.stroke();
      for (let i = 0; i < 2; i++) { const bx = i ? 5.6 : -8.8; rr(x, bx, -11.8, 3.2, 22.2, 0.7); x.fillStyle = i ? BRASS_D : BRASS; x.fill(); x.strokeStyle = OUT; x.lineWidth = 1.15; x.stroke(); x.fillStyle = BRASS_L; x.fillRect(bx + 0.5, -10.6, 0.8, 8.4); }
      rr(x, -12.6, -2.2, 25.2, 2.2, 0.8); x.fillStyle = BRASS; x.fill(); x.strokeStyle = OUT; x.lineWidth = 1.15; x.stroke();
      rr(x, -2.8, -4.4, 5.6, 6.8, 1.4); x.fillStyle = BRASS; x.fill(); x.strokeStyle = OUT; x.lineWidth = 1.25; x.stroke();
      x.fillStyle = OUT; x.beginPath(); x.arc(0, -1.7, 1.0, 0, TAU); x.fill(); x.fillRect(-0.5, -1.4, 1.0, 2.5);
      x.fillStyle = BRASS_L; x.fillRect(-2.0, -3.7, 0.8, 2.4);
    }));
  }
  function item(c, q, t, g) {
    const age = q.born !== undefined && g ? g.t - q.born : 9;
    let pop = 1; if (age >= 0 && age < 0.3) { const u = age / 0.3; pop = u < 0.7 ? 0.3 + u / 0.7 * 0.85 : 1.15 - (u - 0.7) / 0.3 * 0.15; }
    const bob = q.pull ? 0 : Math.sin(t * 3.2 + q.x * 0.05) * 1.4, x = q.x, y = q.y + bob;
    let s;
    switch (q.kind) {
      case 'coin': s = coinSpr()[((t * 11 + q.x * 0.11 + q.y * 0.07) | 0) & 7]; break;
      case 'heart': { const b = Math.sin(t * 5.2 + q.x * 0.03); pop *= 1 + (b > 0 ? b * b * b * b * 0.12 : 0); s = heartSpr(); break; }
      case 'magnet': s = magnetSpr()[((t * 3 + q.x * 0.01) | 0) & 1]; break;
      case 'bomb': s = bombSpr()[Math.abs((t * 10 + q.y * 0.1) | 0) % 3]; break;
      case 'chest': {
        if (!CGLOW) { CGLOW = bake(72, 72, (x2) => halo(x2, 36, '255,205,90', 0.75)); STAR = bake(8, 8, (x2) => { spark4(x2, 0, 0, 3.7, '#fff6cf'); }); }
        const po = c.globalCompositeOperation, pa = c.globalAlpha, gs = 66 + Math.sin(t * 3.4) * 6;
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = pa * (0.5 + Math.sin(t * 3.4) * 0.12); c.drawImage(CGLOW.cv, x - gs / 2, y - 4 - gs / 2, gs, gs); c.globalAlpha = pa; c.globalCompositeOperation = po;
        s = chestSpr(); const sq = 1 + Math.sin(t * 6.4) * 0.025, w = s.w * pop * (2 - sq), h = s.h * pop * sq;
        c.drawImage(s.cv, x - w / 2, y - 3 + s.h * pop / 2 - h - bob * 0.35, w, h);
        for (let i = 0; i < 3; i++) { let u = t * 0.75 + i * 0.37; u -= Math.floor(u); const tw = Math.sin(u * PI), sz = 8 * tw * (i === 1 ? 1.25 : 0.95), sx2 = x + (i === 0 ? -14.5 : i === 1 ? 13 : 3.5), sy2 = y - 3 + (i === 0 ? -7 : i === 1 ? -11 : -17) - u * 4; if (sz > 0.6) c.drawImage(STAR.cv, sx2 - sz / 2, sy2 - sz / 2, sz, sz); }
        return;
      }
      default: return;
    }
    const w = s.w * pop, h = s.h * pop; c.drawImage(s.cv, x - w / 2, y - h / 2, w, h);
  }
  ART.pickup = { gem, item };
})();
