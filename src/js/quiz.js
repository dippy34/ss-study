/* quiz.js — question engine, mastery tracking, question modal, bonus-round mini-games, practice test and study notes.
   Exposes window.Quiz. Reads window.STUDY (data.js). */
(function () {
  'use strict';
  const U = window.U;
  const STUDY = window.STUDY || { terms: [], facts: [], questions: [], central: [], allied: [], alliedMain: [], neutral: [], chain: [], longOrSpark: [], story: { parts: [''], blanks: [] }, compete: { benefits: [] }, mnemonic: { phrase: '', words: [] }, lines: {}, topics: [], sideOf: () => 'allied', sideLabel: {}, sideWhy: () => '' };
  const SaveX = window.Save || { ns: (n, d) => Object.assign({}, d), commit() {} };
  const factById = {}, byFact = {};
  STUDY.facts.forEach((f) => { factById[f.id] = f; });
  STUDY.questions.forEach((q) => { (byFact[q.fact] || (byFact[q.fact] = [])).push(q); });

  const KEYS = { M: { cls: 'm', label: 'MILITARISM' }, A: { cls: 'a', label: 'ALLIANCES' }, I: { cls: 'i', label: 'IMPERIALISM' }, N: { cls: 'n', label: 'NATIONALISM' }, S: { cls: 's', label: 'THE SPARK' }, X: { cls: 'x', label: 'NOT A CAUSE' } };
  const TOPIC_SHORT = { vocab: 'Vocabulary', sides: 'Two Sides', compete: 'Competition', spark: 'The Spark' };
  const CREDIT = [0, 0.5, 1, 1, 1, 1];   /* right twice in a row = mastered */

  let S = null;
  let openCount = 0;
  let queue = Promise.resolve();
  const serial = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };
  /* sheets opened from a menu: a second call while one is open (or waiting) gets the same promise instead of queueing another */
  const live = {};
  const once = (key, fn) => live[key] || (live[key] = serial(fn).then((v) => { live[key] = null; return v; }, (e) => { live[key] = null; throw e; }));
  const sfx = (n, o) => { try { if (window.AudioSys && AudioSys.sfx) AudioSys.sfx(n, o); } catch (e) { /* audio is optional */ } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const root = () => document.getElementById('modals') || document.body;
  const el = U.el;

  function init() {
    S = SaveX.ns('quiz', { mastery: {}, asked: 0, correct: 0, streak: 0, bestStreak: 0, practiceBest: 0, practiceCount: 0, bonusPerfect: 0 });
    if (!S.mastery || typeof S.mastery !== 'object') S.mastery = {};
    return S;
  }
  const st = () => S || init();
  const boxOf = (id) => { const x = st().mastery[id]; return x ? x.b : 0; };

  /* ================= mastery + selection ================= */
  let askNo = 0;
  const recentQ = [], recentF = [], retry = [], qCount = {};

  function record(factId, ok, opt) {
    st();
    if (!factId) return;
    let x = S.mastery[factId];
    if (!x) x = S.mastery[factId] = { b: 0, s: 0, r: 0, w: 0, t: 0 };
    x.s++; x.t = Date.now();
    S.asked++;
    if (ok) { x.r++; x.b = Math.min(5, x.b + 1); S.correct++; }
    else {
      x.w++; x.b = Math.max(0, x.b - 2);
      if (!retry.some((r) => r.fact === factId)) retry.push({ fact: factId, due: askNo + U.randInt(2, 4) });
    }
    if (opt && opt.streak) {
      if (ok) { S.streak++; if (S.streak > S.bestStreak) S.bestStreak = S.streak; } else S.streak = 0;
    }
    SaveX.commit();
  }
  /* one verdict per fact per mini-game (so a single round can't over-credit a fact) */
  function tally() {
    const m = {};
    return { add(f, ok) { if (f) m[f] = (f in m) ? (m[f] && !!ok) : !!ok; }, flush() { for (const f in m) record(f, m[f]); } };
  }

  function weightOf(f) {
    const x = S.mastery[f.id];
    if (!x) return 6;
    return [9, 5, 3, 1.2, 0.6, 0.35][x.b] || 0.35;
  }
  function pickQuestion(opts) {
    st(); askNo++;
    const lastF = recentF[recentF.length - 1];
    let factId = null;
    const due = retry.findIndex((r) => r.due <= askNo && r.fact !== lastF && byFact[r.fact]);
    if (due >= 0) { factId = retry[due].fact; retry.splice(due, 1); }
    else {
      let cands = STUDY.facts.filter((f) => byFact[f.id] && f.id !== lastF);
      if (opts && opts.key && Math.random() < 0.6) { const k = cands.filter((f) => f.key === opts.key); if (k.length) cands = k; }
      const fresh = cands.filter((f) => recentF.indexOf(f.id) < 0);
      if (fresh.length >= 3) cands = fresh;
      let tot = 0; const ws = cands.map((f) => { const w = weightOf(f); tot += w; return w; });
      let r = Math.random() * tot, i = 0;
      for (; i < cands.length - 1; i++) { r -= ws[i]; if (r <= 0) break; }
      factId = cands[i] ? cands[i].id : null;
    }
    const all = byFact[factId] || STUDY.questions;
    const pool = all.filter((q) => recentQ.indexOf(q.id) < 0);
    const list = pool.length ? pool : all;
    let min = Infinity; list.forEach((q) => { const c = qCount[q.id] || 0; if (c < min) min = c; });
    const q = U.pick(list.filter((x) => (qCount[x.id] || 0) === min));
    qCount[q.id] = (qCount[q.id] || 0) + 1;
    recentQ.push(q.id); if (recentQ.length > 8) recentQ.shift();
    recentF.push(q.fact); if (recentF.length > 4) recentF.shift();
    return q;
  }
  /* shuffle choices for display (true/false and fixed-order questions keep their order) */
  function present(q) {
    let order = q.choices.map((c, i) => i);
    if (q.type === 'mc' && !q.fixed) order = U.shuffle(order);
    return { q, choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer) };
  }
  /* the cause/topic a fact belongs to — only ever shown AFTER he has answered */
  function pillFor(q) { const f = factById[q.fact] || {}; const k = KEYS[q.key] || KEYS.S; return { cls: k.cls, label: f.pill || k.label }; }

  function readiness() {
    st();
    const by = { vocab: [0, 0], sides: [0, 0], compete: [0, 0], spark: [0, 0] };
    let sum = 0, mastered = 0, seen = 0;
    STUDY.facts.forEach((f) => {
      const x = S.mastery[f.id]; const b = x ? x.b : 0; const c = CREDIT[b] || 0;
      sum += c; if (b >= 2) mastered++; if (x && x.s > 0) seen++;
      const t = by[f.topic] || (by[f.topic] = [0, 0]); t[0] += c; t[1]++;
    });
    const byTopic = {};
    for (const k in by) byTopic[k] = by[k][1] ? Math.round((by[k][0] / by[k][1]) * 100) : 0;
    const total = STUDY.facts.length;
    return { overall: total ? Math.round((sum / total) * 100) : 0, byTopic, mastered, total, seen };
  }
  function stats() {
    st();
    return { asked: S.asked, correct: S.correct, accuracy: S.asked ? Math.round((S.correct / S.asked) * 100) : 0, streak: S.streak, bestStreak: S.bestStreak, practiceBest: S.practiceBest, practiceCount: S.practiceCount, bonusPerfect: S.bonusPerfect };
  }

  /* ================= small UI helpers ================= */
  const reduced = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
  /* the drawn icon set is "real" once it knows the cause medals; until then we use our own tiny vector marks (never emoji) */
  const realIcons = () => { try { return !!(window.PK && PK.icon && PK.ICON_NAMES && PK.ICON_NAMES.indexOf('M') >= 0); } catch (e) { return false; } };
  const SVGS = {
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.6l4.6 4.6L19 7.4" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cross: '<svg viewBox="0 0 24 24"><path d="M6.6 6.6l10.8 10.8M17.4 6.6L6.6 17.4" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 7.4V12l3.1 2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.8 6.3.7-4.7 4.2 1.4 6.2L12 16.7 6.4 19.9l1.4-6.2L3.1 9.5l6.3-.7z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M13.6 2.5L5.5 13.4h5.2l-1.3 8.1 8.1-10.9h-5.2z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  };
  /* an icon element: the drawn canvas icon when the real set is loaded, else a vector mark; null when neither exists */
  function ico(name, px) {
    if (realIcons()) { try { const c = PK.icon(name, px); if (c) { c.classList.add('qz-ico'); return c; } } catch (e) { /* fall through */ } }
    if (SVGS[name]) return el('span', { class: 'qz-ico qz-svg', 'aria-hidden': 'true', style: { width: px + 'px', height: px + 'px' }, html: SVGS[name] });
    return null;
  }
  const garnish = (name, px) => (realIcons() ? ico(name, px) : null);   /* optional header icons: only with the real set */
  /* a round cause medal (M A I N, the spark, or "not a cause") */
  function medal(key, px) {
    const k = KEYS[key] || KEYS.S;
    if (realIcons()) { try { const c = PK.icon(key, px); if (c) { c.classList.add('qz-ico'); return c; } } catch (e) { /* fall through */ } }
    const glyph = key === 'S' ? SVGS.spark : key === 'X' ? SVGS.cross : null;
    return el('span', { class: 'qz-medal key-' + k.cls, 'aria-hidden': 'true', style: { width: px + 'px', height: px + 'px', fontSize: Math.max(12, Math.round(px * 0.52)) + 'px' }, html: glyph || undefined, text: glyph ? undefined : key });
  }
  /* swap an option's number chip for a tick / cross once it has been judged */
  function chipMark(btn, ok) {
    const chip = btn && btn.querySelector('.qz-key');
    const ic = chip && ico(ok ? 'check' : 'cross', 18);
    if (!ic) return;
    chip.textContent = ''; chip.classList.add('ic'); if (ic.tagName === 'CANVAS') chip.classList.add('img'); chip.appendChild(ic);
  }
  /* quick fade-out, then run cb (which removes the node) */
  function leave(node, cb) { if (reduced()) { cb(); return; } node.classList.add('qz-out'); setTimeout(cb, 130); }
  /* short screens: tighten the type one notch at a time until the whole card is on screen (.qz-tight / .qz-tighter in quiz.css) */
  function fit(box, card, keep) {
    if (!keep) card.classList.remove('qz-tight', 'qz-tighter');
    const over = () => box.scrollHeight > box.clientHeight + 1;
    if (over()) card.classList.add('qz-tight');
    if (over()) card.classList.add('qz-tighter');
  }
  /* a card taller than the screen: a fade and a "More below" tag stay pinned to the bottom edge until he reaches the end.
     Not shown while the card has its own pinned footer button. Returns a function that re-checks. */
  function scrollCue(box) {
    const more = el('div', { class: 'qz-more', hidden: true, 'aria-hidden': 'true' }, el('span', { text: 'More below' }));
    box.appendChild(more);
    const sync = () => { more.hidden = !!box.querySelector('.qz-foot') || box.scrollHeight - box.clientHeight - box.scrollTop < 40; };
    box.addEventListener('scroll', sync, { passive: true });
    try { if (window.ResizeObserver) { const ro = new ResizeObserver(sync); ro.observe(box); if (box.firstElementChild) ro.observe(box.firstElementChild); } } catch (e) { /* older browsers */ }
    sync();
    return sync;
  }
  /* growing a centred card (feedback, a "Got it" button) must not make it jump up: pin its top where it is */
  function holdTop(box, card) { try { card.style.marginTop = Math.max(0, card.offsetTop - (parseFloat(getComputedStyle(box).paddingTop) || 0)) + 'px'; } catch (e) { /* ignore */ } }
  /* ...and once it has grown: if its foot now hangs off the screen, slide it up just far enough (never past the top) */
  function settle(box, card) {
    const mt = parseFloat(card.style.marginTop);
    if (!(mt > 0)) return;
    const over = box.scrollHeight - box.clientHeight;
    if (over > 0) card.style.marginTop = Math.max(0, mt - over) + 'px';
  }
  const toFocus = (node) => { try { node.focus({ preventScroll: true }); } catch (e) { /* ignore */ } };
  /* Space / Enter must not reach whatever is focused behind an open card (it would press the button that opened it again).
     strict: also when the card itself (not one of its buttons or fields) has the focus */
  function strayKey(e, node, strict) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return false;
    const a = document.activeElement;
    return !(a && node.contains(a) && !(strict && a === node));
  }
  /* a one-second paper-confetti toss inside a card */
  function confetti(host) {
    if (reduced() || !host) return;
    const box = el('div', { class: 'qz-confetti', 'aria-hidden': 'true' });
    const cols = ['var(--brass)', 'var(--good)', 'var(--stamp)', 'var(--paper-ink)', 'var(--brass-line)'];
    for (let i = 0; i < 18; i++) {
      const bit = el('i');
      bit.style.left = (4 + Math.random() * 92) + '%'; bit.style.background = cols[i % cols.length]; bit.style.animationDelay = Math.round(Math.random() * 160) + 'ms';
      bit.style.setProperty('--r', Math.round(200 + Math.random() * 420) + 'deg'); bit.style.setProperty('--x', Math.round(-36 + Math.random() * 72) + 'px');
      box.appendChild(bit);
    }
    host.appendChild(box); setTimeout(() => box.remove(), 1100);
  }
  /* FLIP: slide re-ordered siblings to their new place instead of jumping */
  const tops = (nodes) => nodes.map((n) => n.getBoundingClientRect().top);
  function slide(nodes, before) {
    if (reduced()) return;
    nodes.forEach((n, i) => { const dy = before[i] - n.getBoundingClientRect().top; if (Math.abs(dy) > 1 && n.animate) n.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
  }

  /* ================= the question modal ================= */
  const HEAD = { levelup: 'LEVEL UP — answer to choose your upgrade', boss: 'BREAK THE SHIELD', revive: 'LAST STAND', practice: 'QUICK QUESTION', drill: 'QUICK REVIEW' };
  const HICON = { levelup: 'star', boss: 'shield', revive: 'hp', practice: 'pencil', drill: 'bolt' };
  const RUN_CTX = { levelup: 1, boss: 1, revive: 1 };
  let runMiss = [];   /* wrong answers given inside the current run (for the results screen) */
  const YES = ['CORRECT', 'NAILED IT', 'YES', 'SHARP', 'RIGHT'];
  const STREAKS = [3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

  function ask(opts) { opts = opts || {}; return serial(() => askNow(opts)); }
  function askNow(opts) {
    st();
    return new Promise((resolve) => {
      const q = opts.question || pickQuestion(opts);
      const P = present(q);
      const ctx = opts.context || 'levelup';
      const timed = opts.timeLimit > 0;
      const head = String(opts.header || HEAD[ctx] || 'QUESTION').split(' — ');
      const step = Array.isArray(opts.step) ? opts.step : null;   /* [i, n]: Last Stand progress */
      const timerFill = el('i');
      const secs = el('span', { class: 'qz-secs num', text: timed ? String(Math.ceil(opts.timeLimit)) : '' });
      const timer = el('div', { class: 'qz-timer', hidden: !timed }, ico('clock', 18), el('div', { class: 'bar' }, timerFill), secs);
      const marks = step && Array.isArray(opts.marks) ? opts.marks : null;   /* drill: how the earlier cards went */
      const pips = step && !marks ? el('div', { class: 'qz-pips', role: 'img', 'aria-label': 'Question ' + step[0] + ' of ' + step[1] },
        Array.from({ length: step[1] }, (_, k) => el('i', { class: k + 1 < step[0] ? 'done' : k + 1 === step[0] ? 'now' : '' })),
        el('span', { class: 'qz-pips-n num', text: step[0] + '/' + step[1] })) : null;
      const strip = marks ? el('div', { class: 'qz-prog', role: 'img', 'aria-label': 'Question ' + step[0] + ' of ' + step[1] },
        el('div', { class: 'qz-prog-bars' }, Array.from({ length: step[1] }, (_, k) => el('i', { class: k < marks.length ? (marks[k] ? 'ok' : 'no') : k === step[0] - 1 ? 'cur' : '' }))),
        el('span', { class: 'qz-pips-n num', text: step[0] + '/' + step[1] })) : null;
      const stopBtn = opts.stop ? el('button', { class: 'qz-stop', type: 'button', 'aria-label': 'Stop the review', text: 'Stop' }) : null;
      const btns = P.choices.map((c, i) => el('button', { class: 'btn qz-choice', type: 'button' },
        el('span', { class: 'qz-key', text: String(i + 1) }), el('span', { class: 'qz-choice-text', text: c })));
      btns.forEach((bt, i) => bt.style.setProperty('--i', String(i)));
      const fb = el('div', { class: 'qz-feedback', hidden: true, role: 'status', 'aria-live': 'polite' });
      const modal = el('div', { class: 'modal paper qz qz-card-in qz-ctx-' + ctx, role: 'dialog', 'aria-modal': 'true', tabindex: '-1' },
        el('div', { class: 'qz-head' },
          garnish(HICON[ctx] || 'star', 22),
          el('div', { class: 'display qz-header' }, el('span', { text: head[0] }), head.length > 1 ? el('small', { text: head.slice(1).join(' — ') }) : null),
          pips, stopBtn),
        strip,
        timer,
        el('div', { class: 'qz-q', text: q.q }),
        el('div', { class: 'qz-choices' + (P.choices.length === 2 ? ' two' : '') }, btns),
        fb);
      const veil = el('div', { class: 'veil qz-veil' }, modal);
      root().appendChild(veil); openCount++;
      sfx('card');

      const t0 = performance.now();
      const unlockAt = t0 + 350;       /* ignore taps that were meant for the game */
      let answered = false, done = false, canGo = false, tick = null, lastTick = 99, result = null;
      /* short screen: shrink the type until all the choices show; if they still cannot, say that there is more below */
      const cue = scrollCue(veil);
      const refit = () => { if (done) return; if (!answered) fit(veil, modal); cue(); };
      refit(); veil.scrollTop = 0; toFocus(modal);
      window.addEventListener('resize', refit);
      try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit); } catch (e) { /* older browsers */ }

      function choose(i) {
        if (answered) return;
        if (i >= 0 && performance.now() < unlockAt) return;
        answered = true;
        if (tick) { clearInterval(tick); tick = null; }
        const ok = i === P.answer, before = S.streak;
        btns.forEach((b, j) => { b.disabled = true; b.classList.add(j === P.answer ? 'is-right' : j === i ? 'is-wrong' : 'is-dim'); });
        chipMark(btns[P.answer], true); if (!ok && i >= 0) chipMark(btns[i], false);
        record(q.fact, ok, { streak: true });
        sfx(ok ? 'correct' : 'wrong');
        const mile = ok && STREAKS.indexOf(S.streak) >= 0;
        if (mile) setTimeout(() => sfx('streak'), 200);
        modal.classList.remove('qz-card-in'); modal.classList.add(ok ? 'qz-ok' : 'qz-no');
        timer.classList.add('done');
        if (pips) { const now = pips.querySelector('.now'); if (now) now.className = ok ? 'done' : 'fail'; }
        if (strip) { const cur = strip.querySelector('.cur'); if (cur) cur.className = ok ? 'ok' : 'no'; }
        const missed = ok ? null : { fact: q.fact, q: q.q, answer: P.choices[P.answer], explain: q.explain || '', key: q.key };
        if (missed && RUN_CTX[ctx]) runMiss.push(missed);

        let streakEl = '';
        if (S.streak > 1) {
          streakEl = el('span', { class: 'qz-streak' + (mile ? ' hot' : '') }, mile ? ico('star', 16) : null, el('span', { text: 'Streak' }), el('b', { class: 'num', text: '×' + S.streak }));
          if (mile && !reduced()) for (let a = 0; a < 8; a++) { const sp = el('i', { class: 'qz-spark' }); sp.style.setProperty('--a', (a * 45 + 12) + 'deg'); streakEl.appendChild(sp); }
        } else if (!ok && before > 1) streakEl = el('span', { class: 'qz-streak lost', text: 'Streak reset' });
        const pill = pillFor(q);
        const medals = q.fact === 'cause:main' ? ['M', 'A', 'I', 'N'].map((k) => medal(k, 22)) : medal(q.key, 22);
        const cont = el('button', { class: 'btn primary big qz-continue', type: 'button', text: 'Continue' });
        const note = el('div', { class: 'qz-note key-' + pill.cls }, el('div', { class: 'qz-note-head' }, medals, el('span', { text: pill.label })), el('p', { class: 'qz-explain', text: q.explain || '' }));
        holdTop(veil, modal);
        fb.append(
          el('div', { class: 'qz-verdict' },
            el('span', { class: 'stamp qz-stamp ' + (ok ? 'good' : 'bad'), text: ok ? U.pick(YES) : (i < 0 ? 'TIME UP' : 'NOT QUITE') }), streakEl),
          note, cont);
        fb.hidden = false;
        settle(veil, modal);
        result = { correct: ok, questionId: q.id, factId: q.fact, timeMs: Math.round(performance.now() - t0), streak: S.streak };
        if (opts.stop && missed) result.miss = missed;
        setTimeout(() => { canGo = true; }, ok ? 220 : 450);
        cont.addEventListener('click', () => { if (canGo) finish(); });
        try {
          /* a card that outgrew the screen goes to its very end, so Continue and the note sit above the bottom edge */
          const toEnd = () => { if (cont.getBoundingClientRect().bottom > veil.getBoundingClientRect().bottom - 10) veil.scrollTop = veil.scrollHeight; };
          cont.focus({ preventScroll: true }); toEnd();
          /* after a miss the right choice is lit green in the list; if the card is so tall that it scrolled out of view, repeat it next to the note */
          if (!ok && btns[P.answer].getBoundingClientRect().top < veil.getBoundingClientRect().top + 4) {
            fb.insertBefore(el('div', { class: 'qz-answer' }, ico('check', 20), el('div', { class: 'qz-answer-text' }, el('span', { class: 'eyebrow', text: 'Answer' }), el('b', { text: P.choices[P.answer] }))), note);
            toEnd();
          }
        } catch (e) { /* older browsers */ }
        cue();
      }
      function finish() {
        if (done) return; done = true;
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', refit);
        if (tick) clearInterval(tick);
        sfx('click');
        leave(veil, () => { veil.remove(); openCount--; resolve(result); });
      }
      /* drill only: leave now. An unanswered card is dropped (nothing recorded); an answered one still counts. */
      function stop() {
        if (done) return;
        if (!answered) { answered = true; result = { stopped: true, answered: false }; }
        else result = Object.assign({}, result, { stopped: true });
        finish();
      }
      function onKey(e) {
        const k = e.key;
        if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (opts.stop && !e.repeat) stop(); return; }
        if (!answered) {
          let i = -1;
          if (k >= '1' && k <= '9') i = parseInt(k, 10) - 1;
          else if (P.choices[0] === 'True' && (k === 't' || k === 'T')) i = 0;
          else if (P.choices[0] === 'True' && (k === 'f' || k === 'F')) i = 1;
          if (i >= 0 && i < btns.length) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) choose(i); }
          else if (strayKey(e, modal, true)) { e.preventDefault(); e.stopPropagation(); }
        } else if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
          e.preventDefault(); e.stopPropagation();
          if (canGo && !e.repeat) finish();
        }
      }
      btns.forEach((b, i) => b.addEventListener('click', () => choose(i)));
      if (stopBtn) stopBtn.addEventListener('click', stop);
      window.addEventListener('keydown', onKey, true);
      if (timed) {
        const total = opts.timeLimit * 1000;
        timerFill.style.width = '100%';
        /* count only time the page is actually visible: locking the phone must not time the question out */
        let used = 0, prev = performance.now(), seen = false, waited = 0;
        tick = setInterval(() => {
          const now = performance.now(), dt = document.hidden ? 0 : Math.min(now - prev, 250);
          prev = now;
          /* the clock starts once the last choice is on screen (or after six seconds, so it cannot be stalled) */
          if (!seen) {
            let low = 0, edge = 0;
            try { low = btns[btns.length - 1].getBoundingClientRect().bottom; edge = veil.getBoundingClientRect().bottom; } catch (e) { /* ignore */ }
            seen = waited >= 6000 || low <= edge + 2;
            if (!seen) { waited += dt; return; }
          }
          used += dt;
          const left = total - used;
          timerFill.style.width = Math.max(0, (left / total) * 100) + '%';
          const sec = Math.ceil(left / 1000);
          secs.textContent = String(Math.max(0, sec));
          if (sec <= 5 && sec > 0 && sec < lastTick) { lastTick = sec; sfx('tick'); timer.classList.add('hot'); }
          if (left <= 0) choose(-1);
        }, 100);
      }
    });
  }

  let gauntlet = { right: 0, wrong: 0 };
  async function reviveGauntlet(n) {
    n = n || 3; gauntlet = { right: 0, wrong: 0 };
    for (let i = 1; i <= n; i++) {
      const r = await ask({ context: 'revive', header: 'LAST STAND', step: [i, n] });
      if (!r || !r.correct) { gauntlet.wrong++; return false; }
      gauntlet.right++;
    }
    return true;
  }

  /* ================= quick review (drill), run misses, review sheet ================= */
  const weakCount = () => { st(); return STUDY.facts.filter((f) => boxOf(f.id) < 2).length; };
  function runReset() { runMiss = []; }
  /* newest first, one per fact, at most 8 */
  function runMisses() {
    const seen = {}, out = [];
    for (let i = runMiss.length - 1; i >= 0 && out.length < 8; i--) { const m = runMiss[i]; if (seen[m.fact]) continue; seen[m.fact] = true; out.push({ q: m.q, answer: m.answer, explain: m.explain, key: m.key, fact: m.fact }); }
    return out;
  }
  /* the n weakest facts: just-missed first, then never seen, then box 1, then (only to fill up) the mastered ones he has not seen for longest */
  function weakest(n) {
    st();
    const pending = {}; retry.forEach((r) => { pending[r.fact] = true; });
    const missed = [], fresh = [], learning = [], solid = [];
    STUDY.facts.forEach((f) => {
      if (!byFact[f.id]) return;
      const x = S.mastery[f.id];
      if (!x || !x.s) fresh.push(f);
      else if (pending[f.id] || x.b === 0) missed.push(f);
      else if (x.b < 2) learning.push(f);
      else solid.push(f);
    });
    const seenAt = (f) => (S.mastery[f.id] ? S.mastery[f.id].t || 0 : 0);
    missed.sort((a, c) => seenAt(c) - seenAt(a));
    learning.sort((a, c) => seenAt(a) - seenAt(c));
    solid.sort((a, c) => seenAt(a) - seenAt(c));
    return missed.concat(U.shuffle(fresh), learning, solid).slice(0, n);
  }
  /* a question for one fact, with the same no-repeat bookkeeping the game uses */
  function questionFor(factId) {
    const all = byFact[factId] || STUDY.questions;
    const pool = all.filter((q) => recentQ.indexOf(q.id) < 0);
    const list = pool.length ? pool : all;
    let min = Infinity; list.forEach((q) => { const c = qCount[q.id] || 0; if (c < min) min = c; });
    const q = U.pick(list.filter((x) => (qCount[x.id] || 0) === min));
    qCount[q.id] = (qCount[q.id] || 0) + 1;
    recentQ.push(q.id); if (recentQ.length > 8) recentQ.shift();
    recentF.push(q.fact); if (recentF.length > 4) recentF.shift();
    const due = retry.findIndex((r) => r.fact === factId); if (due >= 0) retry.splice(due, 1);
    return q;
  }
  /* the "fix these" list: question, the right answer lit green, the explanation with its cause medal */
  function reviewList(items) {
    return el('div', { class: 'rv-list' }, items.map((m) => {
      const k = m && m.key && KEYS[m.key] ? m.key : null;
      return el('div', { class: 'rv-item' },
        el('div', { class: 'rv-q', text: (m && m.q) || '' }),
        el('div', { class: 'qz-answer' }, ico('check', 20), el('div', { class: 'qz-answer-text' }, el('span', { class: 'eyebrow', text: 'Answer' }), el('b', { text: (m && m.answer) || '' }))),
        m && m.explain ? el('div', { class: 'rv-why' + (k ? ' key-' + KEYS[k].cls : '') }, k ? medal(k, 22) : null, el('p', { text: m.explain })) : null);
    }));
  }
  function drill(opts) { opts = opts || {}; return once('drill', () => runDrill(opts)); }
  async function runDrill(opts) {
    st();
    const count = Math.max(1, Math.min(30, (opts.count | 0) || 10));
    let last = { correct: 0, total: 0, quit: false };
    openCount++;   /* the whole session counts as open, including the gaps between cards */
    try {
      for (;;) {
        const facts = weakest(count), before = readiness().overall, marks = [], misses = [];
        let quit = false;
        for (let i = 0; i < facts.length; i++) {
          const r = await askNow({ context: 'drill', question: questionFor(facts[i].id), step: [i + 1, facts.length], marks: marks.slice(), stop: true });
          if (r && r.answered !== false) { marks.push(!!r.correct); if (r.miss) misses.push(r.miss); }
          if (r && r.stopped) { quit = true; break; }
        }
        last = { correct: marks.filter(Boolean).length, total: marks.length, quit };
        if (!marks.length) break;   /* left before answering anything */
        if (!(await drillEnd(last, before, readiness().overall, misses))) break;
      }
    } catch (e) { if (window.console) console.error('quick review failed', e); }
    openCount--;
    return last;
  }
  /* end card: score, readiness before -> after, what to fix. Resolves true for "Again". */
  function drillEnd(res, before, after, misses) {
    return new Promise((resolve) => {
      const perfect = !res.quit && res.correct === res.total, fair = res.correct * 2 >= res.total;
      const again = el('button', { class: 'btn big', type: 'button', text: 'Again' });
      const doneBtn = el('button', { class: 'btn primary big', type: 'button', text: 'Done' });
      const fill = el('i', { style: { width: before + '%' } });
      const modal = el('div', { class: 'modal paper bz dr-end qz-card-in', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Quick review result' },
        el('div', { class: 'bz-head' }, el('div', { class: 'bz-top' }, el('span', { class: 'eyebrow bz-eyebrow' }, garnish('bolt', 16), 'Quick review'))),
        el('div', { class: 'bz-result' + (perfect ? ' perfect' : '') },
          el('span', { class: 'stamp qz-stamp ' + (perfect ? 'good' : fair ? 'mid' : 'bad'), text: perfect ? 'PERFECT' : fair ? 'NICE WORK' : 'KEEP GOING' }),
          el('div', { class: 'display bz-score num', text: res.correct + ' / ' + res.total }),
          el('div', { class: 'dr-ready' },
            el('div', { class: 'dr-ready-top' }, el('span', { class: 'eyebrow', text: 'Quiz Readiness' }),
              el('span', { class: 'dr-ready-n num' }, after === before ? el('b', { class: 'now', text: after + '%' }) : [el('span', { class: 'was', text: before + '%' }), el('span', { class: 'to', text: ' → ' }), el('b', { class: 'now', text: after + '%' })])),
            el('div', { class: 'bar' }, fill)),
          misses.length ? el('div', { class: 'bz-fixbox dr-fix' }, el('div', { class: 'eyebrow', text: misses.length === 1 ? 'Fix this one' : 'Fix these ' + misses.length }), reviewList(misses)) : null),
        el('div', { class: 'qz-foot dr-actions' }, again, doneBtn));
      const veil = el('div', { class: 'veil qz-veil' }, modal);
      const t0 = performance.now(); let done = false;
      const fin = (v) => { if (done || performance.now() - t0 < 400) return; done = true; window.removeEventListener('keydown', onKey, true); sfx('click'); leave(veil, () => { veil.remove(); openCount--; resolve(v); }); };
      const onKey = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) fin(e.key !== 'Escape' && document.activeElement === again); }
      };
      again.addEventListener('click', () => fin(true)); doneBtn.addEventListener('click', () => fin(false));
      window.addEventListener('keydown', onKey, true);
      root().appendChild(veil); openCount++;
      sfx(perfect ? 'streak' : 'card');
      setTimeout(() => { fill.style.width = after + '%'; }, reduced() ? 0 : 250);
      if (perfect) confetti(modal);
      toFocus(doneBtn);
    });
  }
  /* a closable paper sheet listing [{q, answer, explain, key}] — e.g. Quiz.runMisses() on the results screen */
  function reviewSheet(list, title) { return once('sheet', () => runSheet(Array.isArray(list) ? list.filter(Boolean) : [], title)); }
  function runSheet(list, title) {
    st();
    return new Promise((resolve) => {
      const closeBtn = el('button', { class: 'qz-stop', type: 'button', text: 'Close' });
      const doneBtn = el('button', { class: 'btn primary big', type: 'button', text: 'Done' });
      const modal = el('div', { class: 'modal paper bz rv-sheet qz-card-in', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Review', tabindex: '-1' },
        el('div', { class: 'qz-head' }, el('div', { class: 'display qz-header' }, el('span', { text: title || 'What to fix' })), closeBtn),
        list.length ? reviewList(list) : el('div', { class: 'qz-q', text: 'Nothing to review. Every answer was right.' }),
        el('div', { class: 'qz-foot' }, doneBtn));
      const veil = el('div', { class: 'veil qz-veil' }, modal);
      let done = false;
      const fin = () => { if (done) return; done = true; window.removeEventListener('keydown', onKey, true); sfx('click'); leave(veil, () => { veil.remove(); openCount--; resolve(); }); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) fin(); }
        else if (strayKey(e, modal, true)) { e.preventDefault(); e.stopPropagation(); }
      };
      closeBtn.addEventListener('click', fin); doneBtn.addEventListener('click', fin);
      window.addEventListener('keydown', onKey, true);
      root().appendChild(veil); openCount++;
      toFocus(modal);
      sfx('card');
    });
  }

  /* ================= bonus rounds ================= */
  function frame(title, sub) {
    const pips = el('div', { class: 'bz-pips', role: 'img', 'aria-label': 'Progress' });
    const body = el('div', { class: 'bz-body' });
    const modal = el('div', { class: 'modal paper bz qz-card-in', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Bonus round', tabindex: '-1' },
      el('div', { class: 'bz-head' },
        el('div', { class: 'bz-top' }, el('span', { class: 'eyebrow bz-eyebrow' }, garnish('chest', 16), 'Bonus round'), pips),
        el('h2', { class: 'display bz-title', text: title }),
        el('div', { class: 'bz-sub', text: sub })),
      body);
    const veil = el('div', { class: 'veil qz-veil' }, modal);
    const esc = (e) => { if (e.key === 'Escape' || strayKey(e, modal, true)) { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener('keydown', esc, true);
    root().appendChild(veil); openCount++;
    const cue = scrollCue(veil);
    toFocus(modal);
    sfx('chest');
    let dots = [];
    return { veil, modal, body,
      /* call after drawing a card: on a short screen the type only ever gets tighter during one round, so it never jumps back */
      fit() { fit(veil, modal, true); cue(); },
      /* a button pinned to the bottom edge of the card (it stays on screen however tall the card is). Returns the footer. */
      foot(btn) { const f = el('div', { class: 'qz-foot' }, btn); modal.appendChild(f); settle(veil, modal); cue(); return f; },
      unfoot(f) { if (f) f.remove(); cue(); },
      /* while a judged card grows (correction, button) keep the top of the frame where it is; release before the next card */
      hold() { holdTop(veil, modal); },
      release() { modal.style.marginTop = ''; },
      /* progress strip: one pip per card/step. state: '' | 'cur' | 'on' | 'ok' | 'no' */
      steps(n) { pips.innerHTML = ''; dots = []; for (let i = 0; i < n; i++) { const d = el('i'); dots.push(d); pips.appendChild(d); } },
      step(i, state, label) { if (dots[i]) dots[i].className = state || ''; if (label) pips.setAttribute('aria-label', label); },
      clearSteps() { pips.innerHTML = ''; dots = []; },
      close() { return new Promise((res) => { window.removeEventListener('keydown', esc, true); leave(veil, () => { veil.remove(); openCount--; res(); }); }); } };
  }
  /* wait for one of the buttons (click or number key) */
  function pickOne(btns, lockMs) {
    return new Promise((res) => {
      const t0 = performance.now(); let done = false;
      const fin = (i) => { if (done || performance.now() - t0 < (lockMs == null ? 200 : lockMs)) return; done = true; window.removeEventListener('keydown', onKey, true); res(i); };
      const onKey = (e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= btns.length) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) fin(n - 1); } };
      window.addEventListener('keydown', onKey, true);
      btns.forEach((b, i) => b.addEventListener('click', () => fin(i)));
    });
  }
  function waitContinue(btn, lockMs) {
    return new Promise((res) => {
      const t0 = performance.now(); let done = false;
      const fin = () => { if (done || performance.now() - t0 < (lockMs || 350)) return; done = true; window.removeEventListener('keydown', onKey, true); sfx('click'); res(); };
      const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) fin(); } };
      window.addEventListener('keydown', onKey, true);
      btn.addEventListener('click', fin);
      try { btn.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    });
  }
  /* shared runner: one card at a time, pick the right option */
  async function classify(fr, T, items, cfg) {
    let correct = 0; const fixes = [];
    const cardBox = el('div', { class: 'bz-cardbox' });
    const optBox = el('div', { class: 'bz-opts' });
    fr.body.append(cardBox, optBox);
    fr.steps(items.length);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      fr.release();
      fr.step(i, 'cur', 'Card ' + (i + 1) + ' of ' + items.length);
      const card = cfg.card(it, i);
      card.classList.add('bz-in');
      cardBox.innerHTML = ''; cardBox.appendChild(card);
      const options = it.options || cfg.options;
      optBox.className = 'bz-opts n' + options.length + (cfg.optClass ? ' ' + cfg.optClass : '');
      optBox.innerHTML = '';
      const btns = options.map((o, k) => { const bt = el('button', { class: 'btn bz-opt ' + (o.cls || ''), type: 'button' },
        el('span', { class: 'qz-key', text: String(k + 1) }), el('span', { class: 'qz-choice-text', text: o.text })); bt.style.setProperty('--i', String(k)); return bt; });
      btns.forEach((bt) => optBox.appendChild(bt));
      fr.fit();
      const k = await pickOne(btns);
      const ok = k === it.answer;
      fr.hold();
      T.add(it.fact, ok);
      btns.forEach((bt, j) => { bt.disabled = true; bt.classList.add(j === it.answer ? 'is-right' : j === k ? 'is-wrong' : 'is-dim'); });
      if (options[it.answer] && options[it.answer].medal) btns[it.answer].insertBefore(medal(options[it.answer].medal, 22), btns[it.answer].firstChild);   /* the cause medal shows only now */
      chipMark(btns[it.answer], true); if (!ok) chipMark(btns[k], false);
      card.classList.remove('bz-in'); card.classList.add(ok ? 'is-right' : 'is-wrong');
      fr.step(i, ok ? 'ok' : 'no');
      if (ok) { correct++; sfx('correct', { pitch: 1 + i * 0.05 }); } else { sfx('wrong'); if (it.fix) fixes.push(it.fix); }
      if (cfg.after) cfg.after(it, ok, card, i);
      if (!ok && it.fix) card.appendChild(el('div', { class: 'bz-fix', html: it.fixShort || it.fix }));
      else if (it.note) card.appendChild(el('div', { class: 'bz-note', text: it.note }));
      if (ok) await sleep(it.note ? 1000 : 430);
      else {   /* a miss waits for him: time to read the correction */
        const go = el('button', { class: 'btn primary big', type: 'button', text: i === items.length - 1 ? 'Continue' : 'Got it' });
        const f = fr.foot(go);
        try { card.scrollIntoView({ block: 'nearest' }); } catch (e) { /* older browsers */ }
        await waitContinue(go, 450);
        fr.unfoot(f);
      }
    }
    return { correct, total: items.length, fixes };
  }
  const bigCard = (eyebrow, text, cls) => el('div', { class: 'bz-card ' + (cls || '') }, el('div', { class: 'eyebrow', text: eyebrow }), el('div', { class: 'bz-card-text', text }));
  const b = (s) => '<b>' + U.esc(s) + '</b>';

  const GAMES = {
    sides: {
      title: 'PICK A SIDE', sub: 'Allied Powers, Central Powers, or neutral in 1914?',
      async run(fr, T) {
        const cen = U.shuffle(STUDY.central).slice(0, 3);
        const al = U.shuffle(STUDY.alliedMain || STUDY.allied).slice(0, 3);
        const extra = U.pick(STUDY.allied.filter((c) => al.indexOf(c) < 0));
        const list = U.shuffle(cen.concat(al, [extra], STUDY.neutral.slice(0, 1)));
        const idx = { allied: 0, central: 1, neutral: 2 };
        const items = list.map((c) => { const s = STUDY.sideOf(c); return { c, answer: idx[s], fact: 'side:' + c, fix: b(c) + ' → ' + U.esc(STUDY.sideLabel[s]) + (c === 'Italy' ? ' (switched sides to join the Allies in 1915)' : s === 'neutral' ? ' — never list the USA as an Allied Power' : '') }; });
        const r = await classify(fr, T, items, {
          options: [{ text: 'ALLIED POWERS', cls: 'side-allied' }, { text: 'CENTRAL POWERS', cls: 'side-central' }, { text: 'NEUTRAL IN 1914', cls: 'side-neutral' }],
          card: (it) => bigCard('Which side?', it.c === 'Italy' ? 'Italy (from 1915)' : it.c, 'big'),   /* Italy changed sides, so the card says when */
        });
        r.note = 'Central Powers = <b>B</b>ears <b>A</b>te <b>G</b>reen <b>O</b>ranges: Bulgaria, Austria-Hungary, Germany, Ottoman Empire.';
        return r;
      },
    },
    causes: {
      title: 'CAUSE OR NOT?', sub: 'Is it one of the causes of World War I?',
      async run(fr, T) {
        const items = U.shuffle(STUDY.terms).map((t) => ({ t, answer: t.cause ? 0 : 1, fact: t.cause ? 'cause:main' : 'cause:' + t.id,
          fix: b(t.name) + (t.cause ? ' IS a cause — the ' + t.letter + ' in M.A.I.N.' : ' is NOT a cause. ' + U.esc(t.note.replace(/^NOT a cause of WWI: /, '').replace(/^./, (ch) => ch.toUpperCase()))),
          note: t.cause ? 'Yes — the ' + t.letter + ' in M.A.I.N.' : t.note.replace(/^NOT a cause of WWI: /, 'Right — ') }));
        const r = await classify(fr, T, items, {
          options: [{ text: 'CAUSE OF WWI', cls: 'opt-yes' }, { text: 'NOT A CAUSE', cls: 'opt-no' }],
          card: (it) => bigCard('Cause or not?', it.t.name, 'big'),
        });
        r.note = U.esc(STUDY.lines.main || '') + ' Isolationism and communism are NOT causes.';
        return r;
      },
    },
    ls: {
      title: 'LONG-TERM OR SPARK?', sub: 'Is it a long-term cause, or the spark?',
      async run(fr, T) {
        const base = STUDY.longOrSpark.filter((x) => !x.variant);
        const vars = U.shuffle(STUDY.longOrSpark.filter((x) => x.variant));
        const vS = vars.filter((x) => x.ans === 'S').slice(0, 1), vL = vars.filter((x) => x.ans === 'L').slice(0, 1);
        const items = U.shuffle(base.concat(vS, vL)).map((x) => ({ x, answer: x.ans === 'L' ? 0 : 1, fact: x.fact,
          fix: b(x.text) + ' → ' + (x.ans === 'L' ? 'Long-term cause' : 'Spark'), fixShort: x.ans === 'L' ? 'That is a ' + b('long-term cause') + ': it built up for years.' : 'That is the ' + b('spark') + ': the one event that lit the fuse.' }));
        const r = await classify(fr, T, items, {
          options: [{ text: 'L · LONG-TERM CAUSE', cls: 'opt-l' }, { text: 'S · SPARK', cls: 'opt-s' }],
          card: (it) => bigCard('Long-term cause or spark?', it.x.text),
        });
        r.note = 'Only ONE spark: the assassination of Archduke Franz Ferdinand. Armies, colonies and alliances built up for years.';
        return r;
      },
    },
    clues: {
      title: 'CLUE MATCH', sub: 'Match each clue phrase to its term.',
      async run(fr, T) {
        /* chips stay plain until he answers; the right one then gets its cause medal */
        const options = STUDY.terms.map((t) => ({ text: t.name, medal: t.key }));
        const items = U.shuffle(STUDY.terms.filter((t) => t.clue)).map((t) => ({ t, answer: STUDY.terms.indexOf(t), fact: 'clue:' + t.id, fix: '"' + U.esc(t.clue) + '" → ' + b(t.name), fixShort: 'That clue means ' + b(t.name) }));
        return classify(fr, T, items, { options, optClass: 'chips', card: (it) => bigCard('Clue words', '"' + it.t.clue + '"', 'quote') });
      },
    },
    story: {
      title: 'FILL THE TELEGRAM', sub: 'Pick the word that fills the glowing blank.',
      async run(fr, T) {
        const st0 = STUDY.story; const filled = [];
        const items = st0.blanks.map((bl) => { const opts = U.shuffle(bl.options); return { bl, options: opts.map((t) => ({ text: t })), answer: opts.indexOf(bl.answer), fact: bl.fact, fix: 'The word was ' + b(bl.answer) }; });
        const render = (cur, fresh) => {
          const p = el('p', { class: 'bz-story' });
          st0.parts.forEach((part, i) => {
            p.appendChild(document.createTextNode(part));
            if (i < st0.blanks.length) {
              const f = filled[i];
              p.appendChild(el('span', { class: 'bz-blank' + (f ? (f.ok ? ' ok' : ' no') : '') + (i === cur && !f ? ' cur' : '') + (i === fresh ? ' snap' : ''), text: f ? st0.blanks[i].answer : '' }));
            }
          });
          return el('div', { class: 'bz-card story' }, el('div', { class: 'eyebrow bz-wire', text: 'Telegram · urgent' }), p);
        };
        const r = await classify(fr, T, items, {
          optClass: 'words',
          card: (it, i) => render(i, -1),
          after: (it, ok, card, i) => { filled[i] = { ok }; const fresh = render(-1, i); card.innerHTML = ''; while (fresh.firstChild) card.appendChild(fresh.firstChild); },
        });
        r.fixes = r.fixes.length ? [U.esc(STUDY.lines.story || '')] : [];
        return r;
      },
    },
    chain: {
      title: 'CHAIN REACTION', sub: 'Tap the five events in order, first to last.',
      run(fr, T) {
        return new Promise((res) => {
          const order = U.shuffle([0, 1, 2, 3, 4]);
          const first = [true, true, true, true, true];
          let next = 0; const t0 = performance.now();
          const list = el('div', { class: 'bz-chain' });
          const rows = [];
          fr.steps(5); fr.step(0, 'cur', 'Event 1 of 5');
          order.forEach((idx) => {
            const num = el('span', { class: 'bz-num num' });
            const btn = el('button', { class: 'btn bz-chain-item', type: 'button', style: { order: '10' } }, num, el('span', { class: 'qz-choice-text', text: STUDY.chain[idx] }));
            rows.push(btn);
            btn.addEventListener('click', () => {
              if (btn.disabled || performance.now() - t0 < 250) return;
              if (idx === next) {
                const was = tops(rows);
                btn.disabled = true; btn.classList.add('is-right'); btn.style.order = String(next); num.textContent = String(next + 1); num.classList.add('stamped');
                slide(rows, was);
                T.add('chain:' + (next + 1), first[next]);
                sfx('correct', { pitch: 1 + next * 0.1 });
                fr.step(next, first[next] ? 'ok' : 'no');
                next++;
                if (next < 5) fr.step(next, 'cur', 'Event ' + (next + 1) + ' of 5');
                if (next === 5) {
                  const correct = first.filter(Boolean).length;
                  T.add('chain:order', correct === 5);
                  setTimeout(() => res({ correct, total: 5, fixes: correct === 5 ? [] : STUDY.chain.map((s, i) => b((i + 1) + '.') + ' ' + U.esc(s)), note: correct === 5 ? 'Assassination → Austria-Hungary → Russia → Germany → Great Britain.' : '' }), 650);
                }
              } else {
                first[next] = false; sfx('wrong');
                btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
              }
            });
            list.appendChild(btn);
          });
          fr.body.appendChild(list);
          fr.fit();
        });
      },
    },
    central: {
      title: 'THE CENTRAL POWERS', sub: 'Tap the four Central Powers, then Check.',
      run(fr, T) {
        return new Promise((res) => {
          const pool = U.shuffle(STUDY.central.concat(U.shuffle(STUDY.alliedMain || STUDY.allied).slice(0, 5), STUDY.neutral.slice(0, 1)));
          const picked = new Set(); const t0 = performance.now(); let locked = false;
          const grid = el('div', { class: 'bz-grid' });
          const check = el('button', { class: 'btn primary big bz-check', type: 'button', disabled: true, text: 'Pick 4' });
          const pips = () => { for (let i = 0; i < 4; i++) fr.step(i, i < picked.size ? 'on' : '', picked.size + ' of 4 picked'); };
          const tiles = pool.map((c, i) => {
            const t = el('button', { class: 'btn bz-tile', type: 'button', 'aria-pressed': 'false', text: c });
            t.style.setProperty('--i', String(i));
            t.addEventListener('click', () => {
              if (locked || performance.now() - t0 < 250) return;
              if (picked.has(c)) picked.delete(c); else { if (picked.size >= 4) { check.classList.remove('shake'); void check.offsetWidth; check.classList.add('shake'); return; } picked.add(c); }
              t.classList.toggle('on', picked.has(c)); t.setAttribute('aria-pressed', picked.has(c) ? 'true' : 'false');
              sfx('select');
              check.disabled = picked.size !== 4; check.textContent = picked.size === 4 ? 'Check' : 'Pick ' + (4 - picked.size) + ' more';
              pips();
            });
            grid.appendChild(t); return t;
          });
          fr.steps(4); pips();
          check.addEventListener('click', () => {
            if (locked || picked.size !== 4) return; locked = true; check.disabled = true;
            let correct = 0; const fixes = [];
            grid.classList.add('judged');
            pool.forEach((c, i) => {
              const isC = STUDY.central.indexOf(c) >= 0, on = picked.has(c);
              tiles[i].disabled = true;
              if (isC && on) { correct++; tiles[i].classList.add('is-right'); T.add('side:' + c, true); }
              else if (isC && !on) { tiles[i].classList.add('is-missed'); T.add('side:' + c, false); fixes.push(b(c) + ' is a Central Power.'); }
              else if (!isC && on) { tiles[i].classList.add('is-wrong'); T.add('side:' + c, false); fixes.push(b(c) + (c === 'United States' ? ' was neutral in 1914.' : ' was an Allied Power.')); }
              else tiles[i].classList.add('is-dim');
            });
            for (let i = 0; i < 4; i++) fr.step(i, i < correct ? 'ok' : 'no');
            T.add('sides:central4', correct === 4);
            sfx(correct === 4 ? 'correct' : 'wrong');
            const out = { correct, total: 4, fixes, note: '<b>B</b>ears <b>A</b>te <b>G</b>reen <b>O</b>ranges = Bulgaria, Austria-Hungary, Germany, Ottoman Empire.' };
            if (correct === 4) setTimeout(() => res(out), 800);
            else { check.textContent = 'Continue'; check.disabled = false; waitContinue(check, 450).then(() => res(out)); }   /* a miss waits for him */
          });
          fr.body.append(grid, check);
          fr.fit();
        });
      },
    },
  };
  let bag = [], lastKind = null;
  function nextKind() {
    if (!bag.length) { bag = U.shuffle(Object.keys(GAMES)); if (bag[bag.length - 1] === lastKind && bag.length > 1) bag.unshift(bag.pop()); }
    lastKind = bag.pop(); return lastKind;
  }
  function bonusRound(opts) { opts = opts || {}; return serial(() => runBonus(opts)); }
  async function runBonus(opts) {
    st();
    const kind = opts.kind && GAMES[opts.kind] ? opts.kind : nextKind();
    const g = GAMES[kind];
    const fr = frame(g.title, g.sub);
    let r = { correct: 0, total: 1, fixes: [] };
    try {
      const T = tally();
      r = await g.run(fr, T);
      T.flush();
      const perfect = r.correct === r.total, fair = r.correct * 2 >= r.total;
      if (perfect) { S.bonusPerfect++; SaveX.commit(); }
      sfx(perfect ? 'streak' : 'card');
      fr.clearSteps();
      fr.release();
      fr.body.innerHTML = '';
      const cont = el('button', { class: 'btn primary big', type: 'button', text: 'Continue' });
      fr.body.appendChild(el('div', { class: 'bz-result' + (perfect ? ' perfect' : '') },
        el('span', { class: 'stamp qz-stamp ' + (perfect ? 'good' : fair ? 'mid' : 'bad'), text: perfect ? 'PERFECT' : fair ? 'NOT BAD' : 'STUDY THIS' }),
        el('div', { class: 'display bz-score num', text: r.correct + ' / ' + r.total }),
        r.fixes && r.fixes.length ? el('div', { class: 'bz-fixbox' }, el('div', { class: 'eyebrow', text: 'Get these next time' }),
          el('ul', { class: 'bz-fixes' }, r.fixes.map((h) => el('li', {}, el('span', { html: h }))))) : '',
        r.note ? el('div', { class: 'bz-note', html: r.note }) : ''));
      fr.foot(cont);
      try { fr.veil.scrollTop = 0; } catch (e) { /* ignore */ }
      if (perfect) confetti(fr.modal);
      await waitContinue(cont, 450);
    } catch (e) { if (window.console) console.error('bonus round failed', e); }
    await fr.close();
    return { kind, correct: r.correct, total: r.total, score: r.total ? r.correct / r.total : 0, perfect: r.correct === r.total };
  }

  /* ================= practice test ================= */
  const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '').replace(/^the(?=.{2})/, '');
  /* edit distance; two swapped neighbouring letters count as one slip */
  function lev(a, c) {
    const m = a.length, n = c.length; if (!m) return n; if (!n) return m;
    let prev2 = null, prev = []; for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === c[j - 1] ? 0 : 1));
        if (prev2 && j > 1 && a[i - 1] === c[j - 2] && a[i - 2] === c[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v;
      }
      prev2 = prev; prev = cur;
    }
    return prev[n];
  }
  /* how many slips a spelling of this length may have: none in short words, never more than two */
  const slack = (L) => (L <= 4 ? 0 : L <= 7 ? 1 : 2);
  /* a different real answer that happens to sit one slip away from a right one */
  const NEVER = { prussia: 1, prussianempire: 1 };
  /* how far what he typed is from one accepted spelling; -1 when it is too far to count */
  function near(input, alias) {
    if (input === alias) return 0;
    const tol = slack(alias.length);
    if (!tol || NEVER[input] || Math.abs(input.length - alias.length) > tol) return -1;
    const d = lev(input, alias);
    return d <= tol ? d : -1;
  }
  const fuzzy = (input, alias) => near(input, alias) >= 0;
  /* the year blank may come with a date around it ("June 28, 1914"), but every year in it has to be 1914 */
  const only1914 = (v) => { const m = String(v).match(/\d{4,}/g) || []; return m.length > 0 && m.every((y) => y === '1914'); };
  const AL = {
    'Germany': ['germany', 'germanempire', 'deutschland'],
    'Austria-Hungary': ['austriahungary', 'austrohungary', 'austrohungarianempire', 'austriahungarianempire', 'austrohungarian', 'austriahungaryempire', 'austriaandhungary'],
    'Ottoman Empire': ['ottomanempire', 'ottoman', 'ottomans', 'ottomanturks'],
    'Bulgaria': ['bulgaria'],
    'Great Britain': ['greatbritain', 'britain', 'uk', 'unitedkingdom', 'gb', 'britishempire'],
    'France': ['france'], 'Russia': ['russia', 'russianempire'], 'Italy': ['italy'], 'Serbia': ['serbia'], 'Belgium': ['belgium'], 'Japan': ['japan'],
    'Militarism': ['militarism'], 'Alliances': ['alliances', 'alliance', 'alliancesystem', 'alliancesystems', 'systemofalliances'], 'Imperialism': ['imperialism'], 'Nationalism': ['nationalism'],
  };
  const G = (names) => names.map((n) => ({ name: n, aliases: AL[n] || [norm(n)] }));
  const TYPED = [
    { id: 'central', must: true, fact: 'sides:central4', topic: 'sides', q: 'Type the four Central Powers.', slots: 4, need: 4, groups: G(STUDY.central), answerText: 'Germany, Austria-Hungary, Ottoman Empire, Bulgaria', explain: 'Bears Ate Green Oranges: Bulgaria, Austria-Hungary, Germany, Ottoman Empire.' },
    { id: 'allied', fact: 'sides:allied4', topic: 'sides', q: 'Name four Allied Powers.', slots: 4, need: 4, groups: G(STUDY.allied), answerText: 'Any four of: Great Britain, France, Russia, Italy, Serbia (also Belgium or Japan)', explain: STUDY.lines.allied5 || '' },
    { id: 'main', fact: 'cause:main', topic: 'vocab', q: 'What does M.A.I.N. stand for? Type the four causes.', slots: 4, need: 4, labels: ['M', 'A', 'I', 'N'], groups: G(['Militarism', 'Alliances', 'Imperialism', 'Nationalism']), answerText: 'Militarism, Alliances, Imperialism, Nationalism', explain: STUDY.lines.main || '' },
    { id: 'assassin', fact: 'spark:assassin', topic: 'spark', q: 'Who assassinated Archduke Franz Ferdinand?', slots: 1, need: 1, groups: [{ name: 'Gavrilo Princip', aliases: ['gavriloprincip', 'princip', 'gavriloprinciple', 'principle'] }], answerText: 'Gavrilo Princip', explain: STUDY.lines.story || '' },
    { id: 'city', fact: 'spark:city', topic: 'spark', q: 'In which city was the Archduke assassinated?', slots: 1, need: 1, groups: [{ name: 'Sarajevo', aliases: ['sarajevo'] }], answerText: 'Sarajevo', explain: STUDY.lines.story || '' },
    { id: 'year', fact: 'spark:date', topic: 'spark', q: 'In what year was Archduke Franz Ferdinand assassinated?', slots: 1, need: 1, test: only1914, groups: [{ name: '1914', aliases: ['1914', 'june281914'] }], answerText: '1914 (June 28, 1914)', explain: STUDY.lines.story || '' },
    { id: 'heir', fact: 'spark:heir', topic: 'spark', q: 'Archduke Franz Ferdinand was heir to the throne of which empire?', slots: 1, need: 1, groups: G(['Austria-Hungary']), answerText: 'Austria-Hungary', explain: STUDY.lines.story || '' },
    { id: 'usa', fact: 'ex:isolationism', topic: 'vocab', q: "Which vocabulary term describes the United States' position when the war began in 1914?", slots: 1, need: 1, groups: [{ name: 'Isolationism', aliases: ['isolationism', 'isolationist', 'isolation'] }], answerText: 'Isolationism', explain: 'Isolationism: the United States followed a policy of neutrality in 1914 and refused to join the fighting in Europe.' },
    { id: 'africa', fact: 'imp:africa', topic: 'compete', q: 'Which continent were European countries competing to colonize the most?', slots: 1, need: 1, groups: [{ name: 'Africa', aliases: ['africa'] }], answerText: 'Africa', explain: 'Africa — the "Scramble for Africa."' },
    { id: 'navy', fact: 'mil:best-navy', topic: 'compete', q: "Which country had the world's best navy before WWI?", slots: 1, need: 1, groups: G(['Great Britain']), answerText: 'Great Britain', explain: "Great Britain had the world's best navy; Germany tried to build a rival navy to match it." },
    { id: 'rival', fact: 'mil:rival-navy', topic: 'compete', q: "Which country tried to build a rival navy to match Great Britain's?", slots: 1, need: 1, groups: G(['Germany']), answerText: 'Germany', explain: "Germany tried to build a navy to rival Great Britain's — the naval arms race." },
  ];
  /* a one-answer box may hold a few extra words ("Sarajevo, Bosnia", "it was Gavrilo Princip"): the answer has to be in
     there, and no rival answer with it ("Germany or Britain" is a hedge, not an answer) */
  function looseHit(item, n) {
    const mine = []; item.groups.forEach((grp) => grp.aliases.forEach((a) => mine.push(a)));
    if (!mine.some((a) => a.length >= 6 && n.indexOf(a) >= 0)) return false;
    for (const name in AL) for (const a of AL[name]) {
      if (a.length >= 5 && mine.indexOf(a) < 0 && n.indexOf(a) >= 0 && !mine.some((m) => m.indexOf(a) >= 0)) return false;
    }
    return true;
  }
  const SPLIT = /\s*(?:,|;|\/|\n|&|\+|\band\b)\s*/i;
  /* each typed value goes to the CLOSEST answer nobody has claimed yet: exact spellings first, then one slip, then two */
  function gradeTyped(item, values) {
    const raw = (values || []).filter((v) => v != null && String(v).trim());
    if (item.test) { const hit = raw.some((v) => item.test(v)) ? 1 : 0; return { ok: hit >= item.need, got: hit }; }
    const known = (n) => item.groups.some((grp) => grp.aliases.some((a) => near(n, a) >= 0));
    if (item.slots === 1) {
      const v = raw.length ? String(raw[0]) : '', whole = norm(v); if (!whole) return { ok: false, got: 0 };
      const head = norm(v.split(/[,;(\[\/]|\s[-–—]\s/)[0]);
      const hit = known(whole) || (head && known(head)) || looseHit(item, whole);
      return { ok: !!hit, got: hit ? 1 : 0 };
    }
    /* several answers in one box ("Germany, Bulgaria and Austria-Hungary") count one by one */
    const toks = [];
    raw.forEach((v) => {
      const whole = norm(v); if (!whole) return;
      if (known(whole)) { toks.push(whole); return; }
      const parts = String(v).split(SPLIT).map(norm).filter(Boolean);
      if (parts.length > 1) parts.forEach((x) => toks.push(x)); else toks.push(whole);
    });
    const pairs = [];
    toks.forEach((n, vi) => {
      item.groups.forEach((grp, gi) => {
        let best = -1;
        grp.aliases.forEach((a) => { const d = near(n, a); if (d >= 0 && (best < 0 || d < best)) best = d; });
        if (best >= 0) pairs.push([best, vi, gi]);
      });
    });
    pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
    const usedV = {}, usedG = {}; let got = 0;
    pairs.forEach((x) => { if (usedV[x[1]] || usedG[x[2]]) return; usedV[x[1]] = usedG[x[2]] = true; got++; });
    /* listing extra countries to be safe does not count: no more answers than there are boxes */
    return { ok: got >= item.need && toks.length <= item.slots, got };
  }
  function buildPractice() {
    const plan = { vocab: 5, sides: 4, compete: 4, spark: 4 };
    const typed = [TYPED[0]].concat(U.shuffle(TYPED.slice(1)).slice(0, 2));
    const skip = {}; typed.forEach((t) => { skip[t.fact] = true; });
    let items = [];
    Object.keys(plan).forEach((topic) => {
      const facts = STUDY.facts.filter((f) => f.topic === topic && byFact[f.id] && !skip[f.id])
        .map((f) => ({ f, w: boxOf(f.id) + Math.random() * 2.5 })).sort((a, c) => a.w - c.w).slice(0, plan[topic]);
      facts.forEach((x) => { const q = U.pick(byFact[x.f.id]); items.push({ P: present(q), fact: q.fact, topic: q.topic }); });
    });
    items = U.shuffle(items);
    typed.forEach((t, i) => items.splice(Math.min(items.length, 4 + i * 6), 0, { typed: t, fact: t.fact, topic: t.topic }));
    return items;
  }
  function practiceTest() { return once('practice', runPractice); }
  function runPractice() {
    st();
    return new Promise((resolve) => {
      const wrap = el('div', { class: 'wrap' });
      const screen = el('div', { class: 'screen pt qz-screen-in', tabindex: '-1' }, wrap);
      root().appendChild(screen); openCount++;
      const cue = scrollCue(screen);
      toFocus(screen);
      let keyFn = null, last = { score: 0, total: 0, pct: 0 }, closed = false, armT = 0, goT = 0;
      /* ONE key listener for the whole test (the cards only swap what it does), removed on every way out.
         Space / Enter never reach the button behind the test. */
      const onKey = (e) => { if (closed) return; if (keyFn) keyFn(e); if (!e.defaultPrevented && strayKey(e, screen, true)) { e.preventDefault(); e.stopPropagation(); } };
      window.addEventListener('keydown', onKey, true);
      const setKey = (fn) => { keyFn = closed ? null : fn; };
      const close = () => {
        if (closed) return; closed = true; keyFn = null;
        window.removeEventListener('keydown', onKey, true); clearTimeout(armT); clearTimeout(goT);
        sfx('click'); leave(screen, () => { screen.remove(); openCount--; resolve(last); });
      };

      function start() {
        if (closed) return;
        const items = buildPractice(); const answers = []; let i = 0, armed = false, armAt = 0;
        const count = el('div', { class: 'display pt-count num' });
        const fill = el('i');
        /* two taps to quit; the armed label is the same width, so nothing in the header moves */
        const quit = el('button', { class: 'btn small ghost pt-quit', type: 'button', text: 'Quit' });
        quit.addEventListener('click', () => {
          if (armed) { if (performance.now() - armAt < 350) return; return close(); }
          armed = true; armAt = performance.now(); quit.textContent = 'Tap again'; quit.classList.add('danger'); quit.setAttribute('aria-label', 'Tap again to quit the practice test');
          clearTimeout(armT); armT = setTimeout(() => { armed = false; quit.textContent = 'Quit'; quit.classList.remove('danger'); quit.removeAttribute('aria-label'); }, 2500);
        });
        const slot = el('div', { class: 'pt-slot' });
        screen.classList.remove('pt-done');
        wrap.innerHTML = '';
        wrap.append(
          el('div', { class: 'pt-top' }, el('div', { class: 'grow' }, el('div', { class: 'eyebrow pt-eyebrow' }, garnish('pencil', 16), 'Practice test'), count), quit),
          el('div', { class: 'bar pt-bar' }, fill),
          slot);
        const next = () => { if (closed) return; i++; if (i < items.length) show(); else results(items, answers); };
        function show() {
          if (closed) return;
          const it = items[i]; let moved = false;
          const shownAt = performance.now();
          const early = () => performance.now() - shownAt < 350;   /* a tap that was meant for the question before */
          count.textContent = 'Question ' + (i + 1) + ' of ' + items.length;
          fill.style.width = ((i / items.length) * 100) + '%';
          const card = el('div', { class: 'paper pt-card pt-in' });
          const go = () => { if (moved || closed) return; moved = true; sfx('click'); next(); };
          if (it.typed) {
            const t = it.typed;
            const inputs = [], fields = [];
            for (let k = 0; k < t.slots; k++) {
              const id = 'pt-' + t.id + '-' + k;
              const inp = el('input', { class: 'pt-input', id, name: id, type: 'text', autocomplete: 'off', autocapitalize: 'words', autocorrect: 'off', spellcheck: 'false', enterkeyhint: k < t.slots - 1 ? 'next' : 'done', 'aria-label': 'Answer ' + (k + 1), placeholder: t.slots > 1 ? '' : 'Type your answer' });
              inputs.push(inp);
              fields.push(el('label', { class: 'pt-field', for: id }, t.slots > 1 ? el('span', { class: 'qz-key', text: t.labels ? t.labels[k] : String(k + 1) }) : null, inp));
            }
            const nextBtn = el('button', { class: 'btn primary big', type: 'button', text: i === items.length - 1 ? 'Finish' : 'Next' });
            const save = () => { answers[i] = inputs.map((x) => x.value); };
            nextBtn.addEventListener('click', () => { if (early()) return; save(); go(); });
            card.append(el('div', { class: 'eyebrow', text: 'Type your answer' }), el('div', { class: 'qz-q', text: t.q }),
              el('div', { class: 'pt-inputs' + (t.slots > 1 ? ' multi' : '') }, fields), el('div', { class: 'mute pt-hint', text: 'Spelling does not have to be perfect.' }), nextBtn);
            setKey((e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault(); e.stopPropagation();
              const at = inputs.indexOf(document.activeElement);
              if (at >= 0 && at < inputs.length - 1) inputs[at + 1].focus(); else if (!early()) { save(); go(); }
            });
            setTimeout(() => { if (!moved && !closed) toFocus(inputs[0]); }, 60);
          } else {
            const P = it.P;
            const btns = P.choices.map((c, k) => el('button', { class: 'btn qz-choice', type: 'button' }, el('span', { class: 'qz-key', text: String(k + 1) }), el('span', { class: 'qz-choice-text', text: c })));
            btns.forEach((bt, k) => bt.style.setProperty('--i', String(k)));
            const pick = (k) => { if (moved || closed || answers[i] != null || early()) return; answers[i] = k; btns[k].classList.add('is-picked'); btns.forEach((x) => { x.disabled = true; }); goT = setTimeout(go, 200); };
            btns.forEach((x, k) => x.addEventListener('click', () => pick(k)));
            card.append(el('div', { class: 'qz-q', text: P.q.q }), el('div', { class: 'qz-choices' + (P.choices.length === 2 ? ' two' : '') }, btns));
            setKey((e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= btns.length) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) pick(n - 1); } });
          }
          slot.innerHTML = ''; slot.appendChild(card);
          screen.scrollTop = 0;
          fit(screen, card); cue();
        }
        show();
      }

      function results(items, answers) {
        if (closed) return;
        setKey(null);
        const T = tally(); let score = 0; const by = {}; const misses = [];
        items.forEach((it, k) => {
          let ok, yours, right, qtext, explain;
          if (it.typed) {
            const vals = (answers[k] || []).filter((v) => v && v.trim());
            ok = gradeTyped(it.typed, vals).ok; yours = vals.join(', ') || '(blank)'; right = it.typed.answerText; qtext = it.typed.q; explain = it.typed.explain;
          } else {
            ok = answers[k] === it.P.answer; yours = answers[k] == null ? '(blank)' : it.P.choices[answers[k]]; right = it.P.choices[it.P.answer]; qtext = it.P.q.q; explain = it.P.q.explain;
          }
          T.add(it.fact, ok); if (ok) score++; else misses.push({ qtext, yours, right, explain });
          const t = by[it.topic] || (by[it.topic] = [0, 0]); t[1]++; if (ok) t[0]++;
        });
        T.flush();
        const total = items.length, pct = Math.round((score / total) * 100);
        S.practiceCount++; if (pct > S.practiceBest) S.practiceBest = pct; SaveX.commit();
        last = { score, total, pct };
        const grade = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'NOT YET';
        const msg = pct === 100 ? 'Flawless. You are quiz-ready.' : pct >= 90 ? 'Quiz-ready. Fix the last few below and you are golden.' : pct >= 80 ? 'So close. Read the misses below, then go again.' : pct >= 60 ? 'Getting there. Every miss below is a free point on the quiz.' : 'Good start. Read the misses, play a few runs, then try again.';
        sfx(pct >= 80 ? 'victory' : 'levelup');
        const again = el('button', { class: 'btn big', type: 'button', text: 'Try again' });
        const doneBtn = el('button', { class: 'btn primary big', type: 'button', text: 'Done' });
        const shown = performance.now();   /* same stray-tap guard as the questions */
        again.addEventListener('click', () => { if (performance.now() - shown < 400) return; sfx('click'); start(); });
        doneBtn.addEventListener('click', () => { if (performance.now() - shown < 400) return; close(); });
        const fills = [];
        const sheet = el('div', { class: 'paper pt-card pt-results pt-in' },
          el('div', { class: 'eyebrow', text: 'Practice test results' }),
          el('div', { class: 'pt-scoreline' },
            el('div', { class: 'stamp qz-stamp pt-grade ' + (pct >= 80 ? 'good' : pct >= 60 ? 'mid' : 'bad') + (grade === 'NOT YET' ? ' long' : '') },
              grade === 'NOT YET' ? el('b', { text: 'NOT YET' }) : [el('small', { text: 'GRADE' }), el('b', { text: grade })]),
            el('div', { class: 'pt-scorebox' }, el('div', { class: 'display pt-score num', text: score + ' / ' + total }), el('div', { class: 'pt-pct num', text: pct + '%' }))),
          el('div', { class: 'pt-msg', text: msg }),
          el('div', { class: 'pt-topics' }, Object.keys(TOPIC_SHORT).filter((k) => by[k]).map((k) => {
            const f = el('i'); fills.push([f, (by[k][0] / by[k][1]) * 100]);
            return el('div', { class: 'pt-topic' },
              el('div', { class: 'pt-topic-top' }, el('span', { text: TOPIC_SHORT[k] }), el('span', { class: 'num', text: by[k][0] + ' / ' + by[k][1] })),
              el('div', { class: 'bar' }, f));
          })),
          el('div', { class: 'row pt-actions' }, again, doneBtn));
        wrap.innerHTML = '';
        wrap.append(sheet,
          misses.length ? el('div', { class: 'paper pt-card pt-misses' },
            el('div', { class: 'eyebrow', text: 'Review these ' + misses.length + ' — they come back in the game' }),
            misses.map((m) => el('div', { class: 'pt-miss' },
              el('div', { class: 'pt-miss-q', text: m.qtext }),
              el('div', { class: 'pt-miss-you' }, ico('cross', 18), el('div', {}, el('span', { class: 'eyebrow', text: 'You said' }), el('span', { text: m.yours }))),
              el('div', { class: 'pt-miss-right' }, ico('check', 18), el('div', {}, el('span', { class: 'eyebrow', text: 'Answer' }), el('b', { text: m.right }))),
              m.explain ? el('div', { class: 'pt-miss-why', text: m.explain }) : null)))
            : el('div', { class: 'paper pt-card pt-misses' }, el('div', { class: 'qz-q', text: 'Nothing to review. Every answer was right.' })));
        /* bars grow from zero once the sheet is on screen */
        setTimeout(() => { fills.forEach((x) => { x[0].style.width = x[1] + '%'; }); }, reduced() ? 0 : 120);
        if (pct === 100) confetti(sheet);
        screen.classList.add('pt-done');   /* a results page plainly continues: no "more below" tag here */
        screen.scrollTop = 0; cue(); toFocus(screen);   /* keyboard: arrows and Page Down scroll the misses straight away */
      }
      start();
    });
  }

  /* ================= study notes (codex) ================= */
  function openCodex() { return once('codex', runCodex); }
  function runCodex() {
    st();
    return new Promise((resolve) => {
      const e = U.esc;
      /* ONE mastery dot per line; a line that covers several facts shows the weakest of them */
      const dot = (...ids) => {
        let bx = 9, known = true;
        ids.forEach((id) => { const x = S.mastery[id]; if (!x) known = false; bx = Math.min(bx, x ? x.b : 0); });
        return '<i class="cx-dot b' + (bx >= 2 ? 3 : bx) + (known ? '' : ' new') + '" title="' + (bx >= 2 ? 'Mastered' : known ? 'Learning' : 'Not asked yet') + '"></i>';
      };
      const med = (key, px) => '<span data-medal="' + key + '" data-px="' + px + '"></span>';
      const R = readiness();
      const k = (t) => KEYS[t.key].cls;
      const causes = STUDY.terms.filter((t) => t.cause), nots = STUDY.terms.filter((t) => !t.cause);
      const cm = STUDY.compete || { benefits: [] };
      const words = STUDY.mnemonic.words || [];
      const part = (n, title) => '<div class="cx-part"><span class="eyebrow">Part ' + n + '</span><h2 class="display">' + title + '</h2></div>';
      const sec = (n) => '<section class="paper cx-sec" data-part="' + n + '">';
      const NAV = ['Vocabulary', 'Two sides', 'Competition', 'The spark'];
      let h = '';
      h += '<header class="cx-top"><div class="grow"><div class="eyebrow">Study notes</div><h1 class="display cx-h1">Causes of World War I</h1></div>'
        + '<button class="btn primary cx-close" type="button">Close</button>'
        + '<nav class="cx-nav" aria-label="Jump to a part">' + NAV.map((t, i) => '<button class="cx-jump" type="button" data-go="' + (i + 1) + '"><b class="display">' + (i + 1) + '</b><span>' + t + '</span></button>').join('') + '</nav></header>';
      h += '<div class="cx-legend"><span class="cx-ready"><b class="num">' + R.overall + '%</b> quiz-ready</span><span><i class="cx-dot b0 new"></i>not asked yet</span><span><i class="cx-dot b1"></i>learning</span><span><i class="cx-dot b3"></i>mastered</span></div>';

      /* ---- Part 1 ---- */
      h += sec(1) + part(1, 'Key vocabulary: M.A.I.N.')
        + '<p class="cx-lead">' + dot('cause:main') + 'The four long-term causes spell <b>M.A.I.N.</b></p><div class="cx-terms">';
      causes.forEach((t) => {
        h += '<article class="cx-term key-' + k(t) + '"><div class="cx-term-head">' + med(t.key, 40) + '<h3>' + e(t.name) + '</h3></div>'
          + '<p>' + dot('def:' + t.id) + e(t.def) + '</p>'
          + '<p class="cx-more">' + dot('ex:' + t.id) + '<span class="eyebrow">WWI example</span> ' + e(t.example) + '</p>'
          + '<p class="cx-more">' + dot('clue:' + t.id) + '<span class="eyebrow">Clue words</span> “' + e(t.clue) + '”</p></article>';
      });
      h += '</div><h3 class="cx-sub">Two terms that are NOT causes</h3><div class="cx-terms">';
      nots.forEach((t) => {
        h += '<article class="cx-term key-x"><div class="cx-term-head">' + med('X', 40) + '<h3>' + e(t.name) + '</h3><span class="stamp">Not a cause</span></div>'
          + '<p>' + dot('def:' + t.id) + e(t.def) + '</p>'
          + '<p class="cx-more">' + dot('cause:' + t.id, 'ex:' + t.id) + e(t.note) + '</p>'
          + (t.clue ? '<p class="cx-more">' + dot('clue:' + t.id) + '<span class="eyebrow">Clue words</span> “' + e(t.clue) + '”</p>' : '') + '</article>';
      });
      h += '</div></section>';

      /* ---- Part 2 ---- */
      h += sec(2) + part(2, 'The two sides')
        + '<p class="cx-lead">' + dot('sides:local-world') + e(STUDY.lines.alliance || '') + '</p><div class="cx-sides">'
        + '<div class="cx-side central"><h3>Central Powers</h3><div class="cx-side-sub">' + dot('sides:central4') + 'all four</div><ul>'
        + STUDY.central.map((c) => '<li>' + dot('side:' + c) + '<b>' + e(c) + '</b></li>').join('') + '</ul></div>'
        + '<div class="cx-side allied"><h3>Allied Powers</h3><div class="cx-side-sub">' + dot('sides:allied4') + 'know four</div><ul>'
        + (STUDY.alliedMain || []).map((c) => '<li>' + dot('side:' + c) + '<b>' + e(c) + '</b>' + (c === 'Italy' ? '<span class="cx-aside">' + dot('sides:italy1915') + 'switched sides to join the Allies in 1915</span>' : c === 'Great Britain' ? '<span class="cx-aside">(United Kingdom)</span>' : '') + '</li>').join('')
        + '<li class="cx-also">' + dot('side:Belgium', 'side:Japan') + 'Also accepted: <b>Belgium</b>, <b>Japan</b></li></ul></div></div>'
        + '<p class="cx-mn">' + dot('sides:mnemonic') + '“' + words.map((w) => '<b>' + e(w[0][0]) + '</b>' + e(w[0].slice(1))).join(' ') + '” = '
        + words.map((w) => '<b>' + e(w[1][0]) + '</b>' + e(w[1].slice(1))).join(', ') + '</p>'
        + '<p class="cx-mn warn">' + dot('side:United States') + '<b>NOT the USA.</b> It was neutral when the war began.</p></section>';

      /* ---- Part 3 ---- */
      h += sec(3) + part(3, 'Competition between nations') + '<p class="cx-lead">' + e(cm.intro || '') + '</p>'
        + '<h3 class="cx-sub">' + med('I', 26) + 'Imperialism: the race for colonies</h3><dl class="cx-qa">'
        + '<div><dt>Continent colonized the most?</dt><dd>' + dot('imp:africa') + '<b>Africa</b> (the “Scramble for Africa”)</dd></div>'
        + '<div><dt>What did countries hope to gain?</dt><dd>' + dot('imp:resources') + e(cm.benefits[0] || '') + '</dd><dd>' + dot('imp:benefits') + e(cm.benefits[1] || '') + '</dd><dd class="cx-cont">' + e(cm.benefits[2] || '') + '</dd></div>'
        + '<div><dt>Why did it breed suspicion?</dt><dd>' + dot('imp:suspicion') + e(cm.suspicion || '') + '</dd></div></dl>'
        + '<h3 class="cx-sub">' + med('M', 26) + 'Militarism: the naval race</h3><dl class="cx-qa">'
        + '<div><dt>World’s best navy?</dt><dd>' + dot('mil:best-navy') + '<b>Great Britain</b></dd></div>'
        + '<div><dt>Who built a rival navy?</dt><dd>' + dot('mil:rival-navy') + '<b>Germany</b></dd></div>'
        + '<div><dt>Why did both feel LESS safe?</dt><dd>' + dot('mil:less-safe') + e(cm.lessSafe || '') + '</dd></div></dl>'
        + '<h3 class="cx-sub">How each cause made war more likely</h3><div class="cx-connect">'
        + causes.map((t) => '<div class="cx-conn key-' + k(t) + '">' + med(t.key, 30) + '<p>' + dot('connect:' + t.letter) + '<b>' + e(t.name) + '.</b> ' + e(t.connect) + '</p></div>').join('') + '</div></section>';

      /* ---- Part 4 ---- */
      h += sec(4) + part(4, 'The spark') + '<p class="cx-lead">' + dot('spark:keg') + e(STUDY.lines.keg || '') + '</p><p class="cx-story">';
      STUDY.story.parts.forEach((p, i) => { h += e(p); if (i < STUDY.story.blanks.length) { const bl = STUDY.story.blanks[i]; h += '<span class="cx-nb">' + dot(bl.fact) + '<mark>' + e(bl.answer) + '</mark></span>'; } });
      h += '</p><h3 class="cx-sub">' + med('S', 26) + '<span>' + dot('chain:order') + 'The chain reaction</span></h3><ol class="cx-chain">'
        + STUDY.chain.map((s, i) => '<li><span class="cx-n display">' + (i + 1) + '</span><span class="cx-chain-t">' + dot('chain:' + (i + 1)) + e(s) + '</span></li>').join('') + '</ol>'
        + '<h3 class="cx-sub">Long-term cause or spark?</h3><ul class="cx-ls">'
        + STUDY.longOrSpark.filter((x) => !x.variant).map((x) => '<li><span class="cx-badge ' + (x.ans === 'L' ? 'l' : 's') + ' display">' + x.ans + '</span><span>' + dot(x.fact) + e(x.text) + '</span></li>').join('')
        + '</ul><p class="cx-mn">L = long-term cause (built up for years). S = spark (the one event that lit the fuse).</p></section>';

      const wrap = el('div', { class: 'wrap cx', html: h });
      wrap.querySelectorAll('[data-medal]').forEach((n) => { n.replaceWith(medal(n.getAttribute('data-medal'), parseInt(n.getAttribute('data-px'), 10) || 28)); });
      const screen = el('div', { class: 'screen cx-screen qz-screen-in', tabindex: '-1' }, wrap);
      let done = false;
      const close = () => { if (done) return; done = true; window.removeEventListener('keydown', onKey, true); sfx('click'); leave(screen, () => { screen.remove(); openCount--; resolve(); }); };
      const onKey = (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); }
        else if (strayKey(ev, screen, ev.key === 'Enter')) { ev.preventDefault(); ev.stopPropagation(); }   /* never the tile behind the notes */
        else if (ev.key === ' ' && document.activeElement === screen) ev.stopPropagation();                  /* Space just scrolls the notes */
      };
      window.addEventListener('keydown', onKey, true);
      wrap.querySelector('.cx-close').addEventListener('click', close);
      wrap.querySelectorAll('.cx-jump').forEach((bt) => bt.addEventListener('click', () => {
        const target = wrap.querySelector('.cx-sec[data-part="' + bt.getAttribute('data-go') + '"]'); if (!target) return;
        sfx('click');
        const top = target.getBoundingClientRect().top - screen.getBoundingClientRect().top + screen.scrollTop - wrap.querySelector('.cx-top').offsetHeight - 10;
        try { screen.scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' }); } catch (err) { screen.scrollTop = top; }
      }));
      const bottom = el('button', { class: 'btn primary big cx-bottom', type: 'button', text: 'Close notes' });
      bottom.addEventListener('click', close);
      wrap.appendChild(bottom);
      root().appendChild(screen); openCount++;
      toFocus(screen);
      sfx('card');
    });
  }

  window.Quiz = {
    init, ask, reviveGauntlet, bonusRound, practiceTest, openCodex, readiness, stats, record,
    drill, weakCount, runReset, runMisses, reviewSheet,
    isOpen: () => openCount > 0,
    gauntletTally: () => ({ right: gauntlet.right, wrong: gauntlet.wrong }),
    kinds: Object.keys(GAMES),
    _debug: { pickQuestion, gradeTyped, norm, fuzzy, TYPED, weakest },
  };
})();
