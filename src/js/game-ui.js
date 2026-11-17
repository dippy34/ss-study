/* game-ui.js — every piece of in-run DOM UI: HUD, banners, boss intro, upgrade picker, pause, confirm.
   Exposes PK.UI. The game engine (game.js) only calls this API and never builds in-run DOM itself. */
(function () {
  'use strict';
  const PK = (window.PK = window.PK || {});
  const H = {}, HV = {};
  let root, modalRoot, banT = 0, handlers = {};
  const sfx = (n) => { try { window.AudioSys && AudioSys.sfx(n); } catch (e) {} };

  /* icon element: drawn icon when the icon set is loaded, otherwise the emoji fallback */
  function ico(name, emoji, px) {
    if (PK.icon && name) { try { const c = PK.icon(name, px || 28); if (c) return c; } catch (e) {} }
    return U.el('span', { class: 'ui-emoji', text: emoji || '' });
  }

  function init(h) {
    handlers = h || {}; root = document.getElementById('hud'); modalRoot = document.getElementById('modals'); root.innerHTML = '';
    H.xp = U.el('i'); H.lv = U.el('span', { class: 'hud-lv num' }); H.hp = U.el('i'); H.hpT = U.el('span', { class: 'num' });
    H.time = U.el('span', { class: 'hud-time num' }); H.coins = U.el('span', { class: 'num' });
    H.main = U.el('div', { class: 'hud-main' }, PK.ACTS.map((a) => U.el('span', { class: 'k-' + a.key.toLowerCase(), text: a.key === 'S' ? '⚡' : a.key })));
    H.pause = U.el('button', { class: 'hud-pause', 'aria-label': 'Pause', onclick: () => handlers.onPause && handlers.onPause() }, U.el('i'), U.el('i'));
    H.bossN = U.el('div', { class: 'hud-boss-n display' }); H.bossB = U.el('i'); H.fuseB = U.el('i');
    H.fuse = U.el('div', { class: 'hud-fuse', hidden: true }, U.el('span', { text: 'FUSE' }), U.el('div', {}, H.fuseB));
    H.boss = U.el('div', { class: 'hud-boss', hidden: true }, H.bossN, U.el('div', { class: 'hud-boss-bar' }, H.bossB), H.fuse);
    H.banner = U.el('div', { class: 'hud-banner', hidden: true });
    root.append(
      U.el('div', { class: 'hud-top' },
        U.el('div', { class: 'hud-xp' }, H.xp, H.lv),
        U.el('div', { class: 'hud-row' },
          U.el('div', { class: 'hud-left' }, U.el('div', { class: 'hud-hp' }, H.hp, H.hpT), U.el('div', { class: 'hud-actrow' }, H.main)),
          U.el('div', { class: 'hud-right' }, U.el('div', { class: 'hud-stats' }, H.time, U.el('span', { class: 'hud-coin' }, U.el('span', { class: 'coin' }), H.coins)), H.pause)),
        H.boss),
      H.banner);
    show(false);
  }
  function show(on) { root.hidden = !on; if (!on) H.banner.hidden = true; }
  function reset() { for (const k in HV) delete HV[k]; }
  /* act tracker: M A I N ⚡ — done / now / upcoming */
  function setAct(g) { U.$$('span', H.main).forEach((s, i) => { s.className = 'k-' + PK.ACTS[i].key.toLowerCase() + (i < g.act ? ' done' : i === g.act ? ' now' : ''); }); }
  /* called whenever the player's weapons/boosts change (the calm HUD shows no build row; the pause menu lists it) */
  function setBuild() {}
  function set(el, key, val, fn) { if (HV[key] !== val) { HV[key] = val; fn(el, val); } }
  /* per-frame, cheap: only touches the DOM when a value changed */
  function sync(g) {
    const p = g.player; if (!p) return;
    set(H.xp, 'xp', Math.round(p.xp / p.xpNext * 200), (e, v) => { e.style.width = v / 2 + '%'; });
    set(H.lv, 'lv', p.level, (e, v) => { e.textContent = 'LEVEL ' + v; });
    set(H.hp, 'hp', Math.round(p.hp / p.maxHp * 100), (e, v) => { e.style.width = v + '%'; e.className = v < 30 ? 'low' : ''; });
    set(H.hpT, 'hpt', Math.ceil(p.hp) + ' / ' + p.maxHp, (e, v) => { e.textContent = v; });
    set(H.time, 'time', Math.floor(g.t), (e, v) => { e.textContent = U.fmtTime(v); });
    set(H.coins, 'coins', g.coins, (e, v) => { e.textContent = v; });
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
  /* short announcement card. big = one glyph (act letter, ⚡, ✓, ★, !, +) */
  function banner(title, sub, col, big, ms) {
    const b = H.banner; b.innerHTML = ''; b.style.setProperty('--bc', col || PK.COL.brass);
    b.append(U.el('div', { class: 'hb-big display', text: big || '' }), U.el('div', { class: 'hb-txt' }, U.el('div', { class: 'hb-t display', text: title }), U.el('div', { class: 'hb-s', text: sub || '' })));
    b.hidden = false; b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
    clearTimeout(banT); banT = setTimeout(() => { b.hidden = true; }, ms || 3500);
  }
  /* boss arrival card. spec = {name, line, color, key:'M'|'A'|'I'|'N'|'S', kind, ms}. The game freezes for ~1.3s while it shows. */
  function bossIntro(spec) { banner(spec.name, spec.line, spec.color, spec.key === 'S' ? '⚡' : spec.key, spec.ms || 3000); }

  function modal(cls) { const veil = U.el('div', { class: 'veil ' + (cls || '') }), box = U.el('div', { class: 'modal panel pop-in' }); veil.appendChild(box); modalRoot.appendChild(veil); return { veil, box, close() { veil.remove(); } }; }
  function closeAll() { U.$$('.pk-pick,.pk-pause,.pk-confirm', modalRoot).forEach((n) => n.remove()); }

  /* Upgrade picker. spec = { head, sub, options:[{ref, art, icon, name, tag, desc, key:'m'|'a'|'i'|'n'|'s'|'x', isNew}], rerolls, reroll() -> {options, rerolls} }
     Resolves with the chosen option object (same object that was passed in / returned by reroll). Keys 1-4 choose. */
  function pick(spec) {
    return new Promise((resolve) => {
      let opts = spec.options, rerolls = spec.rerolls | 0, born = performance.now(); const m = modal('pk-pick');
      const choose = (i) => { const o = opts[i]; if (!o || performance.now() - born < 280) return; window.removeEventListener('keydown', onk); sfx('select'); m.close(); resolve(o); };
      const onk = (e) => { const i = '1234'.indexOf(e.key); if (i >= 0 && i < opts.length) { e.preventDefault(); choose(i); } };
      const render = () => {
        born = performance.now(); m.box.innerHTML = '';
        m.box.append(U.el('div', { class: 'eyebrow', text: spec.sub || '' }), U.el('h2', { class: 'display pk-h', text: spec.head }));
        const wrap = U.el('div', { class: 'pk-cards n' + opts.length });
        opts.forEach((o, i) => wrap.appendChild(U.el('button', { class: 'pk-card k-' + (o.key || 'x') + (o.isNew ? ' new' : ''), onclick: () => choose(i) },
          U.el('span', { class: 'pk-ic' }, ico(o.art, o.icon, 30)),
          U.el('span', { class: 'pk-body' }, U.el('span', { class: 'pk-lv', text: o.tag }), U.el('span', { class: 'pk-nm', text: o.name }), U.el('span', { class: 'pk-ds', text: o.desc })))));
        m.box.appendChild(wrap);
        if (rerolls > 0 && opts.length > 1 && spec.reroll) m.box.appendChild(U.el('div', { class: 'row pk-foot' }, U.el('button', { class: 'btn small', text: 'Reroll choices (' + rerolls + ' left)', onclick: () => { const r = spec.reroll(); if (!r) return; opts = r.options; rerolls = r.rerolls | 0; sfx('card'); render(); } })));
      };
      window.addEventListener('keydown', onk); render(); sfx('card');
    });
  }
  /* yes/no box. Resolves true/false. `no` may be omitted for a single-button notice. */
  function confirm(title, body, yes, no) {
    return new Promise((resolve) => {
      const m = modal('pk-confirm'); const done = (v) => { sfx('click'); m.close(); resolve(v); };
      m.box.append(U.el('h2', { class: 'display pk-h', text: title }), U.el('p', { class: 'pk-p', text: body }), U.el('div', { class: 'col' }, U.el('button', { class: 'btn primary big', text: yes, onclick: () => done(true) }), no ? U.el('button', { class: 'btn ghost', text: no, onclick: () => done(false) }) : null));
    });
  }
  /* Pause menu. spec = { eyebrow, tip, build:[{art, icon, name, lvl}], muted, onResume(), onRestart(), onQuit(), onMute() -> newMuted }. Returns {close()}. */
  function pauseMenu(spec) {
    const m = modal('pk-pause');
    const snd = U.el('button', { class: 'btn grow', text: spec.muted ? 'Sound: off' : 'Sound: on', onclick: () => { const v = spec.onMute(); snd.textContent = v ? 'Sound: off' : 'Sound: on'; } });
    m.box.append(U.el('div', { class: 'eyebrow', text: spec.eyebrow || '' }), U.el('h2', { class: 'display pk-h', text: 'PAUSED' }),
      U.el('div', { class: 'pk-tip' }, U.el('span', { class: 'eyebrow', text: 'Remember this' }), U.el('p', { text: spec.tip || '' })),
      U.el('div', { class: 'pk-build' }, (spec.build || []).map((b) => U.el('span', {}, ico(b.art, b.icon, 18), ' ' + b.name + ' ', U.el('b', { text: 'Lv ' + b.lvl })))),
      U.el('div', { class: 'col' }, U.el('button', { class: 'btn primary big', text: 'Resume', onclick: () => spec.onResume() }),
        U.el('div', { class: 'row' }, snd, U.el('button', { class: 'btn grow', text: 'Restart', onclick: () => spec.onRestart() }), U.el('button', { class: 'btn danger grow', text: 'End run', onclick: () => spec.onQuit() }))));
    return m;
  }

  PK.UI = { init, show, reset, setAct, setBuild, sync, banner, bossIntro, pick, confirm, pauseMenu, closeAll };
})();
