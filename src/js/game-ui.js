/* game-ui.js — every piece of in-run DOM UI: HUD strip, boss bar, act title card, boss intro, upgrade picker,
   pause, confirm. Exposes PK.UI. The game engine (game.js) only calls this API and never builds in-run DOM itself.

   On screen during a run, and nothing more: level + XP, health, the M-A-I-N-spark act tracker, time, coins, pause;
   a boss bar (and the final boss's fuse) only while a boss is alive. */
(function () {
  'use strict';
  const PK = (window.PK = window.PK || {});
  const H = {}, HV = {};
  const open = new Set();            /* live modals: {veil, off()} */
  let root, modalRoot, handlers = {};
  let banT = 0, banT2 = 0, introT = 0, introT2 = 0, introRaf = 0, bossOutT = 0, snap = 0, xpSnap = false, lastBump = 0, bossHold = 0;
  let lg = false, kbAt = -1e9, celebrate = false, cineT = 0;
  let mW = -1, mH = -1, mStrip = 0, mBoss = 0, mFuse = 0, curAct = 0;   /* cached top-of-screen measurements */   /* roomy screens get a slightly larger HUD; kbAt = when a key was last used */
  const sfx = (n) => { try { window.AudioSys && AudioSys.sfx(n); } catch (e) {} };
  const still = () => { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
  const tween = (el, frames, o) => { if (!el || !el.animate || still()) return null; try { return el.animate(frames, o); } catch (e) { return null; } };
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* ---------- glyphs: the drawn icon set when it is loaded, otherwise crisp inline SVG ---------- */
  const S = (body) => '<svg viewBox="0 0 24 24" width="100%" height="100%" focusable="false">' + body + '</svg>';
  const SVG = {
    hp: S('<path d="M12 20.6C7.2 17.3 2.6 13.5 2.6 8.9c0-2.9 2.1-5 4.8-5 1.9 0 3.5 1 4.6 2.7 1.1-1.7 2.700-2.700 4.600-2.700 2.700 0 4.800 2.100 4.800 5 0 4.600-4.600 8.400-9.400 11.700z" style="fill:var(--heart);stroke:var(--out);stroke-width:2.2;stroke-linejoin:round"/><path d="M6.2 8.600c0-1.300.900-2.300 2.100-2.300" style="fill:none;stroke:var(--heart-hi);stroke-width:1.8;stroke-linecap:round"/>'),
    clock: S('<circle cx="12" cy="12.6" r="8.6" style="fill:var(--paper);stroke:var(--out);stroke-width:2.2"/><path d="M12 7.800v5l3.200 2" style="fill:none;stroke:var(--out);stroke-width:2.200;stroke-linecap:round;stroke-linejoin:round"/><path d="M9.300 2.300h5.400" style="stroke:var(--out);stroke-width:2.400;stroke-linecap:round"/>'),
    coin: S('<circle cx="12" cy="12" r="9.200" style="fill:var(--brass);stroke:var(--out);stroke-width:2.200"/><circle cx="12" cy="12" r="5.600" style="fill:none;stroke:var(--brass-deep);stroke-width:1.800"/><path d="M7.200 8.800c.800-1.500 2-2.500 3.500-2.900" style="fill:none;stroke:var(--brass-hi);stroke-width:1.800;stroke-linecap:round"/>'),
    pause: S('<rect x="5.500" y="4.500" width="4.600" height="15" rx="1.800" style="fill:currentColor"/><rect x="13.900" y="4.500" width="4.600" height="15" rx="1.800" style="fill:currentColor"/>'),
    skull: S('<path d="M12 2.800c-5 0-8.600 3.500-8.600 8 0 2.700 1.300 4.900 3.400 6.300v2.300c0 .900.700 1.600 1.600 1.600h7.200c.900 0 1.600-.700 1.600-1.600v-2.300c2.100-1.400 3.400-3.600 3.400-6.300 0-4.500-3.600-8-8.600-8z" style="fill:var(--paper);stroke:var(--out);stroke-width:2.200;stroke-linejoin:round"/><circle cx="8.700" cy="11.300" r="2.200" style="fill:var(--out)"/><circle cx="15.300" cy="11.300" r="2.200" style="fill:var(--out)"/><path d="M10.200 17v3.600M13.800 17v3.600" style="stroke:var(--out);stroke-width:1.800;stroke-linecap:round"/>'),
    shield: S('<path d="M12 2.600l8 2.900v5.900c0 5-3.300 8.500-8 10.200-4.700-1.700-8-5.200-8-10.200V5.500z" style="fill:var(--shield);stroke:var(--out);stroke-width:2.200;stroke-linejoin:round"/><path d="M12 5.300v13.600c3.300-1.500 5.400-4 5.400-7.500V7.300z" style="fill:var(--shield-2)"/>'),
    sound: S('<path d="M3.500 9.300h3.600l5-4.200v13.800l-5-4.200H3.500z" style="fill:currentColor;stroke:currentColor;stroke-width:1.600;stroke-linejoin:round"/><path d="M15.600 8.600c1.900 1.900 1.900 4.900 0 6.800M18.300 5.900c3.400 3.400 3.400 8.800 0 12.200" style="fill:none;stroke:currentColor;stroke-width:2.200;stroke-linecap:round"/>'),
    mute: S('<path d="M3.500 9.300h3.600l5-4.200v13.800l-5-4.200H3.500z" style="fill:currentColor;stroke:currentColor;stroke-width:1.600;stroke-linejoin:round"/><path d="M15.800 9.200l5 5.600M20.800 9.200l-5 5.600" style="fill:none;stroke:currentColor;stroke-width:2.400;stroke-linecap:round"/>'),
    dice: S('<rect x="3.400" y="3.400" width="17.200" height="17.200" rx="4.200" style="fill:var(--paper);stroke:var(--out);stroke-width:2.200"/><circle cx="8.300" cy="8.300" r="1.500" style="fill:var(--out)"/><circle cx="15.700" cy="8.300" r="1.500" style="fill:var(--out)"/><circle cx="12" cy="12" r="1.500" style="fill:var(--out)"/><circle cx="8.300" cy="15.700" r="1.500" style="fill:var(--out)"/><circle cx="15.700" cy="15.700" r="1.500" style="fill:var(--out)"/>'),
    keg: S('<rect x="5" y="3.800" width="14" height="17" rx="4.400" style="fill:var(--keg);stroke:var(--out);stroke-width:2.200"/><path d="M5.400 9h13.200M5.400 15.600h13.200" style="stroke:var(--out);stroke-width:1.800"/>'),
    bolt: S('<path d="M13.600 2.200L5 13.400h5.200L8.800 21.800 19 9.800h-5.600z" style="fill:currentColor;stroke:var(--out);stroke-width:1.600;stroke-linejoin:round"/>'),
    check: S('<path d="M4.800 12.800l4.600 4.600L19.400 6.800" style="fill:none;stroke:currentColor;stroke-width:3.600;stroke-linecap:round;stroke-linejoin:round"/>'),
    star: S('<path d="M12 2.600l2.900 6 6.500.900-4.700 4.600 1.100 6.500L12 17.500l-5.800 3.100 1.100-6.500L2.600 9.500l6.500-.900z" style="fill:currentColor;stroke:currentColor;stroke-width:1.200;stroke-linejoin:round"/>'),
  };
  let real = null;
  /* true once the real icon set (not the emoji stand-in) is loaded */
  function hasIcons() {
    if (real === null) { real = false; try { real = typeof PK.icon === 'function' && !/EMOJI\s*\[/.test(Function.prototype.toString.call(PK.icon)); } catch (e) {} }
    return real;
  }
  function art(name, px) {
    if (!name || !hasIcons()) return null;
    if (PK.ICON_NAMES && PK.ICON_NAMES.indexOf(name) < 0) return null;
    try { const c = PK.icon(name, px); return c && c.nodeType === 1 ? c : null; } catch (e) { return null; }
  }
  function glyph(name, px, cls) {
    const c = art(name, px);
    if (c) { c.classList.add('ui-ico'); if (cls) c.classList.add(cls); return c; }
    const s = U.el('span', { class: 'ui-ico ui-svg g-' + name + (cls ? ' ' + cls : ''), 'aria-hidden': 'true', html: SVG[name] || '' });
    s.style.width = s.style.height = px + 'px'; return s;
  }
  /* round medal for a title card: act letters use the drawn cause medals when available */
  function medal(big, px) {
    const key = big === '⚡' ? 'S' : big;
    if (key && 'MAINS'.indexOf(key) >= 0 && key.length === 1) { const c = art(key, px); if (c) { c.classList.add('ui-medal-art'); return c; } }
    const m = U.el('div', { class: 'ui-medal', 'aria-hidden': 'true' });
    m.style.width = m.style.height = px + 'px'; m.style.fontSize = Math.round(px * 0.56) + 'px';
    if (big === '⚡') m.appendChild(glyph('bolt', Math.round(px * 0.62)));
    else if (big === '✓') m.appendChild(glyph('check', Math.round(px * 0.62)));
    else if (big === '★') m.appendChild(glyph('star', Math.round(px * 0.62)));
    else m.textContent = big || '';
    return m;
  }

  /* ================= HUD ================= */
  function init(h) {
    handlers = h || {}; root = document.getElementById('hud'); modalRoot = document.getElementById('modals'); root.innerHTML = '';
    lg = window.innerWidth >= 1000 && window.innerHeight >= 620; root.classList.toggle('hud-lg', lg); mW = -1;
    if (!init.keys) { init.keys = true; window.addEventListener('keydown', () => { kbAt = performance.now(); }, true); window.addEventListener('pointerdown', () => { kbAt = -1e9; }, true); }
    H.lvN = U.el('b', { class: 'num', text: '1' });
    H.ring = U.el('i', { class: 'hud-ring' });
    H.badge = U.el('div', { class: 'hud-badge', role: 'img', 'aria-label': 'Level 1' }, H.ring, H.lvN);
    H.hpG = U.el('i', { class: 'ghost' }); H.hpF = U.el('i', { class: 'fill' }); H.hpHit = U.el('i', { class: 'hit' }); H.hpT = U.el('span', { class: 'val num' });
    H.hp = U.el('div', { class: 'hud-hp', role: 'img', 'aria-label': 'Health' }, H.hpG, H.hpF, H.hpHit, H.hpT);
    H.heart = glyph('hp', lg ? 24 : 20, 'hud-heart');
    H.xpF = U.el('i', { class: 'fill' }); H.xpS = U.el('i', { class: 'shine' });
    H.acts = U.el('div', { class: 'hud-acts', role: 'img', 'aria-label': 'Acts: M, A, I, N, then the Spark' }, PK.ACTS.map((a) => {
      const ic = art(a.key, lg ? 30 : 26);
      return U.el('span', { class: 'k-' + a.key.toLowerCase() + ' up' + (ic ? ' has-art' : '') }, ic || (a.key === 'S' ? glyph('bolt', lg ? 17 : 14) : a.key));
    }));
    H.time = U.el('b', { class: 'num', text: '0:00' }); H.coins = U.el('b', { class: 'num', text: '0' }); H.coinI = glyph('coin', lg ? 22 : 18);
    H.pause = U.el('button', { class: 'hud-pause', type: 'button', 'aria-label': 'Pause', onclick: () => { if (handlers.onPause) handlers.onPause(); } }, glyph('pause', lg ? 26 : 22));
    H.strip = U.el('div', { class: 'hud-strip' },
      U.el('div', { class: 'hud-plate' }, H.badge,
        U.el('div', { class: 'hud-bars' }, U.el('div', { class: 'hud-hprow' }, H.heart, H.hp), U.el('div', { class: 'hud-xp', role: 'img', 'aria-label': 'Experience' }, H.xpF, H.xpS))),
      H.acts,
      U.el('div', { class: 'hud-meta' }, U.el('span', { class: 'hud-time' }, glyph('clock', lg ? 21 : 17), H.time), U.el('span', { class: 'hud-coins' }, H.coinI, H.coins)),
      H.pause);
    H.bossI = U.el('span', { class: 'hud-boss-ico' });
    H.bossG = U.el('i', { class: 'ghost' }); H.bossF = U.el('i', { class: 'fill' });
    H.fuseF = U.el('i'); H.fuseS = U.el('b');
    H.fuse = U.el('div', { class: 'hud-fuse', hidden: true, role: 'img', 'aria-label': 'Fuse' }, H.fuseF, H.fuseS);
    H.bossBar = U.el('div', { class: 'hud-boss-bar', role: 'img', 'aria-label': 'Boss health' }, H.bossG, H.bossF, U.el('i', { class: 'stripes' }));
    H.boss = U.el('div', { class: 'hud-boss', hidden: true }, H.bossI, U.el('div', { class: 'hud-boss-col' }, H.bossBar, H.fuse));
    H.card = U.el('div', { class: 'hud-card', hidden: true, role: 'status' });
    H.intro = U.el('div', { class: 'hud-intro', hidden: true });
    root.append(U.el('div', { class: 'hud-top' }, H.strip, H.boss, H.card), H.intro);
    show(false);
  }
  function show(on) { root.hidden = !on; if (!on) { hideCard(); hideIntro(); } }
  /* new run: forget cached values and jump the bars to their new values without tweening */
  function reset() {
    for (const k in HV) delete HV[k];
    hideCard(); hideIntro(); clearTimeout(bossOutT); bossHold = 0; celebrate = false;
    if (H.boss) { H.boss.hidden = true; H.boss.classList.remove('sh'); H.hp.classList.remove('low'); H.heart.classList.remove('low'); root.classList.add('snap'); snap = 3; }
  }
  /* act tracker: M A I N spark — done / now / upcoming */
  function setAct(g) {
    curAct = g.act | 0; const kids = H.acts.children;
    for (let i = 0; i < kids.length; i++) { const s = kids[i]; s.classList.remove('up', 'now', 'done'); s.classList.add(i < g.act ? 'done' : i === g.act ? 'now' : 'up'); }
  }
  /* called whenever the player's weapons/boosts change (the calm HUD shows no build row; the pause menu lists it) */
  function setBuild() {}
  function set(el, key, val, fn) { if (HV[key] !== val) { const was = HV[key]; HV[key] = val; fn(el, val, was); } }
  function levelUp() {
    tween(H.badge, [{ transform: 'scale(1)' }, { transform: 'scale(1.32)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 560, easing: 'cubic-bezier(.2,1.4,.4,1)' });
    tween(H.ring, [{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(2.1)', opacity: 0 }], { duration: 600, easing: 'ease-out' });
    tween(H.xpS, [{ transform: 'translateX(-100%)', opacity: 1 }, { transform: 'translateX(100%)', opacity: 1 }], { duration: 680, easing: 'ease-out' });
  }
  /* per-frame, cheap: only touches the DOM when a value changed; fills move with transforms only */
  function sync(g) {
    const p = g.player; if (!p) return;
    if (snap > 0 && --snap === 0) root.classList.remove('snap');
    if (xpSnap) { H.xpF.style.transition = ''; xpSnap = false; }
    if (HV.lv !== p.level) {
      const up = HV.lv !== undefined && p.level > HV.lv; HV.lv = p.level;
      H.lvN.textContent = p.level; H.badge.setAttribute('aria-label', 'Level ' + p.level); H.badge.classList.toggle('wide', p.level > 99);
      if (up) { celebrate = true; H.xpF.style.transition = 'none'; xpSnap = true; }
    }
    /* the level-up flourish waits until the question and the upgrade picker are out of the way */
    if (celebrate && !g.busy) { celebrate = false; levelUp(); }
    set(H.xpF, 'xp', Math.round(clamp01(p.xp / p.xpNext) * 250), (e, v) => { e.style.transform = 'scaleX(' + v / 250 + ')'; });
    set(H.hpF, 'hp', Math.round(clamp01(p.hp / p.maxHp) * 250), (e, v, was) => {
      const s = 'scaleX(' + v / 250 + ')'; e.style.transform = s; H.hpG.style.transform = s;
      const low = v < 75; if (HV.low !== low) { HV.low = low; H.hp.classList.toggle('low', low); H.heart.classList.toggle('low', low); }
      if (was !== undefined && v < was) tween(H.hpHit, [{ opacity: 0.9 }, { opacity: 0 }], { duration: 340, easing: 'ease-out' });
    });
    set(H.hpT, 'hpt', Math.ceil(p.hp) + '/' + p.maxHp, (e, v) => { e.textContent = v; });
    set(H.time, 'time', Math.floor(g.t), (e, v) => { e.textContent = U.fmtTime(v); });
    set(H.coins, 'coins', g.coins, (e, v, was) => {
      e.textContent = U.fmtNum(v);
      if (was !== undefined && v > was) { const now = performance.now(); if (now - lastBump > 260) { lastBump = now; tween(H.coinI, [{ transform: 'scale(1)' }, { transform: 'scale(1.4)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 240, easing: 'ease-out' }); } }
    });
    /* the bar waits a beat after a boss intro starts, so the boss's entrance is not hidden behind it */
    const bs = g.bosses, on = bs.length > 0 && performance.now() >= bossHold;
    set(H.boss, 'bossOn', on, (e, v) => {
      clearTimeout(bossOutT);
      if (v) {
        const a = g.actDef || {}; e.hidden = false; e.style.opacity = ''; e.style.setProperty('--bc', a.color || PK.COL.N); H.bossBar.setAttribute('aria-label', (a.bossName || 'Boss') + ' health');
        H.bossI.innerHTML = ''; H.bossI.appendChild(art(a.key, lg ? 28 : 22) || glyph('skull', lg ? 26 : 20));
        delete HV.bossHp; delete HV.bossSh; delete HV.fuseOn; delete HV.fuse; e.classList.remove('sh');
        tween(e, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
        tween(H.bossF, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' });
      } else { delete HV.fuseOn; delete HV.fuse; if (still()) e.hidden = true; else { e.style.opacity = '0'; bossOutT = setTimeout(() => { e.hidden = true; e.style.opacity = ''; }, 420); } }
    });
    if (on) {
      let hp = 0, mx = 0, sh = false; for (let i = 0; i < bs.length; i++) { const b = bs[i]; hp += Math.max(0, b.hp); mx += b.maxHp; if (b.shield) sh = true; }
      set(H.bossF, 'bossHp', Math.round(clamp01(hp / (mx || 1)) * 400), (e, v) => { const s = 'scaleX(' + v / 400 + ')'; e.style.transform = s; H.bossG.style.transform = s; });
      set(H.boss, 'bossSh', sh, (e, v) => {
        e.classList.toggle('sh', v); H.bossI.innerHTML = '';
        H.bossI.appendChild(v ? glyph('shield', lg ? 26 : 21) : (art((g.actDef || {}).key, lg ? 28 : 22) || glyph('skull', lg ? 26 : 20)));
      });
      const f = bs[0].fuse; set(H.fuse, 'fuseOn', f !== undefined, (e, v) => { e.hidden = !v; });
      if (f !== undefined) set(H.fuseF, 'fuse', Math.round(clamp01(f / (bs[0].fuseMax || 1)) * 200), (e, v) => { e.style.width = v / 2 + '%'; H.fuseS.style.left = v / 2 + '%'; H.fuse.classList.toggle('hot', v < 50); });
    }
  }

  /* ================= how much of the top of the screen the HUD covers ================= */
  function measure() {
    const w = window.innerWidth, h = window.innerHeight;
    if (w === mW && h === mH && mStrip > 0) return;
    mW = w; mH = h; let strip = 0, boss = 0, fuse = 0;
    if (root && H.strip) {
      /* lay everything out invisibly for one synchronous read (nothing is painted in between) */
      const rH = root.hidden, bH = H.boss.hidden, fH = H.fuse.hidden, rV = root.style.visibility, bV = H.boss.style.visibility;
      try {
        if (rH) { root.style.visibility = 'hidden'; root.hidden = false; }
        if (bH) { H.boss.style.visibility = 'hidden'; H.boss.hidden = false; }
        H.fuse.hidden = false;
        strip = H.strip.offsetTop + H.strip.offsetHeight;
        boss = H.bossBar.offsetTop + H.bossBar.offsetHeight + 3;      /* + the bar's outer ring */
        fuse = H.fuse.offsetTop + H.fuse.offsetHeight + 5;            /* + the spark riding the fuse */
      } catch (e) { strip = 0; }
      H.fuse.hidden = fH; H.boss.hidden = bH; H.boss.style.visibility = bV; root.hidden = rH; root.style.visibility = rV;
    }
    if (!(strip > 0)) {           /* not laid out yet: the numbers the layout is designed to */
      const short = h <= 480;
      strip = lg ? 76 : w >= 640 ? (short ? 53 : 62) : 90;
      boss = strip + (lg ? 10 : short ? 5 : 6) + (lg ? 21 : short ? 14 : 18) + 3; fuse = boss + 8;
      mW = -1;                    /* try a real measurement again next time */
    }
    mStrip = strip; mBoss = Math.max(boss, strip); mFuse = Math.max(fuse, mBoss);
  }
  /* CSS px from the top of the game area to the bottom edge of the HUD strip. With a boss (withBoss, or its bar is
     showing) the number includes the boss bar and, for the Spark, the fuse line. It is right before the bar appears and
     while the HUD is hidden, and it is cached per viewport size, so it is safe to call every frame. */
  function topInset(withBoss) {
    measure();
    if (!(withBoss || HV.bossOn)) return mStrip;
    const a = PK.ACTS && PK.ACTS[curAct];
    return (HV.fuseOn !== undefined ? HV.fuseOn : !!(a && a.boss === 'spark')) ? mFuse : mBoss;
  }

  /* ================= title card ================= */
  function hideCard() { clearTimeout(banT); clearTimeout(banT2); if (H.card) { H.card.hidden = true; H.card.classList.remove('in', 'out'); } }
  /* short announcement card under the HUD. big = one glyph (act letter, ⚡, ✓, ★, !, +). A new card replaces the old. */
  function banner(title, sub, col, big, ms) {
    const b = H.card; hideCard();
    if (!title && !sub) return;
    b.style.setProperty('--bc', col || PK.COL.brass); b.innerHTML = '';
    if (big) b.appendChild(medal(big, lg ? 62 : 52));
    b.appendChild(U.el('div', { class: 'hc-txt' }, U.el('div', { class: 'hc-t display', text: title || '' }), sub ? U.el('div', { class: 'hc-s', text: sub }) : null));
    b.hidden = false; void b.offsetWidth; b.classList.add('in');
    ms = ms || 3500;
    banT2 = setTimeout(() => { b.classList.remove('in'); b.classList.add('out'); }, Math.max(0, ms - 230));
    banT = setTimeout(hideCard, ms);
  }

  /* ================= boss intro ================= */
  function hideIntro() { clearTimeout(introT); clearTimeout(introT2); clearTimeout(cineT); if (root) root.classList.remove('cine'); if (introRaf) cancelAnimationFrame(introRaf); introRaf = 0; if (H.intro) { H.intro.hidden = true; H.intro.classList.remove('in', 'out'); H.intro.innerHTML = ''; } }
  /* boss arrival card (lower third, so it never hides the boss dropping in at the top or the hero in the middle).
     spec = {name, line, color, key:'M'|'A'|'I'|'N'|'S', kind, ms}. The game freezes for ~1.25s while it shows. */
  function bossIntro(spec) {
    spec = spec || {}; hideIntro(); hideCard(); bossHold = performance.now() + 950;
    /* the strip steps back for a moment so the boss dropping in at the top of the screen is not hidden behind it */
    root.classList.add('cine'); cineT = setTimeout(() => { root.classList.remove('cine'); }, 1300);
    const el = H.intro, short = window.innerHeight < 480, size = short ? 68 : window.innerWidth < 560 ? 108 : 140;
    el.style.setProperty('--bc', spec.color || PK.COL.N);
    let pic = null;
    if (PK.portrait && PK.portrait.boss && spec.kind && PK.BOSS_INFO && PK.BOSS_INFO[spec.kind]) {
      const cv = U.el('canvas', { class: 'hi-pic', 'aria-hidden': 'true' });
      const draw = () => { PK.portrait.boss(cv, spec.kind, performance.now() / 1000, { size }); };
      try { draw(); pic = cv; const loop = () => { if (!cv.isConnected) { introRaf = 0; return; } try { draw(); } catch (e) { introRaf = 0; return; } introRaf = requestAnimationFrame(loop); }; introRaf = requestAnimationFrame(loop); } catch (e) { pic = null; }
    }
    if (!pic) pic = medal(spec.key === 'S' ? '⚡' : spec.key || '!', Math.round(size * 0.72));
    el.appendChild(U.el('div', { class: 'hi-band' }, U.el('div', { class: 'hi-art' }, pic),
      U.el('div', { class: 'hi-txt' }, U.el('div', { class: 'hi-n display', text: spec.name || '' }), spec.line ? U.el('div', { class: 'hi-l', text: spec.line }) : null)));
    el.hidden = false; void el.offsetWidth; el.classList.add('in');
    const ms = Math.min(Math.max(spec.ms || 3000, 1500), 3400);
    introT2 = setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); }, ms - 280);
    introT = setTimeout(hideIntro, ms);
  }

  /* ================= modals ================= */
  function mount(veil, off) { const rec = { veil, off: off || (() => {}) }; open.add(rec); modalRoot.appendChild(veil); return rec; }
  function unmount(rec) { try { rec.off(); } catch (e) {} rec.veil.remove(); open.delete(rec); }
  function closeAll() {
    open.forEach((rec) => { try { rec.off(); } catch (e) {} rec.veil.remove(); }); open.clear();
    U.$$('.pk-pick,.pk-pause,.pk-confirm', modalRoot).forEach((n) => n.remove());
  }

  /* level pips for a card: {to, max, isNew} or null when the tag does not encode a level */
  function levelInfo(o) {
    const W = PK.WEAPONS && PK.WEAPONS[o.art], P = PK.PASSIVES && PK.PASSIVES[o.art], max = (W && W.max) || (P && P.max) || 0;
    const m = /LEVEL\s+(\d+)\D+(\d+)/.exec(o.tag || '');
    if (m) return { to: +m[2], max: Math.max(max, +m[2]), isNew: false };
    if (o.isNew && max) return { to: 1, max, isNew: true };
    return null;
  }
  function card(o, i, choose, px) {
    const li = levelInfo(o), ic = art(o.art, px);
    const tile = U.el('span', { class: 'pk-art' }, ic || U.el('span', { class: 'pk-emoji', text: o.icon || '' }));
    const meta = U.el('span', { class: 'pk-meta' },
      !li || li.isNew ? U.el('span', { class: 'pk-tag', text: o.tag || '' }) : null,
      li ? U.el('span', { class: 'pk-pips', role: 'img', 'aria-label': 'Level ' + li.to + ' of ' + li.max }, Array.from({ length: li.max }, (_, k) => U.el('i', { class: k < li.to - 1 ? 'on' : k === li.to - 1 ? 'next' : '' }))) : null);
    const b = U.el('button', { class: 'pk-card k-' + (o.key || 'x') + (o.isNew ? ' new' : ''), type: 'button', onclick: () => choose(i) },
      tile, U.el('span', { class: 'pk-body' }, U.el('span', { class: 'pk-nm', text: o.name || '' }), meta, U.el('span', { class: 'pk-ds', text: o.desc || '' })));
    b.style.setProperty('--i', i);
    return b;
  }
  /* Upgrade picker. spec = { head, sub, options:[{ref, art, icon, name, tag, desc, key:'m'|'a'|'i'|'n'|'s'|'x', isNew}], rerolls, reroll() -> {options, rerolls} }
     Resolves with the chosen option object (same object that was passed in / returned by reroll). Keys 1-4 choose. */
  function pick(spec) {
    return new Promise((resolve) => {
      let opts = spec.options || [], rerolls = spec.rerolls | 0, born = performance.now(), done = false;
      const stage = U.el('div', { class: 'pk-stage', role: 'dialog', 'aria-modal': 'true', 'aria-label': spec.head || 'Choose an upgrade', tabindex: '-1' });
      const veil = U.el('div', { class: 'veil pk-pick' }, stage);
      const onk = (e) => { if (e.repeat || !e.key || e.key.length !== 1) return; const i = '1234'.indexOf(e.key); if (i >= 0 && i < opts.length) { e.preventDefault(); choose(i); } };
      const rec = mount(veil, () => window.removeEventListener('keydown', onk));
      const choose = (i) => {
        const o = opts[i]; if (done || !o || performance.now() - born < 280) return;
        done = true; window.removeEventListener('keydown', onk); sfx('select');
        U.$$('.pk-card', stage).forEach((c, k) => c.classList.add(k === i ? 'picked' : 'gone')); veil.classList.add('leaving');
        const fin = () => { unmount(rec); resolve(o); };
        if (still()) fin(); else setTimeout(fin, 210);
      };
      const render = () => {
        born = performance.now(); stage.innerHTML = '';
        const wide = window.innerWidth >= 720, short = window.innerHeight < 480, n = opts.length, px = wide && n > 1 ? (short ? 46 : n > 3 ? 64 : 76) : 50;
        stage.appendChild(U.el('div', { class: 'pk-head' }, spec.sub ? U.el('div', { class: 'eyebrow pk-sub', text: spec.sub }) : null, U.el('h2', { class: 'display pk-h', text: spec.head || '' })));
        const wrap = U.el('div', { class: 'pk-cards n' + n }); opts.forEach((o, i) => wrap.appendChild(card(o, i, choose, px))); stage.appendChild(wrap);
        const foot = U.el('div', { class: 'pk-foot' });
        if (n === 1) foot.appendChild(U.el('button', { class: 'btn primary', type: 'button', text: 'Take it', onclick: () => choose(0) }));
        if (rerolls > 0 && n > 1 && spec.reroll) foot.appendChild(U.el('button', { class: 'btn small ghost pk-reroll', type: 'button', onclick: () => { if (done) return; const r = spec.reroll(); if (!r) return; opts = r.options || []; rerolls = r.rerolls | 0; sfx('card'); render(); } }, glyph('dice', 18), 'Reroll (' + rerolls + ' left)'));
        if (foot.childNodes.length) stage.appendChild(foot);
      };
      window.addEventListener('keydown', onk); render(); sfx('card');
      try { stage.focus({ preventScroll: true }); } catch (e) {}
    });
  }
  /* yes/no box. Resolves true/false. `no` may be omitted for a single-button notice. */
  function confirm(title, body, yes, no) {
    return new Promise((resolve) => {
      const box = U.el('div', { class: 'modal panel pop-in pk-box', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title || '' });
      const veil = U.el('div', { class: 'veil pk-confirm' }, box), rec = mount(veil);
      let fin = false; const done = (v) => { if (fin) return; fin = true; sfx('click'); unmount(rec); resolve(v); };
      const yesB = U.el('button', { class: 'btn primary big', type: 'button', text: yes || 'OK', onclick: () => done(true) });
      box.append(U.el('h2', { class: 'display pk-h', text: title || '' }), body ? U.el('p', { class: 'pk-p', text: body }) : null,
        U.el('div', { class: 'col pk-actions' }, yesB, no ? U.el('button', { class: 'btn ghost', type: 'button', text: no, onclick: () => done(false) }) : null));
      /* keyboard players get the main button focused (after a beat, so a mashed key cannot answer by accident) */
      if (performance.now() - kbAt < 4000) setTimeout(() => { if (!fin) { try { yesB.focus({ preventScroll: true }); } catch (e) {} } }, 400);
    });
  }
  /* Pause menu. spec = { eyebrow, tip, build:[{art, icon, name, lvl}], muted, onResume(), onRestart(), onQuit(), onMute() -> newMuted }. Returns {close()}. */
  function pauseMenu(spec) {
    spec = spec || {};
    const box = U.el('div', { class: 'modal panel pop-in pk-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' });
    const veil = U.el('div', { class: 'veil pk-pause' }, box), rec = mount(veil);
    const snd = U.el('button', { class: 'btn pk-snd', type: 'button' });
    const paint = (m) => { snd.innerHTML = ''; snd.appendChild(glyph(m ? 'mute' : 'sound', 24)); snd.setAttribute('aria-pressed', m ? 'false' : 'true'); snd.setAttribute('aria-label', m ? 'Sound is off. Turn sound on' : 'Sound is on. Turn sound off'); };
    paint(!!spec.muted);
    snd.addEventListener('click', () => { if (spec.onMute) paint(!!spec.onMute()); });
    const resume = U.el('button', { class: 'btn primary big', type: 'button', text: 'Resume', onclick: () => spec.onResume && spec.onResume() });
    box.append(
      U.el('div', { class: 'pk-phead' }, U.el('div', {}, spec.eyebrow ? U.el('div', { class: 'eyebrow', text: spec.eyebrow }) : null, U.el('h2', { class: 'display pk-h', text: 'PAUSED' })), snd),
      spec.tip ? U.el('div', { class: 'paper pk-tip' }, U.el('span', { class: 'eyebrow', text: 'Remember this' }), U.el('p', { text: spec.tip })) : null,
      (spec.build || []).length ? U.el('div', { class: 'pk-build', role: 'list', 'aria-label': 'Your weapons and boosts' }, spec.build.map((b) => U.el('span', { role: 'listitem', title: (b.name || '') + ' · level ' + b.lvl, 'aria-label': (b.name || '') + ', level ' + b.lvl },
        art(b.art, 20) || U.el('span', { class: 'pk-emoji', text: b.icon || '' }), U.el('b', { class: 'num', text: String(b.lvl) })))) : null,
      U.el('div', { class: 'col pk-actions' }, resume,
        U.el('div', { class: 'pk-row2' }, U.el('button', { class: 'btn', type: 'button', text: 'Restart', onclick: () => spec.onRestart && spec.onRestart() }), U.el('button', { class: 'btn danger', type: 'button', text: 'End run', onclick: () => spec.onQuit && spec.onQuit() }))));
    return { veil, box, close() { unmount(rec); } };
  }

  PK.UI = { init, show, reset, setAct, setBuild, sync, banner, bossIntro, pick, confirm, pauseMenu, closeAll, topInset };
})();
