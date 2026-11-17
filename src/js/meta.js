/* meta.js — everything between runs: title screen, characters, shop, achievements, stats, settings, results.
   Exposes window.Meta. Talks to Game / Quiz / AudioSys only through guarded calls. */
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

  const C5 = [60, 120, 200, 320, 500];
  const SHOP = [
    { id: 'maxHp', icon: '❤️', name: 'Iron Rations', desc: 'More health, so you survive bigger hits.', max: 5, costs: C5,
      label: (l) => '+' + 10 * l + ' max HP', apply: (b, l) => { b.maxHp += 10 * l; } },
    { id: 'dmgMult', icon: '💥', name: 'Sharper Facts', desc: 'Every weapon hits harder.', max: 5, costs: C5,
      label: (l) => '+' + 6 * l + '% damage', apply: (b, l) => { b.dmgMult *= 1 + 0.06 * l; } },
    { id: 'speedMult', icon: '👟', name: 'Quick Boots', desc: 'Run faster.', max: 5, costs: C5,
      label: (l) => '+' + 4 * l + '% speed', apply: (b, l) => { b.speedMult *= 1 + 0.04 * l; } },
    { id: 'magnetMult', icon: '🧲', name: 'Gem Magnet', desc: 'Pull in gems from farther away.', max: 5, costs: C5,
      label: (l) => '+' + 15 * l + '% pickup range', apply: (b, l) => { b.magnetMult *= 1 + 0.15 * l; } },
    { id: 'xpMult', icon: '📚', name: 'Fast Learner', desc: 'Level up quicker. More questions, more upgrades.', max: 5, costs: C5,
      label: (l) => '+' + 6 * l + '% XP', apply: (b, l) => { b.xpMult *= 1 + 0.06 * l; } },
    { id: 'coinMult', icon: '🪙', name: 'War Chest', desc: 'Earn more coins from every run.', max: 5, costs: C5,
      label: (l) => '+' + 10 * l + '% coins', apply: (b, l) => { b.coinMult *= 1 + 0.10 * l; } },
    { id: 'cooldownMult', icon: '⚡', name: 'Rapid Fire', desc: 'All weapons fire faster.', max: 5, costs: C5,
      label: (l) => Math.round((1 - Math.pow(0.96, l)) * 100) + '% faster firing', apply: (b, l) => { b.cooldownMult *= Math.pow(0.96, l); } },
    { id: 'crit', icon: '🎯', name: 'Lucky Shot', desc: 'More critical hits for big damage.', max: 5, costs: C5,
      label: (l) => '+' + 4 * l + '% crit chance', apply: (b, l) => { b.crit += 0.04 * l; } },
    { id: 'regen', icon: '🩹', name: 'Field Medic', desc: 'Slowly heal all the time.', max: 4, costs: [80, 160, 280, 450],
      label: (l) => '+' + (0.25 * l) + ' HP per second', apply: (b, l) => { b.regen += 0.25 * l; } },
    { id: 'armor', icon: '🛡️', name: 'Steel Plating', desc: 'Every hit hurts a little less.', max: 3, costs: [150, 400, 900],
      label: (l) => '+' + l + ' armor', apply: (b, l) => { b.armor += l; } },
    { id: 'rerolls', icon: '🎲', name: 'Second Opinion', desc: 'Swap your upgrade choices for new ones during a run.', max: 3, costs: [200, 450, 800],
      label: (l) => '+' + l + (l === 1 ? ' reroll' : ' rerolls') + ' per run', apply: (b, l) => { b.rerolls += l; } },
    { id: 'revives', icon: '🕊️', name: 'Extra Life', desc: 'Get back up one more time after you fall.', max: 1, costs: [1200],
      label: (l) => '+' + l + ' revive per run', apply: (b, l) => { b.revives += l; } },
  ];

  /* c = {st, q, r, up, chars}; prog returns [current, target] */
  const ACH = [
    { id: 'first_run', name: 'Reporting for Duty', desc: 'Finish your first run.', coins: 25, prog: (c) => [c.st.runs, 1] },
    { id: 'boss1', name: 'Boss Buster', desc: 'Defeat your first boss.', coins: 50, prog: (c) => [c.st.bossKills, 1] },
    { id: 'act2', name: 'A is for Alliances', desc: 'Reach Act 2: Alliances.', coins: 40, prog: (c) => [c.st.bestAct, 2] },
    { id: 'act3', name: 'I is for Imperialism', desc: 'Reach Act 3: Imperialism.', coins: 60, prog: (c) => [c.st.bestAct, 3] },
    { id: 'act4', name: 'N is for Nationalism', desc: 'Reach Act 4: Nationalism.', coins: 80, prog: (c) => [c.st.bestAct, 4] },
    { id: 'act5', name: 'Lit Fuse', desc: 'Reach Act 5: The Spark.', coins: 120, prog: (c) => [c.st.bestAct, 5] },
    { id: 'win', name: 'Powder Keg Defused', desc: 'Beat the Spark and win a run.', coins: 300, prog: (c) => [c.st.wins, 1] },
    { id: 'win3', name: 'Danger Seeker', desc: 'Win a run on Danger +3 or higher.', coins: 500, prog: (c) => [Math.max(0, c.st.bestWinDanger), 3] },
    { id: 'kills500', name: 'Horde Breaker', desc: 'Defeat 500 monsters in one run.', coins: 100, prog: (c) => [c.st.bestKills, 500] },
    { id: 'kills5000', name: 'Monster Historian', desc: 'Defeat 5,000 monsters in total.', coins: 150, prog: (c) => [c.st.kills, 5000] },
    { id: 'level20', name: 'Fully Loaded', desc: 'Reach level 20 in one run.', coins: 100, prog: (c) => [c.st.bestLevel, 20] },
    { id: 'survive10', name: 'Ten-Minute Hero', desc: 'Survive 10 minutes in one run.', coins: 100, prog: (c) => [Math.floor(c.st.bestTime / 60), 10], unit: ' min' },
    { id: 'shopper', name: 'Upgrade Day', desc: 'Buy 10 permanent upgrades.', coins: 75, prog: (c) => [c.up, 10] },
    { id: 'collector', name: 'Full Squad', desc: 'Unlock all 8 characters.', coins: 300, prog: (c) => [c.chars, CHARS.length] },
    { id: 'correct10', learn: true, name: 'Warm-Up', desc: 'Answer 10 questions correctly.', coins: 25, prog: (c) => [c.q.correct, 10] },
    { id: 'correct50', learn: true, name: 'Sharp Student', desc: 'Answer 50 questions correctly.', coins: 75, prog: (c) => [c.q.correct, 50] },
    { id: 'correct200', learn: true, name: 'History Buff', desc: 'Answer 200 questions correctly.', coins: 200, prog: (c) => [c.q.correct, 200] },
    { id: 'correct500', learn: true, name: 'Walking Textbook', desc: 'Answer 500 questions correctly.', coins: 400, prog: (c) => [c.q.correct, 500] },
    { id: 'streak5', learn: true, name: 'On a Roll', desc: 'Get 5 answers right in a row.', coins: 40, prog: (c) => [c.q.bestStreak, 5] },
    { id: 'streak10', learn: true, name: 'Hot Streak', desc: 'Get 10 answers right in a row.', coins: 100, prog: (c) => [c.q.bestStreak, 10] },
    { id: 'streak25', learn: true, name: 'Unstoppable', desc: 'Get 25 answers right in a row.', coins: 300, prog: (c) => [c.q.bestStreak, 25] },
    { id: 'ready50', learn: true, name: 'Halfway There', desc: 'Reach 50% Quiz Readiness.', coins: 100, prog: (c) => [c.r, 50], unit: '%' },
    { id: 'ready80', learn: true, name: 'Almost Quiz-Ready', desc: 'Reach 80% Quiz Readiness.', coins: 200, prog: (c) => [c.r, 80], unit: '%' },
    { id: 'ready100', learn: true, name: 'Quiz Ready', desc: 'Reach 100% Quiz Readiness.', coins: 500, prog: (c) => [c.r, 100], unit: '%' },
    { id: 'test80', learn: true, name: 'Solid Score', desc: 'Score 80% or higher on a Practice Test.', coins: 150, prog: (c) => [c.q.practiceBest, 80], unit: '%' },
    { id: 'test100', learn: true, name: 'Perfect Paper', desc: 'Score 100% on a Practice Test.', coins: 400, prog: (c) => [c.q.practiceBest, 100], unit: '%' },
    { id: 'bonus1', learn: true, name: 'Bonus Brain', desc: 'Finish a bonus round with no misses.', coins: 40, prog: (c) => [c.q.bonusPerfect, 1] },
    { id: 'bonus10', learn: true, name: 'Chest Master', desc: 'Finish 10 bonus rounds with no misses.', coins: 250, prog: (c) => [c.q.bonusPerfect, 10] },
  ];

  const TOPICS = [['vocab', 'Vocabulary'], ['sides', 'Two Sides'], ['compete', 'Competition'], ['spark', 'The Spark']];
  const ACT_NAMES = ['', 'Militarism', 'Alliances', 'Imperialism', 'Nationalism', 'The Spark'];
  const ACT_KEYS = ['', 'm', 'a', 'i', 'n', 's'];
  const MAX_DANGER = 10;
  const STAT_KEYS = ['runs', 'wins', 'kills', 'bossKills', 'bestTime', 'bestAct', 'bestLevel', 'playSeconds', 'bestScore', 'bestKills'];

  /* --------------------------------------------------------------- helpers */
  const root = () => document.getElementById('screens');
  const sfx = (n, o) => { try { window.AudioSys && AudioSys.sfx && AudioSys.sfx(n, o); } catch (e) {} };
  const music = (t) => { try { window.AudioSys && AudioSys.music && AudioSys.music(t); } catch (e) {} };
  const audio = (fn, v) => { try { window.AudioSys && AudioSys[fn] && AudioSys[fn](v); } catch (e) {} };
  const n0 = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const fmt = (n) => Math.round(n0(n)).toLocaleString('en-US');
  const charById = (id) => CHARS.find((c) => c.id === id) || CHARS[0];
  const toast = (html, opts) => { try { window.Toast && Toast.show(html, opts); } catch (e) {} };

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

  function btn(label, cls, fn, attrs) {
    const b = U.el('button', Object.assign({ type: 'button', class: 'btn ' + (cls || '') }, attrs || {}));
    (Array.isArray(label) ? label : [label]).forEach((n) => { if (n != null && n !== false) b.append(n); });
    b.addEventListener('click', (e) => { if (!b.dataset.quiet) sfx('click'); if (fn) fn(e, b); });
    return b;
  }
  function walletEl() {
    return U.el('div', { class: 'mt-wallet', title: 'Your coins' }, U.el('span', { class: 'coin' }),
      U.el('span', { class: 'num', dataset: { coins: '1' }, text: fmt(M.coins) }), U.el('span', { class: 'mt-sr', text: ' coins' }));
  }
  function refreshWallets() { U.$$('[data-coins]').forEach((e) => { e.textContent = fmt(M.coins); }); }
  function coinTag(n, prefix) { return U.el('span', { class: 'mt-cost num' }, prefix || '', U.el('span', { class: 'coin' }), ' ' + fmt(n)); }
  function lvClass(p) { return p >= 100 ? 'lv-full' : p >= 80 ? 'lv-hi' : p >= 40 ? 'lv-mid' : 'lv-lo'; }
  function bar(pct, cls) { const p = U.clamp(Math.round(pct), 0, 100); return U.el('div', { class: 'bar ' + (cls || '') }, U.el('i', { class: lvClass(p), style: { width: p + '%' } })); }
  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

  function mount(screen, name, back) {
    const r = root(); if (!r) return;
    current = name; backFn = back || null; helpVeil = null;
    r.replaceChildren(screen);
    screen.scrollTop = 0;
  }
  function clearScreens() { const r = root(); if (r) r.replaceChildren(); current = null; backFn = null; helpVeil = null; }
  function goBack() { if (backFn) backFn(); else showTitle(); }
  function subScreen(name, title, back, body, opts) {
    const head = U.el('div', { class: 'mt-head' },
      btn('‹ Back', 'small', goBack, { 'aria-label': 'Back' }),
      U.el('h1', { class: 'display mt-h1', text: title }),
      opts && opts.noWallet ? U.el('span') : walletEl());
    const wrap = U.el('div', { class: 'wrap' }, head, opts && opts.lead ? U.el('p', { class: 'mt-lead mute', text: opts.lead }) : null, body);
    const sc = U.el('div', { class: 'screen mt-sub mt-' + name }, wrap);
    mount(sc, name, back);
    return sc;
  }

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
    armor: (v) => [(v > 0 ? '+' : '') + v + ' armor', v > 0],
    regen: (v) => ['+' + v + ' HP/sec', v > 0],
    crit: (v) => ['+' + Math.round(v * 100) + '% crit', v > 0],
    revives: (v) => ['+' + v + ' revive', v > 0],
    rerolls: (v) => ['+' + v + ' reroll', v > 0],
  };
  function modChips(mods) {
    const out = [];
    for (const k in mods) { if (!MOD_TEXT[k]) continue; const [t, good] = MOD_TEXT[k](mods[k]); out.push(U.el('span', { class: 'mt-mod ' + (good ? 'up' : 'down'), text: t })); }
    if (!out.length) out.push(U.el('span', { class: 'mt-mod', text: 'No strengths, no weaknesses' }));
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
      if (!silent) got.forEach((ch, i) => setTimeout(() => { toast('New character unlocked: <b>' + U.esc(ch.name) + '</b>', { kind: 'good', ms: 3200 }); sfx('unlock'); }, 300 + i * 900));
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
      if (!silent) got.slice(0, 4).forEach((a, i) => setTimeout(() => {
        toast('Achievement: <b>' + U.esc(a.name) + '</b> +' + a.coins + ' coins', { kind: 'good', ms: 2800 }); sfx('unlock');
      }, 200 + i * 800));
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
    if (!(window.Game && Game.start)) { sfx('error'); toast('The game engine is not loaded.', { kind: 'bad' }); return; }
    try { window.AudioSys && AudioSys.unlock && AudioSys.unlock(); } catch (e) {}
    readyBefore = readiness().overall;
    clearScreens();
    Game.start({ charId: M.char, danger: M.danger });
  }

  /* --------------------------------------------------------------- TITLE */
  function wordmark() {
    return U.el('h1', { class: 'mt-word', 'aria-label': 'Powder Keg 1914' },
      U.el('b', { class: 'w1', text: 'POWDER' }),
      U.el('b', { class: 'w2' }, 'KEG',
        U.el('span', { class: 'stamp', text: '1914' }),
        U.el('span', { class: 'mt-fuse', 'aria-hidden': 'true' }, U.el('i'))));
  }
  function readyCard(r) {
    const p = r.overall;
    const line = p >= 100 ? 'Every bar is full. You are ready for the quiz!'
      : p >= 80 ? 'So close. Fill the last bars and you are ready.'
      : p > 0 ? "Get every bar to 100% and you're ready."
      : 'Answer questions in a run to fill these bars. All four at 100% means you are ready.';
    return U.el('section', { class: 'paper mt-ready', 'aria-label': 'Quiz readiness' },
      U.el('div', { class: 'mt-ready-head' },
        U.el('div', { class: 'grow' },
          U.el('div', { class: 'mt-ready-title', text: 'Quiz Readiness' }),
          U.el('div', { class: 'mt-ready-sub', text: r.total ? r.mastered + ' of ' + r.total + ' study-guide facts mastered' : 'How much of the study guide you know' })),
        U.el('div', { class: 'display mt-ready-pct num ' + lvClass(p), text: p + '%' })),
      bar(p, 'mt-bar-big'),
      U.el('div', { class: 'mt-topics' }, TOPICS.map(([k, name]) => U.el('div', { class: 'mt-topic' },
        U.el('div', { class: 'mt-topic-row' }, U.el('span', { text: name }), U.el('b', { class: 'num', text: r.byTopic[k] + '%' })),
        bar(r.byTopic[k])))),
      U.el('p', { class: 'mt-ready-line', text: line }));
  }
  function dangerStepper() {
    const val = U.el('b', { class: 'num' }), note = U.el('span');
    const dn = btn('−', 'small', () => { M.danger = Math.max(0, M.danger - 1); Save.commit(); sync(); }, { 'aria-label': 'Lower danger' });
    const up = btn('+', 'small', () => { M.danger = Math.min(M.maxDanger, M.danger + 1); Save.commit(); sync(); }, { 'aria-label': 'Raise danger' });
    function sync() {
      val.textContent = 'Danger +' + M.danger;
      note.textContent = M.danger ? 'Tougher monsters, more coins' : 'Normal difficulty';
      if (M.danger <= 0) dn.setAttribute('disabled', ''); else dn.removeAttribute('disabled');
      if (M.danger >= M.maxDanger) up.setAttribute('disabled', ''); else up.removeAttribute('disabled');
    }
    sync();
    return U.el('div', { class: 'mt-danger' }, dn, U.el('div', { class: 'v' }, val, note), up);
  }
  function showTitle() {
    if (!M) init();
    const r = readiness(), c = charById(M.char);
    const earned = ACH.filter((a) => M.ach[a.id]).length;
    const menuBtn = (icon, label, fn) => btn([U.el('span', { class: 'ic', 'aria-hidden': 'true', text: icon }), U.el('span', { text: label })], '', fn);
    const wrap = U.el('div', { class: 'wrap' },
      U.el('div', { class: 'mt-top' }, U.el('span', { class: 'eyebrow', text: 'Causes of World War I' }), walletEl()),
      U.el('div', { class: 'mt-hero' }, wordmark(),
        U.el('p', { class: 'mt-pitch', text: 'Outrun the causes of World War I. Know your facts, power up, stop the Spark.' })),
      btn('PLAY', 'primary big mt-play', startRun, { id: 'mt-play' }),
      U.el('div', { class: 'mt-setup' },
        btn([avatar(c), U.el('span', { class: 't' }, U.el('b', { text: c.name }), U.el('span', { text: 'Starts with ' + WEAPONS[c.startWeapon] })),
          U.el('span', { class: 'go', text: 'Change' })], 'mt-chip', showChars, { 'aria-label': 'Character: ' + c.name + '. Change character' }),
        M.maxDanger > 0 ? dangerStepper() : null),
      readyCard(r),
      U.el('div', { class: 'mt-menu' },
        menuBtn('🛠️', 'Upgrades', () => showShop(showTitle)),
        menuBtn('📝', 'Practice Test', openPractice),
        menuBtn('📖', 'Study Notes', openCodex)),
      U.el('div', { class: 'mt-menu2' },
        btn([U.el('span', { class: 'mt-wide', text: 'Achievements ' }), U.el('span', { class: 'mt-narrow', text: 'Awards ' }), U.el('span', { class: 'num mt-count', text: earned + '/' + ACH.length })], 'small', showAchievements, { 'aria-label': 'Achievements' }),
        btn('Stats', 'small', showStats),
        btn('Settings', 'small', showSettings),
        btn([U.el('span', { class: 'mt-wide', text: 'How to Play' }), U.el('span', { class: 'mt-narrow', text: 'Help' })], 'small', showHelp, { 'aria-label': 'How to play' })));
    mount(U.el('div', { class: 'screen mt-title' }, wrap), 'title', null);
    music('menu');
    if (!M.seenHelp) { M.seenHelp = true; Save.commit(); showHelp(); }
  }
  function afterLearning() { checkAll(false); if (current === 'title' || current === null) showTitle(); }
  function openPractice() {
    if (!(window.Quiz && Quiz.practiceTest)) { sfx('error'); toast('The Practice Test is not loaded.', { kind: 'bad' }); return; }
    let p; try { p = Quiz.practiceTest(); } catch (e) { p = null; }
    Promise.resolve(p).then(afterLearning, afterLearning);
  }
  function openCodex() {
    if (!(window.Quiz && Quiz.openCodex)) { sfx('error'); toast('The Study Notes are not loaded.', { kind: 'bad' }); return; }
    let p; try { p = Quiz.openCodex(); } catch (e) { p = null; }
    Promise.resolve(p).then(afterLearning, afterLearning);
  }

  /* --------------------------------------------------------------- HOW TO PLAY */
  function closeHelp() { if (helpVeil) { helpVeil.remove(); helpVeil = null; const p = document.getElementById('mt-play'); if (p && !U.isTouch()) p.focus(); } }
  function showHelp() {
    if (helpVeil) return;
    const rows = [
      ['Move', 'Use WASD or the arrow keys. On a phone, drag anywhere on the screen.'],
      ['Fight', 'Your weapons fire by themselves. Just keep moving and do not get cornered.'],
      ['Level up', 'Grab the gems monsters drop to level up.'],
      ['Answer', 'Every level-up asks one study-guide question. Get it right and you pick your upgrade.'],
      ['Win', 'Open chests for bonus rounds, beat the 5 bosses (M‑A‑I‑N, then the Spark) and spend coins on permanent upgrades.'],
    ];
    const ok = btn('Got it', 'primary big', closeHelp);
    helpVeil = U.el('div', { class: 'veil mt-help' },
      U.el('div', { class: 'modal paper pop-in', role: 'dialog', 'aria-label': 'How to play' },
        U.el('div', { class: 'eyebrow', text: 'Mission briefing' }),
        U.el('h2', { class: 'display mt-h2', text: 'How to play' }),
        U.el('ol', { class: 'mt-howto' }, rows.map(([tag, text]) => U.el('li', null, U.el('span', { class: 'mt-tag', text: tag }), U.el('span', { text })))),
        U.el('div', { class: 'row mt-center' }, ok)));
    root().appendChild(helpVeil);
    if (!U.isTouch()) ok.focus();
  }

  /* --------------------------------------------------------------- CHARACTERS */
  function showChars() {
    const c = ctx();
    const grid = U.el('div', { class: 'grid mt-chargrid' }, CHARS.map((ch) => {
      const owned = !!M.chars[ch.id], sel = M.char === ch.id;
      let action;
      if (sel) action = U.el('div', { class: 'mt-state sel', text: 'Selected' });
      else if (owned) action = btn('Select', 'primary', () => { M.char = ch.id; Save.commit(); sfx('select'); showTitle(); }, { dataset: { quiet: '1' } });
      else if (ch.unlock.type === 'coins') {
        action = btn(['Unlock ', coinTag(ch.unlock.cost)], M.coins >= ch.unlock.cost ? 'primary' : 'mt-cant', (e, b) => {
          if (M.coins < ch.unlock.cost) { sfx('error'); shake(card); toast('You need ' + fmt(ch.unlock.cost - M.coins) + ' more coins.', { kind: 'bad', ms: 1600 }); return; }
          M.coins -= ch.unlock.cost; M.chars[ch.id] = true; M.char = ch.id; Save.commit(); sfx('buy');
          toast('<b>' + U.esc(ch.name) + '</b> joined your squad!', { kind: 'good' });
          checkAll(false); showChars();
        }, { dataset: { quiet: '1' } });
      } else action = U.el('div', { class: 'mt-state lock' }, U.el('b', { text: 'Locked: ' + ch.unlock.text }), U.el('span', { text: featProgress(ch.unlock.feat, c) }));
      const card = U.el('article', { class: 'mt-card mt-char' + (sel ? ' is-sel' : '') + (owned ? '' : ' is-locked') },
        U.el('div', { class: 'mt-char-top' }, avatar(ch, 'lg'),
          U.el('div', { class: 'grow' },
            U.el('h2', { class: 'mt-card-name', text: ch.name }),
            U.el('div', { class: 'mt-char-tag' }, ch.keyName ? U.el('span', { class: 'pill ' + ch.key, text: ch.keyName }) : null, U.el('span', { class: 'mute', text: ch.title })))),
        U.el('p', { class: 'mt-card-desc', text: ch.desc }),
        U.el('div', { class: 'mt-weapon' }, U.el('span', { class: 'eyebrow', text: 'Starts with' }), U.el('b', { text: WEAPONS[ch.startWeapon] }), U.el('span', { class: 'mute', text: WEAPON_HOW[ch.startWeapon] })),
        U.el('div', { class: 'mt-mods' }, modChips(ch.mods)),
        U.el('div', { class: 'mt-card-foot' }, action));
      return card;
    }));
    subScreen('chars', 'Agents', showTitle, grid, { lead: 'Each agent starts with a different weapon. Unlock them with coins or by proving you know your stuff.' });
  }

  /* --------------------------------------------------------------- SHOP */
  function showShop(back, keep) {
    const prevBack = back || backFn || showTitle;
    const grid = U.el('div', { class: 'grid mt-shopgrid' }, SHOP.map((t) => {
      const l = U.clamp(n0(M.up[t.id]) | 0, 0, t.max), maxed = l >= t.max, cost = maxed ? 0 : t.costs[l];
      const pips = U.el('div', { class: 'mt-pips', 'aria-label': 'Level ' + l + ' of ' + t.max });
      for (let i = 0; i < t.max; i++) pips.appendChild(U.el('i', { class: i < l ? 'on' : '' }));
      const card = U.el('article', { class: 'mt-card mt-up' + (maxed ? ' is-max' : '') });
      const action = maxed ? U.el('div', { class: 'mt-state sel', text: 'Maxed out' })
        : btn(['Buy ', coinTag(cost)], M.coins >= cost ? 'primary' : 'mt-cant', () => {
          if (M.coins < cost) { sfx('error'); shake(card); toast('You need ' + fmt(cost - M.coins) + ' more coins.', { kind: 'bad', ms: 1600 }); return; }
          M.coins -= cost; M.up[t.id] = l + 1; Save.commit(); sfx('buy');
          checkAll(false);
          showShop(prevBack, { top: sc.scrollTop, focus: t.id });
        }, { dataset: { quiet: '1', up: t.id }, 'aria-label': 'Buy ' + t.name + ' level ' + (l + 1) + ' for ' + cost + ' coins' });
      card.append(
        U.el('div', { class: 'mt-up-top' }, U.el('span', { class: 'mt-icon', 'aria-hidden': 'true', text: t.icon }),
          U.el('div', { class: 'grow' }, U.el('h2', { class: 'mt-card-name', text: t.name }), pips)),
        U.el('p', { class: 'mt-card-desc', text: t.desc }),
        U.el('div', { class: 'mt-effect num' },
          U.el('span', { class: l ? 'now' : 'now none', text: l ? t.label(l) : 'Not bought yet' }),
          maxed ? null : U.el('span', { class: 'arrow', 'aria-hidden': 'true', text: '→' }),
          maxed ? null : U.el('b', { text: t.label(l + 1) })),
        U.el('div', { class: 'mt-card-foot' }, action));
      return card;
    }));
    const sc = subScreen('shop', 'Upgrades', prevBack, grid, { lead: 'These upgrades are permanent. They power up every run, with every agent.' });
    if (keep) { sc.scrollTop = keep.top || 0; const b = sc.querySelector('[data-up="' + keep.focus + '"]'); if (b && !U.isTouch()) b.focus({ preventScroll: true }); }
  }

  /* --------------------------------------------------------------- ACHIEVEMENTS */
  function showAchievements() {
    const c = ctx();
    const done = ACH.filter((a) => M.ach[a.id]).length;
    const card = (a) => {
      const got = !!M.ach[a.id], p = a.prog(c), cur = Math.min(Math.max(0, Math.round(p[0])), p[1]);
      return U.el('article', { class: 'mt-card mt-ach' + (got ? ' is-done' : '') },
        U.el('div', { class: 'mt-ach-top' }, U.el('h2', { class: 'mt-card-name', text: a.name }), got ? U.el('span', { class: 'stamp', text: 'Earned' }) : coinTag(a.coins, '+')),
        U.el('p', { class: 'mt-card-desc', text: a.desc }),
        got ? null : U.el('div', { class: 'mt-ach-prog' }, bar(p[1] ? (cur / p[1]) * 100 : 0), U.el('span', { class: 'num', text: fmt(cur) + ' / ' + fmt(p[1]) + (a.unit || '') })));
    };
    const section = (title, list) => U.el('section', { class: 'col' }, U.el('h2', { class: 'eyebrow mt-sec', text: title }), U.el('div', { class: 'grid mt-achgrid' }, list.map(card)));
    const body = U.el('div', { class: 'col' },
      U.el('div', { class: 'panel mt-ach-sum' }, U.el('b', { class: 'num', text: done + ' of ' + ACH.length + ' earned' }), bar((done / ACH.length) * 100)),
      section('For knowing your stuff', ACH.filter((a) => a.learn)),
      section('For playing well', ACH.filter((a) => !a.learn)));
    subScreen('ach', 'Achievements', showTitle, body, { lead: 'Every achievement pays out coins the moment you earn it.' });
  }

  /* --------------------------------------------------------------- STATS */
  function tile(label, value) { return U.el('div', { class: 'mt-tile' }, U.el('b', { class: 'num', text: String(value) }), U.el('span', { text: label })); }
  function showStats() {
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
          tile('Monsters defeated', fmt(st.kills)), tile('Bosses defeated', fmt(st.bossKills)), tile('Time played', U.fmtTime(st.playSeconds)),
          tile('Coins earned, all time', fmt(M.totalCoins)), tile('Highest danger unlocked', '+' + M.maxDanger),
          tile('Achievements', ACH.filter((a) => M.ach[a.id]).length + ' / ' + ACH.length))));
    subScreen('stats', 'Stats', showTitle, body);
  }

  /* --------------------------------------------------------------- SETTINGS */
  function showSettings() {
    const S = Save.ns('settings', { music: 0.55, sfx: 0.8, muted: false, shake: true, dmgNumbers: true });
    const slider = (id, label, val, on) => {
      const out = U.el('span', { class: 'num mt-set-val', text: Math.round(val * 100) + '%' });
      const inp = U.el('input', { id, type: 'range', min: 0, max: 100, step: 5, value: Math.round(val * 100), class: 'mt-range' });
      inp.addEventListener('input', () => { const v = U.clamp(+inp.value / 100, 0, 1); out.textContent = Math.round(v * 100) + '%'; on(v, false); });
      inp.addEventListener('change', () => on(U.clamp(+inp.value / 100, 0, 1), true));
      return U.el('div', { class: 'mt-set-row' }, U.el('label', { for: id, text: label }), inp, out);
    };
    const toggle = (id, label, val, on, hint) => {
      const b = U.el('button', { id, type: 'button', class: 'mt-switch', role: 'switch', 'aria-checked': val ? 'true' : 'false', 'aria-label': label }, U.el('i'));
      b.addEventListener('click', () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', v ? 'true' : 'false'); on(v); sfx('click'); });
      return U.el('div', { class: 'mt-set-row' }, U.el('div', { class: 'grow' }, U.el('label', { for: id, text: label }), hint ? U.el('div', { class: 'mt-hint mute', text: hint }) : null), b);
    };
    const confirmRow = U.el('div', { class: 'mt-confirm', hidden: true },
      U.el('p', { text: 'This erases your coins, upgrades, characters, achievements AND your Quiz Readiness. It can not be undone.' }),
      U.el('div', { class: 'row' },
        btn('Yes, erase everything', 'danger', () => {
          Save.reset();
          try { location.reload(); } catch (e) {}
          setTimeout(() => { M = null; try { window.Quiz && Quiz.init && Quiz.init(); } catch (e) {} init(); showTitle(); toast('Progress erased.', { ms: 1800 }); }, 600);
        }, { id: 'mt-reset-yes' }),
        btn('Keep my progress', '', () => { confirmRow.hidden = true; resetBtn.hidden = false; })));
    const resetBtn = btn('Reset all progress', 'small ghost mt-reset', () => { confirmRow.hidden = false; resetBtn.hidden = true; }, { id: 'mt-reset' });
    const body = U.el('div', { class: 'col mt-set' },
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
    const t0 = performance.now(); let last = 0;
    if (to <= 0) { el.textContent = '+0'; return; }
    (function step(now) {
      const k = Math.min(1, (now - t0) / ms), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
      el.textContent = '+' + fmt(v);
      if (k < 1 && now - last > 95) { last = now; sfx('coin', { vol: 0.45, pitch: 1 + k * 0.6 }); }
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    })(t0);
  }
  function showResults(s, x) {
    const win = !!s.won, act = U.clamp(n0(s.act) | 0 || 1, 1, 5), answered = n0(s.correct) + n0(s.wrong);
    const head = U.el('header', { class: 'mt-res-head ' + (win ? 'win' : 'loss') },
      U.el('div', { class: 'stamp', text: win ? (s.endless ? 'Endless run' : 'Victory') : 'Defeated' }),
      U.el('h1', { class: 'display mt-res-title', text: win ? 'POWDER KEG DEFUSED' : 'RUN OVER' }),
      win ? U.el('p', { class: 'mt-res-sub', text: 'You beat Militarism, Alliances, Imperialism, Nationalism and the Spark' + (s.danger ? ' on Danger +' + s.danger : '') + '.' })
          : U.el('p', { class: 'mt-res-sub' }, 'You made it to ', U.el('span', { class: 'pill ' + ACT_KEYS[act], text: 'Act ' + act + ' · ' + ACT_NAMES[act] })));
    const coinsEl = U.el('b', { class: 'display num mt-res-coins', text: '+0' });
    const achCoins = x.ach.reduce((t, a) => t + a.coins, 0);
    const coinBox = U.el('section', { class: 'panel mt-res-coinbox' },
      U.el('div', { class: 'grow' }, U.el('div', { class: 'eyebrow', text: 'Coins earned' }),
        U.el('div', { class: 'mt-res-coinrow' }, U.el('span', { class: 'coin' }), coinsEl),
        achCoins ? U.el('div', { class: 'mute num', text: '+' + fmt(achCoins) + ' more from achievements' }) : null),
      U.el('div', { class: 'mt-res-wallet' }, U.el('span', { class: 'eyebrow', text: 'Wallet' }), walletEl()));
    const delta = x.readyAfter - x.readyBefore;
    const readyBox = U.el('section', { class: 'paper mt-res-ready' },
      U.el('div', { class: 'mt-ready-head' },
        U.el('div', { class: 'grow' }, U.el('div', { class: 'mt-ready-title', text: 'Quiz Readiness' }),
          U.el('div', { class: 'mt-ready-sub', text: delta > 0 ? 'Up ' + delta + ' points this run. Keep going!' : x.readyAfter >= 100 ? 'Every bar is full. You are ready!' : 'Answer more questions right to push this up.' })),
        U.el('div', { class: 'display mt-ready-pct num ' + lvClass(x.readyAfter), text: (delta > 0 ? x.readyBefore + '% → ' : '') + x.readyAfter + '%' })),
      bar(x.readyAfter, 'mt-bar-big'));
    const news = [];
    if (x.newDanger) news.push(U.el('li', { class: 'danger' }, U.el('b', { text: 'Danger +' + M.maxDanger + ' unlocked' }), U.el('span', { text: 'Tougher monsters, bigger coin payouts. Set it on the title screen.' })));
    x.chars.forEach((c) => news.push(U.el('li', { class: 'char' }, U.el('b', { text: 'New agent: ' + c.name }), U.el('span', { text: 'Starts with ' + WEAPONS[c.startWeapon] + '.' }))));
    x.ach.forEach((a) => news.push(U.el('li', null, U.el('b', { text: a.name }), U.el('span', { text: a.desc }), coinTag(a.coins, '+'))));
    const again = btn('Play Again', 'primary', startRun, { id: 'mt-again' });
    const wrap = U.el('div', { class: 'wrap' }, head,
      U.el('div', { class: 'mt-tiles mt-res-tiles' },
        tile('Time', U.fmtTime(n0(s.time))), tile('Monsters', fmt(s.kills)), tile('Level', fmt(s.level)), tile('Bosses', fmt(s.bossKills)),
        tile('Answers right', answered ? fmt(s.correct) + '/' + fmt(answered) : '0'), tile('Best streak', fmt(s.bestStreak)),
        tile('Act reached', act + '/5'), tile('Score', fmt(s.score))),
      coinBox, readyBox,
      news.length ? U.el('section', { class: 'col' }, U.el('h2', { class: 'eyebrow mt-sec', text: 'New this run' }), U.el('ul', { class: 'mt-news' }, news)) : null,
      U.el('div', { class: 'mt-res-actions' }, again, btn('Upgrades', '', () => showShop(() => showResults(s, x))), btn('Menu', '', showTitle)));
    mount(U.el('div', { class: 'screen mt-sub mt-results' }, wrap), 'results', showTitle);
    resultsAt = performance.now();
    countUp(coinsEl, x.coins, 900);
    if (!U.isTouch()) again.focus({ preventScroll: true });
  }
  function onRunEnd(summary) {
    if (!M) init();
    const s = Object.assign({ won: false, endless: false, act: 1, time: 0, kills: 0, level: 1, coins: 0, correct: 0, wrong: 0, bestStreak: 0, bossKills: 0,
      bonusPerfect: 0, revived: false, charId: M.char, danger: M.danger, damageTaken: 0, weapons: [], score: 0 }, summary || {});
    const st = M.stats;
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
    showResults(s, { coins, ach: got.ach, chars: got.chars, newDanger, readyBefore: readyBefore == null ? after : Math.min(readyBefore, after), readyAfter: after });
    readyBefore = null;
  }

  /* --------------------------------------------------------------- keys + init */
  function onKey(e) {
    if (!current || e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    try { if (window.Quiz && Quiz.isOpen && Quiz.isOpen()) return; if (window.Game && Game.isRunning && Game.isRunning()) return; } catch (err) {}
    const k = e.key, a = document.activeElement;
    const onControl = a && a !== document.body && /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(a.tagName) && a.isConnected;
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
    if (!keysOn) { keysOn = true; document.addEventListener('keydown', onKey); }
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
