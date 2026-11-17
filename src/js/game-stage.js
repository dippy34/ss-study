/* game-stage.js — frame orchestrator (lead-owned). Camera, draw order, y-sorting, ground shadows, the art-module hooks
   (each with a built-in fallback so a missing or broken art module can never break the game), the default fx
   interpreter, and portrait helpers for menus. Overrides PK.R.draw.

   Art modules register on PK.art:  world, enemy, boss, hero, pickup, fx.  Every function is optional. */
(function () {
  'use strict';
  const PK = window.PK, COL = PK.COL, R = PK.R, TAU = Math.PI * 2, OUT = '#0a1118';
  const ART = (PK.art = PK.art || {});
  const off = {};
  let ctx = null;
  const baseInit = R.init;
  R.init = function (canvas) { ctx = canvas.getContext('2d'); baseInit(canvas); };
  function mod(name, fn) { const m = ART[name]; return m && typeof m[fn] === 'function' && !off[name + '.' + fn] ? m : null; }
  function fail(name, fn, err) { off[name + '.' + fn] = true; try { console.error('[art] ' + name + '.' + fn + ' threw; using the built-in look', err); } catch (e) {} }
  PK.artStatus = () => ({ loaded: Object.keys(ART), disabled: Object.keys(off) });

  const GEMC = ['#58e6c9', '#58b4ff', '#c58bff', '#ffd04d'];
  const gemTier = (PK.gemTier = (v) => (v >= 25 ? 3 : v >= 6 ? 2 : v >= 2 ? 1 : 0));
  function dot(c, x, y, r, col) { c.beginPath(); c.arc(x, y, r, 0, TAU); if (col) c.fillStyle = col; c.fill(); }
  function rr(c, x, y, w, h, rad) { c.beginPath(); c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad); c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath(); }

  /* ================= built-in looks ================= */
  const B = {
    world(c, act, v) { const a = PK.ACTS[act] || PK.ACTS[0]; c.fillStyle = R._tile(a.color); c.fillRect(v.x - 2, v.y - 2, v.w + 4, v.h + 4); },
    zone(c, z, t) {
      if (z.kind === 'fire') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, z.life * 2) * (0.55 + Math.sin(t * 20 + z.x) * 0.12); const s = z.r * 2.3; c.drawImage(R._fire(), z.x - s / 2, z.y - s / 2, s, s); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
      else if (z.kind === 'claim') {
        if (z.warn > 0) { c.strokeStyle = PK.rgba(COL.I, 0.9); c.lineWidth = 2.5; c.setLineDash([8, 6]); c.beginPath(); c.arc(z.x, z.y, z.r * (1 - z.warn * 0.25), 0, TAU); c.stroke(); c.setLineDash([]); }
        else { c.fillStyle = PK.rgba(COL.I, 0.2 + Math.sin(t * 6) * 0.04); c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.fill(); c.strokeStyle = PK.rgba(COL.I, 0.9); c.lineWidth = 2.5; c.stroke();
          c.strokeStyle = OUT; c.lineWidth = 2.5; c.beginPath(); c.moveTo(z.x, z.y + 12); c.lineTo(z.x, z.y - 22); c.stroke(); c.fillStyle = COL.I; c.beginPath(); c.moveTo(z.x, z.y - 22); c.lineTo(z.x + 18, z.y - 15); c.lineTo(z.x, z.y - 8); c.closePath(); c.fill(); c.stroke(); }
      } else if (z.kind === 'blast') {
        const f = 1 - Math.max(0, z.warn) / z.w0; c.fillStyle = PK.rgba(COL.S, 0.12); c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.fill();
        c.fillStyle = PK.rgba(COL.S, 0.3); c.beginPath(); c.arc(z.x, z.y, z.r * f, 0, TAU); c.fill();
        c.strokeStyle = COL.S; c.lineWidth = 2.5; c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.stroke();
        c.fillStyle = '#fff'; c.font = '900 30px Nunito, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(z.n), z.x, z.y); c.textBaseline = 'alphabetic';
      }
    },
    aura(c, p, t) { c.fillStyle = 'rgba(190,235,255,.07)'; c.beginPath(); c.arc(p.x, p.y, p.auraR, 0, TAU); c.fill(); c.strokeStyle = 'rgba(210,240,255,.5)'; c.lineWidth = 2; c.setLineDash([10, 9]); c.lineDashOffset = t * 30; c.beginPath(); c.arc(p.x, p.y, p.auraR, 0, TAU); c.stroke(); c.setLineDash([]); },
    gem(c, q) {
      const tr = gemTier(q.v), s = 4.2 + tr * 1.5;
      c.fillStyle = GEMC[tr]; c.beginPath(); c.moveTo(q.x, q.y - s * 1.25); c.lineTo(q.x + s, q.y); c.lineTo(q.x, q.y + s * 1.25); c.lineTo(q.x - s, q.y); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,.65)'; c.beginPath(); c.moveTo(q.x, q.y - s * 1.25); c.lineTo(q.x + s * 0.5, q.y - s * 0.3); c.lineTo(q.x - s * 0.4, q.y - s * 0.2); c.closePath(); c.fill();
    },
    item(c, q, t) {
      const by = q.y + Math.sin(t * 4 + q.x) * 2.5;
      if (q.kind === 'coin') { dot(c, q.x, by, 6.5, '#a87708'); dot(c, q.x - 0.6, by - 0.8, 5.4, COL.brass); dot(c, q.x - 2, by - 2.2, 1.7, '#fff6c9'); }
      else if (q.kind === 'chest') {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35 + Math.sin(t * 5) * 0.12; c.drawImage(R._fire(), q.x - 44, by - 46, 88, 88); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        c.lineWidth = 2.2; c.strokeStyle = OUT; rr(c, q.x - 15, by - 9, 30, 20, 3); c.fillStyle = '#8a5a2b'; c.fill(); c.stroke();
        rr(c, q.x - 16, by - 15, 32, 11, 5); c.fillStyle = '#a8703a'; c.fill(); c.stroke(); c.fillStyle = COL.brass; c.fillRect(q.x - 3, by - 9, 6, 9); c.strokeRect(q.x - 3, by - 9, 6, 9);
      } else { c.font = '20px sans-serif'; c.textAlign = 'center'; c.fillText(q.kind === 'heart' ? '❤️' : q.kind === 'magnet' ? '🧲' : '💣', q.x, by + 7); }
    },
    links(c, g, t, vis) {
      c.lineWidth = 2; c.setLineDash([5, 5]);
      for (const e of g.enemies) { const m = e.buddy; if (!m || m.hp <= 0 || e.hp <= 0 || !vis(e.x, e.y, 80)) continue; c.strokeStyle = e.rage ? 'rgba(255,120,110,.9)' : 'rgba(170,215,255,.55)'; c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(m.x, m.y); c.stroke(); }
      c.setLineDash([]);
    },
    tether(c, a, b, t) { c.strokeStyle = 'rgba(255,90,80,.9)'; c.lineWidth = 6; c.setLineDash([12, 8]); c.lineDashOffset = -t * 50; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.setLineDash([]); },
    telegraph(c, x, y, dx, dy, len, w) { c.strokeStyle = 'rgba(255,90,80,.55)'; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * len, y + dy * len); c.stroke(); },
    enemy(c, e, t) {
      const s = R.sprite(e.type), sc = e.r / s.r, hs = s.half * sc, by = Math.sin(t * 7 + e.seed) * 1.5;
      if (e.elite) { c.strokeStyle = COL.brass; c.lineWidth = 3; c.beginPath(); c.arc(e.x, e.y, e.r + 6 + Math.sin(t * 6) * 1.5, 0, TAU); c.stroke(); }
      c.drawImage(e.flash > 0 ? s.w : s.c, e.x - hs, e.y - hs + by, hs * 2, hs * 2);
      if (e.rage) { c.fillStyle = '#ff5e4f'; c.font = '900 15px Nunito, sans-serif'; c.textAlign = 'center'; c.fillText('!', e.x, e.y - e.r - 6); }
      if (e.elite) R._crown(c, e.x, e.y - e.r - 12, 8);
    },
    hero(c, p, t) { PK.drawHero(c, p.x, p.y, p.r, p.char, t, p.moving, p.face, p.iframes > 0 && (t * 20 % 2 < 1) ? 0.35 : 1); },
    orbs(c, p) { for (const o of p.orbPos) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; dot(c, o.x, o.y, 15, COL.A); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; dot(c, o.x, o.y, 8.5, '#d9eeff'); c.lineWidth = 2; c.strokeStyle = '#1b5fa8'; c.stroke(); } },
    bullet(c, b) {
      if (b.kind === 'bolt') { c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.strokeStyle = COL.brass; c.lineWidth = 6; c.beginPath(); c.moveTo(b.x - b.vx * 0.028, b.y - b.vy * 0.028); c.lineTo(b.x, b.y); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 2.4; c.stroke(); c.globalCompositeOperation = 'source-over'; }
      else if (b.kind === 'paper') { c.save(); c.translate(b.x, b.y); c.rotate(b.rot); c.fillStyle = '#f4ecd6'; c.fillRect(-7, -5, 14, 10); c.strokeStyle = OUT; c.lineWidth = 1.2; c.strokeRect(-7, -5, 14, 10); c.fillStyle = '#555'; c.fillRect(-5, -3, 10, 1.6); c.fillRect(-5, 0, 7, 1.2); c.fillRect(-5, 2.4, 9, 1.2); c.restore(); }
      else if (b.kind === 'shell') { c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(b.x, b.y, 7, 3.5, 0, 0, TAU); c.fill(); dot(c, b.x, b.y - b.z, 6.5, '#2c363d'); c.lineWidth = 1.5; c.strokeStyle = OUT; c.stroke(); dot(c, b.x - 2, b.y - b.z - 2, 2, '#aab7bd');
        c.strokeStyle = PK.rgba(COL.M, 0.5); c.lineWidth = 1.5; c.setLineDash([4, 5]); c.beginPath(); c.arc(b.tx, b.ty, b.rad * (b.t / b.dur), 0, TAU); c.stroke(); c.setLineDash([]); }
      else if (b.kind === 'boom') { c.save(); c.translate(b.x, b.y); c.rotate(b.spin); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = OUT; c.lineWidth = b.r * 0.62; c.beginPath(); c.moveTo(-b.r, b.r * 0.5); c.lineTo(0, -b.r * 0.5); c.lineTo(b.r, b.r * 0.5); c.stroke(); c.strokeStyle = COL.I; c.lineWidth = b.r * 0.4; c.stroke(); c.restore(); }
    },
    ebullet(c, b) { dot(c, b.x, b.y, b.r + 2, OUT); dot(c, b.x, b.y, b.r, b.col || '#ff5a3c'); dot(c, b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.45, '#fff0c9'); },
    arcs(c, g) {
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const a of g.arcs) {
        c.globalCompositeOperation = 'lighter'; c.strokeStyle = a.col || '#bfe3ff'; c.lineWidth = 3.2 * Math.min(1, a.life / 0.1); c.beginPath();
        for (let i = 0; i < a.pts.length - 1; i++) { const p0 = a.pts[i], p1 = a.pts[i + 1], dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len; c.moveTo(p0.x, p0.y); for (let s = 1; s < 4; s++) { const o = (Math.random() - 0.5) * 16; c.lineTo(p0.x + dx * s / 4 + nx * o, p0.y + dy * s / 4 + ny * o); } c.lineTo(p1.x, p1.y); }
        c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke(); c.globalCompositeOperation = 'source-over';
      }
    },
    rings(c, g) { for (const q of g.rings) { const f = 1 - q.life / q.max; c.globalAlpha = 1 - f; c.strokeStyle = q.col; c.lineWidth = q.w * (1 - f) + 1; c.beginPath(); c.arc(q.x, q.y, q.r0 + (q.r1 - q.r0) * f, 0, TAU); c.stroke(); } c.globalAlpha = 1; },
    parts(c, g) { c.globalCompositeOperation = 'lighter'; for (const q of g.parts) { const a = q.life / q.max; c.globalAlpha = a; c.fillStyle = q.col; const s = q.size * (0.4 + a * 0.6); c.fillRect(q.x - s / 2, q.y - s / 2, s, s); } c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; },
    texts(c, g) { c.textAlign = 'center'; c.lineJoin = 'round'; for (const q of g.texts) { c.globalAlpha = Math.min(1, q.life / 0.25); c.font = '900 ' + q.size + 'px Nunito, system-ui, sans-serif'; c.lineWidth = 3; c.strokeStyle = 'rgba(8,14,20,.85)'; c.strokeText(q.str, q.x, q.y); c.fillStyle = q.col; c.fillText(q.str, q.x, q.y); } c.globalAlpha = 1; },
  };

  /* ================= the frame ================= */
  const view = { x: 0, y: 0, w: 0, h: 0 }, actors = [];
  const byY = (a, b) => (a.y + a.r) - (b.y + b.r);
  R.draw = function (g) {
    const c = ctx, sc = g.scale * (g.zoom || 1), k = g.dpr * sc;
    g.vw = g.W / sc; g.vh = g.H / sc;
    const cx = g.cam.x + g.cam.sx, cy = g.cam.y + g.cam.sy, t = g.t + (g.idleT || 0);
    const tx = g.W * g.dpr / 2 - cx * k, ty = g.H * g.dpr / 2 - cy * k;
    const world = () => { c.setTransform(k, 0, 0, k, tx, ty); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; };
    const vl = cx - g.vw / 2, vt = cy - g.vh / 2; view.x = vl; view.y = vt; view.w = g.vw; view.h = g.vh;
    const vis = (x, y, m) => x > vl - m && x < vl + g.vw + m && y > vt - m && y < vt + g.vh + m;
    const idle = g.state === 'idle', act = idle ? (g.idleAct | 0) : g.act, p = idle ? null : g.player;
    let m, done;
    world();

    /* 1. ground */
    done = false; m = mod('world', 'draw');
    if (m) { c.save(); try { m.draw(c, act, view, t, g); done = true; } catch (err) { fail('world', 'draw', err); } c.restore(); world(); }
    if (!done) B.world(c, act, view);

    /* 2. things lying on the ground */
    if (!idle) {
      m = mod('fx', 'zone');
      for (const z of g.zones) { if (!vis(z.x, z.y, z.r + 30)) continue; if (m) { try { m.zone(c, z, t, g); } catch (err) { fail('fx', 'zone', err); m = null; B.zone(c, z, t); } world(); } else B.zone(c, z, t); }
      if (p.auraR > 0) { m = mod('fx', 'aura'); if (m) { try { m.aura(c, p, t, g); } catch (err) { fail('fx', 'aura', err); B.aura(c, p, t); } world(); } else B.aura(c, p, t); }
    }

    /* 3. who is on screen */
    const mE = mod('enemy', 'draw'), mB = mod('boss', 'draw'), mH = mod('hero', 'draw');
    actors.length = 0;
    const list = idle ? g.deco : g.enemies;
    for (let i = 0; i < list.length; i++) { const e = list[i]; if (e.dead) continue; if (e.boss || vis(e.x, e.y, 70)) actors.push(e); }
    if (p) actors.push(p);
    actors.sort(byY);

    /* 4. soft ground shadows (art modules never draw their own) */
    c.fillStyle = 'rgba(4,10,16,.28)'; c.beginPath();
    for (let i = 0; i < actors.length; i++) { const a = actors[i]; if (a === p ? !mH : a.boss ? !mB : false) continue; const r = a === p ? a.r * 1.2 : a.r, sy = a.y + r * (a.boss ? 0.9 : 0.95); c.moveTo(a.x + r * 0.95, sy); c.ellipse(a.x, sy, r * 0.95, r * 0.34, 0, 0, TAU); }
    c.fill();

    if (!idle) {
      /* 5. pickups */
      m = mod('pickup', 'gem');
      for (const q of g.gems) { if (!vis(q.x, q.y, 14)) continue; if (m) { try { m.gem(c, q, t, g); } catch (err) { fail('pickup', 'gem', err); m = null; B.gem(c, q); } } else B.gem(c, q); }
      world(); m = mod('pickup', 'item');
      for (const q of g.pickups) { if (!vis(q.x, q.y, 50)) continue; if (m) { try { m.item(c, q, t, g); } catch (err) { fail('pickup', 'item', err); m = null; B.item(c, q, t); } world(); } else B.item(c, q, t); }
      world();

      /* 6. chains + telegraphs */
      m = mod('enemy', 'links'); if (m) { try { m.links(c, g, t, vis); } catch (err) { fail('enemy', 'links', err); B.links(c, g, t, vis); } world(); } else B.links(c, g, t, vis);
      if (g.bosses.length === 2 && g.bosses[0].hp > 0 && g.bosses[1].hp > 0) { m = mod('boss', 'tether'); if (m) { try { m.tether(c, g.bosses[0], g.bosses[1], t, g); } catch (err) { fail('boss', 'tether', err); B.tether(c, g.bosses[0], g.bosses[1], t); } world(); } else B.tether(c, g.bosses[0], g.bosses[1], t); }
      m = mod('fx', 'telegraph');
      for (let i = 0; i < actors.length; i++) { const a = actors[i]; if (a.st !== 'aim') continue; const len = a.boss ? 420 : 230, w = a.boss ? 8 : 3; if (m) { try { m.telegraph(c, a.x, a.y, a.dx, a.dy, len, w, t, a); } catch (err) { fail('fx', 'telegraph', err); m = null; B.telegraph(c, a.x, a.y, a.dx, a.dy, len, w); } world(); } else B.telegraph(c, a.x, a.y, a.dx, a.dy, len, w); }

      /* 7. death pops */
      const mC = mod('enemy', 'corpse'), mBC = mod('boss', 'corpse');
      for (const d of g.corpses) { const mm = d.boss ? mBC : mC; if (!mm || !vis(d.x, d.y, 120)) continue; try { mm.corpse(c, d, t, g); } catch (err) { fail(d.boss ? 'boss' : 'enemy', 'corpse', err); } world(); }
    }

    /* 8. actors, back to front */
    let fE = mE, fB = mB, fH = mH;
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (a === p) { if (fH) { try { fH.draw(c, p, t, g); } catch (err) { fail('hero', 'draw', err); fH = null; B.hero(c, p, t); } world(); } else { B.hero(c, p, t); world(); } }
      else if (a.boss) { if (fB) { try { fB.draw(c, a, t, g); } catch (err) { fail('boss', 'draw', err); fB = null; R._drawBoss(c, a, g); } world(); } else { R._drawBoss(c, a, g); world(); } }
      else if (fE) { try { fE.draw(c, a, t, g); } catch (err) { fail('enemy', 'draw', err); fE = null; B.enemy(c, a, t); } world(); }
      else B.enemy(c, a, t);
    }
    if (idle) { c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); vignette(c, g, 0.6); return; }
    for (let i = 0; i < actors.length; i++) { const e = actors[i]; if (!e.elite) continue; const f = Math.max(0, Math.min(1, e.hp / e.maxHp)); c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(e.x - 18, e.y + e.r + 7, 36, 5); c.fillStyle = COL.brass; c.fillRect(e.x - 18, e.y + e.r + 7, 36 * f, 5); }

    /* 9. projectiles + effects */
    if (p.orbPos.length) { m = mod('fx', 'orbs'); if (m) { try { m.orbs(c, p, t, g); } catch (err) { fail('fx', 'orbs', err); B.orbs(c, p); } world(); } else B.orbs(c, p); }
    m = mod('fx', 'bullet');
    for (const b of g.bullets) { if (!vis(b.x, b.y, 70)) continue; if (m) { try { m.bullet(c, b, t, g); } catch (err) { fail('fx', 'bullet', err); m = null; B.bullet(c, b); } world(); } else B.bullet(c, b); }
    m = mod('fx', 'ebullet');
    for (const b of g.ebullets) { if (!vis(b.x, b.y, 24)) continue; if (m) { try { m.ebullet(c, b, t, g); } catch (err) { fail('fx', 'ebullet', err); m = null; B.ebullet(c, b); } } else B.ebullet(c, b); }
    world();
    m = mod('fx', 'effect');
    if (m) for (const q of g.fxs) { if (!vis(q.x, q.y, 260)) continue; try { m.effect(c, q, t, g); } catch (err) { fail('fx', 'effect', err); break; } world(); }
    for (const nm of ['arcs', 'rings', 'parts', 'texts']) { m = mod('fx', nm); if (m) { try { m[nm](c, g, t); } catch (err) { fail('fx', nm, err); world(); B[nm](c, g); } world(); } else B[nm](c, g); }
    m = mod('world', 'over'); if (m) { c.save(); try { m.over(c, act, view, t, g); } catch (err) { fail('world', 'over', err); } c.restore(); }

    /* 10. screen space: off-screen arrows, joystick, vignette, flashes */
    c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    const arrow = (x, y, col) => {
      if (vis(x, y, -20)) return; const a = Math.atan2(y - cy, x - cx), mg = 34, ex = g.W / 2 - mg, ey = g.H / 2 - mg - 30;
      const tt = Math.min(Math.abs(ex / (Math.cos(a) || 1e-6)), Math.abs(ey / (Math.sin(a) || 1e-6))), ax = g.W / 2 + Math.cos(a) * tt, ay = g.H / 2 + 20 + Math.sin(a) * tt;
      c.save(); c.translate(ax, ay); c.rotate(a); c.fillStyle = col; c.strokeStyle = OUT; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath(); c.moveTo(14, 0); c.lineTo(-8, -10); c.lineTo(-3, 0); c.lineTo(-8, 10); c.closePath(); c.fill(); c.stroke(); c.restore();
    };
    for (const q of g.pickups) if (q.kind === 'chest') arrow(q.x, q.y, COL.brass);
    for (const b of g.bosses) if (b.hp > 0) arrow(b.x, b.y, COL[b.def.key]);
    if (g.joy.on) { c.globalAlpha = 0.35; c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(g.joy.ox, g.joy.oy, 50, 0, TAU); c.stroke(); const dx = g.joy.x - g.joy.ox, dy = g.joy.y - g.joy.oy, d = Math.hypot(dx, dy) || 1, mm = Math.min(50, d); dot(c, g.joy.ox + dx / d * mm, g.joy.oy + dy / d * mm, 22, '#fff'); c.globalAlpha = 1; }
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

  /* ================= fx events ================= */
  /* The engine reports WHAT happened; the look is decided here (built-in) or by PK.art.fx.emit(g, kind, x, y, o). */
  function burst(g, x, y, col, n) { if (g.parts.length > 160) return; for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 40 + Math.random() * 200, l = 0.25 + Math.random() * 0.35; g.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, col, size: 3 + Math.random() * 4, dead: false }); } }
  function ring(g, x, y, r0, r1, col, w, life) { g.rings.push({ x, y, r0, r1, col, w: w || 4, life: life || 0.35, max: life || 0.35, dead: false }); }
  function defaultEmit(g, kind, x, y, o) {
    switch (kind) {
      case 'kill': burst(g, x, y, o.col, o.elite ? 9 : o.r > 14 ? 4 : 3); if (o.elite) ring(g, x, y, o.r, o.r * 4, COL.brass, 6, 0.5); break;
      case 'explode': ring(g, x, y, o.r * 0.25, o.r, '#ffd27a', 7, 0.3); burst(g, x, y, '#ffb347', 5); break;
      case 'blast': ring(g, x, y, o.r * 0.2, o.r, COL.S, 8, 0.35); burst(g, x, y, COL.S, 6); break;
      case 'levelup': ring(g, x, y, 10, 170, COL.brass, 6, 0.5); break;
      case 'shieldBreak': ring(g, x, y, o.r, o.r * 4, '#9fe8ff', 8, 0.6); burst(g, x, y, '#9fe8ff', 12); break;
      case 'bossDie': burst(g, x, y, o.col, 18); burst(g, x, y, '#ffffff', 10); ring(g, x, y, o.r, o.r * 6, o.col, 10, 0.7); break;
      case 'nuke': ring(g, x, y, 20, o.r, '#ffffff', 10, 0.5); break;
      case 'down': burst(g, x, y, '#ffffff', 14); ring(g, x, y, 10, 200, '#ff8a80', 8, 0.6); break;
      case 'revive': ring(g, x, y, 10, 260, '#7dffb2', 8, 0.6); break;
      default: break;
    }
  }
  PK.fxEmit = function (g, kind, x, y, o) {
    o = o || {}; const m = mod('fx', 'emit');
    if (m) { try { m.emit(g, kind, x, y, o); return; } catch (err) { fail('fx', 'emit', err); } }
    defaultEmit(g, kind, x, y, o);
  };

  /* ================= portraits for menus ================= */
  const fakeG = (t, p) => ({ t, idleT: 0, state: 'menu', player: p || { x: 0, y: 300, r: 13 }, act: 0, bosses: [], enemies: [], gems: [], scale: 1, dpr: 1, zoom: 1 });
  PK.fakeEnemy = (type, o) => Object.assign({ type, def: PK.ENEMIES[type], x: 0, y: 0, r: PK.ENEMIES[type].r, face: 1, flash: 0, elite: false, st: 'walk', dx: 1, dy: 0, seed: 1.3, born: -99, rage: false, slowed: false, loot: 0, hp: 1, maxHp: 1, dead: false }, o || {});
  PK.fakeBoss = (kind, o) => { const i = PK.BOSS_INFO[kind]; return Object.assign({ boss: true, kind, def: { key: i.key }, name: i.name, x: 0, y: 0, r: i.r, face: -1, flash: 0, hp: 1, maxHp: 1, shield: false, stun: 0, enr: 0, st: '', dx: -1, dy: 0, side: 0, raging: false, rage: 0, vac: 0, arms: 0, fuse: undefined, t: 0, born: -99, aimA: Math.PI, seed: 0.7, dead: false }, o || {}); };
  PK.fakePlayer = (ch, o) => Object.assign({ x: 0, y: 0, r: 13, char: ch, moving: false, face: 0, faceX: 1, aim: null, iframes: 0, hp: 100, maxHp: 100, level: 1, auraR: 0, orbPos: [] }, o || {});
  function prep(canvas, size, span, oy) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3), w = Array.isArray(size) ? size[0] : size, h = Array.isArray(size) ? size[1] : size;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
    const c = canvas.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, pw, ph);
    const s = Math.min(w, h) / span * dpr; c.setTransform(s, 0, 0, s, pw / 2, ph / 2 + (oy || 0) * s); c.lineJoin = 'round'; c.lineCap = 'round'; return c;
  }
  function shadow(c, r) { c.fillStyle = 'rgba(4,10,16,.28)'; c.beginPath(); c.ellipse(0, r * 0.95, r * 0.95, r * 0.34, 0, 0, TAU); c.fill(); }
  /* Draw a character / monster / boss into any <canvas>. o = {size: cssPx | [w,h], moving, faceX, shadow:false, ...entity overrides} */
  PK.portrait = {
    hero(canvas, ch, t, o) {
      o = o || {}; const c = prep(canvas, o.size || 64, o.span || 58, o.oy === undefined ? 9 : o.oy), p = PK.fakePlayer(ch, { moving: !!o.moving, faceX: o.faceX || 1, face: o.faceX < 0 ? Math.PI : 0 }), g = fakeG(t, p), m = mod('hero', 'draw');
      if (m) { try { if (o.shadow !== false) shadow(c, p.r * 1.2); m.draw(c, p, t, g); return; } catch (err) { fail('hero', 'draw', err); } }
      B.hero(c, p, t);
    },
    enemy(canvas, type, t, o) {
      o = o || {}; const e = PK.fakeEnemy(type, o.entity), c = prep(canvas, o.size || 64, o.span || e.r * 5, o.oy === undefined ? e.r * 0.5 : o.oy), g = fakeG(t), m = mod('enemy', 'draw');
      if (o.shadow !== false) shadow(c, e.r);
      if (m) { try { m.draw(c, e, t, g); return; } catch (err) { fail('enemy', 'draw', err); } }
      B.enemy(c, e, t);
    },
    boss(canvas, kind, t, o) {
      o = o || {}; const b = PK.fakeBoss(kind, Object.assign({ t }, o.entity)), c = prep(canvas, o.size || 96, o.span || b.r * 4.6, o.oy === undefined ? b.r * 0.4 : o.oy), g = fakeG(t), m = mod('boss', 'draw');
      if (m) { try { if (o.shadow !== false) shadow(c, b.r); m.draw(c, b, t, g); return; } catch (err) { fail('boss', 'draw', err); } }
      R._drawBoss(c, b, g);
    },
  };
})();
