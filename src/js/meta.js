/* meta.js — everything between runs: title screen, agents, shop, awards, stats, settings, results.
   Exposes window.Meta. Talks to Game / Quiz / AudioSys / PK only through guarded calls, so it also runs on its own. */
(function () {
  'use strict';
  const U = window.U, Save = window.Save;

  let M = null;            // Save.ns('meta')
  let current = null;      // name of the Meta screen on show, or null while the game owns the screen
  let backFn = null;       // where Back / Esc goes from a sub-screen
  let helpVeil = null;     // open How-to-Play modal, if any
  let readyBefore = null;  // Quiz Readiness when the current run started
  let resultsAt = 0;       // when the results screen opened (ignore key mashing right after a run)
  let keysOn = false;
  let avatarSeq = 0;
  let shownReady = null;   // readiness % the title last showed (the bar grows from here)
  let lastHeroSize = 0;
  let studyOpen = false;   // a Quick Review or a "missed" sheet that we opened is still on screen
  let keysLast = false;    // the last input came from the keyboard (then focus follows the player from page to page)
  let navFrom = null;      // {from, key}: the control just pressed, if it leads to another page
  const openedBy = {};     // page name -> {from, key}: where focus goes back to when that page closes
  let helpFrom = null;     // what had focus when How to Play opened
  let studyAt = 0;

  /* ------------------------------------------------------------------ data */
  const WEAPONS = {
    blaster: 'Fact Blaster', cannon: 'Dreadnought Cannon', orbs: 'Alliance Orbs', chain: 'Chain Reaction',
    boomerang: 'Scramble Boomerang', trail: 'Powder Trail', aura: 'Neutral Zone', press: 'Extra! Extra!',
  };
  const WEAPON_HOW = {
    blaster: 'fires bolts at the nearest monster', cannon: 'lobs heavy shells that explode',
    orbs: 'allied orbs circle you and smash monsters', chain: 'lightning that jumps from monster to monster',
    boomerang: 'flies out and comes back, hitting twice', trail: 'leaves a burning fuse behind you',
    aura: 'a keep-out field around you', press: 'newspapers fly out in every direction',
  };
  const CHARS = [
    { id: 'cadet', name: 'Time Cadet', title: 'All-rounder', key: '', keyName: '', color: '#f2bb3d', hat: 'cap', startWeapon: 'blaster', mods: {},
      desc: 'Fresh out of time-travel school. No weak spots.', unlock: { type: 'free' } },
    { id: 'admiral', name: 'The Admiral', title: 'Built like a battleship', key: 'm', keyName: 'Militarism', color: '#a3b85e', hat: 'helmet', startWeapon: 'cannon', mods: { maxHp: 25, speedMult: 0.93 },
      desc: 'Loves a naval race. Tough and heavy, a little slow.', unlock: { type: 'coins', cost: 300 } },
    { id: 'diplomat', name: 'The Diplomat', title: 'Friends who back you up', key: 'a', keyName: 'Alliances', color: '#4da8ff', hat: 'tophat', startWeapon: 'orbs', mods: { xpMult: 1.15 },
      desc: 'Never fights alone. Learns fast and levels up faster.', unlock: { type: 'coins', cost: 300 } },
    { id: 'explorer', name: 'The Explorer', title: 'Grabs everything in sight', key: 'i', keyName: 'Imperialism', color: '#b77dff', hat: 'pith', startWeapon: 'boomerang', mods: { magnetMult: 1.4, speedMult: 1.08 },
      desc: 'Races for resources. Quick feet and a huge gem magnet.', unlock: { type: 'coins', cost: 600 } },
    { id: 'firebrand', name: 'The Firebrand', title: 'Never backs down', key: 'n', keyName: 'Nationalism', color: '#ff5e4f', hat: 'beret', startWeapon: 'trail', mods: { dmgMult: 1.2, maxHp: -20 },
      desc: 'All pride, no brakes. Hits hard but can not take many hits.', unlock: { type: 'coins', cost: 600 } },
    { id: 'sparky', name: 'Sparky', title: 'Lights the fuse', key: 's', keyName: 'The Spark', color: '#ffa01f', hat: 'goggles', startWeapon: 'chain', mods: { cooldownMult: 0.9 },
      desc: 'One zap sets off a chain reaction. Fires faster than anyone.', unlock: { type: 'feat', feat: 'win', text: 'Beat the final boss' } },
    { id: 'neutral', name: 'Uncle Neutral', title: 'Staying out of it', key: 'x', keyName: 'Isolationism', color: '#8fa0ad', hat: 'bowler', startWeapon: 'aura', mods: { armor: 1 },
      desc: 'Wants no part of the fight, so nothing gets near him.', unlock: { type: 'feat', feat: 'ready80', text: 'Reach 80% Quiz Readiness' } },
    { id: 'editor', name: 'The Editor', title: 'Read all about it', key: '', keyName: '', color: '#38b876', hat: 'visor', startWeapon: 'press', mods: { coinMult: 1.25 },
      desc: 'Prints the headlines and pockets the profits.', unlock: { type: 'feat', feat: 'test90', text: 'Score 90%+ on a Practice Test' } },
  ];

  /* the drawn icon for a shop track is PK.icon(track.id) */
  const C5 = [60, 120, 200, 320, 500];
  const SHOP = [
    { id: 'maxHp', name: 'Iron Rations', desc: 'More health, so you survive bigger hits.', max: 5, costs: C5,
      label: (l) => '+' + 10 * l + ' max HP', apply: (b, l) => { b.maxHp += 10 * l; } },
    { id: 'dmgMult', name: 'Sharper Facts', desc: 'Every weapon hits harder.', max: 5, costs: C5,
      label: (l) => '+' + 6 * l + '% damage', apply: (b, l) => { b.dmgMult *= 1 + 0.06 * l; } },
    { id: 'speedMult', name: 'Quick Boots', desc: 'Run faster.', max: 5, costs: C5,
      label: (l) => '+' + 4 * l + '% speed', apply: (b, l) => { b.speedMult *= 1 + 0.04 * l; } },
    { id: 'magnetMult', name: 'Gem Magnet', desc: 'Pull in gems from farther away.', max: 5, costs: C5,
      label: (l) => '+' + 15 * l + '% pickup range', apply: (b, l) => { b.magnetMult *= 1 + 0.15 * l; } },
    { id: 'xpMult', name: 'Fast Learner', desc: 'Level up quicker. More questions, more upgrades.', max: 5, costs: C5,
      label: (l) => '+' + 6 * l + '% XP', apply: (b, l) => { b.xpMult *= 1 + 0.06 * l; } },
    { id: 'coinMult', name: 'War Chest', desc: 'Earn more coins from every run.', max: 5, costs: C5,
      label: (l) => '+' + 10 * l + '% coins', apply: (b, l) => { b.coinMult *= 1 + 0.10 * l; } },
    { id: 'cooldownMult', name: 'Rapid Fire', desc: 'All weapons fire faster.', max: 5, costs: C5,
      label: (l) => Math.round((1 - Math.pow(0.96, l)) * 100) + '% faster firing', apply: (b, l) => { b.cooldownMult *= Math.pow(0.96, l); } },
    { id: 'crit', name: 'Lucky Shot', desc: 'More critical hits for big damage.', max: 5, costs: C5,
      label: (l) => '+' + 4 * l + '% crit chance', apply: (b, l) => { b.crit += 0.04 * l; } },
    { id: 'regen', name: 'Field Medic', desc: 'Slowly heal all the time.', max: 4, costs: [80, 160, 280, 450],
      label: (l) => '+' + (0.25 * l) + ' HP per second', apply: (b, l) => { b.regen += 0.25 * l; } },
    { id: 'armor', name: 'Steel Plating', desc: 'Every hit hurts a little less.', max: 3, costs: [150, 400, 900],
      label: (l) => (7 * l) + '% less damage taken', apply: (b, l) => { b.armor += l; } },
    { id: 'rerolls', name: 'Second Opinion', desc: 'Swap your upgrade choices for new ones during a run.', max: 3, costs: [200, 450, 800],
      label: (l) => '+' + l + (l === 1 ? ' reroll' : ' rerolls') + ' per run', apply: (b, l) => { b.rerolls += l; } },
    { id: 'revives', name: 'Extra Life', desc: 'Get back up one more time after you fall.', max: 1, costs: [1200],
      label: (l) => '+' + l + ' revive per run', apply: (b, l) => { b.revives += l; } },
  ];

  /* c = {st, q, r, up, chars}; prog returns [current, target]; ic = drawn icon name */
  const ACH = [
    { id: 'first_run', ic: 'medal', name: 'Reporting for Duty', desc: 'Finish your first run.', coins: 25, prog: (c) => [c.st.runs, 1] },
    { id: 'boss1', ic: 'skull', name: 'Boss Buster', desc: 'Defeat your first boss.', coins: 50, prog: (c) => [c.st.bossKills, 1] },
    { id: 'act2', ic: 'A', name: 'A is for Alliances', desc: 'Reach Act 2: Alliances.', coins: 40, prog: (c) => [c.st.bestAct, 2] },
    { id: 'act3', ic: 'I', name: 'I is for Imperialism', desc: 'Reach Act 3: Imperialism.', coins: 60, prog: (c) => [c.st.bestAct, 3] },
    { id: 'act4', ic: 'N', name: 'N is for Nationalism', desc: 'Reach Act 4: Nationalism.', coins: 80, prog: (c) => [c.st.bestAct, 4] },
    { id: 'act5', ic: 'S', name: 'Lit Fuse', desc: 'Reach Act 5: The Spark.', coins: 120, prog: (c) => [c.st.bestAct, 5] },
    { id: 'win', ic: 'crown', name: 'Powder Keg Defused', desc: 'Beat the Spark and win a run.', coins: 300, prog: (c) => [c.st.wins, 1] },
    { id: 'win3', ic: 'flame', name: 'Danger Seeker', desc: 'Win a run on Danger +3 or higher.', coins: 500, prog: (c) => [Math.max(0, c.st.bestWinDanger), 3] },
    { id: 'kills500', ic: 'skull', name: 'Horde Breaker', desc: 'Defeat 500 monsters in one run.', coins: 100, prog: (c) => [c.st.bestKills, 500] },
    { id: 'kills5000', ic: 'skull', name: 'Monster Historian', desc: 'Defeat 5,000 monsters in total.', coins: 150, prog: (c) => [c.st.kills, 5000] },
    { id: 'level20', ic: 'star', name: 'Fully Loaded', desc: 'Reach level 20 in one run.', coins: 100, prog: (c) => [c.st.bestLevel, 20] },
    { id: 'survive10', ic: 'clock', name: 'Ten-Minute Hero', desc: 'Survive 10 minutes in one run.', coins: 100, prog: (c) => [Math.floor(c.st.bestTime / 60), 10], unit: ' min' },
    { id: 'shopper', ic: 'shop', name: 'Upgrade Day', desc: 'Buy 10 permanent upgrades.', coins: 75, prog: (c) => [c.up, 10] },
    { id: 'collector', ic: 'person', name: 'Full Squad', desc: 'Unlock all 8 characters.', coins: 300, prog: (c) => [c.chars, CHARS.length] },
    { id: 'correct10', ic: 'scholar', learn: true, name: 'Warm-Up', desc: 'Answer 10 questions correctly.', coins: 25, prog: (c) => [c.q.correct, 10] },
    { id: 'correct50', ic: 'scholar', learn: true, name: 'Sharp Student', desc: 'Answer 50 questions correctly.', coins: 75, prog: (c) => [c.q.correct, 50] },
    { id: 'correct200', ic: 'scholar', learn: true, name: 'History Buff', desc: 'Answer 200 questions correctly.', coins: 200, prog: (c) => [c.q.correct, 200] },
    { id: 'correct500', ic: 'scholar', learn: true, name: 'Walking Textbook', desc: 'Answer 500 questions correctly.', coins: 400, prog: (c) => [c.q.correct, 500] },
    { id: 'streak5', ic: 'bolt', learn: true, name: 'On a Roll', desc: 'Get 5 answers right in a row.', coins: 40, prog: (c) => [c.q.bestStreak, 5] },
    { id: 'streak10', ic: 'bolt', learn: true, name: 'Hot Streak', desc: 'Get 10 answers right in a row.', coins: 100, prog: (c) => [c.q.bestStreak, 10] },
    { id: 'streak25', ic: 'bolt', learn: true, name: 'Unstoppable', desc: 'Get 25 answers right in a row.', coins: 300, prog: (c) => [c.q.bestStreak, 25] },
    { id: 'ready50', ic: 'chart', learn: true, name: 'Halfway There', desc: 'Reach 50% Quiz Readiness.', coins: 100, prog: (c) => [c.r, 50], unit: '%' },
    { id: 'ready80', ic: 'chart', learn: true, name: 'Almost Quiz-Ready', desc: 'Reach 80% Quiz Readiness.', coins: 200, prog: (c) => [c.r, 80], unit: '%' },
    { id: 'ready100', ic: 'chart', learn: true, name: 'Quiz Ready', desc: 'Reach 100% Quiz Readiness.', coins: 500, prog: (c) => [c.r, 100], unit: '%' },
    { id: 'test80', ic: 'pencil', learn: true, name: 'Solid Score', desc: 'Score 80% or higher on a Practice Test.', coins: 150, prog: (c) => [c.q.practiceBest, 80], unit: '%' },
    { id: 'test100', ic: 'pencil', learn: true, name: 'Perfect Paper', desc: 'Score 100% on a Practice Test.', coins: 400, prog: (c) => [c.q.practiceBest, 100], unit: '%' },
    { id: 'bonus1', ic: 'chest', learn: true, name: 'Bonus Brain', desc: 'Finish a bonus round with no misses.', coins: 40, prog: (c) => [c.q.bonusPerfect, 1] },
    { id: 'bonus10', ic: 'chest', learn: true, name: 'Chest Master', desc: 'Finish 10 bonus rounds with no misses.', coins: 250, prog: (c) => [c.q.bonusPerfect, 10] },
  ];

  const ACT_NAMES = ['', 'Militarism', 'Alliances', 'Imperialism', 'Nationalism', 'The Spark'];
  const ACT_KEYS = ['', 'm', 'a', 'i', 'n', 's'];
  const ACT_MEDAL = ['', 'M', 'A', 'I', 'N', 'S'];
  const MAX_DANGER = 10;
  const STAT_KEYS = ['runs', 'wins', 'kills', 'bossKills', 'bestTime', 'bestAct', 'bestLevel', 'playSeconds', 'bestScore', 'bestKills'];

  /* --------------------------------------------------------------- helpers */
  const root = () => document.getElementById('screens');
  const sfx = (n, o) => { try { window.AudioSys && AudioSys.sfx && AudioSys.sfx(n, o); } catch (e) {} };
  const music = (t) => { try { window.AudioSys && AudioSys.music && AudioSys.music(t); } catch (e) {} };
  const audio = (fn, v) => { try { window.AudioSys && AudioSys[fn] && AudioSys[fn](v); } catch (e) {} };
  const n0 = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const fmt = (n) => Math.round(n0(n)).toLocaleString('en-US');
  const fmtDur = (sec) => { const m = Math.round(n0(sec) / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
  const charById = (id) => CHARS.find((c) => c.id === id) || CHARS[0];
  /* Meta's toasts go up one at a time: news (awards, unlocks) waits its turn, feedback for a tap replaces what is up */
  const TQ = { q: [], el: null, timer: 0 };
  function showToast(html, opts) {
    const host = document.getElementById('toasts');
    if (TQ.el && TQ.el.isConnected) TQ.el.remove();
    clearTimeout(TQ.timer);
    const before = host ? host.lastElementChild : null;
    try { window.Toast && Toast.show(html, opts); } catch (e) {}
    const el = host ? host.lastElementChild : null;
    TQ.el = el && el !== before ? el : null;
    if (opts.sfx) sfx(opts.sfx);
    TQ.timer = setTimeout(() => { TQ.timer = 0; TQ.el = null; pumpToast(); }, (opts.ms || 2200) + 380);
  }
  function pumpToast() { if (!TQ.timer && TQ.q.length) { const t = TQ.q.shift(); showToast(t[0], t[1]); } }
  function toast(html, opts) {
    opts = opts || {};
    if (opts.kind === 'bad' || opts.now) { showToast(html, opts); return; }
    TQ.q.push([html, opts]); if (TQ.q.length > 3) TQ.q.splice(0, TQ.q.length - 3);
    pumpToast();
  }
  const calm = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
  const gameOn = () => { try { return !!(window.Game && Game.isRunning && Game.isRunning()); } catch (e) { return false; } };
  const quizBusy = () => { try { return !!(window.Quiz && Quiz.isOpen && Quiz.isOpen()); } catch (e) { return false; } };

  function readiness() {
    let r = null;
    try { if (window.Quiz && Quiz.readiness) r = Quiz.readiness(); } catch (e) {}
    r = r || {};
    const t = r.byTopic || {};
    return {
      overall: Math.round(U.clamp(n0(r.overall), 0, 100)),
      byTopic: { vocab: Math.round(n0(t.vocab)), sides: Math.round(n0(t.sides)), compete: Math.round(n0(t.compete)), spark: Math.round(n0(t.spark)) },
      mastered: n0(r.mastered), total: n0(r.total), seen: n0(r.seen),
    };
  }
  function qstats() {
    let q = null;
    try { if (window.Quiz && Quiz.stats) q = Quiz.stats(); } catch (e) {}
    q = q || {};
    return { asked: n0(q.asked), correct: n0(q.correct), accuracy: Math.round(n0(q.accuracy)), streak: n0(q.streak), bestStreak: n0(q.bestStreak),
      practiceBest: Math.round(n0(q.practiceBest)), practiceCount: n0(q.practiceCount), bonusPerfect: n0(q.bonusPerfect) };
  }
  function ctx() {
    const st = Object.assign({}, M.stats);
    STAT_KEYS.forEach((k) => { st[k] = n0(st[k]); });
    st.bestWinDanger = typeof M.stats.bestWinDanger === 'number' ? M.stats.bestWinDanger : -1;
    let up = 0; for (const k in M.up) up += n0(M.up[k]);
    return { st, q: qstats(), r: readiness().overall, up, chars: CHARS.filter((c) => M.chars[c.id]).length };
  }

  /* ---- drawn icons (PK.icon) with a quiet stand-in when the icon set is not loaded ---- */
  function ico(name, px, cls) {
    let el = null;
    try { if (window.PK && PK.icon) el = PK.icon(name, px); } catch (e) { el = null; }
    if (!el) {
      if (name === 'coin') { el = U.el('span', { class: 'coin' }); el.style.fontSize = px + 'px'; }
      else if (/^[MAINSX]$/.test(name)) { el = U.el('span', { class: 'pill ' + name.toLowerCase(), text: name === 'S' ? '*' : name }); }
      else { el = U.el('span', { class: 'mt-ico-fb' }); el.style.width = el.style.height = px + 'px'; }
    }
    el.classList.add('mt-ico'); if (cls) el.classList.add(cls);
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  function btn(label, cls, fn, attrs) {
    const b = U.el('button', Object.assign({ type: 'button', class: 'btn ' + (cls || '') }, attrs || {}));
    (Array.isArray(label) ? label : [label]).forEach((n) => { if (n != null && n !== false) b.append(n); });
    b.addEventListener('click', (e) => { if (covered()) return; navFrom = b.dataset.nav ? { from: current, key: b.dataset.nav } : null; if (!b.dataset.quiet) sfx('click'); if (fn) fn(e, b); });
    return b;
  }
  /* a plain <button> with its own look (not the .btn slab) */
  function tap(cls, kids, fn, attrs) {
    const b = U.el('button', Object.assign({ type: 'button', class: cls }, attrs || {}));
    (Array.isArray(kids) ? kids : [kids]).forEach((n) => { if (n != null && n !== false) b.append(n); });
    b.addEventListener('click', (e) => { if (covered()) return; navFrom = b.dataset.nav ? { from: current, key: b.dataset.nav } : null; if (!b.dataset.quiet) sfx('click'); if (fn) fn(e, b); });
    return b;
  }

  /* ---- numbers that roll, bars that grow ---- */
  const tweens = new WeakMap();
  function tweenNum(el, from, to, ms, f) {
    f = f || fmt; const old = tweens.get(el); if (old) cancelAnimationFrame(old.id);
    el.dataset.v = String(to);
    if (!(ms > 0) || calm() || from === to) { el.textContent = f(to); return; }
    const t0 = performance.now(), st = { id: 0 };
    (function step(t) {
      const k = Math.min(1, Math.max(0, (t - t0) / ms)), v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      el.textContent = f(v);
      if (k < 1 && t !== t0 && !el.isConnected) { el.textContent = f(to); return; }   // its screen is gone: stop counting
      if (k < 1) st.id = requestAnimationFrame(step);
    })(t0);
    tweens.set(el, st);
  }
  function walletEl() {
    return U.el('div', { class: 'mt-wallet', title: 'Your coins' }, ico('coin', 20),
      U.el('span', { class: 'num', dataset: { coins: '1', v: String(M.coins) }, text: fmt(M.coins) }), U.el('span', { class: 'mt-sr', text: ' coins' }));
  }
  function refreshWallets(instant) { U.$$('[data-coins]').forEach((e) => tweenNum(e, n0(+e.dataset.v), M.coins, instant ? 0 : 420)); }
  function coinTag(n, prefix) { return U.el('span', { class: 'mt-cost num' }, prefix || '', ico('coin', 16), U.el('span', { text: fmt(n) })); }
  function lvClass(p) { return p >= 100 ? 'lv-full' : p >= 80 ? 'lv-hi' : p >= 40 ? 'lv-mid' : 'lv-lo'; }
  /* a bar that grows from `from`% (default 0) to pct%; add class mt-shine for one soft shine */
  function bar(pct, cls, from) {
    const p = U.clamp(Math.round(n0(pct)), 0, 100), f = U.clamp(Math.round(n0(from)), 0, 100);
    const i = U.el('i', { class: lvClass(p) });
    if (calm()) i.style.width = p + '%';
    else { i.style.width = f + '%'; requestAnimationFrame(() => requestAnimationFrame(() => { i.style.width = p + '%'; })); }
    return U.el('div', { class: 'bar mt-bar ' + (cls || '') }, i);
  }
  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  /* ---- living portraits: ONE shared animation loop, alive only while portraits are on screen ---- */
  const PORT = { list: [], raf: 0, nap: 0, watch: false };
  const modalsUp = () => { const m = document.getElementById('modals'); return !!(m && m.childElementCount > 0); };
  const hiddenNow = () => modalsUp() || !!helpVeil;        // something lies over the page we are showing
  /* called whenever a cover appears or goes: freeze / unfreeze what moves on the title */
  function coverSync() {
    const r = root(), t = r ? r.querySelector('.mt-title') : null, on = hiddenNow();
    if (t) t.classList.toggle('mt-paused', on);
    if (!on) portKick();
  }
  const canDraw = () => !!(window.PK && PK.portrait && PK.portrait.hero);
  function drawPort(e, t) {
    try { PK.portrait.hero(e.cv, e.ch, t, { size: e.size, moving: e.moving, faceX: e.faceX }); }
    catch (err) { e.live = false; }
  }
  function portTick() {
    PORT.raf = 0;
    if (document.hidden) return;
    if (gameOn()) { portStop(); return; }                    // a run owns every frame: nothing of ours draws
    PORT.list = PORT.list.filter((e) => e.live && e.cv.isConnected);
    if (!PORT.list.length) return;
    /* covered (help, a question card, Study Notes, the Practice Test): stand still. coverSync() starts us again;
       only without a MutationObserver do we look again now and then */
    if (hiddenNow()) { if (!PORT.watch) { clearTimeout(PORT.nap); PORT.nap = setTimeout(portKick, 400); } return; }
    const t = performance.now() / 1000;
    for (let i = 0; i < PORT.list.length; i++) drawPort(PORT.list[i], t);
    PORT.raf = requestAnimationFrame(portTick);
  }
  function portKick() {
    if (gameOn()) { portStop(); return; }
    if (!PORT.raf && !document.hidden && PORT.list.length) PORT.raf = requestAnimationFrame(portTick);
  }
  function portStop() { PORT.list.length = 0; clearTimeout(PORT.nap); if (PORT.raf) { cancelAnimationFrame(PORT.raf); PORT.raf = 0; } }
  /* a character drawn by the game's own art. o = {live, moving, faceX, cls}. Static ones are drawn once. */
  function heroCanvas(ch, size, o) {
    o = o || {};
    const w = Array.isArray(size) ? size[0] : size, h = Array.isArray(size) ? size[1] : size;
    if (!canDraw()) { const a = avatar(ch, 'mt-port ' + (o.cls || '')); a.style.width = Math.min(w, h) + 'px'; a.style.height = Math.min(w, h) + 'px'; return a; }
    const cv = U.el('canvas', { class: 'mt-port ' + (o.cls || ''), 'aria-hidden': 'true' });
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const e = { cv, ch, size, moving: !!o.moving, faceX: o.faceX || 1, live: true };
    drawPort(e, o.live === false || calm() ? 0.6 : performance.now() / 1000);
    if (!e.live) { const a = avatar(ch, 'mt-port ' + (o.cls || '')); a.style.width = a.style.height = Math.min(w, h) + 'px'; return a; }   // the art failed: stand-in
    if (e.live && o.live !== false && !calm() && !gameOn()) { PORT.list.push(e); requestAnimationFrame(portKick); }
    return cv;
  }

  /* ---- confetti: only for a win, or for reaching 100% readiness ---- */
  function cssColor(name, fallback) { try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; } catch (e) { return fallback; } }
  function confetti() {
    const host = root(); if (!host || calm()) return;
    const W = host.clientWidth || window.innerWidth, H = host.clientHeight || window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cv = U.el('canvas', { class: 'mt-confetti', 'aria-hidden': 'true' }); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    host.appendChild(cv);
    const c = cv.getContext('2d'); if (!c) { cv.remove(); return; }
    const cols = ['--c-m', '--c-a', '--c-i', '--c-n', '--c-s', '--brass', '--paper'].map((k) => cssColor(k, '#f2bb3d'));
    const ps = [];
    for (let i = 0; i < 56; i++) ps.push({ x: W * (0.5 + (Math.random() - 0.5) * 0.5), y: H * 0.3, vx: (Math.random() - 0.5) * W * 1.3, vy: -(H * 0.55 + Math.random() * H * 0.5), r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 14, w: 6 + Math.random() * 5, h: 9 + Math.random() * 6, col: cols[i % cols.length] });
    const t0 = performance.now(), LIFE = 1200; let last = t0;
    (function step(t) {
      if (!cv.isConnected) return;
      const dt = Math.min(0.05, (t - last) / 1000), age = t - t0; last = t;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H); c.globalAlpha = Math.max(0, Math.min(1, (LIFE - age) / 300));
      for (const p of ps) {
        p.vy += H * 1.9 * dt; p.vx *= 1 - 1.2 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.col; c.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 1.3)), p.w, p.h * Math.abs(Math.cos(p.r * 1.3))); c.restore();
      }
      if (age < LIFE) requestAnimationFrame(step); else cv.remove();
    })(t0);
  }

  /* ---- screens ---- */
  function mount(screen, name, back) {
    const r = root(); if (!r) return;
    const prev = current, was = document.activeElement && r.contains(document.activeElement) ? document.activeElement : null;
    const wasId = was && was.id, wasNav = was && was.dataset ? was.dataset.nav : '';
    if (prev !== name) screen.classList.add('mt-in');        // re-rendering the same screen: no second entrance
    if (navFrom && navFrom.from === prev && prev !== name) openedBy[name] = navFrom;
    navFrom = null;
    current = name; backFn = back || null; helpVeil = null; helpFrom = null;
    r.replaceChildren(screen);
    screen.scrollTop = 0;
    /* focus never stays on a page that is gone */
    let target = null;
    const ob = prev && prev !== name ? openedBy[prev] : null;
    if (ob && ob.from === name) { if (keysLast) target = screen.querySelector('[data-nav="' + ob.key + '"]'); delete openedBy[prev]; }
    else if (prev === name && keysLast) target = (wasId && document.getElementById(wasId)) || (wasNav && screen.querySelector('[data-nav="' + wasNav + '"]')) || null;
    screen.setAttribute('tabindex', '-1');
    try { (target || screen).focus({ preventScroll: true }); } catch (e) {}
    coverSync();
  }
  function clearScreens() { const r = root(); if (r) r.replaceChildren(); current = null; backFn = null; helpVeil = null; helpFrom = null; navFrom = null; portStop(); }
  function goBack() { navFrom = null; if (backFn) backFn(); else showTitle(); }
  function subScreen(name, title, back, body, opts) {
    opts = opts || {};
    const head = U.el('div', { class: 'mt-head' },
      btn([ico('back', 16), U.el('span', { text: 'Back' })], 'small mt-back', goBack, { 'aria-label': 'Back' }),
      U.el('h1', { class: 'display mt-h1', text: title }),
      opts.noWallet ? U.el('span') : walletEl());
    const wrap = U.el('div', { class: 'wrap' }, head, body);
    const sc = U.el('div', { class: 'screen mt-sub mt-' + name }, wrap);
    mount(sc, name, back);
    return sc;
  }

  /* SVG stand-in for a character when the game art is not loaded */
  function avatar(c, cls) {
    const id = 'mtav' + (++avatarSeq), col = c.color, dk = 'style="fill:var(--ink)"';
    let hat;
    switch (c.hat) {
      case 'helmet': hat = `<path d="M15 31a17 17 0 0 1 34 0v2H15z" fill="${col}"/><rect x="11" y="31" width="42" height="5" rx="2.5" fill="${col}"/><path d="M30 15h4v-6l-2-4-2 4z" fill="${col}"/>`; break;
      case 'tophat': hat = `<rect x="21" y="5" width="22" height="22" rx="2" ${dk}/><rect x="21" y="19" width="22" height="4" fill="${col}"/><rect x="13" y="25" width="38" height="5" rx="2.5" ${dk}/>`; break;
      case 'pith': hat = `<path d="M17 28a15 15 0 0 1 30 0z" fill="${col}"/><rect x="9" y="26" width="46" height="5" rx="2.5" fill="${col}"/><circle cx="32" cy="12.5" r="2.5" fill="${col}"/>`; break;
      case 'beret': hat = `<ellipse cx="29" cy="23" rx="18" ry="8" transform="rotate(-10 29 23)" fill="${col}"/><rect x="31" y="10" width="3" height="6" rx="1.5" fill="${col}"/>`; break;
      case 'goggles': hat = `<path d="M19 27a13 13 0 0 1 26 0z" ${dk}/><rect x="16" y="25" width="32" height="5" rx="2" ${dk}/><circle cx="25" cy="28" r="6.5" fill="${col}"/><circle cx="39" cy="28" r="6.5" fill="${col}"/><circle cx="25" cy="28" r="3.5" style="fill:var(--ink-3)"/><circle cx="39" cy="28" r="3.5" style="fill:var(--ink-3)"/>`; break;
      case 'bowler': hat = `<path d="M19 27a13 14 0 0 1 26 0z" ${dk}/><rect x="19" y="22" width="26" height="3.5" fill="${col}"/><rect x="12" y="26" width="40" height="5" rx="2.5" ${dk}/>`; break;
      case 'visor': hat = `<path d="M19 26a13 12 0 0 1 26 0z" style="fill:var(--paper-mute)"/><rect x="17" y="24" width="30" height="4" rx="2" ${dk}/><path d="M17 28h31l8 7H24z" fill="${col}" opacity=".9"/>`; break;
      default: hat = `<path d="M18 28a14 14 0 0 1 28 0z" fill="${col}"/><rect x="40" y="24.5" width="17" height="4.5" rx="2.2" fill="${col}"/><circle cx="32" cy="14" r="2.2" fill="${col}"/>`;
    }
    const svg = `<svg viewBox="0 0 64 64" width="100%" height="100%" focusable="false"><defs><clipPath id="${id}"><circle cx="32" cy="32" r="29"/></clipPath></defs>` +
      `<circle cx="32" cy="32" r="29.5" style="fill:var(--ink-3)" stroke="${col}" stroke-width="3"/>` +
      `<g clip-path="url(#${id})"><ellipse cx="32" cy="65" rx="23" ry="15" fill="${col}"/>` +
      `<circle cx="32" cy="38" r="14" style="fill:var(--paper)"/>` +
      `<circle cx="27" cy="39" r="2.2" style="fill:var(--paper-ink)"/><circle cx="37" cy="39" r="2.2" style="fill:var(--paper-ink)"/>` +
      `<path d="M27.5 45q4.5 3.5 9 0" style="fill:none;stroke:var(--paper-ink)" stroke-width="2" stroke-linecap="round"/>` + hat + `</g></svg>`;
    return U.el('span', { class: 'mt-av ' + (cls || ''), 'aria-hidden': 'true', html: svg });
  }

  const pct = (m) => { const p = Math.round((m - 1) * 100); return (p >= 0 ? '+' : '') + p + '%'; };
  const MOD_TEXT = {
    maxHp: (v) => [(v > 0 ? '+' : '') + v + ' max HP', v > 0],
    dmgMult: (v) => [pct(v) + ' damage', v >= 1],
    speedMult: (v) => [pct(v) + ' speed', v >= 1],
    magnetMult: (v) => [pct(v) + ' gem magnet', v >= 1],
    xpMult: (v) => [pct(v) + ' XP', v >= 1],
    coinMult: (v) => [pct(v) + ' coins', v >= 1],
    cooldownMult: (v) => [Math.abs(Math.round((1 - v) * 100)) + '% ' + (v <= 1 ? 'faster' : 'slower') + ' firing', v <= 1],
    armor: (v) => [(7 * v) + '% less damage taken', v > 0],
    regen: (v) => ['+' + v + ' HP/sec', v > 0],
    crit: (v) => ['+' + Math.round(v * 100) + '% crit', v > 0],
    revives: (v) => ['+' + v + ' revive', v > 0],
    rerolls: (v) => ['+' + v + ' reroll', v > 0],
  };
  function modChips(mods) {
    const out = [];
    for (const k in mods) { if (!MOD_TEXT[k]) continue; const [t, good] = MOD_TEXT[k](mods[k]); out.push(U.el('span', { class: 'mt-mod ' + (good ? 'up' : 'down'), text: t })); }
    if (!out.length) out.push(U.el('span', { class: 'mt-mod', text: 'Balanced' }));
    return out;
  }

  /* --------------------------------------------------- coins, unlocks, achievements */
  function addCoins(n) {
    n = Math.round(n0(n)); if (!n) return M.coins;
    M.coins = Math.max(0, M.coins + n); if (n > 0) M.totalCoins += n;
    Save.commit(); refreshWallets();
    return M.coins;
  }
  function featMet(feat, c) {
    if (feat === 'win') return c.st.wins > 0;
    if (feat === 'ready80') return c.r >= 80;
    if (feat === 'test90') return c.q.practiceBest >= 90;
    return false;
  }
  function featProgress(feat, c) {
    if (feat === 'ready80') return 'Now ' + c.r + '% of 80%';
    if (feat === 'test90') return c.q.practiceCount ? 'Best so far ' + c.q.practiceBest + '%' : 'No tests taken yet';
    if (feat === 'win') return c.st.bestAct ? 'Furthest so far: Act ' + c.st.bestAct : 'Beat all five acts';
    return '';
  }
  function checkUnlocks(silent) {
    const c = ctx(), got = [];
    for (const ch of CHARS) {
      if (M.chars[ch.id] || ch.unlock.type !== 'feat') continue;
      if (featMet(ch.unlock.feat, c)) { M.chars[ch.id] = true; got.push(ch); }
    }
    if (got.length) {
      Save.commit();
      if (!silent) toast(got.length === 1 ? 'New character unlocked: <b>' + U.esc(got[0].name) + '</b>' : '<b>' + got.length + ' new characters</b> unlocked', { kind: 'good', ms: 3000, sfx: 'unlock' });
    }
    return got;
  }
  function checkAchievements(silent) {
    const c = ctx(), got = [];
    for (const a of ACH) {
      if (M.ach[a.id]) continue;
      const p = a.prog(c);
      if (p[0] >= p[1]) { M.ach[a.id] = Date.now(); M.coins += a.coins; M.totalCoins += a.coins; got.push(a); }
    }
    if (got.length) {
      Save.commit(); refreshWallets();
      if (!silent) {
        /* one award gets its own toast; several get one calm summary */
        if (got.length === 1) toast('Award: <b>' + U.esc(got[0].name) + '</b> +' + got[0].coins + ' coins', { kind: 'good', ms: 2800, sfx: 'unlock' });
        else { const sum = got.reduce((t, a) => t + a.coins, 0); toast('<b>' + got.length + ' awards earned</b> +' + fmt(sum) + ' coins', { kind: 'good', ms: 3000, sfx: 'unlock' }); }
      }
    }
    return got;
  }
  /* unlocks first: the Full Squad achievement counts them */
  function checkAll(silent) {
    const chars = checkUnlocks(silent);
    const ach = checkAchievements(silent);
    return { chars, ach };
  }

  /* ------------------------------------------------------------- bonuses */
  function bonuses() {
    const b = { maxHp: 0, dmgMult: 1, speedMult: 1, magnetMult: 1, xpMult: 1, coinMult: 1, armor: 0, regen: 0, cooldownMult: 1, crit: 0, revives: 0, rerolls: 0 };
    if (!M) return b;
    for (const t of SHOP) { const l = U.clamp(n0(M.up[t.id]) | 0, 0, t.max); if (l > 0) t.apply(b, l); }
    const mods = charById(M.char).mods;
    for (const k in mods) { if (!(k in b)) continue; if (/Mult$/.test(k)) b[k] *= mods[k]; else b[k] += mods[k]; }
    return b;
  }
  function character() {
    const c = charById(M ? M.char : 'cadet');
    return { id: c.id, name: c.name, title: c.title, desc: c.desc, color: c.color, hat: c.hat, startWeapon: c.startWeapon, mods: Object.assign({}, c.mods) };
  }

  /* --------------------------------------------------------------- start a run */
  function startRun() {
    if (covered()) return;
    if (!(window.Game && Game.start)) { sfx('error'); toast('The game engine is not loaded.', { kind: 'bad' }); return; }
    try { window.AudioSys && AudioSys.unlock && AudioSys.unlock(); } catch (e) {}
    readyBefore = readiness().overall;
    clearScreens();
    Game.start({ charId: M.char, danger: M.danger });
  }

  /* --------------------------------------------------------------- TITLE */
  let fontOk = false;
  function wordmark() {
    const w = U.el('h1', { class: 'mt-word', 'aria-label': 'Powder Keg 1914' },
      U.el('b', { class: 'w1', text: 'POWDER' }),
      U.el('b', { class: 'w2' }, 'KEG',
        U.el('span', { class: 'stamp', text: '1914' }),
        U.el('span', { class: 'mt-fuse', 'aria-hidden': 'true' }, U.el('i'))));
    /* hold the wordmark until its display face has loaded (no flash of the fallback serif), then let it land */
    if (!fontOk) {
      const go = () => {
        if (fontOk) return; fontOk = true;
        document.querySelectorAll('.mt-word.mt-hold').forEach((e) => { e.classList.remove('mt-hold'); e.classList.add('mt-land'); });
      };
      try {
        if (document.fonts && document.fonts.load && !document.fonts.check('1em "Alfa Slab One"')) {
          w.classList.add('mt-hold'); document.fonts.load('1em "Alfa Slab One"').then(go, go); setTimeout(go, 1200);
        } else fontOk = true;
      } catch (e) { fontOk = true; }
    }
    return w;
  }
  /* short phones get a smaller hero so the whole title (danger stepper included) stays on one screen */
  function heroSize() {
    const w = window.innerWidth || 390, h = window.innerHeight || 720, tall = h >= w;
    const k = !tall ? 0.165 : h <= 600 ? 0.12 : h <= 700 ? 0.14 : h <= 780 ? 0.15 : 0.165;
    return Math.round(U.clamp(Math.min(w * 0.33, h * k), tall && h <= 700 ? 60 : 84, 156));
  }
  /* ---- study shortcuts. Quiz may not offer them yet: then the entry points simply are not there ---- */
  const canDrill = () => !!(window.Quiz && typeof Quiz.drill === 'function');
  const canSheet = () => !!(window.Quiz && typeof Quiz.reviewSheet === 'function' && typeof Quiz.runMisses === 'function');
  const studyBusy = () => studyOpen && (quizBusy() || performance.now() - studyAt < 1500);   // never trust a stuck flag for long
  /* a question card or a study sheet is covering the screen: nothing underneath may react (a focused button would
     otherwise still fire on Enter). An open-count that says "open" with no card on screen is not believed. */
  function covered() {
    if (!studyBusy() && !quizBusy()) return false;
    const m = document.getElementById('modals');
    return !m || m.childElementCount > 0 || performance.now() - studyAt < 1500;
  }
  function dropFocus() { const a = document.activeElement, r = root(); if (a && r && r.contains(a) && a.blur) a.blur(); }
  function weakLeft(r) {
    let n = null;
    try { if (window.Quiz && Quiz.weakCount) n = Quiz.weakCount(); } catch (e) { n = null; }
    if (typeof n === 'number' && isFinite(n)) return Math.max(0, Math.round(n));
    return r.total ? Math.max(0, r.total - r.mastered) : null;
  }
  function runMisses() {
    try { if (canSheet()) { const l = Quiz.runMisses(); return Array.isArray(l) ? l.filter((m) => m && m.q).slice(0, 8) : []; } } catch (e) {}
    return [];
  }
  const byKeys = (e) => !!e && e.detail === 0;          // the button was pressed with Enter/Space, not tapped
  function chevron() { return U.el('i', { class: 'mt-caret', 'aria-hidden': 'true' }); }
  /* Quick Review: ten questions on the weakest facts, then the title shows what it did to the readiness bar */
  function openDrill(e) {
    if (covered() || gameOn() || !canDrill()) return;
    const keys = byKeys(e);
    let p; try { p = Quiz.drill({ count: 10 }); } catch (err) { p = null; }
    studyOpen = true; studyAt = performance.now(); dropFocus();
    const done = () => {
      studyOpen = false;
      checkAll(false);
      if (current !== 'title' || gameOn()) return;
      showTitle();
      if (keys) { const c = document.getElementById('mt-drill'); if (c) c.focus({ preventScroll: true }); }
    };
    Promise.resolve(p).then(done, done);
  }
  /* the questions missed in the run that just ended, as a sheet over the results */
  function openMissed(list, e, b) {
    if (covered() || !canSheet()) return;
    const keys = byKeys(e);
    let p; try { p = Quiz.reviewSheet(list, 'Missed this run'); } catch (err) { p = null; }
    studyOpen = true; studyAt = performance.now(); dropFocus();
    const done = () => {
      studyOpen = false;
      if (current !== 'results') return;
      resultsAt = performance.now() - 550; portKick();       // a blink, so a held Enter does not fire the button under it
      if (U.isTouch()) return;
      const t = keys && b && b.isConnected ? b : document.getElementById('mt-again');
      if (t) t.focus({ preventScroll: true });
    };
    Promise.resolve(p).then(done, done);
  }

  /* the report card. When Quiz can drill, the whole card is one button: tap = Quick Review.
     still = an in-place refresh, so an unchanged bar does not re-grow */
  function readyCard(r, from, still) {
    const p = r.overall, f = from == null ? p : U.clamp(from, 0, 100), same = f === p;
    const go = canDrill(), weak = weakLeft(r), all = r.total > 0 && (weak === 0 || (weak == null && p >= 100));
    const pctEl = U.el('span', { class: 'display mt-ready-pct num ' + (p > 0 ? lvClass(p) : ''), text: p + '%' });
    if (!same) tweenNum(pctEl, f, p, 800, (v) => v + '%');
    const head = U.el('span', { class: 'mt-ready-head' }, U.el('span', { class: 'mt-ready-title grow', text: 'Quiz Readiness' }), pctEl);
    const meter = bar(p, 'mt-bar-big' + (still && same ? '' : ' mt-shine'), same ? (still ? p : Math.max(0, p - 12)) : f);
    if (!go) {
      const sub = all ? 'Every fact mastered. You are ready!' : r.total ? r.mastered + ' of ' + r.total + ' facts mastered' : 'How much of the study guide you know';
      return U.el('section', { class: 'paper mt-ready', 'aria-label': 'Quiz readiness: ' + p + ' percent' }, head, meter, U.el('span', { class: 'mt-ready-sub', text: sub }));
    }
    const say = all ? 'All ' + r.total + ' facts mastered. Tap to stay sharp.' : 'Quick review: 10 questions on your weak spots';
    const line = U.el('span', { class: 'mt-ready-go' },
      all ? U.el('span', { class: 't', text: say })
          : U.el('span', { class: 't' }, U.el('b', { text: 'Quick review:' }), U.el('span', { class: 'l', text: ' 10 questions on your weak spots' }), U.el('span', { class: 's', text: ' 10 of your weak spots' })),
      chevron());
    return tap('paper mt-ready mt-pbtn', [head, meter, line], openDrill, { id: 'mt-drill', 'aria-label': 'Quiz readiness: ' + p + ' percent. ' + say });
  }
  function dangerStepper() {
    const val = U.el('b', { class: 'num' }), note = U.el('span');
    const dn = btn('−', 'small', () => { M.danger = Math.max(0, M.danger - 1); Save.commit(); sync(); }, { 'aria-label': 'Lower danger' });
    const up = btn('+', 'small', () => { M.danger = Math.min(M.maxDanger, M.danger + 1); Save.commit(); sync(); }, { 'aria-label': 'Raise danger' });
    const box = U.el('div', { class: 'mt-danger' });
    function sync() {
      const on = M.danger > 0;
      box.classList.toggle('is-zero', !on);
      val.textContent = on ? 'Danger +' + M.danger : 'Normal difficulty';
      note.textContent = on ? 'Tougher monsters, more coins' : 'Raise the danger for more coins';
      if (M.danger <= 0) dn.setAttribute('disabled', ''); else dn.removeAttribute('disabled');
      if (M.danger >= M.maxDanger) up.setAttribute('disabled', ''); else up.removeAttribute('disabled');
    }
    box.append(dn, U.el('div', { class: 'v' }, U.el('div', { class: 'r' }, ico('flame', 18), val), note), up);
    sync();
    return box;
  }
  function showTitle() {
    if (!M) init();
    const r = readiness(), c = charById(M.char);
    const earned = ACH.filter((a) => M.ach[a.id]).length;
    const hs = (lastHeroSize = heroSize());
    const plate = tap('mt-plate', [
      U.el('span', { class: 'mt-plate-hero' }, heroCanvas(c, [Math.round(hs * 1.5), hs], { moving: true })),
      U.el('span', { class: 'mt-plate-bar' },
        U.el('span', { class: 't' }, U.el('b', { text: c.name }), U.el('span', { class: 'w' }, ico(c.startWeapon, 16), U.el('span', { text: WEAPONS[c.startWeapon] }))),
        U.el('span', { class: 'go' }, ico('swap', 16), U.el('span', { text: 'Change' })))],
      showChars, { 'aria-label': 'Character: ' + c.name + '. Change character', dataset: { nav: 'chars' } });
    plate.style.setProperty('--hs', hs + 'px');
    const tile3 = (icon, label, fn, nav) => btn([U.el('span', { class: 'ic' }, ico(icon, 30)), U.el('span', { class: 'lb', text: label })], 'mt-tile3', fn, { dataset: { nav } });
    const from = shownReady == null ? null : shownReady; shownReady = r.overall;
    const still = current === 'title';                   // refreshing in place (e.g. after a Quick Review)
    const wrap = U.el('div', { class: 'wrap' },
      U.el('div', { class: 'mt-top' }, walletEl(),
        U.el('div', { class: 'mt-top-r' },
          btn([ico('trophy', 22), U.el('span', { class: 'mt-sr', text: 'Awards ' }), U.el('span', { class: 'num mt-count', text: earned + '/' + ACH.length })], 'small mt-topbtn', showAchievements, { 'aria-label': 'Awards: ' + earned + ' of ' + ACH.length + ' earned', title: 'Awards', dataset: { nav: 'awards' } }),
          btn([ico('gear', 22), U.el('span', { class: 'mt-sr', text: 'Settings' })], 'small mt-topbtn', showSettings, { 'aria-label': 'Settings', title: 'Settings', dataset: { nav: 'settings' } }))),
      U.el('div', { class: 'mt-stage' }, wordmark(), plate),
      U.el('div', { class: 'mt-deck' },
        btn('PLAY', 'primary big mt-play', startRun, { id: 'mt-play' }),
        M.maxDanger > 0 ? dangerStepper() : null,
        readyCard(r, from, still),
        U.el('div', { class: 'mt-menu' },
          tile3('shop', 'Upgrades', () => showShop(showTitle), 'shop'),
          tile3('pencil', 'Practice Test', openPractice, 'practice'),
          tile3('book', 'Study Notes', openCodex, 'codex'))));
    mount(U.el('div', { class: 'screen mt-title' }, wrap), 'title', null);
    music('menu');
    if (from != null && from < 100 && r.overall >= 100) setTimeout(confetti, 300);
    if (!M.seenHelp) { M.seenHelp = true; Save.commit(); showHelp(); }
  }
  function afterLearning() { checkAll(false); if (current === 'title' || current === null) showTitle(); }
  function openPractice() {
    if (!(window.Quiz && Quiz.practiceTest)) { sfx('error'); toast('The Practice Test is not loaded.', { kind: 'bad' }); return; }
    let p; try { p = Quiz.practiceTest(); } catch (e) { p = null; }
    dropFocus();
    Promise.resolve(p).then(afterLearning, afterLearning);
  }
  function openCodex() {
    if (!(window.Quiz && Quiz.openCodex)) { sfx('error'); toast('The Study Notes are not loaded.', { kind: 'bad' }); return; }
    let p; try { p = Quiz.openCodex(); } catch (e) { p = null; }
    dropFocus();
    Promise.resolve(p).then(afterLearning, afterLearning);
  }

  /* --------------------------------------------------------------- HOW TO PLAY */
  function closeHelp() {
    if (!helpVeil) return;
    const r = root(), under = r ? r.querySelector('.screen') : null, back = helpFrom;
    helpVeil.remove(); helpVeil = null; helpFrom = null;
    if (under) { under.inert = false; under.removeAttribute('aria-hidden'); }
    coverSync();
    const t = back && back.isConnected ? back : document.getElementById('mt-play') || under;
    if (t && (keysLast || !U.isTouch())) { try { t.focus({ preventScroll: true }); } catch (e) {} }
  }
  function showHelp() {
    if (helpVeil) return;
    navFrom = null;
    const rows = [
      ['person', 'Move', U.isTouch() ? 'Drag anywhere on the screen to move. Keyboard: WASD or the arrow keys.' : 'Use WASD or the arrow keys to move.'],
      ['bolt', 'Fight', 'Your weapons fire by themselves. Just keep moving and do not get cornered.'],
      ['xp', 'Level up', 'Grab the gems monsters drop to level up.'],
      ['pencil', 'Answer', 'Every level-up asks one study-guide question. Get it right and you pick your upgrade.'],
      ['trophy', 'Win', 'Open chests for bonus rounds, beat the 5 bosses (M‑A‑I‑N, then the Spark) and spend coins on permanent upgrades.'],
    ];
    const ok = btn('Got it', 'primary big', closeHelp);
    helpVeil = U.el('div', { class: 'veil mt-help' },
      U.el('div', { class: 'modal paper pop-in', role: 'dialog', 'aria-label': 'How to play' },
        U.el('div', { class: 'eyebrow', text: 'Mission briefing' }),
        U.el('h2', { class: 'display mt-h2', text: 'How to play' }),
        U.el('ol', { class: 'mt-howto' }, rows.map(([ic, tag, text]) => U.el('li', null, U.el('span', { class: 'mt-how-ic' }, ico(ic, 26)), U.el('span', { class: 'mt-how-t' }, U.el('b', { class: 'mt-tag', text: tag }), U.el('span', { text }))))),
        U.el('div', { class: 'row mt-center' }, ok)));
    const under = root().querySelector('.screen'), a = document.activeElement;
    helpFrom = a && under && under.contains(a) && a !== under ? a : null;
    root().appendChild(helpVeil);
    if (under) { under.inert = true; under.setAttribute('aria-hidden', 'true'); }   // nothing behind the briefing can be reached
    coverSync();
    const modal = helpVeil.firstElementChild; modal.setAttribute('tabindex', '-1');
    try { (keysLast || !U.isTouch() ? ok : modal).focus({ preventScroll: true }); } catch (e) {}
  }

  /* --------------------------------------------------------------- AGENTS (characters) */
  function showChars(focusId) {
    const c = ctx();
    let focus = charById(typeof focusId === 'string' ? focusId : M.char);
    const big = U.clamp(Math.round((window.innerHeight || 720) * 0.185), 108, 176);
    const detail = U.el('section', { class: 'mt-cd', 'aria-live': 'polite' });
    const roster = U.el('div', { class: 'mt-roster' });
    const tabs = {};
    function renderDetail(animate) {
      const ch = focus, owned = !!M.chars[ch.id], sel = M.char === ch.id;
      let action;
      if (sel) action = U.el('div', { class: 'mt-state sel' }, ico('check', 18), U.el('span', { text: 'Selected' }));
      else if (owned) action = btn('Select', 'primary big', () => { M.char = ch.id; Save.commit(); sfx('select'); showTitle(); }, { dataset: { quiet: '1' } });
      else if (ch.unlock.type === 'coins') {
        action = btn([U.el('span', { text: 'Unlock' }), coinTag(ch.unlock.cost)], 'big ' + (M.coins >= ch.unlock.cost ? 'primary' : 'mt-cant'), () => {
          if (M.coins < ch.unlock.cost) { sfx('error'); shake(detail); toast('You need ' + fmt(ch.unlock.cost - M.coins) + ' more coins.', { kind: 'bad', ms: 1600 }); return; }
          M.coins -= ch.unlock.cost; M.chars[ch.id] = true; M.char = ch.id; Save.commit(); sfx('buy');
          toast('<b>' + U.esc(ch.name) + '</b> joined your squad!', { kind: 'good', now: true });
          checkAll(false); showChars(ch.id); refreshWallets(true);
        }, { dataset: { quiet: '1' } });
      } else action = U.el('div', { class: 'mt-state lock' }, ico('lock', 20), U.el('span', { class: 'grow' }, U.el('b', { text: ch.unlock.text }), U.el('span', { text: featProgress(ch.unlock.feat, c) })));
      detail.className = 'mt-cd' + (owned ? '' : ' is-locked');
      detail.style.setProperty('--kc', ch.color);
      detail.replaceChildren(
        U.el('div', { class: 'mt-cd-stage' }, heroCanvas(ch, [Math.round(big * 2), big], { moving: owned, live: owned }), owned ? null : U.el('span', { class: 'mt-cd-lock' }, ico('lock', 22))),
        U.el('div', { class: 'mt-cd-id' },
          U.el('h2', { class: 'display mt-cd-name', text: ch.name }),
          U.el('div', { class: 'mt-char-tag' }, ch.keyName ? U.el('span', { class: 'pill ' + ch.key, text: ch.keyName }) : null, U.el('span', { class: 'mute', text: ch.title })),
          U.el('div', { class: 'mt-mods' }, modChips(ch.mods))),
        U.el('p', { class: 'mt-card-desc', text: ch.desc }),
        U.el('div', { class: 'mt-weapon' }, U.el('span', { class: 'mt-weapon-ic' }, ico(ch.startWeapon, 30)),
          U.el('div', { class: 'grow' }, U.el('b', { text: WEAPONS[ch.startWeapon] }), U.el('span', { class: 'mute', text: 'Starts with it: ' + WEAPON_HOW[ch.startWeapon] }))),
        U.el('div', { class: 'mt-card-foot' }, action));
      if (animate) replay(detail, 'mt-swap');
      for (const id in tabs) tabs[id].setAttribute('aria-pressed', id === ch.id ? 'true' : 'false');
    }
    CHARS.forEach((ch) => {
      const owned = !!M.chars[ch.id], sel = M.char === ch.id;
      const b = tap('mt-rb' + (owned ? '' : ' is-locked') + (sel ? ' is-sel' : ''), [
        heroCanvas(ch, [88, 60], { live: false }),
        sel ? U.el('span', { class: 'mt-rb-badge sel' }, ico('check', 14)) : owned ? null : U.el('span', { class: 'mt-rb-badge' }, ico('lock', 14))],
        () => { if (focus === ch) return; focus = ch; renderDetail(true); },
        { 'aria-label': ch.name + (sel ? ', selected' : owned ? '' : ', locked'), 'aria-pressed': 'false', title: ch.name });
      b.style.setProperty('--kc', ch.color);
      tabs[ch.id] = b; roster.appendChild(b);
    });
    renderDetail(false);
    subScreen('chars', 'Agents', showTitle, U.el('div', { class: 'mt-chars-body' }, detail, roster));
  }

  /* --------------------------------------------------------------- SHOP */
  function showShop(back, keep) {
    const prevBack = back || backFn || showTitle;
    const grid = U.el('div', { class: 'mt-shopgrid' });
    function card(t, popped) {
      const l = U.clamp(n0(M.up[t.id]) | 0, 0, t.max), maxed = l >= t.max, cost = maxed ? 0 : t.costs[l], can = M.coins >= cost;
      const pips = U.el('div', { class: 'mt-pips', role: 'img', 'aria-label': 'Level ' + l + ' of ' + t.max });
      for (let i = 0; i < t.max; i++) pips.appendChild(U.el('i', { class: (i < l ? 'on' : '') + (popped && i === l - 1 ? ' new' : '') }));
      const el = U.el('article', { class: 'mt-card mt-up' + (maxed ? ' is-max' : '') + (popped ? ' mt-pop' : '') });
      const action = maxed ? U.el('div', { class: 'mt-state sel' }, ico('check', 16), U.el('span', { text: 'Max' }))
        : btn([U.el('span', { class: 'bl', text: 'Buy' }), coinTag(cost)], 'mt-buy ' + (can ? 'primary' : 'mt-cant'), () => {
          if (M.coins < cost) { sfx('error'); shake(el); toast('You need ' + fmt(cost - M.coins) + ' more coins.', { kind: 'bad', ms: 1600 }); return; }
          M.coins -= cost; M.up[t.id] = l + 1; Save.commit(); sfx('buy');
          checkAll(false);
          render(t.id); refreshWallets();
        }, { dataset: { quiet: '1', up: t.id }, 'aria-label': 'Buy ' + t.name + ' level ' + (l + 1) + ' for ' + cost + ' coins' });
      el.append(
        U.el('div', { class: 'mt-up-ic' }, ico(t.id, 38)),
        U.el('div', { class: 'mt-up-main' },
          U.el('h2', { class: 'mt-card-name', text: t.name }),
          pips,
          U.el('div', { class: 'mt-effect num' }, maxed ? U.el('b', { text: t.label(l) }) : [l ? U.el('span', { class: 'now', text: t.label(l) }) : null, l ? U.el('span', { class: 'arrow', 'aria-hidden': 'true', text: '›' }) : null, U.el('b', { text: t.label(l + 1) })]),
          U.el('p', { class: 'mt-card-desc', text: t.desc })),
        action);
      return el;
    }
    function render(poppedId) {
      grid.replaceChildren.apply(grid, SHOP.map((t) => card(t, t.id === poppedId)));
      if (poppedId && !U.isTouch()) { const b = grid.querySelector('[data-up="' + poppedId + '"]'); if (b) b.focus({ preventScroll: true }); }
    }
    render(null);
    const sc = subScreen('shop', 'Upgrades', prevBack, grid);
    if (keep && keep.top) sc.scrollTop = keep.top;
  }

  /* --------------------------------------------------------------- AWARDS (achievements) */
  function showAchievements() {
    const c = ctx();
    const done = ACH.filter((a) => M.ach[a.id]).length;
    const row = (a) => {
      const got = !!M.ach[a.id], p = a.prog(c), cur = Math.min(Math.max(0, Math.round(p[0])), p[1]);
      return U.el('article', { class: 'mt-ach' + (got ? ' is-done' : '') },
        U.el('span', { class: 'mt-ach-ic' }, ico(a.ic || 'medal', 30)),
        U.el('div', { class: 'mt-ach-main' },
          U.el('h2', { class: 'mt-card-name', text: a.name }),
          U.el('p', { class: 'mt-card-desc', text: a.desc }),
          got ? null : U.el('div', { class: 'mt-ach-prog' }, bar(p[1] ? (cur / p[1]) * 100 : 0), U.el('span', { class: 'num', text: fmt(cur) + ' / ' + fmt(p[1]) + (a.unit || '') }))),
        got ? U.el('span', { class: 'mt-ach-got' }, ico('check', 18)) : coinTag(a.coins, '+'));
    };
    const section = (title, list) => U.el('section', { class: 'col' }, U.el('h2', { class: 'eyebrow mt-sec', text: title }), U.el('div', { class: 'mt-achgrid' }, list.map(row)));
    const body = U.el('div', { class: 'col' },
      U.el('div', { class: 'mt-ach-sum' }, U.el('span', { class: 'mt-ach-sum-ic' }, ico('trophy', 34)),
        U.el('div', { class: 'grow' }, U.el('b', { class: 'num', text: done + ' of ' + ACH.length + ' earned' }), bar((done / ACH.length) * 100, 'mt-shine'))),
      section('For knowing your stuff', ACH.filter((a) => a.learn)),
      section('For playing well', ACH.filter((a) => !a.learn)));
    subScreen('awards', 'Awards', showTitle, body);
  }

  /* --------------------------------------------------------------- STATS */
  function tile(label, value, icon) { return U.el('div', { class: 'mt-tile' }, icon ? ico(icon, 22) : null, U.el('b', { class: 'num', text: String(value) }), U.el('span', { text: label })); }
  function showStats(back) {
    const c = ctx(), st = c.st, q = c.q, r = readiness();
    const body = U.el('div', { class: 'col' },
      U.el('section', { class: 'col' }, U.el('h2', { class: 'eyebrow mt-sec', text: 'Your brain' }),
        U.el('div', { class: 'mt-tiles c5' },
          tile('Quiz Readiness', r.overall + '%'), tile('Facts mastered', r.total ? r.mastered + ' / ' + r.total : '0'), tile('Questions answered', fmt(q.asked)), tile('Answered right', fmt(q.correct)),
          tile('Accuracy', q.accuracy + '%'), tile('Streak right now', fmt(q.streak)), tile('Best streak', fmt(q.bestStreak)),
          tile('Best Practice Test', q.practiceCount ? q.practiceBest + '%' : 'None yet'), tile('Practice Tests taken', fmt(q.practiceCount)), tile('Perfect bonus rounds', fmt(q.bonusPerfect)))),
      U.el('section', { class: 'col' }, U.el('h2', { class: 'eyebrow mt-sec', text: 'Your runs' }),
        U.el('div', { class: 'mt-tiles c6' },
          tile('Runs played', fmt(st.runs)), tile('Wins', fmt(st.wins)), tile('Furthest act', st.bestAct ? st.bestAct + ' · ' + ACT_NAMES[U.clamp(st.bestAct, 1, 5)] : 'None yet'),
          tile('Longest run', U.fmtTime(st.bestTime)), tile('Highest level', fmt(st.bestLevel)), tile('Best score', fmt(st.bestScore)),
          tile('Monsters defeated', fmt(st.kills)), tile('Bosses defeated', fmt(st.bossKills)), tile('Time played', fmtDur(st.playSeconds)),
          tile('Coins earned, all time', fmt(M.totalCoins)), tile('Highest danger unlocked', '+' + M.maxDanger),
          tile('Awards', ACH.filter((a) => M.ach[a.id]).length + ' / ' + ACH.length))));
    subScreen('stats', 'Stats', typeof back === 'function' ? back : showTitle, body, { noWallet: true });
  }

  /* --------------------------------------------------------------- SETTINGS (also the way to Stats and How to Play) */
  function showSettings() {
    const S = Save.ns('settings', { music: 0.55, sfx: 0.8, muted: false, shake: true, dmgNumbers: true });
    const slider = (id, label, val, on) => {
      const out = U.el('span', { class: 'num mt-set-val', text: Math.round(val * 100) + '%' });
      const inp = U.el('input', { id, type: 'range', min: 0, max: 100, step: 5, value: Math.round(val * 100), class: 'mt-range' });
      const paint = () => inp.style.setProperty('--v', inp.value + '%');
      inp.addEventListener('input', () => { const v = U.clamp(+inp.value / 100, 0, 1); out.textContent = Math.round(v * 100) + '%'; paint(); on(v, false); });
      inp.addEventListener('change', () => on(U.clamp(+inp.value / 100, 0, 1), true));
      paint();
      return U.el('div', { class: 'mt-set-row' }, U.el('label', { for: id, text: label }), inp, out);
    };
    const toggle = (id, label, val, on, hint) => {
      const b = U.el('button', { id, type: 'button', class: 'mt-switch', role: 'switch', 'aria-checked': val ? 'true' : 'false', 'aria-label': label }, U.el('i'));
      b.addEventListener('click', () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', v ? 'true' : 'false'); on(v); sfx('click'); });
      return U.el('div', { class: 'mt-set-row' }, U.el('div', { class: 'grow' }, U.el('label', { for: id, text: label }), hint ? U.el('div', { class: 'mt-hint mute', text: hint }) : null), b);
    };
    const nav = (icon, label, fn, id) => btn([ico(icon, 24), U.el('span', { class: 'grow', text: label }), U.el('span', { class: 'mt-chev', 'aria-hidden': 'true', text: '›' })], 'mt-nav', fn, { id, dataset: { nav: id } });
    const confirmRow = U.el('div', { class: 'mt-confirm', hidden: true },
      U.el('p', { text: 'This erases your coins, upgrades, characters, awards AND your Quiz Readiness. It can not be undone.' }),
      U.el('div', { class: 'row' },
        btn('Yes, erase everything', 'danger', () => {
          Save.reset();
          try { location.reload(); } catch (e) {}
          setTimeout(() => { M = null; shownReady = null; try { window.Quiz && Quiz.init && Quiz.init(); } catch (e) {} init(); showTitle(); toast('Progress erased.', { ms: 1800, now: true }); }, 600);
        }, { id: 'mt-reset-yes' }),
        btn('Keep my progress', '', () => { confirmRow.hidden = true; resetBtn.hidden = false; })));
    const resetBtn = btn('Reset all progress', 'small ghost mt-reset', () => { confirmRow.hidden = false; resetBtn.hidden = true; }, { id: 'mt-reset' });
    const body = U.el('div', { class: 'col mt-set' },
      U.el('div', { class: 'mt-navs' }, nav('chart', 'Stats', () => showStats(showSettings), 'mt-nav-stats'), nav('help', 'How to Play', showHelp, 'mt-nav-help')),
      U.el('section', { class: 'panel col' }, U.el('h2', { class: 'eyebrow mt-sec', text: 'Sound' }),
        slider('mt-set-music', 'Music', n0(S.music), (v) => { S.music = v; Save.commit(); audio('setMusicVolume', v); }),
        slider('mt-set-sfx', 'Sound effects', n0(S.sfx), (v, done) => { S.sfx = v; Save.commit(); audio('setSfxVolume', v); if (done) sfx('coin'); }),
        toggle('mt-set-mute', 'Mute everything', !!S.muted, (v) => { S.muted = v; Save.commit(); audio('setMuted', v); })),
      U.el('section', { class: 'panel col' }, U.el('h2', { class: 'eyebrow mt-sec', text: 'Game feel' }),
        toggle('mt-set-shake', 'Screen shake', S.shake !== false, (v) => { S.shake = v; Save.commit(); }, 'The screen rumbles on big hits.'),
        toggle('mt-set-dmg', 'Damage numbers', S.dmgNumbers !== false, (v) => { S.dmgNumbers = v; Save.commit(); }, 'Numbers pop out of monsters when you hit them.')),
      U.el('section', { class: 'panel col' }, U.el('h2', { class: 'eyebrow mt-sec', text: 'Start over' }), resetBtn, confirmRow));
    subScreen('settings', 'Settings', showTitle, body, { noWallet: true });
  }

  /* --------------------------------------------------------------- RESULTS */
  function countUp(el, to, ms) {
    if (to <= 0 || calm()) { el.textContent = '+' + fmt(Math.max(0, to)); return; }
    const t0 = performance.now(); let last = 0;
    (function step(now) {
      const k = Math.min(1, Math.max(0, (now - t0) / ms)), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
      el.textContent = '+' + fmt(v);
      if (k < 1 && now - last > 95) { last = now; sfx('coin', { vol: 0.45, pitch: 1 + k * 0.6 }); }
      if (k < 1 && (el.isConnected || now - t0 < 200)) requestAnimationFrame(step);
    })(t0);
  }
  function actMedals(act, win) {
    return U.el('div', { class: 'mt-acts', role: 'img', 'aria-label': win ? 'All five acts cleared' : 'Reached act ' + act + ' of 5: ' + ACT_NAMES[act] },
      [1, 2, 3, 4, 5].map((i) => U.el('span', { class: 'mt-actm k-' + ACT_KEYS[i] + (win || i < act ? ' done' : i === act ? ' now' : '') }, ico(ACT_MEDAL[i], 34))));
  }
  function showResults(s, x) {
    const win = !!s.won, act = U.clamp(n0(s.act) | 0 || 1, 1, 5), answered = n0(s.correct) + n0(s.wrong);
    const hero = CHARS.find((c) => c.id === s.charId) || charById(M.char);
    const head = U.el('header', { class: 'mt-res-head ' + (win ? 'win' : 'loss') },
      win || x.best ? U.el('div', { class: 'stamp', text: win ? (s.endless ? 'Endless run' : 'Victory') : 'New best run' }) : null,   // the act is said once, under the medals
      U.el('h1', { class: 'display mt-res-title', text: win ? 'POWDER KEG DEFUSED' : 'RUN OVER' }),
      U.el('div', { class: 'mt-res-hero' }, heroCanvas(hero, [174, 116], { moving: win })),
      actMedals(act, win),
      win ? U.el('p', { class: 'mt-res-sub', text: 'You beat Militarism, Alliances, Imperialism, Nationalism and the Spark' + (s.danger ? ' on Danger +' + s.danger : '') + '.' })
          : U.el('p', { class: 'mt-res-sub' }, 'You made it to ', U.el('span', { class: 'pill ' + ACT_KEYS[act], text: 'Act ' + act + ' · ' + ACT_NAMES[act] })));
    const coinsEl = U.el('b', { class: 'display num mt-res-coins', text: '+0' });
    const achCoins = x.ach.reduce((t, a) => t + a.coins, 0);
    const coinBox = U.el('section', { class: 'mt-res-coinbox' },
      U.el('div', { class: 'grow' }, U.el('div', { class: 'eyebrow', text: 'Coins earned' }),
        U.el('div', { class: 'mt-res-coinrow' }, ico('coin', 34), coinsEl),
        achCoins ? U.el('div', { class: 'mute num mt-res-extra', text: '+' + fmt(achCoins) + ' more from awards' }) : null),
      U.el('div', { class: 'mt-res-wallet' }, U.el('span', { class: 'eyebrow', text: 'Wallet' }), walletEl()));
    const delta = x.readyAfter - x.readyBefore;
    const readyPct = U.el('div', { class: 'display mt-ready-pct num ' + (x.readyAfter > 0 ? lvClass(x.readyAfter) : ''), text: x.readyAfter + '%' });
    if (delta > 0) tweenNum(readyPct, x.readyBefore, x.readyAfter, 900, (v) => v + '%');
    const readyBox = U.el('section', { class: 'paper mt-res-ready' },
      U.el('div', { class: 'mt-ready-head' },
        U.el('div', { class: 'grow' }, U.el('div', { class: 'mt-ready-title', text: 'Quiz Readiness' }),
          U.el('div', { class: 'mt-ready-sub', text: delta > 0 ? 'Up ' + delta + ' points this run. Keep going!' : x.readyAfter >= 100 ? 'Every fact mastered. You are ready!' : 'Answer more questions right to push this up.' })),
        readyPct),
      bar(x.readyAfter, 'mt-bar-big mt-shine', x.readyBefore));
    /* one quiet row: what he got wrong in this run, opened as a sheet */
    const misses = canSheet() && Array.isArray(x.misses) ? x.misses : [];
    const missRow = misses.length ? tap('paper mt-pbtn mt-missed', [
      U.el('span', { class: 't' }, 'Review ', U.el('b', { text: misses.length + (misses.length === 1 ? ' question' : ' questions') }), ' you missed'), chevron()],
      (e, b) => openMissed(misses, e, b), { id: 'mt-missed' }) : null;
    const news = [];
    if (x.newDanger) news.push(U.el('li', { class: 'danger' }, U.el('span', { class: 'mt-news-ic' }, ico('flame', 28)), U.el('div', { class: 'grow' }, U.el('b', { text: 'Danger +' + M.maxDanger + ' unlocked' }), U.el('span', { text: 'Tougher monsters, bigger coin payouts. Set it on the title screen.' }))));
    x.chars.forEach((c) => news.push(U.el('li', { class: 'char' }, U.el('span', { class: 'mt-news-ic' }, heroCanvas(c, 40, { live: false })), U.el('div', { class: 'grow' }, U.el('b', { text: 'New agent: ' + c.name }), U.el('span', { text: 'Starts with ' + WEAPONS[c.startWeapon] + '.' })))));
    x.ach.forEach((a) => news.push(U.el('li', null, U.el('span', { class: 'mt-news-ic' }, ico(a.ic || 'medal', 28)), U.el('div', { class: 'grow' }, U.el('b', { text: a.name }), U.el('span', { text: a.desc })), coinTag(a.coins, '+'))));
    news.forEach((li, i) => li.style.setProperty('--i', String(Math.min(i, 8))));
    /* the first 0.8 s belong to whoever was still mashing keys or the screen when the run ended */
    const settled = (fn) => () => { if (performance.now() - resultsAt < 800) return; sfx('click'); fn(); };
    const again = btn('Play Again', 'primary', settled(startRun), { id: 'mt-again', dataset: { quiet: '1' } });
    const wrap = U.el('div', { class: 'wrap' }, U.el('div', { class: 'mt-res-cols' }, head, U.el('div', { class: 'mt-res-r' },
      U.el('div', { class: 'mt-tiles mt-res-tiles' },
        tile('Time', U.fmtTime(n0(s.time)), 'clock'), tile('Monsters', fmt(s.kills), 'skull'),
        tile('Answers right', answered ? fmt(s.correct) + '/' + fmt(answered) : '0', 'check'), tile('Score', fmt(s.score), 'star')),
      U.el('details', { class: 'mt-more' }, U.el('summary', { text: 'More from this run' }),
        U.el('div', { class: 'mt-tiles mt-res-tiles' },
          tile('Level', fmt(s.level)), tile('Bosses beaten', fmt(s.bossKills)), tile('Best streak', fmt(s.bestStreak)), tile('Damage taken', fmt(s.damageTaken)))),
      coinBox, readyBox, missRow,
      news.length ? U.el('section', { class: 'col' }, U.el('h2', { class: 'eyebrow mt-sec', text: 'New this run' }), U.el('ul', { class: 'mt-news' }, news)) : null)),
      U.el('div', { class: 'mt-res-actions' }, again,
        btn('Upgrades', '', settled(() => showShop(() => showResults(s, x))), { dataset: { quiet: '1', nav: 'shop' } }),
        btn('Menu', '', settled(showTitle), { dataset: { quiet: '1' } })));
    const sc = U.el('div', { class: 'screen mt-sub mt-results ' + (win ? 'is-win' : 'is-loss') }, wrap);
    mount(sc, 'results', showTitle);
    const hold = x.fresh ? 800 : 250;                    // straight after a run: 0.8 s; back from the shop: a blink
    resultsAt = performance.now() - (800 - hold);
    if (x.fresh) {
      countUp(coinsEl, x.coins, 900);
      if (win || (x.readyBefore < 100 && x.readyAfter >= 100)) setTimeout(confetti, 250);
      x.fresh = false;                                   // coming back from the shop: no second celebration
    } else coinsEl.textContent = '+' + fmt(x.coins);
    shownReady = x.readyAfter;
    if (!U.isTouch()) setTimeout(() => {
      const a = document.activeElement;
      if (current === 'results' && again.isConnected && !covered() && (!a || a === document.body || a === sc)) again.focus({ preventScroll: true });
    }, hold + 40);
  }
  function onRunEnd(summary) {
    if (!M) init();
    const s = Object.assign({ won: false, endless: false, act: 1, time: 0, kills: 0, level: 1, coins: 0, correct: 0, wrong: 0, bestStreak: 0, bossKills: 0,
      bonusPerfect: 0, revived: false, charId: M.char, danger: M.danger, damageTaken: 0, weapons: [], score: 0 }, summary || {});
    const st = M.stats;
    const best = n0(st.runs) > 0 && n0(s.score) > n0(st.bestScore);     // beat your own record (not on the very first run)
    st.runs = n0(st.runs) + 1; if (s.won) st.wins = n0(st.wins) + 1;
    st.kills = n0(st.kills) + n0(s.kills); st.bossKills = n0(st.bossKills) + n0(s.bossKills);
    st.playSeconds = n0(st.playSeconds) + n0(s.time);
    st.bestTime = Math.max(n0(st.bestTime), n0(s.time)); st.bestAct = Math.max(n0(st.bestAct), U.clamp(n0(s.act) | 0, 0, 5));
    st.bestLevel = Math.max(n0(st.bestLevel), n0(s.level)); st.bestScore = Math.max(n0(st.bestScore), n0(s.score));
    st.bestKills = Math.max(n0(st.bestKills), n0(s.kills));
    if (s.won) st.bestWinDanger = Math.max(typeof st.bestWinDanger === 'number' ? st.bestWinDanger : -1, n0(s.danger));
    const coins = Math.max(0, Math.round(n0(s.coins)));
    M.coins += coins; M.totalCoins += coins;
    let newDanger = false;
    if (s.won && n0(s.danger) >= M.maxDanger && M.maxDanger < MAX_DANGER) { M.maxDanger = Math.min(MAX_DANGER, (n0(s.danger) | 0) + 1); newDanger = true; }
    const got = checkAll(true);                  // silent: the results screen lists everything new
    if (got.ach.length || got.chars.length || newDanger) setTimeout(() => sfx('unlock'), 700);
    Save.commit(); if (Save.flush) Save.flush();
    const after = readiness().overall;
    showResults(s, { coins, ach: got.ach, chars: got.chars, newDanger, readyBefore: readyBefore == null ? after : Math.min(readyBefore, after), readyAfter: after, best, misses: runMisses(), fresh: true });
    readyBefore = null;
  }

  /* --------------------------------------------------------------- keys + init */
  function onKey(e) {
    if (!current || e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (quizBusy() || studyBusy() || gameOn()) return;      // strict on purpose: also between two question cards
    const k = e.key, a = document.activeElement;
    const onControl = a && a !== document.body && /^(BUTTON|INPUT|TEXTAREA|SELECT|A|SUMMARY)$/.test(a.tagName) && a.isConnected;
    if (k === 'Escape') {
      if (helpVeil) { closeHelp(); e.preventDefault(); }
      else if (current !== 'title') { sfx('click'); goBack(); e.preventDefault(); }
      return;
    }
    if (k !== 'Enter' && k !== ' ' && k !== 'Spacebar') return;
    if (onControl) return;                      // let the focused button handle its own Enter/Space
    if (helpVeil) { closeHelp(); e.preventDefault(); return; }
    if (current === 'title') { e.preventDefault(); sfx('click'); startRun(); }
    else if (current === 'results' && performance.now() - resultsAt > 800) { e.preventDefault(); sfx('click'); startRun(); }
  }
  let rsT = 0;
  function onResize() {
    clearTimeout(rsT);
    /* not behind an open question card: the title refreshes (and shows the readiness change) when that closes */
    rsT = setTimeout(() => { if (current === 'title' && !helpVeil && !gameOn() && !covered() && Math.abs(heroSize() - lastHeroSize) > 10) showTitle(); }, 250);
  }
  function init() {
    M = Save.ns('meta', { coins: 0, totalCoins: 0, up: {}, chars: { cadet: true }, char: 'cadet', ach: {}, danger: 0, maxDanger: 0, seenHelp: false,
      stats: { runs: 0, wins: 0, kills: 0, bossKills: 0, bestTime: 0, bestAct: 0, bestLevel: 0, playSeconds: 0, bestScore: 0 } });
    /* repair anything odd in an old or hand-edited save */
    M.coins = Math.max(0, Math.round(n0(M.coins))); M.totalCoins = Math.max(0, Math.round(n0(M.totalCoins)));
    ['up', 'chars', 'ach', 'stats'].forEach((k) => { if (!M[k] || typeof M[k] !== 'object') M[k] = {}; });
    STAT_KEYS.forEach((k) => { M.stats[k] = n0(M.stats[k]); });
    M.chars.cadet = true;
    if (!M.chars[M.char] || !CHARS.some((c) => c.id === M.char)) M.char = 'cadet';
    M.maxDanger = U.clamp(n0(M.maxDanger) | 0, 0, MAX_DANGER); M.danger = U.clamp(n0(M.danger) | 0, 0, M.maxDanger);
    if (!keysOn) {
      keysOn = true; document.addEventListener('keydown', onKey);
      document.addEventListener('keydown', () => { keysLast = true; }, true);
      document.addEventListener('pointerdown', () => { keysLast = false; }, true);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) portKick(); });
      /* Study Notes, the Practice Test and every question card live in #modals: the title stands still under them */
      try { const m = document.getElementById('modals'); if (m && window.MutationObserver) { new MutationObserver(coverSync).observe(m, { childList: true }); PORT.watch = true; } } catch (e) {}
      window.addEventListener('resize', onResize);
    }
    checkAll(false);
    return Meta;
  }

  const Meta = {
    init, showTitle, bonuses, character, onRunEnd, addCoins,
    coins: () => (M ? M.coins : 0),
    /* extras (handy for the lead / debugging) */
    checkAchievements: () => checkAll(false),
    defs: { characters: CHARS, shop: SHOP, achievements: ACH, weapons: WEAPONS },
  };
  window.Meta = Meta;
})();
