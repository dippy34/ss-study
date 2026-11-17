/* audio.js — procedural WebAudio for Powder Keg 1914: SFX + a little step sequencer for music. Zero assets.
   Exposes window.AudioSys (see SPEC "AudioSys"). Every call is a silent no-op when WebAudio is unavailable. */
(function () {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  /* ------------------------------------------------------------------ state */
  const DEF_SET = { music: 0.55, sfx: 0.8, muted: false };
  const localSet = Object.assign({}, DEF_SET);
  let inited = false, dead = !AC, eng = null, userUnlocked = false, timer = null;
  let wantTrack = null, curTrack = null, ducked = false;
  const players = [];            // live music players (sequencers, buffer loops, stingers)
  const ext = {};                // external tracks: key -> {raw:ArrayBuffer|null, buf:AudioBuffer|null, gain}
  const LOOKAHEAD = 0.35;

  function S() { try { if (window.Save && Save.ns) return Save.ns('settings', DEF_SET); } catch (e) {} return localSet; }
  function persist() { try { if (window.Save && Save.commit) Save.commit(); } catch (e) {} }

  /* ------------------------------------------------------------------ engine (works for live + offline contexts) */
  function makeEngine(ctx) {
    const E = { ctx, voices: 0, sfxVoices: 0, offline: false, waves: {} };
    E.master = ctx.createGain();
    E.comp = ctx.createDynamicsCompressor();
    try { E.comp.threshold.value = -15; E.comp.knee.value = 12; E.comp.ratio.value = 8; E.comp.attack.value = 0.003; E.comp.release.value = 0.18; } catch (e) {}
    E.sfxBus = ctx.createGain();
    E.musicBus = ctx.createGain();
    E.duckGain = ctx.createGain();
    E.musicFilter = ctx.createBiquadFilter(); E.musicFilter.type = 'lowpass'; E.musicFilter.frequency.value = 18000; E.musicFilter.Q.value = 0.5;
    E.musicBus.connect(E.duckGain); E.duckGain.connect(E.musicFilter); E.musicFilter.connect(E.comp);
    E.sfxBus.connect(E.comp); E.comp.connect(E.master); E.master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 1.2), nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;      // white noise, rendered once
    E.noise = nb;
    [['p25', 0.25], ['p12', 0.125]].forEach((w) => {                 // NES-style pulse waves
      const N = 20, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
      for (let k = 1; k <= N; k++) re[k] = (4 / (k * Math.PI)) * Math.sin(k * Math.PI * w[1]);
      try { E.waves[w[0]] = ctx.createPeriodicWave(re, im); } catch (e) {}
    });
    return E;
  }
  function setWave(E, osc, type) {
    const w = E.waves[type];
    if (w) osc.setPeriodicWave(w); else osc.type = (type === 'p25' || type === 'p12') ? 'square' : (type || 'sine');
  }
  function applyLevels(E, instant) {
    const s = S(), t = E.ctx.currentTime;
    const set = (p, v) => { if (instant) p.value = v; else { try { p.setTargetAtTime(v, t, 0.04); } catch (e) { p.value = v; } } };
    set(E.musicBus.gain, Math.pow(clamp(num(s.music, 0.55), 0, 1), 1.5) * 0.8);
    set(E.sfxBus.gain, Math.pow(clamp(num(s.sfx, 0.8), 0, 1), 1.3) * 0.9);
    set(E.master.gain, s.muted ? 0 : 1);
    set(E.duckGain.gain, ducked ? 0.4 : 1);
    set(E.musicFilter.frequency, ducked ? 850 : 18000);
  }
  /* voice bookkeeping + cleanup */
  function reg(E, src, nodes, isSfx) {
    E.voices++; if (isSfx) E.sfxVoices++;
    src.onended = () => {
      E.voices--; if (isSfx) E.sfxVoices--;
      for (let i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) {} }
    };
  }

  /* ------------------------------------------------------------------ synth primitives */
  /* tone: o = {type,f,f2,slide,dur,vol,a,hold,lp,dest} — osc with pitch slide + percussive envelope */
  function tone(E, t, o) {
    if (!(o.vol > 0)) return;
    const ctx = E.ctx, osc = ctx.createOscillator(), g = ctx.createGain(), sfx = !o.dest;
    setWave(E, osc, o.type);
    osc.frequency.setValueAtTime(clamp(o.f, 20, 12000), t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(clamp(o.f2, 20, 12000), t + (o.slide || o.dur));
    const a = o.a == null ? 0.004 : o.a;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + a);
    if (o.hold) g.gain.setValueAtTime(o.vol, t + a + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(o.dur, a + (o.hold || 0) + 0.01));
    const nodes = [g];
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.7; osc.connect(f); f.connect(g); nodes.push(f); }
    else osc.connect(g);
    g.connect(o.dest || E.sfxBus);
    osc.start(t); osc.stop(t + o.dur + 0.03);
    reg(E, osc, nodes, sfx);
  }
  /* noise: o = {type(filter),f,f2,f3,q,dur,vol,a,rate,dest} — filtered noise burst with optional filter sweep */
  function noise(E, t, o) {
    if (!(o.vol > 0)) return;
    const ctx = E.ctx, src = ctx.createBufferSource(), g = ctx.createGain(), sfx = !o.dest;
    src.buffer = E.noise; src.loop = true; if (o.rate) src.playbackRate.value = o.rate;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(clamp(o.f || 1000, 20, 16000), t);
    if (o.f2 && o.f3) { f.frequency.exponentialRampToValueAtTime(clamp(o.f2, 20, 16000), t + o.dur * 0.45); f.frequency.exponentialRampToValueAtTime(clamp(o.f3, 20, 16000), t + o.dur); }
    else if (o.f2) f.frequency.exponentialRampToValueAtTime(clamp(o.f2, 20, 16000), t + o.dur);
    const a = o.a == null ? 0.003 : o.a;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(o.dur, a + 0.01));
    src.connect(f); f.connect(g); g.connect(o.dest || E.sfxBus);
    src.start(t, Math.random()); src.stop(t + o.dur + 0.03);
    reg(E, src, [g, f], sfx);
  }
  /* run of notes: midi list, fixed step; the last note rings for o.last seconds */
  function run(E, t, midis, step, o, p) {
    for (let i = 0; i < midis.length; i++) {
      tone(E, t + i * step, { type: o.type, f: mtof(midis[i]) * (p || 1), dur: i === midis.length - 1 ? (o.last || o.dur) : o.dur, vol: o.vol, lp: o.lp, a: o.a });
    }
  }

  /* ------------------------------------------------------------------ SFX   fn(E, t, p = pitch mult, v = volume mult) */
  const SFX = {
    shoot(E, t, p, v) { tone(E, t, { type: 'p25', f: 860 * p * rnd(0.96, 1.04), f2: 400 * p, dur: 0.07, vol: 0.075 * v }); },
    hit(E, t, p, v) {
      noise(E, t, { type: 'bandpass', f: 2100 * p, q: 1.1, dur: 0.045, vol: 0.13 * v });
      tone(E, t, { type: 'triangle', f: 240 * p * rnd(0.9, 1.1), f2: 150 * p, dur: 0.05, vol: 0.1 * v });
    },
    crit(E, t, p, v) {
      tone(E, t, { type: 'p25', f: 1200 * p, f2: 1850 * p, dur: 0.07, vol: 0.07 * v });
      noise(E, t, { type: 'highpass', f: 4200, dur: 0.06, vol: 0.1 * v });
      tone(E, t, { type: 'triangle', f: 330 * p, f2: 150 * p, dur: 0.09, vol: 0.15 * v });
    },
    kill(E, t, p, v) {
      tone(E, t, { type: 'sine', f: 540 * p * rnd(0.9, 1.1), f2: 105 * p, dur: 0.1, vol: 0.2 * v });
      noise(E, t, { type: 'lowpass', f: 3200, f2: 500, dur: 0.06, vol: 0.07 * v });
    },
    hurt(E, t, p, v) {
      tone(E, t, { type: 'sawtooth', f: 235 * p, f2: 78 * p, dur: 0.24, vol: 0.2 * v, lp: 900 });
      noise(E, t, { type: 'lowpass', f: 950, f2: 140, dur: 0.17, vol: 0.24 * v });
    },
    pickup(E, t, p, v) { tone(E, t, { type: 'triangle', f: 900 * p, f2: 1350 * p, dur: 0.055, vol: 0.1 * v }); },
    coin(E, t, p, v) {
      tone(E, t, { type: 'p25', f: mtof(83) * p, dur: 0.06, vol: 0.05 * v, lp: 5200 });
      tone(E, t + 0.055, { type: 'p25', f: mtof(88) * p, dur: 0.17, vol: 0.05 * v, lp: 5200 });
    },
    levelup(E, t, p, v) {
      run(E, t, [72, 76, 79, 84], 0.075, { type: 'p25', dur: 0.11, last: 0.42, vol: 0.085 * v, lp: 4200 }, p);
      run(E, t, [60, 64, 67, 72], 0.075, { type: 'triangle', dur: 0.11, last: 0.42, vol: 0.13 * v }, p);
      noise(E, t + 0.22, { type: 'highpass', f: 6500, dur: 0.35, vol: 0.035 * v, a: 0.02 });
    },
    correct(E, t, p, v) {
      tone(E, t, { type: 'sine', f: mtof(81) * p, dur: 0.14, vol: 0.2 * v });
      tone(E, t + 0.09, { type: 'sine', f: mtof(88) * p, dur: 0.42, vol: 0.22 * v });
      tone(E, t + 0.09, { type: 'triangle', f: mtof(100) * p, dur: 0.3, vol: 0.045 * v });
    },
    wrong(E, t, p, v) {
      tone(E, t, { type: 'triangle', f: mtof(55) * p, dur: 0.15, vol: 0.15 * v, hold: 0.07 });
      tone(E, t + 0.13, { type: 'triangle', f: mtof(51) * p, dur: 0.26, vol: 0.15 * v, hold: 0.1 });
      tone(E, t, { type: 'square', f: mtof(43) * p, dur: 0.36, vol: 0.035 * v, lp: 420, hold: 0.2 });
    },
    click(E, t, p, v) { tone(E, t, { type: 'p25', f: 720 * p, dur: 0.035, vol: 0.08 * v }); },
    select(E, t, p, v) { tone(E, t, { type: 'triangle', f: 520 * p, f2: 800 * p, dur: 0.06, vol: 0.11 * v }); },
    chest(E, t, p, v) {
      run(E, t, [72, 74, 76, 79, 81, 84, 88], 0.045, { type: 'p25', dur: 0.08, last: 0.4, vol: 0.07 * v, lp: 4500 }, p);
      run(E, t + 0.3, [72, 76, 79], 0, { type: 'triangle', dur: 0.5, vol: 0.08 * v }, p);
      noise(E, t, { type: 'highpass', f: 6000, dur: 0.5, vol: 0.04 * v, a: 0.05 });
    },
    boss_warn(E, t, p, v) {
      for (let i = 0; i < 4; i++) tone(E, t + i * 0.3, { type: 'square', f: (i % 2 ? 370 : 277) * p, dur: 0.26, vol: 0.11 * v, lp: 1400, hold: 0.16 });
      noise(E, t, { type: 'lowpass', f: 220, dur: 1.25, vol: 0.15 * v, a: 0.1 });
    },
    boss_hit(E, t, p, v) {
      tone(E, t, { type: 'sine', f: 175 * p, f2: 55 * p, dur: 0.14, vol: 0.26 * v });
      noise(E, t, { type: 'lowpass', f: 1600, f2: 300, dur: 0.09, vol: 0.14 * v });
    },
    boss_die(E, t, p, v) {
      noise(E, t, { type: 'lowpass', f: 3200, f2: 60, dur: 1.4, vol: 0.4 * v });
      tone(E, t, { type: 'sawtooth', f: 300, f2: 30, dur: 1.2, vol: 0.18 * v, lp: 800 });
      for (let i = 0; i < 5; i++) tone(E, t + 0.12 + i * 0.14 + rnd(0, 0.05), { type: 'sine', f: rnd(380, 900), f2: 70, dur: 0.16, vol: 0.16 * v });
      run(E, t + 0.95, [72, 79, 84, 88, 91], 0.07, { type: 'triangle', dur: 0.14, last: 0.6, vol: 0.11 * v });
    },
    explosion(E, t, p, v) {
      noise(E, t, { type: 'lowpass', f: 1700 * p, f2: 90, dur: 0.42, vol: 0.32 * v });
      tone(E, t, { type: 'sine', f: 125 * p, f2: 36, dur: 0.36, vol: 0.3 * v });
    },
    zap(E, t, p, v) {
      tone(E, t, { type: 'sawtooth', f: 2100 * p, f2: 260 * p, dur: 0.09, vol: 0.07 * v, lp: 3600 });
      tone(E, t + 0.02, { type: 'p12', f: 3100 * p, f2: 900 * p, dur: 0.05, vol: 0.03 * v });
      noise(E, t, { type: 'highpass', f: 5000, dur: 0.05, vol: 0.05 * v });
    },
    orb(E, t, p, v) { tone(E, t, { type: 'sine', f: 330 * p, f2: 520 * p, dur: 0.09, vol: 0.07 * v }); },
    boomerang(E, t, p, v) {
      noise(E, t, { type: 'bandpass', f: 500 * p, f2: 1800 * p, f3: 700 * p, q: 3, dur: 0.24, vol: 0.16 * v, a: 0.03 });
      tone(E, t, { type: 'triangle', f: 300 * p, f2: 460 * p, dur: 0.2, vol: 0.04 * v, a: 0.03 });
    },
    dash(E, t, p, v) { noise(E, t, { type: 'highpass', f: 600 * p, f2: 5000, dur: 0.17, vol: 0.13 * v, a: 0.02 }); },
    heal(E, t, p, v) {
      tone(E, t, { type: 'sine', f: mtof(72) * p, f2: mtof(79) * p, slide: 0.16, dur: 0.22, vol: 0.13 * v, a: 0.02 });
      tone(E, t + 0.13, { type: 'sine', f: mtof(84) * p, dur: 0.34, vol: 0.12 * v, a: 0.02 });
      tone(E, t + 0.13, { type: 'triangle', f: mtof(91) * p, dur: 0.25, vol: 0.04 * v });
    },
    shield_up(E, t, p, v) {
      tone(E, t, { type: 'p25', f: 220 * p, f2: 880 * p, dur: 0.32, vol: 0.07 * v, lp: 2600, a: 0.03 });
      tone(E, t, { type: 'sine', f: 440 * p, f2: 1760 * p, dur: 0.34, vol: 0.09 * v, a: 0.03 });
    },
    shield_break(E, t, p, v) {
      noise(E, t, { type: 'highpass', f: 3500, dur: 0.36, vol: 0.2 * v });
      for (let i = 0; i < 6; i++) tone(E, t + i * 0.03, { type: 'sine', f: rnd(1800, 5200), dur: rnd(0.14, 0.3), vol: 0.06 * v });
      tone(E, t, { type: 'sine', f: 145, f2: 58, dur: 0.16, vol: 0.2 * v });
    },
    revive(E, t, p, v) {
      run(E, t, [60, 67, 72, 76, 79, 84], 0.08, { type: 'triangle', dur: 0.16, last: 0.6, vol: 0.15 * v }, p);
      run(E, t, [72, 79, 84, 88, 91, 96], 0.08, { type: 'sine', dur: 0.14, last: 0.5, vol: 0.05 * v }, p);
      noise(E, t, { type: 'highpass', f: 5000, dur: 0.7, vol: 0.03 * v, a: 0.3 });
    },
    gameover(E, t, p, v) {
      run(E, t, [64, 62, 60, 57], 0.2, { type: 'triangle', dur: 0.24, last: 0.8, vol: 0.17 * v }, p);
      tone(E, t + 0.6, { type: 'sine', f: mtof(45) * p, dur: 0.85, vol: 0.14 * v, a: 0.02 });
    },
    victory(E, t, p, v) {
      const seq = [[0, 67, 0.12], [0.11, 72, 0.12], [0.22, 76, 0.12], [0.33, 79, 0.3], [0.63, 76, 0.12], [0.75, 84, 0.8]];
      seq.forEach((n) => {
        tone(E, t + n[0], { type: 'p25', f: mtof(n[1]) * p, dur: n[2], vol: 0.075 * v, lp: 4200, hold: n[2] * 0.4 });
        tone(E, t + n[0], { type: 'triangle', f: mtof(n[1] - 12) * p, dur: n[2], vol: 0.12 * v, hold: n[2] * 0.4 });
      });
      [60, 64, 67].forEach((m) => tone(E, t + 0.75, { type: 'triangle', f: mtof(m) * p, dur: 0.8, vol: 0.07 * v, hold: 0.3 }));
      noise(E, t + 0.75, { type: 'highpass', f: 5500, dur: 0.7, vol: 0.05 * v });
    },
    tick(E, t, p, v) {
      tone(E, t, { type: 'sine', f: 1100 * p, dur: 0.035, vol: 0.12 * v, a: 0.001 });
      tone(E, t, { type: 'p12', f: 2200 * p, dur: 0.012, vol: 0.03 * v, a: 0.001 });
    },
    streak(E, t, p, v) {
      run(E, t, [79, 84, 88], 0.055, { type: 'p25', dur: 0.09, last: 0.28, vol: 0.07 * v, lp: 4800 }, p);
      run(E, t, [67, 72, 76], 0.055, { type: 'sine', dur: 0.09, last: 0.28, vol: 0.1 * v }, p);
    },
    unlock(E, t, p, v) {
      run(E, t, [76, 80, 83, 88], 0.085, { type: 'triangle', dur: 0.15, last: 0.5, vol: 0.15 * v }, p);
      run(E, t, [88, 92, 95, 100], 0.085, { type: 'sine', dur: 0.1, last: 0.4, vol: 0.04 * v }, p);
      noise(E, t + 0.25, { type: 'highpass', f: 7000, dur: 0.4, vol: 0.03 * v, a: 0.03 });
    },
    buy(E, t, p, v) {
      noise(E, t, { type: 'highpass', f: 5000, dur: 0.04, vol: 0.1 * v });
      tone(E, t + 0.03, { type: 'triangle', f: mtof(91) * p, dur: 0.08, vol: 0.11 * v });
      tone(E, t + 0.1, { type: 'triangle', f: mtof(96) * p, dur: 0.28, vol: 0.12 * v });
    },
    error(E, t, p, v) {
      tone(E, t, { type: 'square', f: 165 * p, dur: 0.07, vol: 0.12 * v, lp: 650, hold: 0.03 });
      tone(E, t + 0.1, { type: 'square', f: 165 * p, dur: 0.09, vol: 0.12 * v, lp: 650, hold: 0.04 });
    },
    whoosh(E, t, p, v) { noise(E, t, { type: 'bandpass', f: 300 * p, f2: 2400 * p, f3: 400 * p, q: 1.5, dur: 0.32, vol: 0.14 * v, a: 0.09 }); },
    countdown(E, t, p, v) {
      tone(E, t, { type: 'sine', f: 660 * p, dur: 0.14, vol: 0.16 * v, hold: 0.06 });
      tone(E, t, { type: 'triangle', f: 1320 * p, dur: 0.1, vol: 0.04 * v });
    },
    card(E, t, p, v) {
      noise(E, t, { type: 'highpass', f: 1800 * p, dur: 0.07, vol: 0.1 * v, a: 0.012 });
      noise(E, t + 0.035, { type: 'bandpass', f: 900 * p, q: 1, dur: 0.05, vol: 0.06 * v });
      tone(E, t + 0.03, { type: 'sine', f: 180 * p, f2: 120 * p, dur: 0.06, vol: 0.07 * v });
    },
  };
  /* min milliseconds between two plays of the same name; LOW = droppable when the mix is busy */
  const GAP = { shoot: 50, hit: 45, crit: 60, kill: 40, hurt: 140, pickup: 30, coin: 45, orb: 80, zap: 70, explosion: 70, boss_hit: 60,
    boomerang: 120, dash: 80, click: 25, select: 25, tick: 80, card: 60, whoosh: 80, heal: 120 };
  ['levelup', 'correct', 'wrong', 'chest', 'boss_warn', 'boss_die', 'shield_up', 'shield_break', 'revive', 'gameover', 'victory', 'streak', 'unlock', 'buy', 'error', 'countdown']
    .forEach((n) => { GAP[n] = 90; });
  const LOW = { shoot: 1, hit: 1, crit: 1, kill: 1, pickup: 1, coin: 1, orb: 1, zap: 1, boomerang: 1, dash: 1, boss_hit: 1 };
  const lastPlay = {};
  const SOFT_CAP = 14, HARD_CAP = 30;

  /* ------------------------------------------------------------------ music data
     Pitched parts are strings, one bar per '|'. Tokens split a bar evenly (8 tokens = 8ths, 16 = 16ths…):
       1-7 scale degree · ^ / _ octave up / down · # / b accidental · - hold · . rest
     lead/lead2 are relative to the key; bass/arp are relative to the bar's chord root (1 root, 3 third, 5 fifth).
     Drum lines: X accent, x normal, o soft, . rest (hat line also: O = open hat).  chords = scale degree per bar. */
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11] };
  const DRUM_A = { k: 'x...x...x...x...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' };
  const TRACKS = {
    /* calm — D major, music-box lead over a slow broken chord, no drums */
    menu: { bpm: 84, root: 62, scale: 'major', leadBase: 74, echo: 0.3,
      lead: { wave: 'triangle', vol: 0.12, cut: 3200, gate: 0.95 }, bass: { vol: 0.15, gate: 0.95 }, arp: { wave: 'triangle', vol: 0.07, lo: 62, cut: 2400, pluck: 0.28 },
      sections: [
        { chords: [1, 6, 4, 5], lead: '5---3---|1---_6--.|4---6---|5-7-^2---', bass: '1-------', arp: '1 5 ^1 5 ^3 5 ^1 5' },
        { chords: [4, 5, 3, 6, 4, 5, 1, 1], lead: '6---^1---|7---^2---|^3---7---|6-------|6-^1-6-4-|5-7-5-2-|3-------|1---....', bass: '1---5---', arp: '1 5 ^1 5 ^3 5 ^1 5' },
        { chords: [1, 6, 4, 5], lead: null, bass: '1-------', arp: '1 3 5 ^1 5 3 5 ^1' },
      ], order: [0, 1, 0, 2] },
    /* military march — G major, fife lead, oom-pah bass, snare cadence with rolls */
    act1: { bpm: 112, root: 55, scale: 'major', leadBase: 67, harm: true, fill: true,
      lead: { wave: 'p25', alt: 'triangle', vol: 0.085, cut: 2600, gate: 0.8 }, bass: { vol: 0.2, gate: 0.7 }, arp: { wave: 'p12', vol: 0.035, lo: 59, cut: 1800, pluck: 0.1 },
      drum: { k: 0.42, s: 0.15, h: 0.045 },
      sections: [
        { chords: [1, 1, 5, 5, 5, 5, 1, 1], lead: '1.1.3-5-|^1-5-3-5-|2.2.5-7-|^2-7-5-..|7.7.^2-7-|5-6-7-^2-|^1-^3-^1-5-|^1---....',
          bass: '1.5.1.5.', arp: '.3.5.3.5', k: 'x...x...x...x...', s: 'X.ooX.ooX.ooXooo|X.ooX.ooX.ooX.oo|X.ooX.ooX.ooXooo|XoooXoooXoooXoooXoXoXoXoXxXxXxXx' },
        { chords: [1, 1, 4, 4, 5, 5, 1, 1], lead: '3-5-^1-5-|3-5-^1---|4-6-^1-6-|4-6-^1---|^2-^2-7-5-|6-7-^2-7-|^1-5-3-5-|1---....',
          bass: '1.5.1.5.', arp: '.3.5.3.5', k: 'x...x...x...x...', s: 'X.ooX.ooX.ooXooo|X.ooX.ooX.ooX.oo', h: '..x...x...x...x.' },
      ], order: [0, 1] },
    /* bouncy duet — Bb major, swung; a high voice calls, a low voice answers, then they play together */
    act2: { bpm: 122, root: 58, scale: 'major', leadBase: 70, swing: 0.1, fill: true,
      lead: { wave: 'p25', vol: 0.085, cut: 2600, gate: 0.85, pan: 0.3 }, lead2: { wave: 'triangle', vol: 0.15, base: 58, cut: 2400, gate: 0.85, pan: -0.3 },
      bass: { vol: 0.2, gate: 0.6 }, arp: { wave: 'p12', vol: 0.03, lo: 58, cut: 1800, pluck: 0.09 }, drum: { k: 0.4, s: 0.15, h: 0.045 },
      sections: [
        { chords: [1, 6, 2, 5], lead: '1.3.5-3.|3.6.^1-..|........|........', lead2: '........|........|^2.6.4-6.|5.7.^2-..',
          bass: '1.^1.5.^1.', arp: '.5.3.5.3', k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
        { chords: [4, 5, 3, 6], lead: '4.6.^1-6.|5.7.^2-7.|........|........', lead2: '........|........|7.5.3-5.|6.^1.6---',
          bass: '1.^1.5.^1.', arp: '.5.3.5.3', k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
        { chords: [2, 5, 1, 1], lead: '2.4.6.4.|5.7.^2.7.|^1.5.3.5.|1---....', lead2: '4.6.^1.6.|7.^2.^4.^2.|^3.^1.5.^1.|3---....',
          bass: '1.^1.5.^1.', arp: '.5.3.5.3', k: 'x.....x.x.....x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      ], order: [0, 1, 0, 2] },
    /* expedition — A dorian, rolling 3+3+2 rhythm, shaker hats */
    act3: { bpm: 104, root: 57, scale: 'dorian', leadBase: 69, harm: true, echo: 0.32,
      lead: { wave: 'triangle', alt: 'p25', vol: 0.14, cut: 3000, gate: 0.9 }, bass: { vol: 0.2, gate: 0.8 }, arp: { wave: 'p25', vol: 0.028, lo: 57, cut: 1500, pluck: 0.08 },
      drum: { k: 0.4, s: 0.12, h: 0.03 },
      sections: [
        { chords: [1, 1, 4, 4, 1, 1, 7, 7], lead: '1--5--4-|3--1--..|4--^1--6-|6--4--2-|1--5--^1-|^3--^1--5-|7--^2--^4-|^2--7--5-',
          bass: '1--1--5-', arp: '1 5 ^1 5 ^3 5 ^1 5 1 5 ^1 5 ^3 5 ^1 5', k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 'x.oox.oox.oox.oo' },
        { chords: [3, 3, 7, 7, 4, 4, 1, 1], lead: '5-5-^3--5|7--5--3-|^2-^2-^4--^2|7--5--4-|6-6-^1--6|4--6--^2-|^1--5--3-|1-------',
          bass: '1--1--5-', arp: '1 5 ^1 5 ^3 5 ^1 5 1 5 ^1 5 ^3 5 ^1 5', k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 'x.oox.oox.oox.oo' },
      ], order: [0, 1] },
    /* proud anthem — G major, fast, dotted fanfare rhythm, always harmonised in thirds */
    act4: { bpm: 138, root: 55, scale: 'major', leadBase: 67, harm: true, harmAlways: true, fill: true,
      lead: { wave: 'p25', vol: 0.085, cut: 2800, gate: 0.88 }, bass: { vol: 0.2, gate: 0.6 }, arp: { wave: 'p12', vol: 0.028, lo: 55, cut: 1900, pluck: 0.07 },
      drum: { k: 0.44, s: 0.16, h: 0.04 },
      sections: [
        { chords: [1, 4, 5, 1, 6, 4, 5, 5], lead: '1-.13-5-|6-.6^1-6-|5-.57-^2-|^1---..5.|^3-.^3^1-6-|^1-.^16-4-|5-7-^2-^4-|^2---7-5-',
          bass: '1.1^11.1^1', arp: '1 3 5 ^1 5 3 1 3 5 ^1 5 3 1 3 5 3', k: 'x...x...x...x...', s: '....X.......X..x', h: '..x...x...x...x.' },
        { chords: [4, 4, 1, 1, 5, 5, 1, 1], lead: '4-6-^1-6-|^1-6-4---|3-5-^1-5-|^3-^1-5---|^2-^2-^2-7-|^4-^2-7-5-|^1-7-^1-^3-|^1---....',
          bass: '1.1^11.1^1', arp: '1 3 5 ^1 5 3 1 3 5 ^1 5 3 1 3 5 3', k: 'x...x...x...x...', s: '....X.......X..x', h: '..x...x...x...x.' },
      ], order: [0, 1] },
    /* the fuse — E harmonic minor, sparse eerie lead over a ticking clock */
    act5: { bpm: 126, root: 52, scale: 'harm', leadBase: 64, echo: 0.4,
      lead: { wave: 'triangle', vol: 0.16, cut: 2400, gate: 0.9 }, bass: { vol: 0.19, gate: 0.45 }, arp: { wave: 'p12', vol: 0.028, lo: 64, cut: 2200, pluck: 0.05 },
      drum: { k: 0.4, s: 0.11, h: 0.04, r: 0.07 },
      sections: [
        { chords: [1, 1, 6, 5, 1, 1, 6, 5], lead: '1-..3-..|5-..3-2-|^1-..6-..|7-..5-..|1-3-5-..|^1-7-5-..|6-^1-^3-..|^2---7---',
          bass: '1 1 1 1 1 1 1 1', arp: '1 . 5 . 1 . 5 . 1 . 5 . ^1 . 5 .', k: 'x.......x.x.....', s: '....x.......x...', h: 'XoooXoooXoooXooo', r: 'x...x...x...x...' },
        { chords: [4, 4, 1, 1, 6, 6, 5, 5], lead: '4-6-^1-6-|4-6-^1---|3-5-^1-5-|5-3-1---|6-^1-^3-^1-|6-^1-^3---|5-7-^2-7-|5-7-^2-^4-',
          bass: '1 1 1 1 1 1 1 1', arp: '1 . 5 . 1 . 5 . 1 . 5 . ^1 . 5 .', k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 'XoooXoooXoooXooo', r: 'x.x.x.x.x.x.x.x.' },
      ], order: [0, 1] },
    /* boss — D harmonic minor, driving 16th bass */
    boss: { bpm: 150, root: 50, scale: 'harm', leadBase: 62, harm: true, fill: true, echo: 0.18,
      lead: { wave: 'sawtooth', alt: 'p25', vol: 0.075, cut: 2200, gate: 0.85 }, bass: { vol: 0.2, gate: 0.55 }, arp: { wave: 'p25', vol: 0.028, lo: 62, cut: 1700, pluck: 0.06 },
      drum: { k: 0.46, s: 0.17, h: 0.045 },
      sections: [
        { chords: [1, 1, 6, 5, 1, 1, 6, 5], lead: '11 5-4-3-|11 5-4-5-|66 ^1-^3-^1-|55 7-^2-7-|^1^1 ^5-^4-^3-|^1^1 ^5-^4-^5-|^6-^5-^3-^1-|^2-7-5-7-',
          bass: '1 1 ^1 1 1 1 ^1 1 1 1 ^1 1 1 ^1 1 ^1', arp: '1 3 5 ^1 5 3 5 ^1 1 3 5 ^1 5 3 5 ^1', k: 'x...x...x...x.x.', s: DRUM_A.s, h: DRUM_A.h },
        { chords: [4, 4, 1, 1, 6, 6, 5, 5], lead: '4-6-^1-6-|^1-6-4-6-|3-5-^1-5-|^3-^1-5---|6-^1-^3-^1-|^4-^3-^1-6-|5-7-^2-^4-|^5---^2-7-',
          bass: '1 1 ^1 1 1 1 ^1 1 1 1 ^1 1 1 ^1 1 ^1', arp: '1 3 5 ^1 5 3 5 ^1 1 3 5 ^1 5 3 5 ^1', k: 'x..x..x.x..x..x.', s: DRUM_A.s, h: DRUM_A.h },
      ], order: [0, 1] },
  };
  /* final boss = the boss theme, faster, a tone higher, busier hats */
  TRACKS.finalboss = Object.assign({}, TRACKS.boss, { bpm: 168, root: 52, leadBase: 64, harmAlways: true, hatAll: 'x.xxx.xxx.xxx.xx',
    lead: { wave: 'p25', alt: 'sawtooth', vol: 0.08, cut: 2500, gate: 0.85 } });

  /* one-shot stingers: [startBeat, midi, beats] per voice */
  const STINGERS = {
    victory: { bpm: 132, len: 7,
      lead: [[0, 67, 0.5], [0.5, 72, 0.5], [1, 76, 0.5], [1.5, 79, 1], [2.5, 76, 0.5], [3, 79, 0.5], [3.5, 84, 3]],
      pad: [[3.5, 60, 3], [3.5, 64, 3], [3.5, 67, 3], [0, 60, 1.5], [1.5, 55, 2]],
      bass: [[0, 36, 1.5], [1.5, 43, 2], [3.5, 36, 3]], roll: [2.5, 3.5], crash: 3.5 },
    gameover: { bpm: 80, len: 6,
      lead: [[0, 69, 1], [1, 67, 1], [2, 65, 1], [3, 64, 2.6]],
      pad: [[3, 52, 2.6], [3, 56, 2.6], [3, 59, 2.6]],
      bass: [[0, 45, 2], [2, 41, 1], [3, 40, 2.6]] },
  };
  const EXT_KEY = { menu: 'menu', act1: 'game', act2: 'game', act3: 'game', act4: 'game', act5: 'game', boss: 'boss', finalboss: 'boss' };

  const HOLD = 1, REST = 0;
  function parsePitched(str) {
    if (!str) return null;
    return str.split('|').map((bar) => {
      const out = []; let oct = 0, acc = 0;
      for (let i = 0; i < bar.length; i++) {
        const ch = bar[i];
        if (ch === '^') oct++; else if (ch === '_') oct--; else if (ch === '#') acc++; else if (ch === 'b') acc--;
        else if (ch === '-') { out.push(HOLD); oct = 0; acc = 0; }
        else if (ch === '.') { out.push(REST); oct = 0; acc = 0; }
        else if (ch >= '1' && ch <= '7') { out.push({ d: ch.charCodeAt(0) - 49 + 7 * oct, a: acc }); oct = 0; acc = 0; }
      }
      return out;
    });
  }
  const parseDrum = (str) => (str ? str.split('|').map((b) => b.replace(/ /g, '')) : null);
  function compile(name) {
    const def = TRACKS[name];
    if (def._c === name) return def;
    def.sections = def.sections.map((s) => Object.assign({}, s, {
      _lead: parsePitched(s.lead), _lead2: parsePitched(s.lead2), _bass: parsePitched(s.bass), _arp: parsePitched(s.arp),
      _k: parseDrum(s.k), _s: parseDrum(s.s), _h: parseDrum(def.hatAll || s.h), _r: parseDrum(s.r),
    }));
    def._c = name;
    return def;
  }

  /* sustained musical note with a soft ADSR; vib = LFO gain node to wobble long notes */
  function mnote(E, dest, wave, f, t, dur, vol, o, vib) {
    const ctx = E.ctx;
    if (!E.offline && t < ctx.currentTime - 0.02) return;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    setWave(E, osc, wave); osc.frequency.setValueAtTime(f, t);
    const a = o.a || 0.01, s = o.s == null ? 0.7 : o.s, d = o.d || 0.08, r = o.r || 0.05;
    const end = t + Math.max(dur, a + 0.02);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setTargetAtTime(vol * s, t + a, d);
    g.gain.setTargetAtTime(0, end, r / 3);
    osc.connect(g); g.connect(dest);
    let wob = false;
    if (vib && o.vib) { try { vib.connect(osc.detune); wob = true; } catch (e) {} }
    osc.start(t); osc.stop(end + r * 1.7 + 0.02);
    E.voices++;
    osc.onended = () => { E.voices--; try { g.disconnect(); } catch (e) {} if (wob) { try { vib.disconnect(osc.detune); } catch (e) {} } };
  }
  /* unfiltered noise hit into a shared filter bus (drums) */
  function nhit(E, dest, t, dur, vol) {
    const ctx = E.ctx;
    if (!E.offline && t < ctx.currentTime - 0.02) return;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = E.noise;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.01);
    reg(E, s, [g], false);
  }
  function kick(E, dest, t, vol) {
    const ctx = E.ctx;
    if (!E.offline && t < ctx.currentTime - 0.02) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.22);
    reg(E, o, [g], false);
  }

  /* ------------------------------------------------------------------ sequencer player */
  function Player(E, name, t0) {
    const def = compile(name), ctx = E.ctx, self = this;
    this.E = E; this.def = def; this.name = name; this.oi = 0; this.bi = 0; this.pass = 0; this.nextBar = t0; this.stopAt = 0;
    const out = this.out = ctx.createGain(); out.gain.value = 0; out.connect(E.musicBus);
    const lp = (f, q) => { const n = ctx.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = f; n.Q.value = q || 0.7; return n; };
    const hpf = (f) => { const n = ctx.createBiquadFilter(); n.type = 'highpass'; n.frequency.value = f; n.Q.value = 0.6; return n; };
    const toOut = (node, panV) => {
      if (panV && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = panV; node.connect(p); p.connect(out); } else node.connect(out);
      return node;
    };
    this.leadIn = toOut(lp(def.lead.cut || 2600), def.lead.pan);
    this.lead2In = def.lead2 ? toOut(lp(def.lead2.cut || 2400), def.lead2.pan) : null;
    const ek = def.echo == null ? 0.2 : def.echo;
    if (ek > 0) {                                    // dotted-eighth echo on the melody
      const dl = ctx.createDelay(1.5), fb = ctx.createGain(), eo = ctx.createGain();
      dl.delayTime.value = Math.min(1.4, (60 / def.bpm) * 0.75); fb.gain.value = 0.3; eo.gain.value = ek;
      this.leadIn.connect(dl); if (this.lead2In) this.lead2In.connect(dl);
      dl.connect(fb); fb.connect(dl); dl.connect(eo); eo.connect(out);
    }
    this.arpIn = toOut(lp((def.arp && def.arp.cut) || 1800, 1.5), 0.25);
    this.bassIn = toOut(lp((def.bass && def.bass.cut) || 620, 0.9), 0);
    this.drumIn = ctx.createGain(); this.drumIn.connect(out);
    this.snIn = hpf(1400); this.snIn.connect(this.drumIn);
    this.hatIn = hpf(7200); toOut(this.hatIn, -0.2);
    try { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.3; lg.gain.value = 7; l.connect(lg); l.start(t0); this.lfo = l; this.vib = lg; } catch (e) { this.vib = null; }
    this.schedule = function (until) {
      const now = ctx.currentTime;
      if (!E.offline && self.nextBar < now - 0.25) self.nextBar = now + 0.03;      // fell behind (tab was busy): skip ahead
      let guard = 0;
      while (self.nextBar < until && guard++ < 64) { if (self.stopAt && self.nextBar > self.stopAt) break; self.bar(self.nextBar); }
    };
    this.dispose = function () { try { self.lfo && self.lfo.stop(); } catch (e) {} try { out.disconnect(); } catch (e) {} };
  }
  Player.prototype.warp = function (x) {            // swing: stretch the first half of each beat
    const sw = this.def.swing || 0; if (!sw) return x;
    const b = x * 4, i = Math.floor(b), f = b - i;
    const g = f < 0.5 ? (f * (0.5 + sw)) / 0.5 : 0.5 + sw + ((f - 0.5) * (0.5 - sw)) / 0.5;
    return (i + g) / 4;
  };
  Player.prototype.bar = function (t0) {
    const def = this.def, sec = def.sections[def.order[this.oi]], bi = this.bi, nb = sec.chords.length;
    const barDur = 240 / def.bpm, chord = sec.chords[bi] - 1, pass = this.pass, E = this.E, D = def.drum || {};
    const rest = def.order.length > 2 && pass % 3 === 2 && this.oi === 0;         // let the melody breathe now and then
    if (sec._lead && !rest) this.part(sec._lead, 'lead', bi, nb, t0, barDur, chord);
    if (sec._lead2) this.part(sec._lead2, 'lead2', bi, nb, t0, barDur, chord);
    if (sec._bass) this.part(sec._bass, 'bass', bi, nb, t0, barDur, chord);
    if (sec._arp) this.part(sec._arp, 'arp', bi, nb, t0, barDur, chord, pass % 2 === 1);
    const line = (arr, fn) => {
      if (!arr) return; const bar = arr[bi % arr.length], n = bar.length;
      for (let i = 0; i < n; i++) { const ch = bar[i]; if (ch !== '.') fn(t0 + this.warp(i / n) * barDur, ch); }
    };
    const hum = () => 0.85 + Math.random() * 0.3;
    line(sec._k, (t, ch) => kick(E, this.drumIn, t, (D.k || 0.4) * (ch === 'X' ? 1 : 0.85)));
    line(sec._s, (t, ch) => this.snare(t, (D.s || 0.15) * (ch === 'X' ? 1 : ch === 'x' ? 0.62 : 0.3) * hum()));
    line(sec._h, (t, ch) => nhit(E, this.hatIn, t, ch === 'O' ? 0.16 : 0.04, (D.h || 0.04) * (ch === 'X' ? 1.25 : ch === 'o' ? 0.4 : 0.8) * hum()));
    line(sec._r, (t) => mnote(E, this.drumIn, 'sine', 1750, t, 0.012, D.r || 0.06, { a: 0.001, s: 0, d: 0.012, r: 0.02 }));
    if (def.fill && bi === nb - 1 && sec._s && Math.random() < 0.7) {             // little snare fill into the next section
      const st = barDur / 16;
      for (let i = 0; i < 4; i++) this.snare(t0 + barDur * 0.75 + i * st, (D.s || 0.15) * (0.45 + i * 0.18));
    }
    this.bi++;
    if (this.bi >= nb) { this.bi = 0; this.oi++; if (this.oi >= def.order.length) { this.oi = 0; this.pass++; } }
    this.nextBar = t0 + barDur;
  };
  Player.prototype.snare = function (t, vol) {
    nhit(this.E, this.snIn, t, 0.1, vol);
    mnote(this.E, this.drumIn, 'triangle', 188, t, 0.03, vol * 0.5, { a: 0.002, s: 0, d: 0.03, r: 0.03 });
  };
  Player.prototype.part = function (bars, part, bi, nb, t0, barDur, chord, reverse) {
    let bar = bars[bi % bars.length]; const n = bar.length; if (!n) return;
    if (reverse) bar = bar.slice().reverse();
    const step = barDur / n;
    for (let i = 0; i < n; i++) {
      const tk = bar[i]; if (typeof tk !== 'object') continue;
      let dur = step, j = i + 1, b = bi, cur = bar;
      for (;;) {                                                                    // extend through holds (may cross bar lines)
        if (j >= cur.length) { b++; if (b >= nb || reverse) break; cur = bars[b % bars.length]; j = 0; if (!cur.length) break; }
        if (cur[j] !== HOLD) break;
        dur += barDur / cur.length; j++;
      }
      this.voice(part, tk, chord, t0 + this.warp(i / n) * barDur, dur);
    }
  };
  Player.prototype.voice = function (part, tk, chord, t, dur) {
    const def = this.def, sc = SCALES[def.scale] || SCALES.major, E = this.E;
    const semi = (deg) => sc[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
    if (part === 'lead' || part === 'lead2') {
      const L = part === 'lead' ? def.lead : def.lead2, base = L.base || def.leadBase;
      const wave = part === 'lead' && L.alt && this.pass % 2 === 1 ? L.alt : L.wave;
      const vol = L.vol * (wave === 'triangle' && L.wave !== 'triangle' ? 1.5 : wave !== 'triangle' && L.wave === 'triangle' ? 0.6 : 1);
      const len = dur * (L.gate || 0.9), dest = part === 'lead' ? this.leadIn : this.lead2In;
      mnote(E, dest, wave, mtof(base + semi(tk.d) + tk.a), t, len, vol, { a: 0.012, s: 0.72, d: 0.09, r: 0.07, vib: len > 0.3 }, this.vib);
      if (part === 'lead' && def.harm && (def.harmAlways || this.pass % 2 === 1)) {   // harmony a third above
        mnote(E, dest, 'triangle', mtof(base + semi(tk.d + 2) + tk.a), t, len, vol * 0.42, { a: 0.015, s: 0.7, d: 0.09, r: 0.07 }, null);
      }
      return;
    }
    const P = part === 'bass' ? (def.bass || {}) : (def.arp || {});
    const lo = part === 'bass' ? (P.lo || 36) : (P.lo || 60);
    let m = def.root + sc[((chord % 7) + 7) % 7];
    while (m < lo) m += 12; while (m >= lo + 12) m -= 12;                               // keep chord roots in one octave
    m += semi(chord + tk.d) - semi(chord) + tk.a;
    if (part === 'bass') mnote(E, this.bassIn, 'sawtooth', mtof(m), t, dur * (P.gate || 0.7), P.vol || 0.2, { a: 0.006, s: 0.8, d: 0.06, r: 0.05 }, null);
    else mnote(E, this.arpIn, P.wave || 'p12', mtof(m), t, Math.min(dur * 0.9, P.pluck || 0.1), P.vol || 0.03, { a: 0.004, s: 0, d: (P.pluck || 0.1) * 0.6, r: 0.04 }, null);
  };

  /* one-shot stinger; returns a player-like object */
  function stinger(E, name, t0) {
    const st = STINGERS[name], ctx = E.ctx, beat = 60 / st.bpm;
    const out = ctx.createGain(); out.gain.value = 1; out.connect(E.musicBus);
    const lead = ctx.createBiquadFilter(); lead.type = 'lowpass'; lead.frequency.value = 3200; lead.connect(out);
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 650; low.connect(out);
    const sn = ctx.createBiquadFilter(); sn.type = 'highpass'; sn.frequency.value = 1400; sn.connect(out);
    const big = name === 'victory';
    (st.lead || []).forEach((n) => {
      mnote(E, lead, big ? 'p25' : 'triangle', mtof(n[1]), t0 + n[0] * beat, n[2] * beat * 0.92, big ? 0.1 : 0.17, { a: 0.012, s: 0.75, d: 0.1, r: 0.12 }, null);
      if (big) mnote(E, lead, 'triangle', mtof(n[1] - 12), t0 + n[0] * beat, n[2] * beat * 0.92, 0.12, { a: 0.012, s: 0.75, d: 0.1, r: 0.12 }, null);
    });
    (st.pad || []).forEach((n) => mnote(E, lead, 'triangle', mtof(n[1]), t0 + n[0] * beat, n[2] * beat * 0.95, 0.075, { a: 0.03, s: 0.8, d: 0.2, r: 0.3 }, null));
    (st.bass || []).forEach((n) => mnote(E, low, 'sawtooth', mtof(n[1]), t0 + n[0] * beat, n[2] * beat * 0.9, 0.2, { a: 0.01, s: 0.8, d: 0.1, r: 0.15 }, null));
    if (st.roll) { const a = st.roll[0], b = st.roll[1], n = Math.round((b - a) * 4); for (let i = 0; i < n; i++) nhit(E, sn, t0 + (a + i / 4) * beat, 0.09, 0.07 + 0.11 * (i / n)); }
    if (st.crash != null) { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200; hp.connect(out); nhit(E, hp, t0 + st.crash * beat, 1.1, 0.1); kick(E, out, t0 + st.crash * beat, 0.4); }
    return { out, stopAt: t0 + st.len * beat + 0.5, dispose() { try { out.disconnect(); } catch (e) {} } };
  }

  /* looping decoded-audio player for external tracks */
  function bufPlayer(E, key) {
    const ctx = E.ctx, slot = ext[key], out = ctx.createGain(); out.gain.value = 0;
    const lvl = ctx.createGain(); lvl.gain.value = slot.gain || 1;
    const src = ctx.createBufferSource(); src.buffer = slot.buf; src.loop = true;
    src.connect(lvl); lvl.connect(out); out.connect(E.musicBus); src.start();
    return { out, stopAt: 0, ext: key, dispose() { try { src.stop(); } catch (e) {} try { out.disconnect(); } catch (e) {} } };
  }

  /* ------------------------------------------------------------------ transport */
  const srcKey = (tr) => (!tr ? null : (EXT_KEY[tr] && ext[EXT_KEY[tr]] && ext[EXT_KEY[tr]].buf) ? 'ext:' + EXT_KEY[tr] : tr);
  let curKey = null;
  function fadeOutAll(E, secs) {
    const now = E.ctx.currentTime;
    for (let i = 0; i < players.length; i++) {
      const p = players[i]; if (p.fading) continue;
      p.fading = true; p.stopAt = now + secs + 0.1;
      try { if (p.out.gain.cancelAndHoldAtTime) p.out.gain.cancelAndHoldAtTime(now); else p.out.gain.cancelScheduledValues(now); } catch (e) {}
      try { p.out.gain.setTargetAtTime(0, now, secs / 4); } catch (e) {}
    }
  }
  function applyTrack() {
    const E = eng; if (!E || E.ctx.state !== 'running') return;
    const key = srcKey(wantTrack);
    if (wantTrack === curTrack && key === curKey) return;
    if (key && key === curKey && key.slice(0, 4) === 'ext:') { curTrack = wantTrack; return; }   // same external loop keeps playing
    const now = E.ctx.currentTime;
    fadeOutAll(E, STINGERS[wantTrack] ? 0.3 : 0.6);
    curTrack = wantTrack; curKey = key;
    if (!wantTrack) return;
    let p;
    try {
      if (STINGERS[wantTrack]) p = stinger(E, wantTrack, now + 0.12);
      else if (key.slice(0, 4) === 'ext:') p = bufPlayer(E, EXT_KEY[wantTrack]);
      else if (TRACKS[wantTrack]) p = new Player(E, wantTrack, now + 0.08);
    } catch (e) { p = null; }
    if (!p) return;
    if (!STINGERS[wantTrack]) { p.out.gain.setValueAtTime(0, now); p.out.gain.setTargetAtTime(1, now, 0.16); }
    players.push(p);
    if (p.schedule) p.schedule(now + LOOKAHEAD);
  }
  function tick() {
    const E = eng; if (!E || E.ctx.state !== 'running') return;
    const now = E.ctx.currentTime;
    for (let i = players.length - 1; i >= 0; i--) {
      const p = players[i];
      if (p.stopAt && now >= p.stopAt) { p.dispose(); players.splice(i, 1); continue; }
      if (p.schedule) { try { p.schedule(now + LOOKAHEAD); } catch (e) {} }
    }
  }
  function decodePending() {
    const E = eng; if (!E) return;
    Object.keys(ext).forEach((key) => {
      const slot = ext[key]; if (!slot.raw || slot.busy) return;
      const raw = slot.raw; slot.raw = null; slot.busy = true;
      const done = (buf) => {
        slot.busy = false; if (!buf) return;
        let sum = 0, n = 0;                                        // rough loudness match to the procedural mix (once, off the audio thread)
        try { const d = buf.getChannelData(0); for (let i = 0; i < d.length; i += 97) { sum += d[i] * d[i]; n++; } } catch (e) {}
        const rms = n ? Math.sqrt(sum / n) : 0.1;
        slot.gain = clamp(0.11 / Math.max(rms, 0.005), 0.15, 2.5); slot.buf = buf;
        if (EXT_KEY[wantTrack] === key) applyTrack();              // swap the procedural version out with a crossfade
      };
      try {
        const pr = E.ctx.decodeAudioData(raw, done, () => { slot.busy = false; });
        if (pr && pr.catch) pr.catch(() => { slot.busy = false; });
      } catch (e) { slot.busy = false; }
    });
  }
  function ensureEngine() {
    if (eng || dead) return eng;
    try { const ctx = new AC({ latencyHint: 'interactive' }); eng = makeEngine(ctx); applyLevels(eng, true); ctx.onstatechange = onState; }
    catch (e) { try { const ctx = new AC(); eng = makeEngine(ctx); applyLevels(eng, true); ctx.onstatechange = onState; } catch (e2) { dead = true; eng = null; } }
    return eng;
  }
  function onState() { if (eng && eng.ctx.state === 'running') onRunning(); }
  function onRunning() {
    if (!timer) timer = setInterval(tick, 50);
    applyLevels(eng);
    decodePending(); applyTrack(); tick();
  }
  function ensureInit() {
    if (inited) return; inited = true;
    if (dead) return;
    const gesture = () => { if (!eng || eng.ctx.state !== 'running') AudioSys.unlock(); };
    ['pointerdown', 'keydown', 'touchend', 'click'].forEach((ev) => window.addEventListener(ev, gesture, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => {
      if (!eng) return; const c = eng.ctx;
      try {
        if (document.hidden) { if (c.state === 'running') c.suspend(); }
        else if (userUnlocked && c.state !== 'running') { const p = c.resume(); if (p && p.then) p.then(onState, () => {}); }
      } catch (e) {}
    });
  }

  /* ------------------------------------------------------------------ public API */
  const AudioSys = {
    init() { ensureInit(); },
    unlock() {
      ensureInit(); if (dead) return;
      userUnlocked = true;
      const E = ensureEngine(); if (!E) return;
      if (document.hidden) return;
      if (E.ctx.state === 'running') { onRunning(); return; }
      try { const p = E.ctx.resume(); if (p && p.then) p.then(onState, () => {}); } catch (e) {}
    },
    sfx(name, opts) {
      const E = eng; if (!E || dead || E.ctx.state !== 'running') return;
      const fn = SFX[name]; if (!fn) return;
      const s = S(); if (s.muted || !(num(s.sfx, 0.8) > 0)) return;
      const now = performance.now(), gap = GAP[name] || 20;
      if (now - (lastPlay[name] || 0) < gap) return;
      if (E.sfxVoices >= HARD_CAP || (LOW[name] && E.sfxVoices >= SOFT_CAP)) return;
      lastPlay[name] = now;
      const p = clamp(num(opts && opts.pitch, 1), 0.25, 4), v = clamp(num(opts && opts.vol, 1), 0, 2);
      if (v <= 0) return;
      try { fn(E, E.ctx.currentTime + 0.002, p, v); } catch (e) {}
    },
    music(track) {
      ensureInit();
      if (track != null && !TRACKS[track] && !STINGERS[track]) return;     // unknown name: ignore
      wantTrack = track || null;
      if (eng && !dead) applyTrack();                                      // otherwise it starts on unlock
    },
    duck(on) { ducked = !!on; if (eng) applyLevels(eng); },
    setMusicVolume(v) { S().music = clamp(num(+v, 0), 0, 1); persist(); if (eng) applyLevels(eng); },
    setSfxVolume(v) { S().sfx = clamp(num(+v, 0), 0, 1); persist(); if (eng) applyLevels(eng); },
    setMuted(b) { S().muted = !!b; persist(); if (eng) applyLevels(eng); },
    /* optional real recordings: {menu:url, game:url, boss:url}. Any failure silently keeps the procedural track. */
    useExternal(map) {
      ensureInit(); if (dead || !map || typeof fetch !== 'function') return;
      ['menu', 'game', 'boss'].forEach((key) => {
        const url = map[key]; if (!url || typeof url !== 'string') return;
        const slot = ext[key] || (ext[key] = { raw: null, buf: null, gain: 1, busy: false });
        try {
          fetch(url).then((r) => { if (!r.ok) throw new Error('missing'); return r.arrayBuffer(); })
            .then((ab) => { if (!ab || ab.byteLength < 1024) return; slot.raw = ab; if (eng && eng.ctx.state === 'running') decodePending(); })
            .catch(() => {});
        } catch (e) {}
      });
    },
    /* test hook (not part of the game API): offline-render a track / stinger / sfx and measure it */
    _render(what, secs) {
      if (!OAC) return Promise.resolve(null);
      try {
        const sr = 44100, ctx = new OAC(2, Math.ceil(sr * secs), sr), E = makeEngine(ctx);
        E.offline = true; applyLevels(E, true);
        if (SFX[what]) SFX[what](E, 0.05, 1, 1);
        else if (TRACKS[what]) { const p = new Player(E, what, 0.05); p.out.gain.value = 1; p.schedule(secs); }
        else if (STINGERS[what]) stinger(E, what, 0.05);
        return ctx.startRendering().then((buf) => {
          let peak = 0, sum = 0, n = 0;
          for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += a * a; n++; } }
          return { peak, rms: Math.sqrt(sum / n) };
        });
      } catch (e) { return Promise.resolve({ error: String(e) }); }
    },
    _debug() { return { dead, state: eng ? eng.ctx.state : 'none', track: curTrack, key: curKey, want: wantTrack, players: players.length, voices: eng ? eng.voices : 0, sfxVoices: eng ? eng.sfxVoices : 0 }; },
    SFX_NAMES: Object.keys(SFX),
    TRACK_NAMES: Object.keys(TRACKS).concat(Object.keys(STINGERS)),
  };
  window.AudioSys = AudioSys;
})();
