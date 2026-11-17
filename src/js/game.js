/* game.js — the action game. Exposes window.Game. Uses PK (game-data/game-render), U, Save, and — when present — Quiz, Meta, AudioSys. */
(function () {
  'use strict';
  const PK = window.PK, COL = PK.COL, R = PK.R, TAU = Math.PI * 2;
  const WD = PK.WEAPONS, PD = PK.PASSIVES, ED = PK.ENEMIES, ACTS = PK.ACTS;
  const MAXW = 5, MAXP = 5, CELL = 80;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sfx = (n, o) => { try { window.AudioSys && AudioSys.sfx(n, o); } catch (e) {} };
  const music = (n) => { try { window.AudioSys && AudioSys.music(n); } catch (e) {} };
  const duck = (b) => { try { window.AudioSys && AudioSys.duck && AudioSys.duck(b); } catch (e) {} };
  const opt = () => Save.ns('settings');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const DBG = { auto: null, god: false, speed: 1, bot: false };

  let cv, g, last = 0, keys = {}, modalRoot, pauseM = null, banT = 0;
  const H = {}, HV = {};

  function blank() {
    return { state: 'idle', paused: false, busy: false, t: 0, idleT: 0, actT: 0, act: 0, actDef: ACTS[0], timeScale: 1, slowT: 0,
      W: 0, H: 0, dpr: 1, scale: 1, vw: 800, vh: 600, cam: { x: 0, y: 0, sx: 0, sy: 0, shake: 0 },
      player: null, enemies: [], bullets: [], ebullets: [], gems: [], pickups: [], parts: [], texts: [], zones: [], arcs: [], rings: [], bosses: [], deco: [],
      kills: 0, coins: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, bossKills: 0, bonusPerfect: 0, revived: false, damageTaken: 0, danger: 0,
      mult: { hp: 1, dmg: 1, spd: 1, spawn: 1 }, spawnAcc: 0, eliteT: 38, bossState: 'none', bossT: 0, flash: 0, flashCol: '#ff3b30',
      killStreak: 0, killStreakT: 0, nextStreak: 25, dmgAcc: 0, dpsT: 0, dps: 25, dpsPeak: 25, gemCombo: 0, gemComboT: 0,
      joy: { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 }, pendChest: 0, pendBoss: null, pendDown: false, maxAct: 1, opts: null, cap: 210 };
  }

  /* ================= player ================= */
  const xpFor = (l) => Math.floor(4 + l * 3.5 + Math.pow(l, 1.9));
  function newPlayer(ch, bon) {
    const p = { x: 0, y: 0, vx: 0, vy: 0, r: 13, face: 0, moving: false, hp: 100, maxHp: 100, iframes: 1, level: 1, xp: 0, xpNext: xpFor(1), pendingLv: 0,
      weapons: [], passives: {}, ov: { dmg: 0, hp: 0, cd: 0 }, char: ch, bon, rerolls: bon.rerolls | 0, revives: 1 + (bon.revives | 0), orbA: 0, orbPos: [], auraR: 0,
      baseMaxHp: Math.max(40, 100 + (bon.maxHp || 0)), dmgMult: 1, cdMult: 1, spdMult: 1, magnet: 1, xpMult: 1, coinMult: 1, armor: 0, regen: 0, crit: 0.05, area: 1 };
    recalc(p); p.hp = p.maxHp;
    p.weapons.push({ id: WD[ch.startWeapon] ? ch.startWeapon : 'blaster', lvl: 1, t: 0.4, acc: 0 });
    return p;
  }
  function recalc(p) {
    const b = p.bon, L = (id) => p.passives[id] || 0;
    p.maxHp = Math.round(p.baseMaxHp + 20 * L('heart') + 10 * p.ov.hp);
    p.dmgMult = (b.dmgMult || 1) * (1 + 0.12 * L('power')) * (1 + 0.06 * p.ov.dmg);
    p.cdMult = (b.cooldownMult || 1) * Math.pow(0.92, L('haste')) * Math.pow(0.97, p.ov.cd);
    p.spdMult = (b.speedMult || 1) * (1 + 0.09 * L('boots'));
    p.magnet = (b.magnetMult || 1) * (1 + 0.3 * L('magnet'));
    p.xpMult = (b.xpMult || 1) * (1 + 0.1 * L('scholar'));
    p.coinMult = (b.coinMult || 1) * (1 + 0.15 * L('greed'));
    p.armor = (b.armor || 0) + L('armor');
    p.regen = (b.regen || 0) + 0.4 * L('regen');
    p.crit = 0.05 + (b.crit || 0) + 0.06 * L('luck');
    p.area = 1 + 0.1 * L('area');
    if (p.hp > p.maxHp) p.hp = p.maxHp;
  }
  function heal(v, quiet) { const p = g.player; if (p.hp >= p.maxHp || p.hp <= 0) return; p.hp = Math.min(p.maxHp, p.hp + v); text(p.x, p.y - 28, '+' + Math.round(v), '#7dffb2', 14); if (!quiet) sfx('heal'); }
  function addXp(v) {
    const p = g.player; p.xp += v * p.xpMult;
    while (p.xp >= p.xpNext) { p.xp -= p.xpNext; p.pendingLv++; p.xpNext = xpFor(p.level + p.pendingLv); }
  }
  function hitPlayer(raw, pure) {
    const p = g.player; if (p.iframes > 0 || g.state !== 'play' || DBG.god) return;
    const d = Math.max(1, Math.round(raw * g.mult.dmg) - (pure ? 0 : p.armor));
    p.hp -= d; g.damageTaken += d; p.iframes = 0.55; shake(9); g.flash = 0.3; g.flashCol = '#ff3b30'; sfx('hurt'); text(p.x, p.y - 26, '-' + d, '#ff9a8f', 15);
    if (p.hp <= 0) { p.hp = 0; g.pendDown = true; }
  }

  /* ================= fx helpers ================= */
  function text(x, y, str, col, size, life) { if (g.texts.length > 70) g.texts.shift(); g.texts.push({ x, y, str: String(str), col: col || '#fff', size: size || 12, life: life || 0.7, dead: false }); }
  function burst(x, y, col, n) { if (g.parts.length > 420) return; for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = rnd(40, 240), l = rnd(0.25, 0.6); g.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, col, size: rnd(3, 7), dead: false }); } }
  function ring(x, y, r0, r1, col, w, life) { g.rings.push({ x, y, r0, r1, col, w: w || 4, life: life || 0.35, max: life || 0.35, dead: false }); }
  function shake(v) { if (opt().shake === false) return; g.cam.shake = Math.max(g.cam.shake, v); }
  function banner(title, sub, col, big, ms) {
    const b = H.banner; b.innerHTML = ''; b.style.setProperty('--bc', col || COL.brass);
    b.append(U.el('div', { class: 'hb-big display', text: big || '' }), U.el('div', { class: 'hb-txt' }, U.el('div', { class: 'hb-t display', text: title }), U.el('div', { class: 'hb-s', text: sub || '' })));
    b.hidden = false; b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
    clearTimeout(banT); banT = setTimeout(() => { b.hidden = true; }, ms || 3500);
  }

  /* ================= spatial grid ================= */
  let grid = new Map(), gridAge = 0; const tmp = [];
  const gkey = (cx, cy) => (cx + 8192) * 16384 + (cy + 8192);
  function buildGrid() {
    if (++gridAge > 600) { grid = new Map(); gridAge = 0; } else grid.forEach((a) => { a.length = 0; });
    const es = g.enemies;
    for (let i = 0; i < es.length; i++) { const e = es[i]; if (e.boss || e.dead) continue; const k = gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL)); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(e); }
  }
  function forNear(x, y, rad, fn) {
    const pad = rad + 30, x0 = Math.floor((x - pad) / CELL), x1 = Math.floor((x + pad) / CELL), y0 = Math.floor((y - pad) / CELL), y1 = Math.floor((y + pad) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const a = grid.get(gkey(cx, cy)); if (a) for (let i = 0; i < a.length; i++) { const e = a[i]; if (e.hp > 0) fn(e); } }
    const bs = g.bosses; for (let i = 0; i < bs.length; i++) if (bs[i].hp > 0) fn(bs[i]);
  }
  function nearest(x, y, maxD, skip) { let best = null, bd = maxD * maxD; forNear(x, y, maxD, (e) => { if (skip && skip.has(e)) return; const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = e; } }); return best; }
  function bossNear(x, y, maxD, chance) { if (!g.bosses.length || Math.random() > chance) return null; let best = null, bd = maxD * maxD; for (const b of g.bosses) { if (b.hp <= 0) continue; const dx = b.x - x, dy = b.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = b; } } return best; }
  function randomNear(x, y, maxD) { tmp.length = 0; const m2 = maxD * maxD; forNear(x, y, maxD, (e) => { const dx = e.x - x, dy = e.y - y; if (dx * dx + dy * dy < m2) tmp.push(e); }); return tmp.length ? tmp[(Math.random() * tmp.length) | 0] : null; }

  /* ================= damage ================= */
  function hurt(e, dmg, kx, ky, quiet) {
    if (e.hp <= 0) return false;
    const p = g.player; let d = dmg * p.dmgMult, crit = false;
    if (Math.random() < p.crit) { d *= 2; crit = true; }
    if (e.boss) {
      if (e.shield) { if (Math.random() < 0.05) text(e.x + rnd(-20, 20), e.y - e.r - 8, 'SHIELDED', '#9fe8ff', 12); return false; }
      e.hp -= d; g.dmgAcc += d; e.flash = 0.07;
      if (e.def.onHurt) e.def.onHurt(e);
      if (e.gates.length && e.hp <= e.maxHp * e.gates[0]) { e.hp = Math.max(1, e.maxHp * e.gates[0]); e.gates.shift(); e.shield = true; e.shieldT = 0; g.pendBoss = e; }
      if (!quiet) sfx('boss_hit');
    } else {
      e.hp -= d; g.dmgAcc += d; e.flash = 0.07;
      if (kx !== undefined) { const kb = e.def.kb !== undefined ? e.def.kb : 1, m = e.elite ? 0.4 : 1; e.kx += kx * kb * m; e.ky += ky * kb * m; }
      if (e.sq) e.sq.rageT = g.t + 2.5;
      if (!quiet) sfx(crit ? 'crit' : 'hit');
    }
    if (!quiet && opt().dmgNumbers !== false && g.texts.length < 46) text(e.x + rnd(-6, 6), e.y - e.r - 4, Math.round(d), crit ? '#ffe066' : '#ffffff', crit ? 17 : 12, 0.5);
    if (e.hp <= 0) kill(e);
    return true;
  }
  function kill(e) {
    e.dead = true; e.hp = 0;
    if (e.boss) { bossDown(e); return; }
    g.kills++; const col = COL[e.def.key];
    burst(e.x, e.y, col, e.elite ? 20 : e.r > 14 ? 8 : 5); sfx('kill');
    gem(e.x, e.y, e.xp); if (e.loot) gem(e.x + 8, e.y, Math.ceil(e.loot * 1.5));
    if (e.elite) { drop('chest', e.x, e.y); for (let i = 0; i < 4; i++) drop('coin', e.x + rnd(-24, 24), e.y + rnd(-24, 24), 2); ring(e.x, e.y, e.r, e.r * 4, COL.brass, 6, 0.5); shake(6); }
    else { const r = Math.random(); if (r < 0.04) drop('coin', e.x, e.y, 1 + (g.act >> 1)); else if (r < 0.048) drop('heart', e.x, e.y); else if (r < 0.052) drop('magnet', e.x, e.y); else if (r < 0.0545) drop('bomb', e.x, e.y); }
    g.killStreak++; g.killStreakT = 2;
    if (g.killStreak >= g.nextStreak) { text(g.player.x, g.player.y - 62, U.pick(PK.STREAK_LINES) + '  x' + g.killStreak, COL.brass, 20, 1.5); g.nextStreak = Math.round(g.nextStreak * 1.8); sfx('streak'); }
  }
  function blast(x, y, rad, dmg) {
    forNear(x, y, rad, (e) => { const dx = e.x - x, dy = e.y - y, rr = rad + e.r; if (dx * dx + dy * dy < rr * rr) { const d = Math.hypot(dx, dy) || 1; hurt(e, dmg, dx / d * 160, dy / d * 160); } });
    ring(x, y, rad * 0.25, rad, '#ffd27a', 7, 0.3); burst(x, y, '#ffb347', 10); shake(4); sfx('explosion');
  }
  function nuke() {
    const p = g.player, far = Math.hypot(g.vw, g.vh) * 0.6;
    for (const e of g.enemies) { if (e.boss || e.dead) continue; if (Math.hypot(e.x - p.x, e.y - p.y) < far) kill(e); }
    g.ebullets.length = 0; g.flash = 0.45; g.flashCol = '#ffffff'; shake(14); sfx('explosion'); ring(p.x, p.y, 20, far, '#ffffff', 10, 0.5); text(p.x, p.y - 40, 'KA-BOOM!', '#fff', 22, 1.2);
  }
  function gem(x, y, v) { if (g.gems.length > 240) { const q = g.gems[(Math.random() * g.gems.length) | 0]; q.v += v; return; } g.gems.push({ x: x + rnd(-5, 5), y: y + rnd(-5, 5), v, pull: false, spd: 0, dead: false }); }
  function drop(kind, x, y, v) { g.pickups.push({ kind, x, y, v: v || 1, pull: false, spd: 0, dead: false }); }
  function eshot(x, y, a, spd, r, dmg, col) { if (g.ebullets.length > 230) return; g.ebullets.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r, dmg: dmg * (1 + 0.15 * g.act), life: 6.5, col, dead: false }); }

  /* ================= weapons ================= */
  const WEP = {
    blaster: { cd: (L) => 0.5 * (L >= 5 ? 0.75 : 1),
      fire(w, p) {
        const L = w.lvl, tg = bossNear(p.x, p.y, 480, 0.5) || nearest(p.x, p.y, 480); if (!tg) return false;
        const n = 1 + (L >= 2) + (L >= 4) + (L >= 6), dmg = 12 * (L >= 3 ? 1.4 : 1), pierce = (L >= 3 ? 1 : 0) + (L >= 6 ? 1 : 0), a0 = Math.atan2(tg.y - p.y, tg.x - p.x);
        for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.13; g.bullets.push({ kind: 'bolt', x: p.x, y: p.y - 4, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, r: 5, dmg, pierce, life: 1.0, hit: null, dead: false }); }
        sfx('shoot');
      } },
    cannon: { cd: (L) => (L >= 6 ? 1.7 : 2.3),
      fire(w, p) {
        const L = w.lvl, n = 1 + (L >= 3) + (L >= 5), up = (L >= 2) + (L >= 4), dmg = 26 * (1 + 0.25 * up) * (L >= 6 ? 1.2 : 1), rad = (62 + 9 * up + (L >= 6 ? 22 : 0)) * p.area; let any = false;
        for (let i = 0; i < n; i++) { const tg = bossNear(p.x, p.y, 430, 0.4) || randomNear(p.x, p.y, 430); if (!tg) break; any = true; g.bullets.push({ kind: 'shell', x: p.x, y: p.y, sx: p.x, sy: p.y, tx: tg.x + rnd(-10, 10), ty: tg.y + rnd(-10, 10), t: 0, dur: 0.55 + i * 0.09, z: 0, rad, dmg, dead: false }); }
        if (!any) return false; sfx('whoosh');
      } },
    orbs: { tick(w, p, dt) {
        const L = w.lvl, n = 2 + (L >= 2) + (L >= 4) + (L >= 5) + (L >= 6), rad = (58 + (L >= 3 ? 16 : 0)) * p.area, dmg = 8 + (L >= 3 ? 4 : 0) + (L >= 6 ? 5 : 0);
        p.orbA += 2.5 * (L >= 5 ? 1.35 : 1) * dt;
        for (let i = 0; i < n; i++) {
          const a = p.orbA + i * TAU / n, ox = p.x + Math.cos(a) * rad, oy = p.y + Math.sin(a) * rad; p.orbPos.push({ x: ox, y: oy });
          forNear(ox, oy, 11, (e) => { const dx = e.x - ox, dy = e.y - oy, rr = e.r + 11; if (dx * dx + dy * dy < rr * rr && (e.cdOrb || 0) < g.t) { e.cdOrb = g.t + 0.4; const d = Math.hypot(dx, dy) || 1; hurt(e, dmg, dx / d * 110, dy / d * 110); sfx('orb'); } });
        }
      } },
    chain: { cd: (L) => 1.7 * (L >= 3 ? 0.85 : 1) * (L >= 5 ? 0.85 : 1),
      fire(w, p) {
        const L = w.lvl, jumps = 3 + (L >= 2) + (L >= 3) + (L >= 4) + (L >= 5) + (L >= 6) * 2, dmg = 15 + (L >= 2 ? 5 : 0) + (L >= 4 ? 6 : 0) + (L >= 6 ? 8 : 0);
        let cur = bossNear(p.x, p.y, 360, 0.4) || nearest(p.x, p.y, 360); if (!cur) return false;
        const seen = new Set(), pts = [{ x: p.x, y: p.y }];
        for (let j = 0; j < jumps && cur; j++) { seen.add(cur); const q = { x: cur.x, y: cur.y }; pts.push(q); hurt(cur, dmg); cur = nearest(q.x, q.y, 150 * p.area, seen); }
        g.arcs.push({ pts, life: 0.2, col: '#9fd6ff', dead: false }); sfx('zap');
      } },
    boomerang: { cd: (L) => 1.9 * (L >= 5 ? 0.75 : 1),
      fire(w, p) {
        const L = w.lvl, n = 1 + (L >= 3) + (L >= 6), dmg = 13 + (L >= 2 ? 5 : 0) + (L >= 4 ? 7 : 0), size = (13 + (L >= 4 ? 5 : 0)) * p.area, range = 230 + (L >= 2 ? 70 : 0);
        const tg = nearest(p.x, p.y, 420), a0 = tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : p.face;
        for (let i = 0; i < n; i++) g.bullets.push({ kind: 'boom', x: p.x, y: p.y, a: a0 + (i - (n - 1) / 2) * 0.5, dist: 0, range, ph: 0, spd: 470, r: size, dmg, spin: 0, dead: false });
        sfx('boomerang');
      } },
    trail: { tick(w, p, dt) {
        const L = w.lvl; w.acc += dt; const moved = Math.hypot(p.x - (w.lx || 0), p.y - (w.ly || 0));
        if (moved > 16 || w.acc > 0.45) {
          w.acc = 0; w.lx = p.x; w.ly = p.y;
          g.zones.push({ kind: 'fire', x: p.x, y: p.y + 6, r: (19 + (L >= 3 ? 5 : 0) + (L >= 5 ? 5 : 0)) * p.area, life: 1.7 + (L >= 2 ? 0.7 : 0) + (L >= 4 ? 0.8 : 0), dmg: (6 + (L >= 3 ? 3 : 0) + (L >= 5 ? 3 : 0)) * (L >= 6 ? 1.6 : 1), acc: 0, dead: false });
        }
      } },
    aura: { tick(w, p, dt) {
        const L = w.lvl, rad = (74 + (L >= 2 ? 16 : 0) + (L >= 4 ? 16 : 0) + (L >= 6 ? 26 : 0)) * p.area; p.auraR = rad;
        w.acc += dt; if (w.acc < 0.4) return; w.acc = 0;
        const dmg = 4 + (L >= 3 ? 3 : 0) + (L >= 5 ? 3 : 0), slow = 0.25 + (L >= 3 ? 0.1 : 0) + (L >= 5 ? 0.1 : 0), push = L >= 6 ? 150 : 30;
        forNear(p.x, p.y, rad, (e) => { const dx = e.x - p.x, dy = e.y - p.y, rr = rad + e.r; if (dx * dx + dy * dy < rr * rr) { const d = Math.hypot(dx, dy) || 1; e.slowT = g.t + 0.6; e.slow = slow; hurt(e, dmg, dx / d * push, dy / d * push, true); } });
      } },
    press: { cd: (L) => 2.6 * (L >= 5 ? 0.75 : 1),
      fire(w, p) {
        const L = w.lvl, n = 8 + (L >= 2 ? 2 : 0) + (L >= 4 ? 2 : 0) + (L >= 6 ? 4 : 0), dmg = 10 + (L >= 2 ? 3 : 0) + (L >= 4 ? 4 : 0), pierce = 1 + (L >= 3 ? 2 : 0) + (L >= 6 ? 2 : 0), a0 = Math.random() * TAU;
        if (!nearest(p.x, p.y, 380)) return false;
        for (let i = 0; i < n; i++) { const a = a0 + i * TAU / n; g.bullets.push({ kind: 'paper', x: p.x, y: p.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, r: 8, dmg, pierce, life: 1.25, rot: a, hit: null, dead: false }); }
        sfx('whoosh');
      } },
  };
  function updWeapons(dt) {
    const p = g.player; p.auraR = 0; p.orbPos.length = 0;
    for (const w of p.weapons) {
      const d = WEP[w.id]; if (d.tick) d.tick(w, p, dt);
      if (d.fire) { w.t -= dt; if (w.t <= 0) w.t = d.fire(w, p) === false ? 0.15 : d.cd(w.lvl) * p.cdMult; }
    }
  }
  function updBullets(dt) {
    const p = g.player;
    for (const b of g.bullets) {
      if (b.dead) continue;
      if (b.kind === 'bolt' || b.kind === 'paper') {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.kind === 'paper') b.rot += dt * 9;
        forNear(b.x, b.y, b.r, (e) => {
          if (b.dead || (b.hit && b.hit.indexOf(e) >= 0)) return;
          const dx = e.x - b.x, dy = e.y - b.y, rr = e.r + b.r;
          if (dx * dx + dy * dy < rr * rr) { const m = Math.hypot(b.vx, b.vy) || 1; hurt(e, b.dmg, b.vx / m * 70, b.vy / m * 70); if (b.pierce > 0) { b.pierce--; (b.hit || (b.hit = [])).push(e); } else b.dead = true; }
        });
        if (b.life <= 0) b.dead = true;
      } else if (b.kind === 'shell') {
        b.t += dt; const f = Math.min(1, b.t / b.dur); b.x = b.sx + (b.tx - b.sx) * f; b.y = b.sy + (b.ty - b.sy) * f; b.z = Math.sin(f * Math.PI) * 70;
        if (f >= 1) { blast(b.tx, b.ty, b.rad, b.dmg); b.dead = true; }
      } else if (b.kind === 'boom') {
        b.spin += dt * 16;
        if (b.ph === 0) { b.x += Math.cos(b.a) * b.spd * dt; b.y += Math.sin(b.a) * b.spd * dt; b.dist += b.spd * dt; b.spd = Math.max(110, b.spd - 420 * dt * (b.dist / b.range)); if (b.dist >= b.range) b.ph = 1; }
        else { const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1; b.spd = Math.min(640, b.spd + 950 * dt); b.x += dx / d * b.spd * dt; b.y += dy / d * b.spd * dt; if (d < 22) b.dead = true; }
        forNear(b.x, b.y, b.r, (e) => { const dx = e.x - b.x, dy = e.y - b.y, rr = e.r + b.r; if (dx * dx + dy * dy < rr * rr && (e.cdBoom || 0) < g.t) { e.cdBoom = g.t + 0.35; const d = Math.hypot(dx, dy) || 1; hurt(e, b.dmg, dx / d * 60, dy / d * 60); } });
        const gr = b.r + 16; for (const q of g.gems) { if (q.pull) continue; const dx = q.x - b.x, dy = q.y - b.y; if (dx * dx + dy * dy < gr * gr) q.pull = true; }
      }
    }
    for (const b of g.ebullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.life <= 0) { b.dead = true; continue; }
      const dx = p.x - b.x, dy = p.y - b.y, rr = p.r + b.r - 2; if (dx * dx + dy * dy < rr * rr) { b.dead = true; hitPlayer(b.dmg); }
    }
  }
  function updZones(dt) {
    const p = g.player;
    for (const z of g.zones) {
      if (z.kind === 'fire') {
        z.life -= dt; z.acc += dt; if (z.life <= 0) { z.dead = true; continue; }
        if (z.acc >= 0.3) { z.acc = 0; forNear(z.x, z.y, z.r, (e) => { const dx = e.x - z.x, dy = e.y - z.y, rr = e.r + z.r; if (dx * dx + dy * dy < rr * rr && (e.cdTrail || 0) < g.t) { e.cdTrail = g.t + 0.28; hurt(e, z.dmg, undefined, undefined, true); if (g.parts.length < 300) burst(e.x, e.y, '#ff9a3c', 1); } }); }
      } else if (z.kind === 'claim') {
        if (z.warn > 0) { z.warn -= dt; continue; }
        z.life -= dt; z.acc += dt; if (z.life <= 0) { z.dead = true; continue; }
        if (z.acc >= 0.45) { z.acc = 0; if (Math.hypot(p.x - z.x, p.y - z.y) < z.r) hitPlayer(z.dmg); }
      } else if (z.kind === 'blast') {
        z.warn -= dt;
        if (z.warn <= 0) { z.dead = true; ring(z.x, z.y, z.r * 0.2, z.r, COL.S, 8, 0.35); burst(z.x, z.y, COL.S, 14); shake(6); sfx('explosion'); if (Math.hypot(p.x - z.x, p.y - z.y) < z.r + p.r) hitPlayer(z.dmg); }
      }
    }
  }
  function updPickups(dt) {
    const p = g.player, pr = 72 * p.magnet, pr2 = pr * pr;
    for (const q of g.gems) {
      if (q.dead) continue; const dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
      if (q.pull || d2 < pr2) {
        q.pull = true; const d = Math.sqrt(d2) || 1; q.spd = Math.min(780, (q.spd || 170) + 1100 * dt); q.x += dx / d * q.spd * dt; q.y += dy / d * q.spd * dt;
        if (d < 18) { q.dead = true; addXp(q.v); g.gemCombo = Math.min(14, g.gemCombo + 1); g.gemComboT = 0.5; sfx('pickup', { pitch: 1 + g.gemCombo * 0.045 }); }
      }
    }
    if (g.gemComboT > 0 && (g.gemComboT -= dt) <= 0) g.gemCombo = 0;
    for (const q of g.pickups) {
      if (q.dead) continue; const dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
      if (q.kind === 'coin' && (q.pull || d2 < pr2)) { q.pull = true; const d = Math.sqrt(d2) || 1; q.spd = Math.min(780, (q.spd || 170) + 1100 * dt); q.x += dx / d * q.spd * dt; q.y += dy / d * q.spd * dt; }
      const rr = p.r + 16; if (d2 < rr * rr) { q.dead = true; take(q); }
    }
  }
  function take(q) {
    const p = g.player;
    switch (q.kind) {
      case 'coin': g.coins += q.v; sfx('coin'); break;
      case 'heart': heal(p.maxHp * 0.25); break;
      case 'magnet': for (const x of g.gems) x.pull = true; for (const x of g.pickups) if (x.kind === 'coin') x.pull = true; sfx('whoosh'); text(p.x, p.y - 34, 'MAGNET!', '#58e6c9', 17, 1); break;
      case 'bomb': nuke(); break;
      case 'chest': g.pendChest++; break;
    }
  }

  /* ================= enemies ================= */
  function edge(m) {
    const hw = g.vw / 2 + m, hh = g.vh / 2 + m, cx = g.player.x, cy = g.player.y, per = Math.random() * (hw * 4 + hh * 4);
    if (per < hw * 2) return [cx - hw + per, cy - hh]; if (per < hw * 4) return [cx - hw + (per - hw * 2), cy + hh];
    if (per < hw * 4 + hh * 2) return [cx - hw, cy - hh + (per - hw * 4)]; return [cx + hw, cy - hh + (per - hw * 4 - hh * 2)];
  }
  function spawn(type, x, y, elite) {
    const d = ED[type], a = g.actDef, hm = a.hp * (1 + Math.min(1.4, g.actT / a.len) * 0.6) * g.mult.hp * (elite ? 8 : 1);
    const e = { type, def: d, ai: d.ai, x, y, r: d.r * (elite ? 1.55 : 1), hp: d.hp * hm, maxHp: d.hp * hm, spd: d.spd * g.mult.spd * rnd(0.92, 1.08) * (elite ? 0.9 : 1),
      dmg: d.dmg * (1 + 0.22 * g.act) * (elite ? 1.4 : 1), xp: Math.max(1, Math.round(d.xp * (1 + 0.35 * g.act))) * (elite ? 8 : 1), kx: 0, ky: 0, flash: 0, seed: Math.random() * 10, elite: !!elite,
      st: 'walk', cd: rnd(1, 3), tm: 0, dx: 0, dy: 0, loot: 0, slowT: 0, slow: 0, sq: null, buddy: null, tgt: null, dead: false };
    g.enemies.push(e); return e;
  }
  function spawnPick(table) {
    let tot = 0; for (const k in table) tot += table[k]; let r = Math.random() * tot, type = 'recruit';
    for (const k in table) { r -= table[k]; if (r <= 0) { type = k; break; } }
    const q = edge(40);
    if (type === 'link') { const n = 3 + ((Math.random() * 3) | 0), sq = { rageT: 0 }; let prev = null; for (let i = 0; i < n; i++) { const e = spawn('link', q[0] + rnd(-34, 34), q[1] + rnd(-34, 34)); e.sq = sq; e.buddy = prev; prev = e; } }
    else if (ED[type].r <= 10 && Math.random() < 0.22) { for (let i = 0; i < 4; i++) spawn(type, q[0] + rnd(-30, 30), q[1] + rnd(-30, 30)); }
    else spawn(type, q[0], q[1]);
  }
  const ELITES = ['brute', 'link', 'grabber', 'zealot', 'spark'];
  function spawnElite() { const q = edge(50), e = spawn(ELITES[g.act] || 'brute', q[0], q[1], true); text(g.player.x, g.player.y - 70, 'ELITE! Beat it for a treasure chest', COL.brass, 15, 2); sfx('boss_warn', { vol: 0.5 }); return e; }
  function spawnNear(type, b, rad) { const a = Math.random() * TAU; return spawn(type, b.x + Math.cos(a) * rad, b.y + Math.sin(a) * rad); }

  function updEnemies(dt) {
    const p = g.player, es = g.enemies, far = Math.hypot(g.vw, g.vh) * 0.95, kd = Math.pow(0.02, dt);
    for (let i = 0; i < es.length; i++) {
      const e = es[i]; if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.boss) { updBoss(e, dt); continue; }
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1; let ux = dx / d, uy = dy / d;
      if (d > far) { const q = edge(40); e.x = q[0]; e.y = q[1]; continue; }
      let sp = e.spd; if (e.slowT > g.t) sp *= 1 - e.slow;
      switch (e.ai) {
        case 'link': if (e.sq && e.sq.rageT > g.t) sp *= 1.9; break;
        case 'wobble': { const w = Math.sin(g.t * 6 + e.seed * 5) * 0.7, nx = -uy, ny = ux; ux += nx * w; uy += ny * w; break; }
        case 'grab': {
          e.tm -= dt;
          if (e.tm <= 0) { e.tm = 0.5; let best = null, bd = 380 * 380; const gs = g.gems; for (let j = 0; j < gs.length; j++) { const q = gs[j]; if (q.dead || q.pull) continue; const gx = q.x - e.x, gy = q.y - e.y, dd = gx * gx + gy * gy; if (dd < bd) { bd = dd; best = q; } } e.tgt = best; }
          const q = e.tgt;
          if (q && !q.dead && !q.pull) { const gx = q.x - e.x, gy = q.y - e.y, gd = Math.hypot(gx, gy) || 1; ux = gx / gd; uy = gy / gd; if (gd < e.r + 6) { q.dead = true; e.loot += q.v; e.r = Math.min(30, e.r + 0.7); e.hp += e.maxHp * 0.06; e.tgt = null; e.tm = 0; if (g.texts.length < 30) text(e.x, e.y - e.r - 6, 'GRAB!', COL.I, 11); } }
          break;
        }
        case 'dash': {
          if (e.st === 'walk') { e.cd -= dt; if (e.cd <= 0 && d < 300) { e.st = 'aim'; e.tm = 0.55; } }
          else if (e.st === 'aim') { sp = 0; e.dx = ux; e.dy = uy; e.tm -= dt; if (e.tm <= 0) { e.st = 'dash'; e.tm = 0.48; } }
          else { ux = e.dx; uy = e.dy; sp = 430; e.tm -= dt; if (e.tm <= 0) { e.st = 'walk'; e.cd = rnd(2.2, 3.8); } }
          break;
        }
        case 'gun': {
          if (d < 190) { ux = -ux; uy = -uy; sp *= 0.8; } else if (d < 270) { const nx = -uy; uy = ux; ux = nx; sp *= 0.6; }
          e.cd -= dt; if (e.cd <= 0 && d < 420) { e.cd = rnd(2.4, 3.2); eshot(e.x, e.y, Math.atan2(dy, dx), 180, 6, e.dmg); }
          break;
        }
      }
      e.x += (ux * sp + e.kx) * dt; e.y += (uy * sp + e.ky) * dt; e.kx *= kd; e.ky *= kd;
      const rr = p.r + e.r - 3;
      if (d < rr + 12) { const ax = p.x - e.x, ay = p.y - e.y; if (ax * ax + ay * ay < rr * rr) hitPlayer(e.dmg * (e.st === 'dash' ? 1.4 : 1)); }
    }
    for (let i = 0; i < es.length; i++) {
      const e = es[i]; if (e.boss || e.dead) continue;
      const a = grid.get(gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL))); if (!a) continue; let n = 0;
      for (let j = 0; j < a.length && n < 5; j++) { const o = a[j]; if (o === e || o.dead) continue; const dx = e.x - o.x, dy = e.y - o.y, rr = (e.r + o.r) * 0.85, d2 = dx * dx + dy * dy; if (d2 < rr * rr && d2 > 0.01) { const d = Math.sqrt(d2), push = (rr - d) * 0.25 / d; e.x += dx * push; e.y += dy * push; n++; } }
    }
  }

  /* ================= bosses ================= */
  const ang = (b, p) => Math.atan2(p.y - b.y, p.x - b.x);
  function moveTo(b, tx, ty, sp, dt) { const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1, s = Math.min(sp * dt, d); b.x += dx / d * s; b.y += dy / d * s; }
  function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1; let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)); }
  const BOSS = {
    dreadnought: { r: 46, spd: 44, dmg: 16, key: 'M',
      init(b) { b.a1 = 2; b.a2 = 5; b.a3 = 7; b.arms = 0; },
      update(b, dt, p) {
        moveTo(b, p.x, p.y, b.spd, dt); const rate = b.enr > 0 ? 1.5 : 1;
        if ((b.a1 -= dt * rate) <= 0) { b.a1 = 2.0; const n = 3 + b.arms, a0 = ang(b, p); for (let i = 0; i < n; i++) eshot(b.x, b.y, a0 + (i - (n - 1) / 2) * 0.17, 205, 7, 10); sfx('shoot', { pitch: 0.55 }); }
        if ((b.a2 -= dt * rate) <= 0) { b.a2 = 6.5; for (let i = 0; i < 16; i++) eshot(b.x, b.y, i / 16 * TAU + b.t, 150, 7, 10); sfx('explosion'); }
        if ((b.a3 -= dt) <= 0) { b.a3 = 9; b.arms = Math.min(4, b.arms + 1); for (let i = 0; i < 5; i++) spawnNear('recruit', b, 70); text(b.x, b.y - b.r - 24, 'ARMS RACE! +1 GUN', COL.M, 16, 1.4); }
      } },
    pact: { r: 36, spd: 96, dmg: 14, key: 'A',
      init(b, i) { b.a1 = 1.2 + i * 0.8; },
      onHurt(b) { if (b.mate && b.mate.hp > 0) b.mate.rage = g.t + 1.2; },
      onDeath(b) { if (b.mate && b.mate.hp > 0) { b.mate.enr = 999; text(b.mate.x, b.mate.y - 60, 'ITS ALLY FELL — IT FIGHTS ON!', COL.A, 16, 2); } },
      update(b, dt, p) {
        const mate = b.mate && b.mate.hp > 0 ? b.mate : null, solo = !mate, sp = b.spd * (solo ? 1.5 : 1) * (b.rage > g.t ? 1.7 : 1);
        let tx = p.x, ty = p.y; if (mate) { const a = g.t * 0.55 + (b.side ? 2.2 : 0); tx = p.x + Math.cos(a) * 165; ty = p.y + Math.sin(a) * 165; }
        moveTo(b, tx, ty, sp, dt);
        if ((b.a1 -= dt * (b.enr > 0 || solo ? 1.6 : 1)) <= 0) { b.a1 = 1.7; const a0 = ang(b, p); eshot(b.x, b.y, a0, 200, 7, 10, COL.A); if (solo) { eshot(b.x, b.y, a0 - 0.26, 200, 7, 10, COL.A); eshot(b.x, b.y, a0 + 0.26, 200, 7, 10, COL.A); } }
        if (mate && b.side === 0 && segDist(p.x, p.y, b.x, b.y, mate.x, mate.y) < p.r + 6) hitPlayer(12);
      } },
    emperor: { r: 48, spd: 58, dmg: 15, key: 'I',
      init(b) { b.a1 = 2.5; b.a2 = 9; b.a3 = 6; b.a4 = 3; b.vac = 0; },
      update(b, dt, p) {
        const rate = b.enr > 0 ? 1.5 : 1; if (b.vac <= 0) moveTo(b, p.x, p.y, b.spd, dt);
        if ((b.a1 -= dt * rate) <= 0) { b.a1 = 3.4; g.zones.push({ kind: 'claim', x: p.x, y: p.y, r: 92, warn: 0.95, life: 6.5, dmg: 10 * (1 + 0.15 * g.act), acc: 0, dead: false }); sfx('whoosh'); }
        if ((b.a4 -= dt * rate) <= 0) { b.a4 = 2.6; const a0 = ang(b, p); for (let i = -2; i <= 2; i++) eshot(b.x, b.y, a0 + i * 0.2, 190, 7, 9, COL.I); }
        if ((b.a3 -= dt) <= 0) { b.a3 = 8.5; for (let i = 0; i < 3; i++) spawnNear('grabber', b, 80); }
        if ((b.a2 -= dt) <= 0) { b.a2 = 12; b.vac = 2.4; b.healLeft = b.maxHp * 0.04; text(b.x, b.y - b.r - 24, 'GRABBING RESOURCES!', COL.I, 16, 1.6); sfx('whoosh'); }
        if (b.vac > 0) { b.vac -= dt; for (const q of g.gems) { if (q.dead) continue; const dx = b.x - q.x, dy = b.y - q.y, d = Math.hypot(dx, dy) || 1; q.pull = false; q.x += dx / d * 430 * dt; q.y += dy / d * 430 * dt; if (d < b.r) { q.dead = true; const h = Math.min(b.healLeft, b.maxHp * 0.0004 * q.v); b.healLeft -= h; b.hp = Math.min(b.maxHp, b.hp + h); } } }
      } },
    general: { r: 44, spd: 88, dmg: 15, key: 'N',
      init(b) { b.st = 'walk'; b.cd = 2.5; b.n = 0; b.a3 = 5; b.tm = 0; },
      update(b, dt, p) {
        const low = b.hp < b.maxHp * 0.5, fast = (low ? 1.3 : 1) * (b.enr > 0 ? 1.2 : 1);
        if (low && !b.said) { b.said = true; text(b.x, b.y - b.r - 26, 'IT REFUSES TO BACK DOWN!', COL.N, 17, 2); sfx('boss_warn', { vol: 0.5 }); }
        if (b.st === 'walk') { moveTo(b, p.x, p.y, b.spd * fast, dt); if ((b.cd -= dt) <= 0) { b.st = 'aim'; b.tm = 0.7; b.n = low ? 4 : 3; } }
        else if (b.st === 'aim') { b.tm -= dt; const a = ang(b, p); b.dx = Math.cos(a); b.dy = Math.sin(a); if (b.tm <= 0) { b.st = 'dash'; b.tm = 0.42; sfx('dash'); } }
        else if (b.st === 'dash') { b.x += b.dx * 520 * fast * dt; b.y += b.dy * 520 * fast * dt; b.tm -= dt; if (b.tm <= 0) { b.n--; if (b.n > 0) { b.st = 'aim'; b.tm = 0.42; } else { b.st = 'walk'; b.cd = 2.8 / fast; for (let i = 0; i < 12; i++) eshot(b.x, b.y, i / 12 * TAU, 170, 7, 10, COL.N); } } }
        if (low && (b.a3 -= dt) <= 0) { b.a3 = 7; for (let i = 0; i < 4; i++) spawnNear('zealot', b, 90); }
      } },
    spark: { r: 40, spd: 150, dmg: 16, key: 'S',
      init(b) { b.a1 = 3; b.sp = 0; b.spA = 0; b.spT = 0; b.a2 = 6; b.a3 = 8; b.fuse = 80; b.fuseMax = 80; b.orb = 1; b.blink = 5; },
      update(b, dt, p) {
        const low = b.hp < b.maxHp * 0.5, a = Math.atan2(b.y - p.y, b.x - p.x) + b.orb * 0.9 * dt * (b.enr > 0 ? 1.5 : 1);
        moveTo(b, p.x + Math.cos(a) * 230, p.y + Math.sin(a) * 230, b.spd * 1.6, dt);
        if ((b.a1 -= dt) <= 0) { b.a1 = 7; b.sp = 3.6; }
        if (b.sp > 0) { b.sp -= dt; if ((b.spT -= dt) <= 0) { b.spT = 0.11; b.spA += 0.33; const arms = low ? 3 : 2; for (let i = 0; i < arms; i++) eshot(b.x, b.y, b.spA + i * TAU / arms, 165, 6, 9, COL.S); } }
        if ((b.a2 -= dt) <= 0) { b.a2 = low ? 7 : 9; text(p.x, p.y - 70, 'CHAIN REACTION! Dodge 1 to 5', COL.S, 17, 1.8); for (let i = 0; i < 5; i++) { const w = 0.9 + i * 0.5; g.zones.push({ kind: 'blast', x: i ? p.x + rnd(-130, 130) : p.x, y: i ? p.y + rnd(-130, 130) : p.y, r: 60 + 10 * i, warn: w, w0: w, n: i + 1, dmg: 14 * (1 + 0.15 * g.act), dead: false }); } }
        if ((b.a3 -= dt) <= 0) { b.a3 = 10; for (let i = 0; i < (low ? 12 : 8); i++) spawnNear('spark', b, 100); }
        if ((b.blink -= dt) <= 0) { b.blink = 6; b.orb *= -1; }
        b.fuse -= dt;
        if (b.fuse <= 0) { b.fuse = b.fuseMax = 60; banner('THE POWDER KEG BLEW!', 'Beat the Spark before the fuse runs out.', COL.S, '!', 2600); g.flash = 0.5; g.flashCol = '#ffb347'; shake(18); sfx('explosion'); const pl = g.player; pl.iframes = 0; hitPlayer(pl.maxHp * 0.45 / g.mult.dmg, true); }
      } },
  };
  function spawnBoss() {
    const a = g.actDef, kind = a.boss, bd = BOSS[kind], base = a.bossHp;
    const hp = Math.max(base * 0.75, Math.min(base * 2.6, g.dpsPeak * 24)) * Math.pow(g.mult.hp, 0.8);
    const mk = (i, n) => {
      const q = edge(30);
      const b = { boss: true, kind, def: bd, name: a.bossName, type: 'boss', x: q[0], y: q[1], r: bd.r, hp: hp / n, maxHp: hp / n, spd: bd.spd * g.mult.spd, dmg: bd.dmg * (1 + 0.1 * g.act), kx: 0, ky: 0, flash: 0, seed: 0, t: 0,
        shield: false, shieldT: 0, stun: 0, enr: 0, gates: n === 1 ? [0.66, 0.33] : [0.5], side: i, mate: null, rage: 0, st: '', dx: 0, dy: 0, dead: false, xp: 0, elite: false };
      bd.init(b, i); g.enemies.push(b); g.bosses.push(b); return b;
    };
    if (kind === 'pact') { const b0 = mk(0, 2), b1 = mk(1, 2); b0.mate = b1; b1.mate = b0; b1.x = b0.x + 130; b1.y = b0.y; } else mk(0, 1);
    for (const e of g.enemies) if (!e.boss && !e.dead && !e.elite) { e.dead = true; e.hp = 0; burst(e.x, e.y, COL[e.def.key], 3); gem(e.x, e.y, e.xp); }
    banner(a.bossName, a.bossLine, a.color, a.key === 'S' ? '⚡' : a.key, 4600); shake(8);
  }
  function updBoss(b, dt) {
    const p = g.player; b.t += dt;
    if (b.enr > 0 && b.enr < 900) b.enr -= dt;
    if (b.shield && b.shieldT > 0 && (b.shieldT -= dt) <= 0) b.shield = false;
    if (b.stun > 0) b.stun -= dt; else b.def.update(b, dt, p);
    const rr = p.r + b.r - 8, dx = p.x - b.x, dy = p.y - b.y; if (dx * dx + dy * dy < rr * rr) hitPlayer(b.dmg * (b.st === 'dash' ? 1.25 : 1));
  }
  function bossDown(b) {
    burst(b.x, b.y, COL[b.def.key], 40); burst(b.x, b.y, '#ffffff', 22); ring(b.x, b.y, b.r, b.r * 6, COL[b.def.key], 10, 0.7); shake(16); sfx('boss_die');
    if (b.def.onDeath) b.def.onDeath(b);
    for (let i = 0; i < 14; i++) gem(b.x + rnd(-60, 60), b.y + rnd(-60, 60), 5 + g.act * 4);
    for (let i = 0; i < 6; i++) drop('coin', b.x + rnd(-50, 50), b.y + rnd(-50, 50), 3);
    if (!g.bosses.every((x) => x.hp <= 0)) return;
    g.bosses = []; g.bossKills++; g.coins += 25 + 15 * g.act; g.timeScale = 0.3; g.slowT = 0.9;
    const final = g.act >= ACTS.length - 1;
    for (const e of g.enemies) if (!e.boss && !e.dead) { e.dead = true; e.hp = 0; g.kills++; burst(e.x, e.y, COL[e.def.key], 4); gem(e.x, e.y, e.xp); }
    g.ebullets.length = 0; g.zones = g.zones.filter((z) => z.kind === 'fire');
    for (const q of g.gems) q.pull = true;
    if (!final) { drop('chest', b.x, b.y); drop('heart', b.x + 40, b.y); }
    g.bossState = 'clear'; g.bossT = final ? 2.2 : 4;
    banner(final ? 'POWDER KEG DEFUSED!' : 'ACT ' + g.actDef.n + ' CLEAR!', final ? 'You beat all four M.A.I.N. causes and the Spark.' : g.actDef.name + ' defeated. Grab the chest!', final ? COL.brass : g.actDef.color, final ? '★' : '✓', 3600);
    g.flash = 0.4; g.flashCol = '#ffffff';
  }
  function nextAct() {
    if (g.act >= ACTS.length - 1) { finish(true); return; }
    g.act++; g.maxAct = g.act + 1; g.actDef = ACTS[g.act]; g.actT = 0; g.bossState = 'none'; g.eliteT = 30; g.spawnAcc = 0; g.dpsPeak = g.dps;
    music(g.actDef.music); hudAct();
    banner('ACT ' + g.actDef.n + ' · ' + g.actDef.name, g.actDef.def, g.actDef.color, g.actDef.key === 'S' ? '⚡' : g.actDef.key, 5600);
  }
  function director(dt) {
    const a = g.actDef;
    if (g.bossState === 'none' && g.actT >= a.len - 4) { g.bossState = 'warn'; g.bossT = 4; banner('WARNING', a.bossName + ' is coming!', a.color, '!', 3400); sfx('boss_warn'); music(g.act === ACTS.length - 1 ? 'finalboss' : 'boss'); }
    else if (g.bossState === 'warn') { if ((g.bossT -= dt) <= 0) { spawnBoss(); g.bossState = 'fight'; } }
    else if (g.bossState === 'clear') { if ((g.bossT -= dt) <= 0) nextAct(); return; }
    let w = a.waves[0]; for (const x of a.waves) if (g.actT >= x[0]) w = x;
    const rate = w[1] * (a.rate || 1) * g.mult.spawn * (g.bossState === 'fight' ? 0.3 : g.bossState === 'warn' ? 0.5 : 1);
    if (g.enemies.length < g.cap) g.spawnAcc += rate * dt; else g.spawnAcc = 0;
    while (g.spawnAcc >= 1) { g.spawnAcc -= 1; spawnPick(w[2]); }
    if (g.bossState === 'none' && (g.eliteT -= dt) <= 0) { g.eliteT = 55; spawnElite(); }
  }

  /* ================= per-frame ================= */
  function updPlayer(dt) {
    const p = g.player; let mx = 0, my = 0;
    if (keys.l) mx -= 1; if (keys.r) mx += 1; if (keys.u) my -= 1; if (keys.d) my += 1;
    if (DBG.bot) {
      let fx = 0, fy = 0;
      for (const e of g.enemies) { const dx = p.x - e.x, dy = p.y - e.y, R0 = e.boss ? 260 : 150, d2 = dx * dx + dy * dy; if (d2 < R0 * R0) { const d = Math.sqrt(d2) || 1, w = (R0 - d) / R0 * (e.boss ? 4 : 1.6); fx += dx / d * w; fy += dy / d * w; } }
      for (const b of g.ebullets) { const dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy; if (d2 < 8100) { const d = Math.sqrt(d2) || 1, w = (90 - d) / 90 * 2.5; fx += dx / d * w; fy += dy / d * w; } }
      for (const z of g.zones) { if (z.kind === 'fire') continue; const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) || 1; if (d < z.r + 40) { fx += dx / d * 3; fy += dy / d * 3; } }
      let best = null, bd = 1e12; for (const q of g.pickups) { if (q.kind === 'coin') continue; const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2; if (d2 < bd) { bd = d2; best = q; } }
      if (!best) for (const q of g.gems) { const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2; if (d2 < bd) { bd = d2; best = q; } }
      if (best) { const d = Math.sqrt(bd) || 1; fx += (best.x - p.x) / d * 1.1; fy += (best.y - p.y) / d * 1.1; }
      const fm = Math.hypot(fx, fy); if (fm > 0.05) { mx = fx / fm; my = fy / fm; }
    }
    if (g.joy.on) { const dx = g.joy.x - g.joy.ox, dy = g.joy.y - g.joy.oy, d = Math.hypot(dx, dy); if (d > 7) { const m = Math.min(1, d / 46); mx = dx / d * m; my = dy / d * m; } }
    const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
    const sp = 185 * p.spdMult; p.vx = mx * sp; p.vy = my * sp; p.x += p.vx * dt; p.y += p.vy * dt; p.moving = m > 0.1; if (p.moving) p.face = Math.atan2(my, mx);
    if (p.iframes > 0) p.iframes -= dt;
    if (p.regen > 0 && p.hp < p.maxHp && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  }
  function updFx(dt) {
    for (const q of g.parts) { q.life -= dt; if (q.life <= 0) { q.dead = true; continue; } q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.93; q.vy *= 0.93; }
    for (const q of g.texts) { q.life -= dt; q.y -= 36 * dt; if (q.life <= 0) q.dead = true; }
    for (const q of g.rings) { q.life -= dt; if (q.life <= 0) q.dead = true; }
    for (const q of g.arcs) { q.life -= dt; if (q.life <= 0) q.dead = true; }
    if (g.flash > 0) g.flash -= dt * 1.4;
    if (g.killStreakT > 0 && (g.killStreakT -= dt) <= 0) { g.killStreak = 0; g.nextStreak = 25; }
    const c = g.cam, p = g.player; c.x += (p.x - c.x) * Math.min(1, dt * 9); c.y += (p.y - c.y) * Math.min(1, dt * 9);
    if (c.shake > 0.2) { c.sx = rnd(-1, 1) * c.shake; c.sy = rnd(-1, 1) * c.shake; c.shake *= Math.pow(0.004, dt); } else { c.sx = c.sy = 0; c.shake = 0; }
    g.dpsT += dt; if (g.dpsT >= 1) { g.dps = g.dps * 0.8 + (g.dmgAcc / g.dpsT) * 0.2; g.dmgAcc = 0; g.dpsT = 0; if (g.dps > g.dpsPeak) g.dpsPeak = g.dps; }
  }
  function compact(a) { let j = 0; for (let i = 0; i < a.length; i++) { const o = a[i]; if (!o.dead) a[j++] = o; } a.length = j; }
  function update(dt) {
    g.t += dt; g.actT += dt;
    updPlayer(dt); buildGrid(); if (g.state === 'play') director(dt); updWeapons(dt); updEnemies(dt); updBullets(dt); updZones(dt); updPickups(dt); updFx(dt);
    compact(g.enemies); compact(g.bullets); compact(g.ebullets); compact(g.gems); compact(g.pickups); compact(g.parts); compact(g.texts); compact(g.zones); compact(g.arcs); compact(g.rings);
  }
  function idle(dt) {
    g.idleT += dt; g.cam.x += 16 * dt; g.cam.y += 5 * dt;
    const hw = g.vw / 2 + 70, hh = g.vh / 2 + 70;
    for (const d of g.deco) { d.x += d.vx * dt; d.y += d.vy * dt; if (d.x < g.cam.x - hw) d.x += hw * 2; else if (d.x > g.cam.x + hw) d.x -= hw * 2; if (d.y < g.cam.y - hh) d.y += hh * 2; else if (d.y > g.cam.y + hh) d.y -= hh * 2; }
  }
  function seedDeco() {
    g.deco = []; const types = Object.keys(ED);
    for (let i = 0; i < 22; i++) { const a = Math.random() * TAU, s = rnd(8, 26); g.deco.push({ type: types[i % types.length], x: g.cam.x + rnd(-g.vw / 2, g.vw / 2), y: g.cam.y + rnd(-g.vh / 2, g.vh / 2), vx: Math.cos(a) * s, vy: Math.sin(a) * s, seed: Math.random() * 10 }); }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now; if (!(dt > 0)) return; if (dt > 0.05) dt = 0.05;
    if (g.state === 'idle') idle(dt);
    else if (!g.busy && !g.paused) {
      if (g.slowT > 0 && (g.slowT -= dt) <= 0 && g.state === 'play') g.timeScale = 1;
      for (let i = 0, n = DBG.speed | 0 || 1; i < n; i++) { update(dt * g.timeScale); if (g.state === 'play') flows(); if (g.busy || g.paused || g.state !== 'play') break; }
    }
    R.draw(g); hudSync();
  }
  function flows() {
    if (g.busy) return; const p = g.player;
    if (g.pendDown) { g.pendDown = false; downFlow(); }
    else if (g.pendBoss) { const b = g.pendBoss; g.pendBoss = null; bossFlow(b); }
    else if (g.pendChest > 0) { g.pendChest--; chestFlow(); }
    else if (p.pendingLv > 0) levelFlow();
  }
  function begin() { g.busy = true; keys = {}; g.joy.on = false; duck(true); }
  function end() { g.busy = false; duck(false); last = performance.now(); const p = g.player; if (p && p.iframes < 0.8) p.iframes = 0.8; }

  /* ================= modals + flows ================= */
  function modal(cls) { const veil = U.el('div', { class: 'veil ' + (cls || '') }), box = U.el('div', { class: 'modal panel pop-in' }); veil.appendChild(box); modalRoot.appendChild(veil); return { veil, box, close() { veil.remove(); } }; }
  function closeMine() { U.$$('.pk-pick,.pk-pause,.pk-confirm', modalRoot).forEach((n) => n.remove()); pauseM = null; }
  function ask(o) {
    if (DBG.auto) return Promise.resolve({ correct: DBG.auto === 'right' ? true : DBG.auto === 'wrong' ? false : Math.random() < 0.7 });
    if (window.Quiz && Quiz.ask) return Quiz.ask(o).catch(() => ({ correct: true }));
    return Promise.resolve({ correct: true });
  }
  function answered(ok) { const p = g.player; if (ok) { g.correct++; g.streak++; if (g.streak > g.bestStreak) g.bestStreak = g.streak; g.coins += Math.min(5, 1 + g.streak); heal(p.maxHp * 0.06, true); } else { g.wrong++; g.streak = 0; } }
  function roll(n) {
    const p = g.player, pool = [], wN = p.weapons.length, pN = Object.keys(p.passives).length;
    for (const id in WD) { const w = p.weapons.find((x) => x.id === id); if (w) { if (w.lvl < WD[id].max) pool.push({ kind: 'w', id, lvl: w.lvl + 1, wt: 1.7 }); } else if (wN < MAXW) pool.push({ kind: 'w', id, lvl: 1, wt: wN < 3 ? 2.4 : 1 }); }
    for (const id in PD) { const l = p.passives[id] || 0; if (l > 0) { if (l < PD[id].max) pool.push({ kind: 'p', id, lvl: l + 1, wt: 1.3 }); } else if (pN < MAXP) pool.push({ kind: 'p', id, lvl: 1, wt: 0.9 }); }
    const out = [];
    while (out.length < n && pool.length) { let tot = 0; for (const o of pool) tot += o.wt; let r = Math.random() * tot, k = 0; for (; k < pool.length - 1; k++) { r -= pool[k].wt; if (r <= 0) break; } out.push(pool.splice(k, 1)[0]); }
    if (out.length < n) { const extra = U.shuffle([{ kind: 'o', id: 'dmg' }, { kind: 'o', id: 'hp' }, { kind: 'o', id: 'cd' }, { kind: 'coins' }]); while (out.length < n && extra.length) out.push(extra.pop()); }
    return out;
  }
  const OVER = {
    dmg: { name: 'Total War', icon: '🔥', key: 'M', desc: '+6% damage for the rest of the run.', hook: 'Because of alliances, a local conflict became a world war.' },
    hp: { name: 'Home Front', icon: '🏠', key: 'N', desc: '+10 max HP and heal 30.', hook: 'The USA stayed neutral in 1914 — that policy is isolationism.' },
    cd: { name: 'Rapid Fire', icon: '🎯', key: 'A', desc: 'Every weapon fires 3% faster.', hook: 'Germany declared war on Russia and France; then Great Britain declared war on Germany.' },
  };
  function apply(o) {
    const p = g.player;
    if (o.kind === 'w') { const w = p.weapons.find((x) => x.id === o.id); if (w) w.lvl++; else p.weapons.push({ id: o.id, lvl: 1, t: 0.3, acc: 0 }); }
    else if (o.kind === 'p') { p.passives[o.id] = (p.passives[o.id] || 0) + 1; recalc(p); if (o.id === 'heart') heal(20, true); }
    else if (o.kind === 'o') { p.ov[o.id]++; recalc(p); if (o.id === 'hp') heal(30, true); }
    else if (o.kind === 'heal') heal(p.maxHp * 0.4);
    else if (o.kind === 'coins') g.coins += 25;
    recalc(p); hudWeps();
  }
  function card(o, i, choose) {
    const d = o.kind === 'w' ? WD[o.id] : o.kind === 'p' ? PD[o.id] : null; let name, icon, lv, desc, hook = '', key = 'x';
    if (o.kind === 'w') { name = d.name; icon = d.icon; lv = o.lvl === 1 ? 'NEW WEAPON' : 'LEVEL ' + (o.lvl - 1) + ' → ' + o.lvl; desc = d.lv[o.lvl - 1]; hook = d.hook; key = d.key; }
    else if (o.kind === 'p') { name = d.name; icon = d.icon; lv = o.lvl === 1 ? 'NEW BOOST' : 'LEVEL ' + (o.lvl - 1) + ' → ' + o.lvl; desc = d.per; hook = d.hook; key = d.key; }
    else if (o.kind === 'o') { const od = OVER[o.id]; name = od.name; icon = od.icon; lv = 'MASTERY · STACKS FOREVER'; desc = od.desc; hook = od.hook; key = od.key; }
    else if (o.kind === 'heal') { name = 'Field Medic'; icon = '❤️'; lv = 'MAXED OUT'; desc = 'Heal 40% of your health.'; }
    else { name = 'War Chest'; icon = '💰'; lv = 'BONUS'; desc = '+25 coins.'; }
    return U.el('button', { class: 'pk-card k-' + key.toLowerCase() + (o.lvl === 1 ? ' new' : ''), onclick: () => choose(i) },
      U.el('span', { class: 'pk-ic', text: icon }),
      U.el('span', { class: 'pk-body' }, U.el('span', { class: 'pk-lv', text: lv }), U.el('span', { class: 'pk-nm', text: name }), U.el('span', { class: 'pk-ds', text: desc }), hook ? U.el('span', { class: 'pk-hk', text: hook }) : null),
      U.el('span', { class: 'pk-key', text: String(i + 1) }));
  }
  function pick(n, head, sub) {
    return new Promise((resolve) => {
      const p = g.player; let opts = roll(n), born = performance.now(); const m = modal('pk-pick');
      const choose = (i) => { const o = opts[i]; if (!o || performance.now() - born < 280) return; window.removeEventListener('keydown', onk); sfx('select'); apply(o); m.close(); resolve(o); };
      const onk = (e) => { const i = '1234'.indexOf(e.key); if (i >= 0 && i < opts.length) { e.preventDefault(); choose(i); } };
      const render = () => {
        born = performance.now(); m.box.innerHTML = '';
        m.box.append(U.el('div', { class: 'eyebrow', text: sub || '' }), U.el('h2', { class: 'display pk-h', text: head }));
        const wrap = U.el('div', { class: 'pk-cards n' + opts.length }); opts.forEach((o, i) => wrap.appendChild(card(o, i, choose))); m.box.appendChild(wrap);
        if (p.rerolls > 0 && n > 1) m.box.appendChild(U.el('div', { class: 'row pk-foot' }, U.el('button', { class: 'btn small', text: 'Reroll choices (' + p.rerolls + ' left)', onclick: () => { p.rerolls--; opts = roll(n); sfx('card'); render(); } })));
      };
      if (DBG.auto) { m.close(); apply(opts[0]); resolve(opts[0]); return; }
      window.addEventListener('keydown', onk); render(); sfx('card');
    });
  }
  function confirmBox(title, body, yes, no) {
    return new Promise((resolve) => {
      const m = modal('pk-confirm'); const done = (v) => { sfx('click'); m.close(); resolve(v); };
      m.box.append(U.el('h2', { class: 'display pk-h', text: title }), U.el('p', { class: 'pk-p', text: body }), U.el('div', { class: 'col' }, U.el('button', { class: 'btn primary big', text: yes, onclick: () => done(true) }), no ? U.el('button', { class: 'btn ghost', text: no, onclick: () => done(false) }) : null));
    });
  }
  async function levelFlow() {
    const p = g.player; begin(); let first = true, ok = true;
    while (p.pendingLv > 0 && g.state === 'play') {
      p.pendingLv--; p.level++;
      if (first) { first = false; sfx('levelup'); const res = await ask({ context: 'levelup', key: Math.random() < 0.5 ? g.actDef.key : undefined }); ok = !!(res && res.correct); answered(ok); }
      if (g.state !== 'play') break;
      await pick(ok ? (g.streak >= 3 ? 4 : 3) : 1, ok ? 'CHOOSE YOUR UPGRADE' : 'RANDOM UPGRADE', ok ? (g.streak >= 3 ? 'Answer streak x' + g.streak + ': bonus 4th choice!' : 'Level ' + p.level + ' reached') : 'Missed it. Get the next question right to choose.');
    }
    ring(p.x, p.y, 10, 170, COL.brass, 6, 0.5); end();
  }
  async function bossFlow(b) {
    begin(); sfx('shield_up'); await sleep(260);
    const res = await ask({ context: 'boss', key: b.def.key, timeLimit: 25, header: 'BREAK THE SHIELD', sub: b.name + ' raised a shield. Answer right to shatter it.' });
    const ok = !!(res && res.correct); answered(ok);
    if (b.hp > 0) {
      if (ok) { b.shield = false; b.stun = 2.4; b.hp = Math.max(1, b.hp - b.maxHp * 0.06); ring(b.x, b.y, b.r, b.r * 4, '#9fe8ff', 8, 0.6); burst(b.x, b.y, '#9fe8ff', 26); sfx('shield_break'); text(b.x, b.y - b.r - 28, 'SHIELD SHATTERED!', '#9fe8ff', 18, 1.6); shake(10); }
      else { b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.05); b.enr = 7; b.shieldT = 4.5; text(b.x, b.y - b.r - 28, 'WRONG! IT POWERS UP', '#ff8a80', 17, 1.8); }
    }
    end();
  }
  async function chestFlow() {
    begin(); sfx('chest'); let res = { score: 1, perfect: true };
    if (!DBG.auto && window.Quiz && Quiz.bonusRound) { try { res = (await Quiz.bonusRound()) || res; } catch (e) {} }
    const perfect = !!res.perfect, good = res.score >= 0.5, picks = perfect ? 2 : good ? 1 : 0, coins = perfect ? 20 : good ? 10 : 5;
    g.coins += coins; if (perfect) { g.bonusPerfect++; heal(g.player.maxHp * 0.3, true); }
    for (let i = 0; i < picks && g.state === 'play'; i++) await pick(3, perfect ? 'JACKPOT PICK ' + (i + 1) + ' OF 2' : 'BONUS PICK', perfect ? 'Perfect round! +' + coins + ' coins and 2 free upgrades' : 'Nice work. +' + coins + ' coins and a free upgrade');
    if (!picks && window.Toast) Toast.show('Chest: +' + coins + ' coins. Ace the next bonus round for free upgrades!');
    end();
  }
  async function downFlow() {
    const p = g.player; begin();
    if (p.revives > 0 && !DBG.auto && window.Quiz && Quiz.reviveGauntlet) {
      p.revives--;
      const go = await confirmBox('YOU ARE DOWN!', 'Last Stand: answer 3 questions in a row and you get back up with half your health.', 'Take the Last Stand', 'End the run');
      let ok = false; if (go) { try { ok = await Quiz.reviveGauntlet(3); } catch (e) {} }
      if (ok) {
        p.hp = Math.round(p.maxHp * 0.5); g.revived = true; g.correct += 3; g.streak += 3; if (g.streak > g.bestStreak) g.bestStreak = g.streak;
        blast(p.x, p.y, 280, 500); g.ebullets.length = 0; sfx('revive'); banner('BACK IN THE FIGHT', 'Knowing your facts just saved you.', COL.good, '+', 2400); end(); p.iframes = 3; return;
      }
    }
    end(); finish(false);
  }
  function summary(won) {
    const p = g.player, dm = 1 + 0.25 * g.danger;
    return { won, endless: false, act: g.maxAct, time: Math.floor(g.t), kills: g.kills, level: p.level, coins: Math.round((g.coins + (won ? 150 : 0)) * p.coinMult * dm), correct: g.correct, wrong: g.wrong, bestStreak: g.bestStreak,
      bossKills: g.bossKills, bonusPerfect: g.bonusPerfect, revived: g.revived, charId: p.char.id, danger: g.danger, damageTaken: g.damageTaken, weapons: p.weapons.map((w) => w.id),
      score: Math.round((g.kills * 10 + g.correct * 150 + g.bossKills * 1000 + Math.floor(g.t) * 5 + (won ? 5000 : 0)) * dm) };
  }
  function finish(won) {
    if (g.state !== 'play') return; g.state = 'over'; g.timeScale = 0.25; g.slowT = 0; closeMine(); g.paused = false;
    const p = g.player, s = summary(won); music(won ? 'victory' : 'gameover'); sfx(won ? 'victory' : 'gameover');
    if (!won) { burst(p.x, p.y, '#ffffff', 30); ring(p.x, p.y, 10, 200, '#ff8a80', 8, 0.6); shake(14); }
    const run = g;
    setTimeout(() => { if (g !== run) return; toIdle(); if (window.Meta && Meta.onRunEnd) Meta.onRunEnd(s); else fallbackEnd(s); }, won ? 2600 : 1500);
  }
  function toIdle() { const cam = g.cam; g.state = 'idle'; g.busy = false; g.paused = false; g.enemies = []; g.bosses = []; g.bullets = []; g.ebullets = []; g.zones = []; g.gems = []; g.pickups = []; g.parts = []; g.texts = []; g.arcs = []; g.rings = []; cam.sx = cam.sy = 0; hudShow(false); seedDeco(); }
  function fallbackEnd(s) { confirmBox(s.won ? 'POWDER KEG DEFUSED!' : 'RUN OVER', 'Act ' + s.act + ' · ' + s.kills + ' defeated · ' + s.correct + ' right answers', 'Play again').then(() => start(g.opts)); }

  function pause() {
    if (g.paused || g.busy || g.state !== 'play') return; g.paused = true; duck(true); keys = {}; g.joy.on = false; sfx('click');
    const p = g.player, m = (pauseM = modal('pk-pause')), st = opt();
    const build = p.weapons.map((w) => U.el('span', {}, WD[w.id].icon + ' ' + WD[w.id].name + ' ', U.el('b', { text: 'Lv ' + w.lvl })))
      .concat(Object.keys(p.passives).map((id) => U.el('span', {}, PD[id].icon + ' ' + PD[id].name + ' ', U.el('b', { text: 'Lv ' + p.passives[id] }))));
    const snd = U.el('button', { class: 'btn grow', text: st.muted ? 'Sound: off' : 'Sound: on', onclick: () => { const v = !opt().muted; if (window.AudioSys && AudioSys.setMuted) AudioSys.setMuted(v); else { opt().muted = v; Save.commit(); } snd.textContent = v ? 'Sound: off' : 'Sound: on'; } });
    m.box.append(U.el('div', { class: 'eyebrow', text: 'Act ' + g.actDef.n + ' · ' + g.actDef.name + ' · ' + U.fmtTime(g.t) }), U.el('h2', { class: 'display pk-h', text: 'PAUSED' }),
      U.el('div', { class: 'pk-tip' }, U.el('span', { class: 'eyebrow', text: 'Remember this' }), U.el('p', { text: U.pick(PK.TIPS) })),
      U.el('div', { class: 'pk-build' }, build),
      U.el('div', { class: 'col' }, U.el('button', { class: 'btn primary big', text: 'Resume', onclick: resume }),
        U.el('div', { class: 'row' }, snd, U.el('button', { class: 'btn grow', text: 'Restart', onclick: () => { closeMine(); start(g.opts); } }), U.el('button', { class: 'btn danger grow', text: 'End run', onclick: () => { closeMine(); g.paused = false; duck(false); finish(false); } }))));
  }
  function resume() { if (!g.paused) return; closeMine(); g.paused = false; duck(false); last = performance.now(); }

  /* ================= HUD ================= */
  function buildHud() {
    const root = (H.root = document.getElementById('hud')); root.innerHTML = '';
    H.xp = U.el('i'); H.lv = U.el('span', { class: 'hud-lv num' }); H.hp = U.el('i'); H.hpT = U.el('span', { class: 'num' });
    H.time = U.el('span', { class: 'hud-time num' }); H.coins = U.el('span', { class: 'num' }); H.kills = U.el('span', { class: 'num' });
    H.main = U.el('div', { class: 'hud-main' }, ACTS.map((a) => U.el('span', { class: 'k-' + a.key.toLowerCase(), text: a.key === 'S' ? '⚡' : a.key })));
    H.act = U.el('div', { class: 'hud-act' });
    H.pause = U.el('button', { class: 'hud-pause', 'aria-label': 'Pause', onclick: () => pause() }, U.el('i'), U.el('i'));
    H.bossN = U.el('div', { class: 'hud-boss-n display' }); H.bossB = U.el('i'); H.fuseB = U.el('i');
    H.fuse = U.el('div', { class: 'hud-fuse', hidden: true }, U.el('span', { text: 'FUSE' }), U.el('div', {}, H.fuseB));
    H.boss = U.el('div', { class: 'hud-boss', hidden: true }, H.bossN, U.el('div', { class: 'hud-boss-bar' }, H.bossB), H.fuse);
    H.banner = U.el('div', { class: 'hud-banner', hidden: true }); H.weps = U.el('div', { class: 'hud-weps' }); H.streak = U.el('div', { class: 'hud-streak', hidden: true });
    root.append(
      U.el('div', { class: 'hud-top' },
        U.el('div', { class: 'hud-xp' }, H.xp, H.lv),
        U.el('div', { class: 'hud-row' },
          U.el('div', { class: 'hud-left' }, U.el('div', { class: 'hud-hp' }, H.hp, H.hpT), U.el('div', { class: 'hud-actrow' }, H.main, H.act)),
          U.el('div', { class: 'hud-right' }, U.el('div', { class: 'hud-stats' }, H.time, U.el('span', { class: 'hud-coin' }, U.el('span', { class: 'coin' }), H.coins), U.el('span', { class: 'hud-kill' }, H.kills)), H.pause)),
        H.boss),
      H.banner,
      U.el('div', { class: 'hud-bottom' }, H.weps, H.streak));
  }
  function hudShow(on) { H.root.hidden = !on; if (!on) H.banner.hidden = true; }
  function hudAct() { U.$$('span', H.main).forEach((s, i) => { s.className = 'k-' + ACTS[i].key.toLowerCase() + (i < g.act ? ' done' : i === g.act ? ' now' : ''); }); H.act.textContent = 'ACT ' + g.actDef.n + ' · ' + g.actDef.name; H.act.style.color = g.actDef.color; }
  function hudWeps() {
    const p = g.player; H.weps.innerHTML = '';
    p.weapons.forEach((w) => H.weps.appendChild(U.el('span', { class: 'hw' }, WD[w.id].icon, U.el('b', { text: String(w.lvl) }))));
    Object.keys(p.passives).forEach((id) => H.weps.appendChild(U.el('span', { class: 'hw pas' }, PD[id].icon, U.el('b', { text: String(p.passives[id]) }))));
  }
  function set(el, key, val, fn) { if (HV[key] !== val) { HV[key] = val; fn(el, val); } }
  function hudSync() {
    if (g.state === 'idle' || !g.player) return; const p = g.player;
    set(H.xp, 'xp', Math.round(p.xp / p.xpNext * 200), (e, v) => { e.style.width = v / 2 + '%'; });
    set(H.lv, 'lv', p.level, (e, v) => { e.textContent = 'LEVEL ' + v; });
    set(H.hp, 'hp', Math.round(p.hp / p.maxHp * 100), (e, v) => { e.style.width = v + '%'; e.className = v < 30 ? 'low' : ''; });
    set(H.hpT, 'hpt', Math.ceil(p.hp) + ' / ' + p.maxHp, (e, v) => { e.textContent = v; });
    set(H.time, 'time', Math.floor(g.t), (e, v) => { e.textContent = U.fmtTime(v); });
    set(H.coins, 'coins', g.coins, (e, v) => { e.textContent = v; });
    set(H.kills, 'kills', g.kills, (e, v) => { e.textContent = v + ' KO'; });
    set(H.streak, 'streak', g.streak, (e, v) => { e.hidden = v < 2; e.textContent = 'ANSWER STREAK x' + v; });
    const bs = g.bosses, on = bs.length > 0;
    set(H.boss, 'bossOn', on, (e, v) => { e.hidden = !v; if (v) { H.bossN.textContent = g.actDef.bossName; H.boss.style.setProperty('--bc', g.actDef.color); } });
    if (on) {
      let hp = 0, mx = 0, sh = false; for (const b of bs) { hp += Math.max(0, b.hp); mx += b.maxHp; if (b.shield) sh = true; }
      set(H.bossB, 'bossHp', Math.round(hp / mx * 300), (e, v) => { e.style.width = v / 3 + '%'; });
      set(H.bossB, 'bossSh', sh, (e, v) => { e.className = v ? 'sh' : ''; });
      const f = bs[0].fuse; set(H.fuse, 'fuseOn', f !== undefined, (e, v) => { e.hidden = !v; });
      if (f !== undefined) set(H.fuseB, 'fuse', Math.round(f / bs[0].fuseMax * 200), (e, v) => { e.style.width = v / 2 + '%'; });
    }
  }

  /* ================= input ================= */
  const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
  function onKeyDown(e) {
    const k = KEYMAP[e.code];
    if (k) { keys[k] = true; if (g.state === 'play' && !g.busy && !g.paused) e.preventDefault(); }
    else if ((e.code === 'Escape' || e.code === 'KeyP') && g.state === 'play') { if (g.paused) resume(); else if (!g.busy) pause(); }
  }
  function onKeyUp(e) { const k = KEYMAP[e.code]; if (k) keys[k] = false; }
  function pt(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function pDown(e) { if (g.state !== 'play' || g.busy || g.paused || g.joy.on) return; const q = pt(e); g.joy.on = true; g.joy.id = e.pointerId; g.joy.ox = g.joy.x = q[0]; g.joy.oy = g.joy.y = q[1]; try { cv.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); }
  function pMove(e) { if (!g.joy.on || e.pointerId !== g.joy.id) return; const q = pt(e); g.joy.x = q[0]; g.joy.y = q[1]; const dx = q[0] - g.joy.ox, dy = q[1] - g.joy.oy, d = Math.hypot(dx, dy); if (d > 70) { g.joy.ox += dx / d * (d - 70); g.joy.oy += dy / d * (d - 70); } }
  function pUp(e) { if (e.pointerId === g.joy.id) g.joy.on = false; }

  /* ================= public ================= */
  function start(o) {
    o = o || {}; const keep = { W: g.W, H: g.H, dpr: g.dpr, scale: g.scale, vw: g.vw, vh: g.vh }; closeMine();
    g = blank(); Object.assign(g, keep); g.opts = o; g.danger = Math.max(0, o.danger | 0); const d = g.danger;
    g.mult = { hp: 1 + 0.4 * d, dmg: 1 + 0.15 * d, spd: 1 + 0.03 * d, spawn: 1 + 0.1 * d };
    const bon = Object.assign({ maxHp: 0, dmgMult: 1, speedMult: 1, magnetMult: 1, xpMult: 1, coinMult: 1, armor: 0, regen: 0, cooldownMult: 1, crit: 0, revives: 0, rerolls: 0 }, window.Meta && Meta.bonuses ? Meta.bonuses() : {});
    const ch = Object.assign({ id: 'cadet', name: 'Time Cadet', color: '#e9b949', hat: 'cap', startWeapon: 'blaster' }, (window.Meta && Meta.character ? Meta.character() : null) || {});
    g.player = newPlayer(ch, bon); g.state = 'play'; g.act = Math.max(0, Math.min(ACTS.length - 1, o.act | 0)); g.actDef = ACTS[g.act]; g.maxAct = g.act + 1; g.cap = U.isTouch() ? 170 : 220;
    for (const k in HV) delete HV[k]; hudShow(true); hudAct(); hudWeps(); music(g.actDef.music);
    banner('ACT ' + g.actDef.n + ' · ' + g.actDef.name, g.actDef.def, g.actDef.color, g.actDef.key === 'S' ? '⚡' : g.actDef.key, 5600);
    R.resize(g);
    text(0, 64, !U.isTouch() ? 'Move with WASD or the arrow keys' : window.innerWidth > 900 ? 'Drag to move, or use WASD / arrow keys' : 'Drag anywhere to move', '#ffffff', 15, 4.5);
    last = performance.now();
    try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
  }
  function init() {
    cv = document.getElementById('game-canvas'); modalRoot = document.getElementById('modals');
    R.init(cv); g = blank(); R.resize(g); buildHud(); hudShow(false); seedDeco();
    window.addEventListener('resize', () => R.resize(g));
    try { new ResizeObserver(() => { if (cv.clientWidth !== g.W || cv.clientHeight !== g.H) R.resize(g); }).observe(cv); } catch (e) {}
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', () => { keys = {}; g.joy.on = false; });
    cv.addEventListener('pointerdown', pDown); cv.addEventListener('pointermove', pMove); cv.addEventListener('pointerup', pUp); cv.addEventListener('pointercancel', pUp);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else last = performance.now(); });
    last = performance.now(); requestAnimationFrame(frame);
  }
  window.Game = {
    init, start, pause, resume,
    isRunning: () => !!g && g.state === 'play',
    debug: { state: () => g, opts: DBG, give(id) { apply({ kind: WD[id] ? 'w' : 'p', id, lvl: 1 }); }, skip() { g.actT = g.actDef.len - 4.5; }, xp(n) { addXp(n); }, hurt(n) { hitPlayer(n, true); } },
  };
})();
