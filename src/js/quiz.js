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
  const TOPIC = { vocab: 'Part 1 · Key Vocabulary', sides: 'Part 2 · The Two Sides', compete: 'Part 3 · Competition', spark: 'Part 4 · The Spark' };
  const TOPIC_SHORT = { vocab: 'Vocabulary', sides: 'Two Sides', compete: 'Competition', spark: 'The Spark' };
  const CREDIT = [0, 0.5, 1, 1, 1, 1];   /* right twice in a row = mastered */

  let S = null;
  let openCount = 0;
  let queue = Promise.resolve();
  const serial = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };
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

  /* ================= the question modal ================= */
  const HEAD = { levelup: 'LEVEL UP — answer to choose your upgrade', boss: 'BREAK THE SHIELD', revive: 'LAST STAND', practice: 'QUICK QUESTION' };
  const SUB = { levelup: 'Right: pick 1 of 3 upgrades. Miss: you get a random one.', boss: 'Answer right to shatter the shield.', revive: 'Answer right to get back in the fight.', practice: '' };
  const YES = ['CORRECT', 'NAILED IT', 'YES', 'SHARP', 'RIGHT'];
  const STREAKS = [3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

  function ask(opts) { opts = opts || {}; return serial(() => askNow(opts)); }
  function askNow(opts) {
    st();
    return new Promise((resolve) => {
      const q = opts.question || pickQuestion(opts);
      const P = present(q);
      const ctx = opts.context || 'levelup';
      const pill = pillFor(q);
      const sub = opts.sub != null ? opts.sub : (SUB[ctx] || '');
      const timed = opts.timeLimit > 0;
      const timerFill = el('i');
      const timer = el('div', { class: 'bar qz-timer', hidden: !timed }, timerFill);
      const btns = P.choices.map((c, i) => el('button', { class: 'btn qz-choice', type: 'button' },
        el('span', { class: 'qz-key', text: String(i + 1) }), el('span', { class: 'qz-choice-text', text: c })));
      const fb = el('div', { class: 'qz-feedback', hidden: true });
      const modal = el('div', { class: 'modal paper pop-in qz qz-ctx-' + ctx, role: 'dialog', 'aria-modal': 'true', tabindex: '-1' },
        el('div', { class: 'qz-head' },
          el('div', { class: 'qz-top' },
            el('span', { class: 'eyebrow', text: TOPIC[q.topic] || 'Study guide' }),
            el('span', { class: 'pill qz-pill ' + pill.cls, text: pill.label })),
          el('div', { class: 'display qz-header', text: opts.header || HEAD[ctx] || 'QUESTION' }),
          sub ? el('div', { class: 'mute qz-sub', text: sub }) : null),
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

      function choose(i) {
        if (answered) return;
        if (i >= 0 && performance.now() < unlockAt) return;
        answered = true;
        if (tick) { clearInterval(tick); tick = null; }
        const ok = i === P.answer;
        btns.forEach((b, j) => { b.disabled = true; b.classList.add(j === P.answer ? 'is-right' : j === i ? 'is-wrong' : 'is-dim'); });
        record(q.fact, ok, { streak: true });
        sfx(ok ? 'correct' : 'wrong');
        if (ok && STREAKS.indexOf(S.streak) >= 0) setTimeout(() => sfx('streak'), 200);
        modal.classList.add(ok ? 'qz-ok' : 'qz-no');
        const cont = el('button', { class: 'btn primary big qz-continue', type: 'button', text: 'Continue' });
        fb.append(
          el('div', { class: 'qz-verdict' },
            el('span', { class: 'stamp ' + (ok ? 'good' : 'bad'), text: ok ? U.pick(YES) : (i < 0 ? 'TIME UP' : 'NOT QUITE') }),
            el('span', { class: 'qz-streak num', text: S.streak > 1 ? 'Streak ×' + S.streak : (ok ? '' : 'Streak reset') })),
          ok ? '' : el('div', { class: 'qz-answer' }, el('span', { class: 'eyebrow', text: 'Answer' }), el('b', { text: P.choices[P.answer] })),
          el('div', { class: 'qz-explain', text: q.explain || '' }),
          cont);
        fb.hidden = false;
        result = { correct: ok, questionId: q.id, factId: q.fact, timeMs: Math.round(performance.now() - t0), streak: S.streak };
        setTimeout(() => { canGo = true; }, ok ? 220 : 450);
        cont.addEventListener('click', () => { if (canGo) finish(); });
        try { cont.focus({ preventScroll: true }); cont.scrollIntoView({ block: 'nearest' }); } catch (e) { /* older browsers */ }
      }
      function finish() {
        if (done) return; done = true;
        window.removeEventListener('keydown', onKey, true);
        if (tick) clearInterval(tick);
        veil.remove(); openCount--;
        sfx('click');
        resolve(result);
      }
      function onKey(e) {
        const k = e.key;
        if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
        if (!answered) {
          let i = -1;
          if (k >= '1' && k <= '9') i = parseInt(k, 10) - 1;
          else if (P.choices[0] === 'True' && (k === 't' || k === 'T')) i = 0;
          else if (P.choices[0] === 'True' && (k === 'f' || k === 'F')) i = 1;
          if (i >= 0 && i < btns.length) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) choose(i); }
        } else if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
          e.preventDefault(); e.stopPropagation();
          if (canGo && !e.repeat) finish();
        }
      }
      btns.forEach((b, i) => b.addEventListener('click', () => choose(i)));
      window.addEventListener('keydown', onKey, true);
      if (timed) {
        const total = opts.timeLimit * 1000;
        timerFill.style.width = '100%';
        tick = setInterval(() => {
          const left = total - (performance.now() - t0);
          timerFill.style.width = Math.max(0, (left / total) * 100) + '%';
          const sec = Math.ceil(left / 1000);
          if (sec <= 5 && sec > 0 && sec < lastTick) { lastTick = sec; sfx('tick'); timer.classList.add('hot'); }
          if (left <= 0) choose(-1);
        }, 100);
      }
    });
  }

  async function reviveGauntlet(n) {
    n = n || 3;
    for (let i = 1; i <= n; i++) {
      const r = await ask({ context: 'revive', header: 'LAST STAND ' + i + '/' + n, sub: i === 1 ? 'Get ' + n + ' right in a row to get back in the fight.' : 'Keep going — ' + (n - i + 1) + ' to go.' });
      if (!r || !r.correct) return false;
    }
    return true;
  }

  /* ================= bonus rounds ================= */
  function frame(title, sub) {
    const prog = el('span', { class: 'bz-prog num' });
    const body = el('div', { class: 'bz-body' });
    const modal = el('div', { class: 'modal paper pop-in bz', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'bz-head' },
        el('div', { class: 'bz-top' }, el('span', { class: 'eyebrow', text: 'Bonus round' }), prog),
        el('h2', { class: 'display bz-title', text: title }),
        el('div', { class: 'mute bz-sub', text: sub })),
      body);
    const veil = el('div', { class: 'veil qz-veil' }, modal);
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener('keydown', esc, true);
    root().appendChild(veil); openCount++;
    sfx('chest');
    return { veil, modal, body, prog, close() { window.removeEventListener('keydown', esc, true); veil.remove(); openCount--; } };
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
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      fr.prog.textContent = (i + 1) + ' / ' + items.length;
      const card = cfg.card(it, i);
      cardBox.innerHTML = ''; cardBox.appendChild(card);
      const options = it.options || cfg.options;
      optBox.className = 'bz-opts n' + options.length + (cfg.optClass ? ' ' + cfg.optClass : '');
      optBox.innerHTML = '';
      const btns = options.map((o, k) => el('button', { class: 'btn bz-opt ' + (o.cls || ''), type: 'button' },
        el('span', { class: 'qz-key', text: String(k + 1) }), el('span', { class: 'qz-choice-text', text: o.text })));
      btns.forEach((b) => optBox.appendChild(b));
      const k = await pickOne(btns);
      const ok = k === it.answer;
      T.add(it.fact, ok);
      btns.forEach((b, j) => { b.disabled = true; b.classList.add(j === it.answer ? 'is-right' : j === k ? 'is-wrong' : 'is-dim'); });
      card.classList.add(ok ? 'is-right' : 'is-wrong');
      if (ok) { correct++; sfx('correct', { pitch: 1 + i * 0.05 }); } else { sfx('wrong'); if (it.fix) fixes.push(it.fix); }
      if (cfg.after) cfg.after(it, ok, card, i);
      if (!ok && it.fix) card.appendChild(el('div', { class: 'bz-fix', html: it.fix }));
      else if (it.note) card.appendChild(el('div', { class: 'bz-note', text: it.note }));
      await sleep(ok ? (it.note ? 1000 : 430) : 1700);
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
          card: (it) => bigCard('Which side?', it.c, 'big'),
        });
        r.note = 'Central Powers = <b>B</b>ears <b>A</b>te <b>G</b>reen <b>O</b>ranges: Bulgaria, Austria-Hungary, Germany, Ottoman Empire.';
        return r;
      },
    },
    causes: {
      title: 'M.A.I.N. OR NOT?', sub: 'Is it one of the causes of World War I?',
      async run(fr, T) {
        const items = U.shuffle(STUDY.terms).map((t) => ({ t, answer: t.cause ? 0 : 1, fact: t.cause ? 'cause:main' : 'cause:' + t.id,
          fix: b(t.name) + (t.cause ? ' IS a cause — the ' + t.letter + ' in M.A.I.N.' : ' is NOT a cause. ' + U.esc(t.note.replace(/^NOT a cause of WWI: /, ''))),
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
      title: 'LONG-TERM OR SPARK?', sub: 'L = built up for years. S = the one event that lit the fuse.',
      async run(fr, T) {
        const base = STUDY.longOrSpark.filter((x) => !x.variant);
        const vars = U.shuffle(STUDY.longOrSpark.filter((x) => x.variant));
        const vS = vars.filter((x) => x.ans === 'S').slice(0, 1), vL = vars.filter((x) => x.ans === 'L').slice(0, 1);
        const items = U.shuffle(base.concat(vS, vL)).map((x) => ({ x, answer: x.ans === 'L' ? 0 : 1, fact: x.fact,
          fix: b(x.text) + ' → ' + (x.ans === 'L' ? 'Long-term cause' : 'Spark') }));
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
        const options = STUDY.terms.map((t) => ({ text: t.name, cls: 'key-' + KEYS[t.key].cls }));
        const items = U.shuffle(STUDY.terms.filter((t) => t.clue)).map((t) => ({ t, answer: STUDY.terms.indexOf(t), fact: 'clue:' + t.id, fix: '"' + U.esc(t.clue) + '" → ' + b(t.name) }));
        return classify(fr, T, items, { options, optClass: 'chips', card: (it) => bigCard('Clue words', '"' + it.t.clue + '"') });
      },
    },
    story: {
      title: 'FILL THE TELEGRAM', sub: 'Pick the word that fills the glowing blank.',
      async run(fr, T) {
        const st0 = STUDY.story; const filled = [];
        const items = st0.blanks.map((bl) => { const opts = U.shuffle(bl.options); return { bl, options: opts.map((t) => ({ text: t })), answer: opts.indexOf(bl.answer), fact: bl.fact, fix: 'Blank: ' + b(bl.answer) }; });
        const render = (cur) => {
          const p = el('p', { class: 'bz-story' });
          st0.parts.forEach((part, i) => {
            p.appendChild(document.createTextNode(part));
            if (i < st0.blanks.length) {
              const f = filled[i];
              p.appendChild(el('span', { class: 'bz-blank' + (f ? (f.ok ? ' ok' : ' no') : '') + (i === cur && !f ? ' cur' : ''), text: f ? st0.blanks[i].answer : '______' }));
            }
          });
          return el('div', { class: 'bz-card story' }, p);
        };
        const r = await classify(fr, T, items, {
          card: (it, i) => render(i),
          after: (it, ok, card, i) => { filled[i] = { ok }; const fresh = render(-1); card.innerHTML = ''; while (fresh.firstChild) card.appendChild(fresh.firstChild); },
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
          fr.prog.textContent = '0 / 5';
          order.forEach((idx) => {
            const num = el('span', { class: 'bz-num num', text: '?' });
            const btn = el('button', { class: 'btn bz-chain-item', type: 'button', style: { order: '10' } }, num, el('span', { class: 'qz-choice-text', text: STUDY.chain[idx] }));
            btn.addEventListener('click', () => {
              if (btn.disabled || performance.now() - t0 < 250) return;
              if (idx === next) {
                btn.disabled = true; btn.classList.add('is-right'); btn.style.order = String(next); num.textContent = String(next + 1);
                T.add('chain:' + (next + 1), first[next]);
                sfx('correct', { pitch: 1 + next * 0.1 });
                next++; fr.prog.textContent = next + ' / 5';
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
        });
      },
    },
    central: {
      title: 'BEARS ATE GREEN ORANGES', sub: 'Tap the FOUR Central Powers, then Check.',
      run(fr, T) {
        return new Promise((res) => {
          const pool = U.shuffle(STUDY.central.concat(U.shuffle(STUDY.alliedMain || STUDY.allied).slice(0, 5), STUDY.neutral.slice(0, 1)));
          const picked = new Set(); const t0 = performance.now(); let locked = false;
          const grid = el('div', { class: 'bz-grid' });
          const check = el('button', { class: 'btn primary big bz-check', type: 'button', disabled: true, text: 'Pick 4' });
          const tiles = pool.map((c) => {
            const t = el('button', { class: 'btn bz-tile', type: 'button', 'aria-pressed': 'false', text: c });
            t.addEventListener('click', () => {
              if (locked || performance.now() - t0 < 250) return;
              if (picked.has(c)) picked.delete(c); else { if (picked.size >= 4) { check.classList.remove('shake'); void check.offsetWidth; check.classList.add('shake'); return; } picked.add(c); }
              t.classList.toggle('on', picked.has(c)); t.setAttribute('aria-pressed', picked.has(c) ? 'true' : 'false');
              sfx('select');
              check.disabled = picked.size !== 4; check.textContent = picked.size === 4 ? 'Check' : 'Pick ' + (4 - picked.size) + ' more';
              fr.prog.textContent = picked.size + ' / 4';
            });
            grid.appendChild(t); return t;
          });
          fr.prog.textContent = '0 / 4';
          check.addEventListener('click', () => {
            if (locked || picked.size !== 4) return; locked = true; check.disabled = true;
            let correct = 0; const fixes = [];
            pool.forEach((c, i) => {
              const isC = STUDY.central.indexOf(c) >= 0, on = picked.has(c);
              tiles[i].disabled = true;
              if (isC && on) { correct++; tiles[i].classList.add('is-right'); T.add('side:' + c, true); }
              else if (isC && !on) { tiles[i].classList.add('is-missed'); T.add('side:' + c, false); fixes.push(b(c) + ' is a Central Power.'); }
              else if (!isC && on) { tiles[i].classList.add('is-wrong'); T.add('side:' + c, false); fixes.push(b(c) + (c === 'United States' ? ' was neutral in 1914.' : ' was an Allied Power.')); }
              else tiles[i].classList.add('is-dim');
            });
            T.add('sides:central4', correct === 4);
            sfx(correct === 4 ? 'correct' : 'wrong');
            setTimeout(() => res({ correct, total: 4, fixes, note: '<b>B</b>ears <b>A</b>te <b>G</b>reen <b>O</b>ranges = Bulgaria, Austria-Hungary, Germany, Ottoman Empire.' }), correct === 4 ? 800 : 1700);
          });
          fr.body.append(grid, check);
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
      const perfect = r.correct === r.total;
      if (perfect) { S.bonusPerfect++; SaveX.commit(); }
      sfx(perfect ? 'streak' : 'card');
      fr.prog.textContent = '';
      fr.body.innerHTML = '';
      const cont = el('button', { class: 'btn primary big', type: 'button', text: 'Continue' });
      fr.body.appendChild(el('div', { class: 'bz-result pop-in' },
        el('span', { class: 'stamp ' + (perfect ? 'good' : r.correct * 2 >= r.total ? '' : 'bad'), text: perfect ? 'PERFECT' : r.correct * 2 >= r.total ? 'NOT BAD' : 'STUDY THIS' }),
        el('div', { class: 'display bz-score num', text: r.correct + ' / ' + r.total }),
        r.fixes && r.fixes.length ? el('ul', { class: 'bz-fixes' }, r.fixes.map((h) => el('li', { html: h }))) : '',
        r.note ? el('div', { class: 'bz-note', html: r.note }) : '',
        cont));
      await waitContinue(cont, 450);
    } catch (e) { if (window.console) console.error('bonus round failed', e); }
    fr.close();
    return { kind, correct: r.correct, total: r.total, score: r.total ? r.correct / r.total : 0, perfect: r.correct === r.total };
  }

  /* ================= practice test ================= */
  const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '').replace(/^the(?=.{3})/, '');
  function lev(a, c) {
    const m = a.length, n = c.length; if (!m) return n; if (!n) return m;
    let prev = []; for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === c[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  function fuzzy(input, alias) {
    if (input === alias) return true;
    const L = alias.length, tol = L <= 4 ? 0 : L <= 7 ? 1 : L <= 11 ? 2 : 3;
    if (Math.abs(input.length - L) > tol) return false;
    return lev(input, alias) <= tol;
  }
  const AL = {
    'Germany': ['germany', 'germanempire', 'deutschland'],
    'Austria-Hungary': ['austriahungary', 'austria', 'austrohungary', 'austrohungarianempire', 'austriahungarianempire', 'austrohungarian', 'austriahungaryempire', 'austriaandhungary'],
    'Ottoman Empire': ['ottomanempire', 'ottoman', 'ottomans', 'turkey', 'ottomanturkey', 'ottomanturks'],
    'Bulgaria': ['bulgaria'],
    'Great Britain': ['greatbritain', 'britain', 'uk', 'unitedkingdom', 'england', 'gb', 'britishempire'],
    'France': ['france'], 'Russia': ['russia', 'russianempire'], 'Italy': ['italy'], 'Serbia': ['serbia'], 'Belgium': ['belgium'], 'Japan': ['japan'],
    'Militarism': ['militarism'], 'Alliances': ['alliances', 'alliance'], 'Imperialism': ['imperialism'], 'Nationalism': ['nationalism'],
  };
  const G = (names) => names.map((n) => ({ name: n, aliases: AL[n] || [norm(n)] }));
  const TYPED = [
    { id: 'central', must: true, fact: 'sides:central4', topic: 'sides', q: 'Type the four Central Powers.', slots: 4, need: 4, groups: G(STUDY.central), answerText: 'Germany, Austria-Hungary, Ottoman Empire, Bulgaria', explain: 'Bears Ate Green Oranges: Bulgaria, Austria-Hungary, Germany, Ottoman Empire.' },
    { id: 'allied', fact: 'sides:allied4', topic: 'sides', q: 'Name four Allied Powers. (Hint: not the USA. It was neutral when the war began.)', slots: 4, need: 4, groups: G(STUDY.allied), answerText: 'Any four of: Great Britain, France, Russia, Italy, Serbia (also Belgium or Japan)', explain: STUDY.lines.allied5 || '' },
    { id: 'main', fact: 'cause:main', topic: 'vocab', q: 'What does M.A.I.N. stand for? Type the four causes.', slots: 4, need: 4, labels: ['M', 'A', 'I', 'N'], groups: G(['Militarism', 'Alliances', 'Imperialism', 'Nationalism']), answerText: 'Militarism, Alliances, Imperialism, Nationalism', explain: STUDY.lines.main || '' },
    { id: 'assassin', fact: 'spark:assassin', topic: 'spark', q: 'Who assassinated Archduke Franz Ferdinand?', slots: 1, need: 1, groups: [{ name: 'Gavrilo Princip', aliases: ['gavriloprincip', 'princip', 'gavrilo', 'gavriloprinciple'] }], answerText: 'Gavrilo Princip', explain: STUDY.lines.story || '' },
    { id: 'city', fact: 'spark:city', topic: 'spark', q: 'In which city was the Archduke assassinated?', slots: 1, need: 1, groups: [{ name: 'Sarajevo', aliases: ['sarajevo'] }], answerText: 'Sarajevo', explain: STUDY.lines.story || '' },
    { id: 'year', fact: 'spark:date', topic: 'spark', q: 'In what year was Archduke Franz Ferdinand assassinated?', slots: 1, need: 1, groups: [{ name: '1914', aliases: ['1914', 'june281914'] }], answerText: '1914 (June 28, 1914)', explain: STUDY.lines.story || '' },
    { id: 'heir', fact: 'spark:heir', topic: 'spark', q: 'Archduke Franz Ferdinand was heir to the throne of which empire?', slots: 1, need: 1, groups: G(['Austria-Hungary']), answerText: 'Austria-Hungary', explain: STUDY.lines.story || '' },
    { id: 'usa', fact: 'ex:isolationism', topic: 'vocab', q: "Which vocabulary term describes the United States' position when the war began in 1914?", slots: 1, need: 1, groups: [{ name: 'Isolationism', aliases: ['isolationism', 'isolationist', 'isolation'] }], answerText: 'Isolationism', explain: 'Isolationism: the United States followed a policy of neutrality in 1914 and refused to join the fighting in Europe.' },
    { id: 'africa', fact: 'imp:africa', topic: 'compete', q: 'Which continent were European countries competing to colonize the most?', slots: 1, need: 1, groups: [{ name: 'Africa', aliases: ['africa'] }], answerText: 'Africa', explain: 'Africa — the "Scramble for Africa."' },
    { id: 'navy', fact: 'mil:best-navy', topic: 'compete', q: "Which country had the world's best navy before WWI?", slots: 1, need: 1, groups: G(['Great Britain']), answerText: 'Great Britain', explain: "Great Britain had the world's best navy; Germany tried to build a rival navy to match it." },
    { id: 'rival', fact: 'mil:rival-navy', topic: 'compete', q: "Which country tried to build a rival navy to match Great Britain's?", slots: 1, need: 1, groups: G(['Germany']), answerText: 'Germany', explain: "Germany tried to build a navy to rival Great Britain's — the naval arms race." },
  ];
  function gradeTyped(item, values) {
    const used = {}; let got = 0;
    (values || []).forEach((v) => {
      const n = norm(v); if (!n) return;
      for (let g = 0; g < item.groups.length; g++) {
        if (used[g]) continue;
        if (item.groups[g].aliases.some((a) => fuzzy(n, a))) { used[g] = true; got++; return; }
      }
    });
    return { ok: got >= item.need, got };
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
  function practiceTest() { return serial(runPractice); }
  function runPractice() {
    st();
    return new Promise((resolve) => {
      const wrap = el('div', { class: 'wrap' });
      const screen = el('div', { class: 'screen pt' }, wrap);
      root().appendChild(screen); openCount++;
      let keyFn = null, last = { score: 0, total: 0, pct: 0 };
      const setKey = (fn) => { if (keyFn) window.removeEventListener('keydown', keyFn, true); keyFn = fn; if (fn) window.addEventListener('keydown', fn, true); };
      const close = () => { setKey(null); screen.remove(); openCount--; sfx('click'); resolve(last); };

      function start() {
        const items = buildPractice(); const answers = []; let i = 0;
        const next = () => { i++; if (i < items.length) show(); else results(items, answers); };
        function show() {
          const it = items[i]; let armed = false, moved = false;
          const quit = el('button', { class: 'btn small ghost pt-quit', type: 'button', text: 'Quit' });
          quit.addEventListener('click', () => {
            if (armed) return close();
            armed = true; quit.textContent = 'Tap again to quit'; quit.classList.add('danger');
            setTimeout(() => { armed = false; quit.textContent = 'Quit'; quit.classList.remove('danger'); }, 2500);
          });
          const card = el('div', { class: 'paper pt-card pop-in' });
          const go = () => { if (moved) return; moved = true; sfx('click'); next(); };
          if (it.typed) {
            const t = it.typed;
            const inputs = [];
            for (let k = 0; k < t.slots; k++) inputs.push(el('input', { class: 'pt-input', id: 'pt-input-' + k, type: 'text', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', 'aria-label': 'Answer ' + (k + 1), placeholder: t.slots > 1 ? (t.labels ? t.labels[k] + '…' : (k + 1) + '.') : 'Type your answer' }));
            const nextBtn = el('button', { class: 'btn primary big', type: 'button', text: i === items.length - 1 ? 'Finish' : 'Next' });
            const save = () => { answers[i] = inputs.map((x) => x.value); };
            nextBtn.addEventListener('click', () => { save(); go(); });
            card.append(el('div', { class: 'eyebrow', text: 'Type it · ' + (TOPIC[t.topic] || '') }), el('div', { class: 'qz-q', text: t.q }),
              el('div', { class: 'pt-inputs' + (t.slots > 1 ? ' multi' : '') }, inputs), el('div', { class: 'mute pt-hint', text: 'Spelling does not have to be perfect.' }), nextBtn);
            setKey((e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault(); e.stopPropagation();
              const at = inputs.indexOf(document.activeElement);
              if (at >= 0 && at < inputs.length - 1) inputs[at + 1].focus(); else { save(); go(); }
            });
            setTimeout(() => { try { inputs[0].focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 60);
          } else {
            const P = it.P;
            const btns = P.choices.map((c, k) => el('button', { class: 'btn qz-choice', type: 'button' }, el('span', { class: 'qz-key', text: String(k + 1) }), el('span', { class: 'qz-choice-text', text: c })));
            const pick = (k) => { if (moved || answers[i] != null) return; answers[i] = k; btns[k].classList.add('is-picked'); btns.forEach((x) => { x.disabled = true; }); setTimeout(go, 200); };
            btns.forEach((x, k) => x.addEventListener('click', () => pick(k)));
            card.append(el('div', { class: 'eyebrow', text: TOPIC[P.q.topic] || '' }), el('div', { class: 'qz-q', text: P.q.q }), el('div', { class: 'qz-choices' + (P.choices.length === 2 ? ' two' : '') }, btns));
            setKey((e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= btns.length) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) pick(n - 1); } });
          }
          wrap.innerHTML = '';
          wrap.append(
            el('div', { class: 'row pt-top' }, el('div', { class: 'grow' }, el('div', { class: 'eyebrow', text: 'Practice test · no hints until the end' }), el('div', { class: 'display pt-count num', text: 'Question ' + (i + 1) + ' of ' + items.length })), quit),
            el('div', { class: 'bar pt-bar' }, el('i', { style: { width: ((i / items.length) * 100) + '%' } })),
            card);
          screen.scrollTop = 0;
        }
        show();
      }

      function results(items, answers) {
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
        const msg = pct === 100 ? 'Flawless. You are quiz-ready.' : pct >= 90 ? 'Quiz-ready. Fix the last few below and you are golden.' : pct >= 80 ? 'So close. Read the misses below, then go again.' : pct >= 60 ? 'Getting there. Every miss below is a free point tomorrow.' : 'Good start. Read the misses, play a few runs, then try again.';
        sfx(pct >= 80 ? 'victory' : 'levelup');
        const again = el('button', { class: 'btn big', type: 'button', text: 'Try again' });
        const doneBtn = el('button', { class: 'btn primary big', type: 'button', text: 'Done' });
        again.addEventListener('click', () => { sfx('click'); start(); });
        doneBtn.addEventListener('click', close);
        wrap.innerHTML = '';
        wrap.append(
          el('div', { class: 'paper pt-card pt-results pop-in' },
            el('div', { class: 'eyebrow', text: 'Practice test results' }),
            el('div', { class: 'pt-scoreline' },
              el('div', { class: 'display pt-score num', text: score + ' / ' + total }),
              el('span', { class: 'stamp ' + (pct >= 80 ? 'good' : pct >= 60 ? '' : 'bad'), text: grade === 'NOT YET' ? grade : 'GRADE ' + grade }),
              el('div', { class: 'pt-pct num', text: pct + '%' })),
            el('div', { class: 'pt-msg', text: msg }),
            el('div', { class: 'pt-topics' }, Object.keys(TOPIC_SHORT).filter((k) => by[k]).map((k) => el('div', { class: 'pt-topic' },
              el('div', { class: 'pt-topic-top' }, el('span', { text: TOPIC_SHORT[k] }), el('span', { class: 'num', text: by[k][0] + ' / ' + by[k][1] })),
              el('div', { class: 'bar' }, el('i', { style: { width: ((by[k][0] / by[k][1]) * 100) + '%' } }))))),
            el('div', { class: 'row pt-actions' }, again, doneBtn)),
          misses.length ? el('div', { class: 'paper pt-card pt-misses' },
            el('div', { class: 'eyebrow', text: 'Review these ' + misses.length + ' — they come back in the game' }),
            misses.map((m) => el('div', { class: 'pt-miss' },
              el('div', { class: 'pt-miss-q', text: m.qtext }),
              el('div', { class: 'pt-miss-you' }, el('span', { class: 'eyebrow', text: 'You said' }), ' ', el('span', { text: m.yours })),
              el('div', { class: 'pt-miss-right' }, el('span', { class: 'eyebrow', text: 'Answer' }), ' ', el('b', { text: m.right })),
              el('div', { class: 'pt-miss-why', text: m.explain || '' })))) : el('div', { class: 'paper pt-card pt-misses' }, el('div', { class: 'qz-q', text: 'Nothing to review. Every answer was right.' })));
        screen.scrollTop = 0;
      }
      start();
    });
  }

  /* ================= study notes (codex) ================= */
  function openCodex() { return serial(runCodex); }
  function runCodex() {
    st();
    return new Promise((resolve) => {
      const e = U.esc;
      const dot = (id) => { const x = S.mastery[id]; const bx = x ? x.b : 0; return '<i class="cx-dot b' + (bx >= 2 ? 3 : bx) + (x ? '' : ' new') + '" title="' + (bx >= 2 ? 'Mastered' : x ? 'Learning' : 'Not asked yet') + '"></i>'; };
      const R = readiness();
      const k = (t) => KEYS[t.key].cls;
      const causes = STUDY.terms.filter((t) => t.cause), nots = STUDY.terms.filter((t) => !t.cause);
      const cm = STUDY.compete || { benefits: [] };
      const mn = {}; (STUDY.mnemonic.words || []).forEach((w) => { mn[w[1]] = w[0]; });
      let h = '';
      h += '<header class="cx-top"><div class="grow"><div class="eyebrow">Study notes · your whole guide</div><h1 class="display cx-h1">Causes of World War I</h1></div>'
        + '<button class="btn primary cx-close" type="button">Close</button></header>';
      h += '<div class="cx-legend"><span class="num"><b>' + R.overall + '%</b> quiz-ready</span><span><i class="cx-dot b0 new"></i> not asked yet</span><span><i class="cx-dot b1"></i> learning</span><span><i class="cx-dot b3"></i> mastered</span></div>';

      h += '<section class="paper cx-sec"><div class="eyebrow">Part 1</div><h2 class="display">Key vocabulary: M.A.I.N.</h2>'
        + '<p class="cx-lead">The four long-term causes spell <b>M.A.I.N.</b> ' + dot('cause:main') + '</p><div class="cx-terms">';
      causes.forEach((t) => {
        h += '<article class="cx-term"><div class="cx-letter display key-' + k(t) + '">' + e(t.letter) + '</div><div class="cx-term-body"><h3>' + e(t.name) + '</h3>'
          + '<p>' + dot('def:' + t.id) + e(t.def) + '</p>'
          + '<p>' + dot('ex:' + t.id) + '<span class="eyebrow">WWI example</span> ' + e(t.example) + '</p>'
          + '<p>' + dot('clue:' + t.id) + '<span class="eyebrow">Clue words</span> “' + e(t.clue) + '”</p></div></article>';
      });
      h += '</div><h3 class="cx-sub">Two terms that are NOT causes</h3><div class="cx-terms">';
      nots.forEach((t) => {
        h += '<article class="cx-term not"><div class="cx-letter display key-x">✕</div><div class="cx-term-body"><h3>' + e(t.name) + ' <span class="stamp">Not a cause</span></h3>'
          + '<p>' + dot('def:' + t.id) + e(t.def) + '</p>'
          + '<p>' + dot('cause:' + t.id) + dot('ex:' + t.id) + e(t.note) + '</p>'
          + (t.clue ? '<p>' + dot('clue:' + t.id) + '<span class="eyebrow">Clue words</span> “' + e(t.clue) + '”</p>' : '') + '</div></article>';
      });
      h += '</div></section>';

      h += '<section class="paper cx-sec"><div class="eyebrow">Part 2</div><h2 class="display">The two sides</h2>'
        + '<p class="cx-lead">' + dot('sides:local-world') + e(STUDY.lines.alliance || '') + '</p><div class="cx-sides">'
        + '<div class="cx-side central"><h3>Central Powers <span class="mute">(all four) ' + dot('sides:central4') + '</span></h3><ul>'
        + STUDY.central.map((c) => '<li>' + dot('side:' + c) + '<b>' + e(c) + '</b></li>').join('') + '</ul>'
        + '<p class="cx-mn">' + dot('sides:mnemonic') + '“' + (STUDY.mnemonic.words || []).map((w) => '<b>' + e(w[0][0]) + '</b>' + e(w[0].slice(1))).join(' ') + '” = '
        + (STUDY.mnemonic.words || []).map((w) => '<b>' + e(w[1][0]) + '</b>' + e(w[1].slice(1))).join(', ') + '</p></div>'
        + '<div class="cx-side allied"><h3>Allied Powers <span class="mute">(know four) ' + dot('sides:allied4') + '</span></h3><ul>'
        + (STUDY.alliedMain || []).map((c) => '<li>' + dot('side:' + c) + '<b>' + e(c) + '</b>' + (c === 'Italy' ? ' <span class="mute">switched sides to join the Allies in 1915 ' + dot('sides:italy1915') + '</span>' : c === 'Great Britain' ? ' <span class="mute">(United Kingdom)</span>' : '') + '</li>').join('')
        + '<li>' + dot('side:Belgium') + dot('side:Japan') + '<span class="mute">Also accepted:</span> <b>Belgium</b>, <b>Japan</b></li></ul>'
        + '<p class="cx-mn">' + dot('side:United States') + '<b>NOT the USA.</b> It was neutral when the war began.</p></div></div></section>';

      h += '<section class="paper cx-sec"><div class="eyebrow">Part 3</div><h2 class="display">Competition between nations</h2><p class="cx-lead">' + e(cm.intro || '') + '</p>'
        + '<h3 class="cx-sub"><span class="pill i">IMPERIALISM</span> The race for colonies</h3><dl class="cx-qa">'
        + '<dt>Continent colonized the most?</dt><dd>' + dot('imp:africa') + '<b>Africa</b> (the “Scramble for Africa”)</dd>'
        + '<dt>What did countries hope to gain?</dt><dd>' + dot('imp:resources') + e(cm.benefits[0] || '') + '<br>' + dot('imp:benefits') + e(cm.benefits[1] || '') + '<br>' + dot('imp:benefits') + e(cm.benefits[2] || '') + '</dd>'
        + '<dt>Why did it breed suspicion?</dt><dd>' + dot('imp:suspicion') + e(cm.suspicion || '') + '</dd></dl>'
        + '<h3 class="cx-sub"><span class="pill m">MILITARISM</span> The naval race</h3><dl class="cx-qa">'
        + '<dt>World’s best navy?</dt><dd>' + dot('mil:best-navy') + '<b>Great Britain</b></dd>'
        + '<dt>Who built a rival navy?</dt><dd>' + dot('mil:rival-navy') + '<b>Germany</b></dd>'
        + '<dt>Why did both feel LESS safe?</dt><dd>' + dot('mil:less-safe') + e(cm.lessSafe || '') + '</dd></dl>'
        + '<h3 class="cx-sub">How each cause made war more likely</h3><div class="cx-connect">'
        + causes.map((t) => '<p>' + dot('connect:' + t.letter) + '<span class="pill ' + k(t) + '">' + e(t.name.toUpperCase()) + '</span> ' + e(t.connect) + '</p>').join('') + '</div></section>';

      h += '<section class="paper cx-sec"><div class="eyebrow">Part 4</div><h2 class="display">The spark</h2><p class="cx-lead">' + dot('spark:keg') + e(STUDY.lines.keg || '') + '</p><p class="cx-story">';
      STUDY.story.parts.forEach((p, i) => { h += e(p); if (i < STUDY.story.blanks.length) { const bl = STUDY.story.blanks[i]; h += '<mark>' + e(bl.answer) + '</mark>' + dot(bl.fact); } });
      h += '</p><h3 class="cx-sub">The chain reaction ' + dot('chain:order') + '</h3><ol class="cx-chain">'
        + STUDY.chain.map((s, i) => '<li><span class="cx-n display">' + (i + 1) + '</span><span>' + e(s) + ' ' + dot('chain:' + (i + 1)) + '</span></li>').join('') + '</ol>'
        + '<h3 class="cx-sub">Long-term cause or spark?</h3><ul class="cx-ls">'
        + STUDY.longOrSpark.filter((x) => !x.variant).map((x) => '<li><span class="cx-badge ' + (x.ans === 'L' ? 'l' : 's') + '">' + x.ans + '</span><span>' + e(x.text) + ' ' + dot(x.fact) + '</span></li>').join('')
        + '</ul><p class="cx-mn">L = long-term cause (built up for years). S = spark (the one event that lit the fuse).</p></section>';

      const wrap = el('div', { class: 'wrap cx', html: h });
      const screen = el('div', { class: 'screen cx-screen' }, wrap);
      let done = false;
      const close = () => { if (done) return; done = true; window.removeEventListener('keydown', onKey, true); screen.remove(); openCount--; sfx('click'); resolve(); };
      const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
      window.addEventListener('keydown', onKey, true);
      wrap.querySelector('.cx-close').addEventListener('click', close);
      const bottom = el('button', { class: 'btn primary big', type: 'button', text: 'Close notes' });
      bottom.addEventListener('click', close);
      wrap.appendChild(bottom);
      root().appendChild(screen); openCount++;
      sfx('card');
    });
  }

  window.Quiz = {
    init, ask, reviveGauntlet, bonusRound, practiceTest, openCodex, readiness, stats, record,
    isOpen: () => openCount > 0,
    kinds: Object.keys(GAMES),
    _debug: { pickQuestion, gradeTyped, norm, fuzzy, TYPED },
  };
})();
