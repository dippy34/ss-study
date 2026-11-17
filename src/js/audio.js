/* audio.js — procedural WebAudio for Powder Keg 1914: layered SFX + a small orchestral-chiptune sequencer. Zero assets.
   Exposes window.AudioSys. Every call is a silent no-op when WebAudio is unavailable. */
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
  let wantTrack = null, curTrack = null, curKey = null, ducked = false;
  const players = [];            // live music players (sequencers, buffer loops, stingers)
  const ext = {};                // external tracks: key -> {raw:ArrayBuffer|null, buf:AudioBuffer|null, gain}
  const LOOKAHEAD = 0.35, MUSIC_CAP = 14;   // most pitched music oscillators allowed to sound at once (arps/harmonies/stabs yield first)

  function S() { try { if (window.Save && Save.ns) return Save.ns('settings', DEF_SET); } catch (e) {} return localSet; }
  function persist() { try { if (window.Save && Save.commit) Save.commit(); } catch (e) {} }

  /* ------------------------------------------------------------------ engine (works for live + offline contexts) */
  function impulse(ctx, secs) {                                       // generated hall impulse, built once per engine
    const sr = ctx.sampleRate, n = Math.floor(sr * secs), b = ctx.createBuffer(2, n, sr), fade = sr * 0.006;
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const x = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.8) * (i < fade ? i / fade : 1); lp += (x - lp) * 0.55; d[i] = lp; } }
    return b;
  }
  function makeEngine(ctx) {
    const E = { ctx, voices: 0, sfxVoices: 0, mv: 0, live: [], offline: false, waves: {} };
    E.master = ctx.createGain();
    E.comp = ctx.createDynamicsCompressor();
    try { E.comp.threshold.value = -16; E.comp.knee.value = 10; E.comp.ratio.value = 6; E.comp.attack.value = 0.004; E.comp.release.value = 0.2; } catch (e) {}
    E.sfxBus = ctx.createGain();
    E.musicBus = ctx.createGain();
    E.duckGain = ctx.createGain();
    E.musicFilter = ctx.createBiquadFilter(); E.musicFilter.type = 'lowpass'; E.musicFilter.frequency.value = 18000; E.musicFilter.Q.value = 0.5;
    E.musicBus.connect(E.duckGain); E.duckGain.connect(E.musicFilter); E.musicFilter.connect(E.comp);
    E.sfxBus.connect(E.comp); E.comp.connect(E.master); E.master.connect(ctx.destination);
    /* shared music reverb: revIn -> convolver -> lowpass -> musicBus */
    E.revIn = ctx.createGain(); E.revRet = ctx.createGain(); E.revRet.gain.value = 0.85; E.revRet.connect(E.musicBus);
    try {
      const cv = ctx.createConvolver(); cv.buffer = impulse(ctx, 1.6);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.5;
      E.revIn.connect(cv); cv.connect(lp); lp.connect(E.revRet);
    } catch (e) {}
    const len = Math.floor(ctx.sampleRate * 1.2), nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;      // white noise, rendered once
    E.noise = nb;
    const pw = (name, re) => { try { E.waves[name] = ctx.createPeriodicWave(new Float32Array(re), new Float32Array(re.length)); } catch (e) {} };
    [['p25', 0.25], ['p12', 0.125]].forEach((w) => {                 // NES-style pulse waves
      const N = 20, re = [0]; for (let k = 1; k <= N; k++) re.push((4 / (k * Math.PI)) * Math.sin(k * Math.PI * w[1])); pw(w[0], re);
    });
    pw('flute', [0, 1, 0.32, 0.1, 0.04, 0.015]);                     // soft woodwind
    pw('warm', [0, 1, 0.5, 0.22, 0.12, 0.06, 0.03]);                 // round bass / horn body
    pw('reed', [0, 1, 0.1, 0.55, 0.08, 0.3, 0.05, 0.15, 0.03, 0.07]); // clarinet-ish (odd harmonics)
    return E;
  }
  function setWave(E, osc, type) {
    const w = E.waves[type];
    if (w) osc.setPeriodicWave(w); else osc.type = (type === 'p25' || type === 'p12') ? 'square' : (type === 'flute' || type === 'warm' || type === 'reed') ? 'triangle' : (type || 'sine');
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

  /* ------------------------------------------------------------------ synth primitives (SFX) */
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

  /* ------------------------------------------------------------------ SFX   fn(E, t, p = pitch mult, v = volume mult)
     Each is layered: transient + body (+ tail). Voice counts stay small because combat fires hundreds per second. */
  const SFX = {
    shoot(E, t, p, v) {
      tone(E, t, { type: 'p25', f: 900 * p * rnd(0.96, 1.04), f2: 380 * p, dur: 0.075, vol: 0.07 * v, lp: 5200 });
      noise(E, t, { type: 'highpass', f: 3800, dur: 0.02, vol: 0.05 * v });
    },
    hit(E, t, p, v) {
      noise(E, t, { type: 'bandpass', f: 2100 * p, q: 1.1, dur: 0.045, vol: 0.13 * v });
      tone(E, t, { type: 'triangle', f: 250 * p * rnd(0.9, 1.1), f2: 140 * p, dur: 0.055, vol: 0.11 * v });
    },
    crit(E, t, p, v) {
      tone(E, t, { type: 'p25', f: 1250 * p, f2: 1900 * p, dur: 0.075, vol: 0.065 * v, lp: 6000 });
      noise(E, t, { type: 'highpass', f: 4200, dur: 0.06, vol: 0.1 * v });
      tone(E, t, { type: 'triangle', f: 330 * p, f2: 140 * p, dur: 0.1, vol: 0.16 * v });
    },
    kill(E, t, p, v) {
      tone(E, t, { type: 'sine', f: 560 * p * rnd(0.9, 1.1), f2: 100 * p, dur: 0.11, vol: 0.2 * v });
      noise(E, t, { type: 'lowpass', f: 3400, f2: 450, dur: 0.07, vol: 0.075 * v });
    },
    hurt(E, t, p, v) {
      tone(E, t, { type: 'sawtooth', f: 240 * p, f2: 76 * p, dur: 0.25, vol: 0.19 * v, lp: 900 });
      noise(E, t, { type: 'lowpass', f: 1000, f2: 130, dur: 0.18, vol: 0.24 * v });
      tone(E, t, { type: 'sine', f: 92 * p, f2: 50, dur: 0.2, vol: 0.2 * v });
    },
    pickup(E, t, p, v) { tone(E, t, { type: 'triangle', f: 900 * p, f2: 1350 * p, dur: 0.055, vol: 0.1 * v }); },
    coin(E, t, p, v) {
      tone(E, t, { type: 'p25', f: mtof(83) * p, dur: 0.06, vol: 0.05 * v, lp: 5200 });
      tone(E, t + 0.055, { type: 'p25', f: mtof(88) * p, dur: 0.2, vol: 0.05 * v, lp: 5200 });
      tone(E, t + 0.055, { type: 'sine', f: mtof(100) * p, dur: 0.16, vol: 0.02 * v });
    },
    levelup(E, t, p, v) {                                             // a real little fanfare: run up, then a held chord
      run(E, t, [67, 72, 76, 79], 0.07, { type: 'p25', dur: 0.1, last: 0.12, vol: 0.075 * v, lp: 4200 }, p);
      run(E, t, [55, 60, 64, 67], 0.07, { type: 'triangle', dur: 0.1, last: 0.12, vol: 0.12 * v }, p);
      [72, 76, 79, 84].forEach((m, i) => tone(E, t + 0.3, { type: i === 3 ? 'p25' : 'triangle', f: mtof(m) * p, dur: 0.55, vol: (i === 3 ? 0.07 : 0.085) * v, lp: 4200, hold: 0.16 }));
      noise(E, t + 0.3, { type: 'highpass', f: 6500, dur: 0.4, vol: 0.035 * v, a: 0.01 });
    },
    correct(E, t, p, v) {                                             // bright, rewarding rising fifth with a bell partial
      tone(E, t, { type: 'sine', f: mtof(81) * p, dur: 0.14, vol: 0.2 * v });
      tone(E, t + 0.09, { type: 'sine', f: mtof(88) * p, dur: 0.46, vol: 0.22 * v });
      tone(E, t + 0.09, { type: 'triangle', f: mtof(100) * p, dur: 0.32, vol: 0.045 * v });
      tone(E, t + 0.09, { type: 'sine', f: mtof(93) * p, dur: 0.4, vol: 0.06 * v });
    },
    wrong(E, t, p, v) {                                               // soft, low, never punishing
      tone(E, t, { type: 'triangle', f: mtof(55) * p, dur: 0.16, vol: 0.14 * v, hold: 0.07 });
      tone(E, t + 0.14, { type: 'triangle', f: mtof(50) * p, dur: 0.3, vol: 0.14 * v, hold: 0.1 });
      tone(E, t, { type: 'sine', f: mtof(38) * p, dur: 0.4, vol: 0.1 * v, hold: 0.2 });
    },
    click(E, t, p, v) { tone(E, t, { type: 'p25', f: 720 * p, dur: 0.035, vol: 0.075 * v, lp: 5000 }); tone(E, t, { type: 'sine', f: 190 * p, dur: 0.03, vol: 0.06 * v }); },
    select(E, t, p, v) { tone(E, t, { type: 'triangle', f: 520 * p, f2: 800 * p, dur: 0.07, vol: 0.11 * v }); tone(E, t + 0.04, { type: 'sine', f: 1040 * p, dur: 0.09, vol: 0.035 * v }); },
    chest(E, t, p, v) {                                               // sparkle run into a warm chord
      run(E, t, [72, 76, 79, 84, 88, 91, 96], 0.042, { type: 'p25', dur: 0.08, last: 0.42, vol: 0.06 * v, lp: 5000 }, p);
      [60, 64, 67, 72].forEach((m) => tone(E, t + 0.3, { type: 'triangle', f: mtof(m) * p, dur: 0.6, vol: 0.07 * v, hold: 0.15 }));
      noise(E, t, { type: 'highpass', f: 6500, dur: 0.6, vol: 0.04 * v, a: 0.08 });
    },
    boss_warn(E, t, p, v) {                                           // two-tone horn call, twice — clear but not shrill
      for (let i = 0; i < 4; i++) {
        tone(E, t + i * 0.3, { type: 'sawtooth', f: (i % 2 ? 311 : 233) * p, dur: 0.27, vol: 0.12 * v, lp: 1300, hold: 0.17, a: 0.012 });
        tone(E, t + i * 0.3, { type: 'triangle', f: (i % 2 ? 155.5 : 116.5) * p, dur: 0.27, vol: 0.1 * v, hold: 0.17, a: 0.012 });
      }
      noise(E, t, { type: 'lowpass', f: 220, dur: 1.25, vol: 0.15 * v, a: 0.1 });
    },
    boss_hit(E, t, p, v) {
      tone(E, t, { type: 'sine', f: 180 * p, f2: 52 * p, dur: 0.15, vol: 0.26 * v });
      noise(E, t, { type: 'lowpass', f: 1700, f2: 300, dur: 0.09, vol: 0.14 * v });
    },
    boss_die(E, t, p, v) {
      noise(E, t, { type: 'lowpass', f: 3200, f2: 60, dur: 1.4, vol: 0.38 * v });
      tone(E, t, { type: 'sawtooth', f: 300, f2: 30, dur: 1.2, vol: 0.17 * v, lp: 800 });
      for (let i = 0; i < 5; i++) tone(E, t + 0.12 + i * 0.14 + rnd(0, 0.05), { type: 'sine', f: rnd(380, 900), f2: 70, dur: 0.16, vol: 0.15 * v });
      run(E, t + 0.95, [72, 79, 84, 88, 91], 0.07, { type: 'triangle', dur: 0.14, last: 0.6, vol: 0.11 * v });
    },
    explosion(E, t, p, v) {
      noise(E, t, { type: 'lowpass', f: 1900 * p, f2: 90, dur: 0.45, vol: 0.32 * v });
      tone(E, t, { type: 'sine', f: 130 * p, f2: 34, dur: 0.38, vol: 0.3 * v });
      noise(E, t + 0.02, { type: 'bandpass', f: 3200, q: 0.8, dur: 0.12, vol: 0.06 * v });
    },
    zap(E, t, p, v) {
      tone(E, t, { type: 'sawtooth', f: 2100 * p, f2: 260 * p, dur: 0.09, vol: 0.07 * v, lp: 3600 });
      tone(E, t + 0.02, { type: 'p12', f: 3100 * p, f2: 900 * p, dur: 0.05, vol: 0.028 * v });
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
      tone(E, t + 0.13, { type: 'sine', f: mtof(84) * p, dur: 0.36, vol: 0.12 * v, a: 0.02 });
      tone(E, t + 0.13, { type: 'triangle', f: mtof(91) * p, dur: 0.26, vol: 0.04 * v });
    },
    shield_up(E, t, p, v) {
      tone(E, t, { type: 'p25', f: 220 * p, f2: 880 * p, dur: 0.32, vol: 0.065 * v, lp: 2600, a: 0.03 });
      tone(E, t, { type: 'sine', f: 440 * p, f2: 1760 * p, dur: 0.34, vol: 0.09 * v, a: 0.03 });
      tone(E, t + 0.3, { type: 'sine', f: 1760 * p, dur: 0.3, vol: 0.05 * v });
    },
    shield_break(E, t, p, v) {                                        // glassy crash: shards + air + a low thud
      noise(E, t, { type: 'highpass', f: 3600, dur: 0.4, vol: 0.2 * v });
      for (let i = 0; i < 7; i++) tone(E, t + i * 0.028, { type: 'sine', f: rnd(1700, 5200), dur: rnd(0.14, 0.34), vol: 0.055 * v });
      tone(E, t, { type: 'sine', f: 150, f2: 55, dur: 0.18, vol: 0.22 * v });
      noise(E, t + 0.05, { type: 'bandpass', f: 7000, q: 2, dur: 0.3, vol: 0.05 * v });
    },
    revive(E, t, p, v) {
      run(E, t, [60, 67, 72, 76, 79, 84], 0.08, { type: 'triangle', dur: 0.16, last: 0.6, vol: 0.15 * v }, p);
      run(E, t, [72, 79, 84, 88, 91, 96], 0.08, { type: 'sine', dur: 0.14, last: 0.5, vol: 0.05 * v }, p);
      noise(E, t, { type: 'highpass', f: 5000, dur: 0.7, vol: 0.03 * v, a: 0.3 });
    },
    /* these two can sound together with the music stingers of the same name (C major / A minor), so they stay short and in key */
    gameover(E, t, p, v) {
      tone(E, t, { type: 'sine', f: 120 * p, f2: 42, dur: 0.5, vol: 0.2 * v });
      noise(E, t, { type: 'lowpass', f: 900, f2: 120, dur: 0.7, vol: 0.13 * v, a: 0.02 });
      tone(E, t + 0.05, { type: 'triangle', f: mtof(57) * p, dur: 0.5, vol: 0.1 * v, hold: 0.2, a: 0.02 });
    },
    victory(E, t, p, v) {
      run(E, t, [72, 76, 79, 84], 0.06, { type: 'p25', dur: 0.1, last: 0.5, vol: 0.06 * v, lp: 4800 }, p);
      run(E, t, [60, 64, 67, 72], 0.06, { type: 'triangle', dur: 0.1, last: 0.5, vol: 0.1 * v }, p);
      noise(E, t + 0.18, { type: 'highpass', f: 5200, dur: 1.1, vol: 0.07 * v, a: 0.005 });
      for (let i = 0; i < 5; i++) tone(E, t + 0.3 + i * 0.09, { type: 'sine', f: mtof([96, 100, 103, 108, 103][i]) * p, dur: 0.2, vol: 0.025 * v });
    },
    tick(E, t, p, v) {
      tone(E, t, { type: 'sine', f: 1100 * p, dur: 0.035, vol: 0.12 * v, a: 0.001 });
      tone(E, t, { type: 'p12', f: 2200 * p, dur: 0.012, vol: 0.03 * v, a: 0.001 });
    },
    streak(E, t, p, v) {
      run(E, t, [79, 84, 88, 91], 0.05, { type: 'p25', dur: 0.09, last: 0.3, vol: 0.065 * v, lp: 4800 }, p);
      run(E, t, [67, 72, 76, 79], 0.05, { type: 'sine', dur: 0.09, last: 0.3, vol: 0.1 * v }, p);
    },
    unlock(E, t, p, v) {
      run(E, t, [76, 80, 83, 88], 0.085, { type: 'triangle', dur: 0.15, last: 0.5, vol: 0.15 * v }, p);
      run(E, t, [88, 92, 95, 100], 0.085, { type: 'sine', dur: 0.1, last: 0.4, vol: 0.04 * v }, p);
      noise(E, t + 0.25, { type: 'highpass', f: 7000, dur: 0.4, vol: 0.03 * v, a: 0.03 });
    },
    buy(E, t, p, v) {                                                 // cash-register "ka-ching"
      noise(E, t, { type: 'highpass', f: 5000, dur: 0.04, vol: 0.1 * v });
      tone(E, t + 0.03, { type: 'triangle', f: mtof(91) * p, dur: 0.08, vol: 0.11 * v });
      tone(E, t + 0.1, { type: 'triangle', f: mtof(96) * p, dur: 0.3, vol: 0.12 * v });
      tone(E, t + 0.1, { type: 'sine', f: mtof(103) * p, dur: 0.22, vol: 0.03 * v });
    },
    error(E, t, p, v) {
      tone(E, t, { type: 'square', f: 165 * p, dur: 0.07, vol: 0.11 * v, lp: 650, hold: 0.03 });
      tone(E, t + 0.1, { type: 'square', f: 165 * p, dur: 0.09, vol: 0.11 * v, lp: 650, hold: 0.04 });
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

  /* ------------------------------------------------------------------ music theory helpers */
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11], mixo: [0, 2, 4, 5, 7, 9, 10] };
  const ROMAN = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };
  const chordCache = {};
  /* Roman numerals relative to the tonic's MAJOR scale; case = quality. 'I' 'vi' 'V7' 'bVII' 'bIII' 'IM7' 'Vsus' 'iidim'
     -> {root: semitones above the tonic, tones: [0, third, fifth(, seventh)]} */
  function chord(sym) {
    if (chordCache[sym]) return chordCache[sym];
    const m = /^([b#]?)([ivIV]+)(M7|7|sus|dim)?$/.exec(sym); if (!m) throw new Error('bad chord ' + sym);
    const low = m[2].toLowerCase(), minor = m[2] === low, q = m[3] || '';
    if (ROMAN[low] == null) throw new Error('bad chord ' + sym);
    const root = ROMAN[low] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
    const tones = [0, q === 'sus' ? 5 : minor ? 3 : 4, q === 'dim' ? 6 : 7];
    if (q === '7') tones.push(10); else if (q === 'M7') tones.push(11);
    return (chordCache[sym] = { sym, root: (root + 12) % 12, tones });
  }
  /* Pitched parts are strings, one bar per '|'. Tokens split a bar evenly (8 tokens = 8ths, 12 = triplets, 16 = 16ths):
       1-7 degree · ^ / _ octave up / down · # / b accidental · - hold · . rest      (spaces are ignored)
     Melodies (lead, lead2, ctr) are scale degrees of the key. bass / arp are CHORD tones: 1 root, 3 third, 5 fifth, 7 seventh.
     Drum lines: X accent, x normal, o soft, . rest. */
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

  /* ------------------------------------------------------------------ instruments
     wave/wave2 (+det cents, +oct2 semitones, mix2) · ADSR a,d,s,r (s = 0 -> plucked: pure decay of length d) · vib · g = level trim
     fenv = per-note low-pass sweep {from, peak, to, at, dt, q} (scaled with pitch) · fm = {ratio, index, decay} */
  const INST = {
    flute: { wave: 'flute', a: 0.03, d: 0.12, s: 0.82, r: 0.09, vib: 1, g: 1.25 },
    picc: { wave: 'flute', wave2: 'sine', oct2: 12, mix2: 0.2, a: 0.02, d: 0.1, s: 0.8, r: 0.07, vib: 1, g: 1.15 },
    reed: { wave: 'reed', a: 0.025, d: 0.12, s: 0.8, r: 0.08, vib: 1, g: 0.95 },
    pulse: { wave: 'p25', a: 0.01, d: 0.09, s: 0.7, r: 0.06, vib: 1, g: 0.62 },
    brass: { wave: 'sawtooth', wave2: 'sawtooth', det: 9, mix2: 0.7, a: 0.03, d: 0.14, s: 0.8, r: 0.07, g: 0.62, fenv: { from: 500, peak: 2600, to: 1500, at: 0.05, dt: 0.16, q: 1.1 } },
    horn: { wave: 'warm', a: 0.04, d: 0.15, s: 0.85, r: 0.12, g: 1.05, fenv: { from: 420, peak: 1800, to: 1150, at: 0.06, dt: 0.2, q: 0.8 } },
    bell: { wave: 'sine', fm: { ratio: 3.5, index: 1.6, decay: 0.2 }, a: 0.003, d: 0.5, s: 0, r: 0.25, g: 1.2 },
    pluck: { wave: 'sawtooth', a: 0.004, d: 0.16, s: 0, r: 0.06, g: 0.9, fenv: { from: 3000, peak: 3000, to: 480, at: 0.001, dt: 0.08, q: 1.4 } },
    chip: { wave: 'p12', a: 0.004, d: 0.09, s: 0, r: 0.04, g: 0.8 },
    pizz: { wave: 'warm', a: 0.004, d: 0.2, s: 0, r: 0.06, g: 1.0 },
    pad: { wave: 'sawtooth', a: 0.12, d: 0.3, s: 0.9, r: 0.24, g: 1 },
    soft: { wave: 'warm', a: 0.18, d: 0.3, s: 0.9, r: 0.3, g: 1.5 },
    bassA: { wave: 'sawtooth', a: 0.006, d: 0.07, s: 0.8, r: 0.05, g: 1 },
    tuba: { wave: 'warm', a: 0.012, d: 0.1, s: 0.78, r: 0.07, g: 1.0 },
  };
  /* music voice budget: E.live holds [start, stop, oscillators] triples of scheduled notes */
  function sounding(E, t) { const a = E.live; let n = 0; for (let i = 0; i < a.length; i += 3) if (a[i] <= t && a[i + 1] > t) n += a[i + 2]; return n; }
  function book(E, s, e, n) {
    const a = E.live;
    if (a.length > 300) { const now = E.ctx.currentTime; let j = 0; for (let i = 0; i < a.length; i += 3) if (a[i + 1] > now) { a[j++] = a[i]; a[j++] = a[i + 1]; a[j++] = a[i + 2]; } a.length = j; }
    a.push(s, e, n);
  }
  /* one musical note. lowPri notes are dropped when the music voice budget is full. */
  function mnote(E, dest, inst, f, t, dur, vol, vibNode, lowPri) {
    const ctx = E.ctx, I = INST[inst] || INST.pulse;
    if (!(vol > 0) || (!E.offline && t < ctx.currentTime - 0.02)) return;
    const planned = 1 + (I.wave2 ? 1 : 0) + (I.fm ? 1 : 0);
    vol *= I.g || 1;
    const a = I.a, r = I.r, plucked = !(I.s > 0);
    const end = plucked ? t + a : t + Math.max(dur, a + 0.02), stop = plucked ? t + a + I.d * 2.2 + 0.03 : end + r * 1.6 + 0.02;
    if (lowPri && !E.offline && Math.max(sounding(E, t + 0.01), sounding(E, (t + stop) / 2), sounding(E, stop - 0.01)) + planned > MUSIC_CAP) return;
    const g = ctx.createGain(), nodes = [g]; let head = g, n = 1;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a);
    if (plucked) g.gain.setTargetAtTime(0, t + a, I.d / 2.2);
    else { g.gain.setTargetAtTime(vol * I.s, t + a, I.d); g.gain.setTargetAtTime(0, end, r / 3); }
    if (I.fenv) {
      const fe = I.fenv, kf = clamp(f / 330, 0.7, 2.2), fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = fe.q || 1;
      fl.frequency.setValueAtTime(fe.from * kf, t); fl.frequency.linearRampToValueAtTime(fe.peak * kf, t + fe.at); fl.frequency.setTargetAtTime(fe.to * kf, t + fe.at, fe.dt);
      fl.connect(g); head = fl; nodes.push(fl);
    }
    const osc = ctx.createOscillator(); setWave(E, osc, I.wave); osc.frequency.setValueAtTime(f, t); osc.connect(head);
    if (I.wave2) {
      const o2 = ctx.createOscillator(), g2 = ctx.createGain(); setWave(E, o2, I.wave2);
      o2.frequency.setValueAtTime(f * Math.pow(2, (I.oct2 || 0) / 12), t); if (I.det) o2.detune.value = I.det;
      g2.gain.value = I.mix2 == null ? 0.5 : I.mix2; o2.connect(g2); g2.connect(head); o2.start(t); o2.stop(stop); nodes.push(g2); n++;
    }
    if (I.fm) {
      const mo = ctx.createOscillator(), mg = ctx.createGain(); mo.frequency.setValueAtTime(f * I.fm.ratio, t);
      mg.gain.setValueAtTime(f * I.fm.index * clamp(700 / f, 0.3, 1), t);   // gentler bell partials on high notes mg.gain.setTargetAtTime(0, t, I.fm.decay);
      mo.connect(mg); mg.connect(osc.frequency); mo.start(t); mo.stop(stop); nodes.push(mg); n++;
    }
    let wob = false;
    if (vibNode && I.vib && !plucked && dur > 0.3) { try { vibNode.connect(osc.detune); wob = true; } catch (e) {} }
    g.connect(dest); osc.start(t); osc.stop(stop);
    E.mv += n; E.voices += n; if (!E.offline) book(E, t, stop, n);
    osc.onended = () => {
      E.mv -= n; E.voices -= n;
      for (let i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) {} }
      if (wob) { try { vibNode.disconnect(osc.detune); } catch (e) {} }
    };
  }
  /* drums: unfiltered noise hit into a shared filter bus, kick with a pitch drop + click, tom, clock tick */
  function nhit(E, dest, t, dur, vol) {
    const ctx = E.ctx;
    if (!(vol > 0) || (!E.offline && t < ctx.currentTime - 0.02)) return;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = E.noise;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.01);
    reg(E, s, [g], false);
  }
  function drumTone(E, dest, t, f1, f2, slide, dur, vol, type) {
    const ctx = E.ctx;
    if (!(vol > 0) || (!E.offline && t < ctx.currentTime - 0.02)) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f1, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + slide);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
    reg(E, o, [g], false);
  }
  const kick = (E, dest, t, vol) => drumTone(E, dest, t, 165, 50, 0.1, 0.17, vol);
  const tom = (E, dest, t, vol, f) => drumTone(E, dest, t, f, f * 0.6, 0.14, 0.2, vol);
  const tickHit = (E, dest, t, vol) => { drumTone(E, dest, t, 1750, 0, 0, 0.03, vol); drumTone(E, dest, t, 3400, 0, 0, 0.012, vol * 0.35, 'triangle'); };

  /* ------------------------------------------------------------------ the score
     sections: ch = one chord symbol per bar ('IV,V' = two chords sharing the bar). Missing bass/arp/stab/drum lines fall back
     to the track's `pat`. order = [section, flags]; the song loops back to order[loopFrom] so intros play once.
     flags: n no melody · q quiet (no melody, no drums) · b percussion break (no kick/snare/hat) · s soft drums · x crash + extra drive
            h chord-tone harmony under the lead · o lead an octave up · w alternate lead instrument · c counter-melody · p no pad · a no arp */
  const TRACKS = {
    /* MAP ROOM AT NIGHT — D major, music-box lead over harp arpeggios and warm strings, no drums */
    menu: { bpm: 80, root: 62, scale: 'major', leadBase: 74, padLo: 57, arpLo: 62, bassLo: 38, echo: 0.28, loopFrom: 1, bassGate: 0.95,
      inst: { lead: 'bell', alt: 'flute', ctr: 'flute', pad: 'soft', arp: 'pluck', bass: 'tuba' },
      vol: { lead: 0.22, ctr: 0.085, pad: 0.034, arp: 0.05, bass: 0.13 }, rev: { lead: 0.4, ctr: 0.4, pad: 0.45, arp: 0.3 },
      pat: { bass: '1---5---', arp: '1 5 ^1 5 ^3 5 ^1 5' },
      sections: {
        I: { ch: ['I', 'vi', 'IV', 'V'], bass: '1-------' },
        A: { ch: ['I', 'vi', 'IV', 'V', 'I', 'iii', 'IV,V', 'I'], lead: '3-5-^1---|^1-7-6---|6-^1-6-4-|5---..2-|3-5-^1---|^3-^2-7---|6-^1-7-^2-|^1-------',
          ctr: '....5---|....3---|....4---|....7---|....5---|....5---|........|....3-5-' },
        B: { ch: ['vi', 'IV', 'I', 'V', 'ii', 'IV', 'V7', 'V7'], lead: '6-^1-^3---|^4-^3-^1---|5-^1-^3-^1-|^2-------|4-6-^2---|^1-6-4-6-|5-7-^2-^4-|^3-^2-7-5-' },
        O: { ch: ['I', 'IV', 'I', 'V'], arp: '1 3 5 ^1 5 3 5 ^1', bass: '1-------' },
      },
      order: [['I', 'q'], ['A', ''], ['A', 'c'], ['B', ''], ['A', 'wc'], ['O', 'q']] },

    /* ACT 1 MILITARISM — G major parade march: piccolo lead, tuba oom-pah, brass after-beats, snare cadence with rolls, a soft trio */
    act1: { bpm: 116, root: 55, scale: 'major', leadBase: 67, gate: 0.8, padLo: 55, stabLo: 59, bassLo: 36, echo: 0.1, fill: true, loopFrom: 1, bassGate: 0.55,
      inst: { lead: 'picc', alt: 'brass', ctr: 'horn', stab: 'brass', bass: 'tuba' },
      vol: { lead: 0.165, ctr: 0.09, stab: 0.046, bass: 0.17, k: 0.32, s: 0.14, h: 0.035 }, rev: { lead: 0.25, ctr: 0.3, stab: 0.2, drums: 0.1 },
      pat: { bass: '1.5.1.5.', stab: '..x...x.', k: 'x.......x.......', s: 'X.ooX.ooX.ooXooo|X.ooX.ooX.ooX.oo', h: '....x.......x...' },
      sections: {
        I: { ch: ['I', 'I', 'V7', 'V7'], s: 'X.ooX.ooX.ooXooo|X.ooX.ooX.ooX.oo|X.ooX.ooX.ooXooo|XoooXoooXoooXoooXxXxXxXxXXXXXXXX' },
        A: { ch: ['I', 'I', 'V7', 'V7', 'V7', 'V7', 'I', 'I'], lead: '5.55^1-^3-|^5-^3-^1-5-|5.557-^2-|^4-^2-7-5-|^2-7-^2-^4-|^5-^4-^2-7-|^3-^1-^3-^5-|^1---..5.' },
        B: { ch: ['IV', 'IV', 'I', 'I', 'V7', 'V7', 'I', 'I'], lead: '^1-6-^1-^4-|^6-^4-^1-6-|5-^1-^3-^5-|^3---^1---|^2-^2^2^4-^2-|7-^2-7-5-|^1-^3-^5-^3-|^1---....' },
        C: { ch: ['I', 'vi', 'ii', 'V7', 'I', 'vi', 'ii,V7', 'I'], lead: '^3---^2-^1-|^1---7-6-|6---^1-^2-|^2---7-5-|^3---^5-^3-|^1---^3-^1-|6-^1-7-^2-|^1-----..',
          ctr: '5---....|3---....|4---....|4---....|5---....|6---....|........|3---....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      },
      order: [['I', ''], ['A', ''], ['A', 'h'], ['B', ''], ['A', 'whx'], ['C', 's'], ['C', 'sc'], ['B', 'hx']] },

    /* ACT 2 ALLIANCES — Bb major, lightly swung: a clarinet calls (right), a horn answers (left), then they play as allies */
    act2: { bpm: 120, root: 58, scale: 'major', leadBase: 70, gate: 0.85, lead2Base: 58, padLo: 58, arpLo: 62, bassLo: 34, swing: 0.09, echo: 0.14, fill: true, loopFrom: 1, bassGate: 0.6,
      inst: { lead: 'reed', lead2: 'horn', pad: 'soft', arp: 'pluck', bass: 'bassA' },
      vol: { lead: 0.185, lead2: 0.2, pad: 0.028, arp: 0.046, bass: 0.16, k: 0.33, s: 0.13, h: 0.036 },
      pan: { lead: 0.35, lead2: -0.35 }, rev: { lead: 0.25, lead2: 0.25, pad: 0.4, arp: 0.2, drums: 0.08 },
      pat: { bass: '1.^1.5.^1.', arp: '.5.3.5.3', k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      sections: {
        I: { ch: ['I', 'V7'] },
        A: { ch: ['I', 'vi', 'ii', 'V7', 'I', 'vi', 'ii,V7', 'I'], lead: '1.3.5-3.|6.^1.6-..|........|........|3.5.^1-5.|^1.^3.^1-..|^2.^4.^2.7.|^1---....',
          lead2: '........|........|2.4.6-4.|5.7.^2-..|........|........|4.6.5.^2.|3---....' },
        B: { ch: ['IV', 'I', 'IV', 'V7', 'vi', 'ii', 'V7', 'V7'], lead: '4.6.^1-6.|........|^1.6.4-6.|........|6.^1.^3-^1.|........|5.7.^2.^4.|^2---7---',
          lead2: '........|5.3.1-3.|........|7.^2.5-..|........|6.4.2-4.|2.5.7.^2.|5---5---' },
        C: { ch: ['I', 'IV', 'I', 'V7', 'I', 'IV', 'ii,V7', 'I'], lead: '^1-^3-^5-^3-|^4-^6-^4-^1-|^3-^1-5-^1-|^2-7-^2-^4-|^5-^3-^1-^3-|^6-^4-^1-^4-|^2-^4-^2-7-|^1---....',
          lead2: '3-5-^1-5-|6-^1-6-4-|^1-5-3-5-|7-5-7-^2-|^3-^1-5-^1-|^4-^1-6-^1-|4-6-7-5-|3---....' },
      },
      order: [['I', 'n'], ['A', ''], ['B', ''], ['A', 'x'], ['C', 'x'], ['B', 'b'], ['C', 'x']] },

    /* ACT 3 IMPERIALISM — D mixolydian expedition in a rolling 12/8: horn theme over a galloping bass, bVII lifts, shaker */
    act3: { bpm: 104, root: 62, scale: 'mixo', leadBase: 62, padLo: 57, arpLo: 62, bassLo: 38, echo: 0.2, fill: true, loopFrom: 1, bassGate: 0.75,
      inst: { lead: 'horn', alt: 'reed', pad: 'pad', arp: 'pluck', bass: 'bassA' },
      vol: { lead: 0.235, pad: 0.028, arp: 0.04, bass: 0.16, k: 0.33, s: 0.12, h: 0.028 }, rev: { lead: 0.3, pad: 0.4, arp: 0.2, drums: 0.08 },
      pat: { bass: '1.11.15.51.1', arp: '135^153135^153', k: 'x.....x....x', s: '...x.....x..', h: 'x.xx.xx.xx.x' },
      sections: {
        I: { ch: ['I', 'I', 'bVII', 'bVII'] },
        A: { ch: ['I', 'I', 'bVII', 'bVII', 'IV', 'IV', 'I', 'bVII'],
          lead: '1.13.5^1--5-.|^3--^2-^15----.|7.7^2.^4^7--^4-.|^2--^1-74----.|4.46.^1^4--^1-.|^6--^4-^16----.|5.5^1.^3^5--^3-.|^4--^2-7^2----.' },
        B: { ch: ['vi', 'IV', 'I', 'bVII', 'vi', 'IV', 'bVII', 'I'],
          lead: '6-----^1--^3--|^4-----^1--6--|5-----^1--^3--|^2--------7--|^3-----^1--6--|^1-----6--4--|7--^2--^4--^2--|^1--------...' },
      },
      order: [['I', 'n'], ['A', ''], ['A', 'h'], ['B', 's'], ['A', 'w'], ['B', 'sh'], ['A', 'whx']] },

    /* ACT 4 NATIONALISM — C major, fast and proud: dotted brass fanfare, after-beat chords, marching bass (an original tune, no anthem) */
    act4: { bpm: 138, root: 60, scale: 'major', leadBase: 60, gate: 0.86, padLo: 55, stabLo: 60, bassLo: 36, echo: 0.1, fill: true, loopFrom: 1, bassGate: 0.55,
      inst: { lead: 'brass', alt: 'picc', pad: 'pad', stab: 'brass', bass: 'tuba' },
      vol: { lead: 0.145, pad: 0.022, stab: 0.042, bass: 0.16, k: 0.34, s: 0.14, h: 0.036 }, rev: { lead: 0.25, pad: 0.35, stab: 0.2, drums: 0.1 },
      pat: { bass: '1.5.1.5.', stab: '..x...x.', k: 'x...x...x...x...', s: '....X.......X..x', h: '..x...x...x...x.' },
      sections: {
        I: { ch: ['I', 'V'], s: 'x.x.x.x.x.x.x.xx|xxxxxxxxXXXXXXXX' },
        A: { ch: ['I', 'IV', 'V', 'I', 'vi', 'IV', 'V7', 'V7'], lead: '1--13-5-|6--6^1-6-|5--57-^2-|^1---..5.|^3--^3^1-6-|^1--^16-4-|5-7-^2-^4-|^2---7-5-' },
        B: { ch: ['IV', 'I', 'V', 'vi', 'IV', 'I', 'V7', 'I'], lead: '^4---^1-6-|^3---^1-5-|^2---7-^2-|^3---^1---|^4-^4-^6-^4-|^5-^3-^1-^3-|^2-7-^2-^4-|^1-----..' },
      },
      order: [['I', 'n'], ['A', ''], ['A', 'h'], ['B', 'h'], ['A', 'n'], ['A', 'owhx'], ['B', 'hx']] },

    /* ACT 5 THE SPARK — E minor ticking fuse. Theme: Grieg, "In the Hall of the Mountain King" (1875, public domain), building from
       pizzicato + a clock tick to full band, with an original B section */
    act5: { bpm: 132, root: 52, scale: 'minor', leadBase: 52, padLo: 52, arpLo: 64, bassLo: 40, echo: 0.3, fill: true, loopFrom: 1, bassGate: 0.5,
      inst: { lead: 'reed', alt: 'pulse', pad: 'pad', arp: 'chip', bass: 'pizz' },
      vol: { lead: 0.235, pad: 0.026, arp: 0.034, bass: 0.2, k: 0.33, s: 0.11, h: 0.03, r: 0.07 }, rev: { lead: 0.3, pad: 0.4, arp: 0.25, drums: 0.08 },
      pat: { bass: '1.5.1.5.', k: 'x.......x.x.....', s: '....x.......x...', h: 'XoooXoooXoooXooo', r: 'x...x...x...x...' },
      sections: {
        I: { ch: ['i', 'i', 'i', 'i'] },
        A: { ch: ['i', 'II,bII', 'i', 'bIII'], lead: '1234535-|#42#4-4b24-|1234535^1|75357---' },
        B: { ch: ['iv', 'iv', 'i', 'i', 'bVI', 'bVI', 'V7', 'V7'], lead: '4-6-^1-6-|4-6-^1---|3-5-^1-5-|3-5-^1---|6-^1-^3-^1-|6-^1-^3---|5-#7-^2-#7-|5-#7-^2-^4-',
          arp: '1.5.1.5.1.5.^1.5.' },
      },
      order: [['I', 'qp'], ['A', 'bp'], ['A', 'bp'], ['A', 'o'], ['A', 'o'], ['B', ''], ['A', 'ohx'], ['A', 'owh'], ['B', 'hx']] },

    /* BOSS — D minor, driving sixteenth-note bass under an urgent brass call */
    boss: { bpm: 150, root: 50, scale: 'minor', leadBase: 62, padN: 2, padLo: 50, arpLo: 62, bassLo: 38, echo: 0.16, fill: true, loopFrom: 1, bassGate: 0.55,
      inst: { lead: 'brass', alt: 'pulse', pad: 'pad', arp: 'chip', bass: 'bassA' },
      vol: { lead: 0.135, pad: 0.024, arp: 0.03, bass: 0.15, k: 0.36, s: 0.15, h: 0.038 }, rev: { lead: 0.25, pad: 0.35, arp: 0.15, drums: 0.08 },
      pat: { bass: '1 1 ^1 1 1 1 ^1 1 1 1 ^1 1 1 ^1 1 ^1', arp: '1 3 5 ^1 5 3 5 ^1 1 3 5 ^1 5 3 5 ^1', k: 'x...x...x...x.x.', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
      sections: {
        I: { ch: ['i', 'V'], s: '....X.......X...|x.x.x.x.xxxxXXXX' },
        A: { ch: ['i', 'i', 'bVI', 'bVII', 'i', 'i', 'bVI', 'V'], lead: '^1-.^15-3-|4-3-1---|6-.6^1-^3-|7-^2-^4-^2-|^5-.^5^3-^1-|^4-^3-^1-5-|6-^1-^3-^6-|5-#7-^2-^5-' },
        B: { ch: ['iv', 'iv', 'i', 'i', 'bVI', 'bVII', 'V', 'V'], lead: '4-6-^1-6-|^4-^1-6-4-|3-5-^1-5-|^3-^1-5-3-|6-^1-^3-^1-|7-^2-^4-^7-|5-5-#7-^2-|^5-------', k: 'x..x..x.x..x..x.' },
      },
      order: [['I', 'n'], ['A', ''], ['A', 'h'], ['B', ''], ['A', 'whx'], ['B', 'hx']] },
  };
  /* FINAL BOSS — the boss theme in E minor, faster, always harmonised, plus a heroic lift into the relative major */
  TRACKS.finalboss = Object.assign({}, TRACKS.boss, { bpm: 168, root: 52, leadBase: 64, padLo: 52, arpLo: 64, bassLo: 40,
    pat: Object.assign({}, TRACKS.boss.pat, { h: 'x.xxx.xxx.xxx.xx' }),
    sections: Object.assign({}, TRACKS.boss.sections, {
      C: { ch: ['bVI', 'bVII', 'bIII', 'bIII', 'bVI', 'bVII', 'V7', 'V7'], lead: '6-^1-^3-^1-|7-^2-^4-^2-|^3---^5-^3-|^7---^5---|^6-^5-^3-^1-|^7-^6-^4-^2-|^5-^4-^2-#7-|^5-------' } }),
    order: [['I', 'n'], ['A', 'h'], ['A', 'whx'], ['C', 'h'], ['B', 'h'], ['A', 'hx'], ['C', 'whx']] });

  /* one-shot stingers: [startBeat, midi, beats] per voice; `then` = the loop that fades in afterwards */
  const STINGERS = {
    victory: { bpm: 132, len: 7.5, then: 'menu', lead: 'brass',
      mel: [[0, 67, 0.5], [0.5, 72, 0.5], [1, 76, 0.5], [1.5, 79, 1], [2.5, 76, 0.5], [3, 79, 0.5], [3.5, 84, 3.4]],
      har: [[1.5, 76, 1], [2.5, 72, 0.5], [3, 76, 0.5], [3.5, 79, 3.4], [3.5, 76, 3.4]],
      pad: [[0, 60, 1.5], [0, 64, 1.5], [1.5, 55, 2], [1.5, 62, 2], [3.5, 60, 3.4], [3.5, 64, 3.4], [3.5, 67, 3.4]],
      bass: [[0, 36, 1.5], [1.5, 43, 2], [3.5, 36, 3.4]], roll: [2.5, 3.5], crash: 3.5, timp: [[0, 65], [1.5, 98], [3.5, 65], [4, 65], [4.5, 65]] },
    gameover: { bpm: 84, len: 6.5, then: 'menu', lead: 'flute',
      mel: [[0, 72, 1], [1, 71, 1], [2, 69, 1], [3, 67, 3]],
      har: [[0, 64, 2], [2, 65, 1], [3, 64, 3]],
      pad: [[0, 57, 2], [0, 60, 2], [2, 53, 1], [2, 57, 1], [3, 48, 3], [3, 55, 3], [3, 60, 3]],
      bass: [[0, 45, 2], [2, 41, 1], [3, 36, 3]] },
  };
  const EXT_KEY = { menu: 'menu', act1: 'game', act2: 'game', act3: 'game', act4: 'game', act5: 'game', boss: 'boss', finalboss: 'boss' };

  function compile(name) {
    const def = TRACKS[name];
    if (def._c === name) return def;
    const pat = def.pat || {}, secs = {};
    Object.keys(def.sections).forEach((k) => {
      const s = def.sections[k], g = (f) => (s[f] !== undefined ? s[f] : pat[f]);
      secs[k] = { n: s.ch.length, ch: s.ch.map((x) => x.split(',').map(chord)), lead: parsePitched(s.lead), lead2: parsePitched(s.lead2), ctr: parsePitched(s.ctr),
        bass: parsePitched(g('bass')), arp: parsePitched(g('arp')), stab: parseDrum(g('stab')), k: parseDrum(g('k')), s: parseDrum(g('s')), h: parseDrum(g('h')), r: parseDrum(g('r')) };
    });
    def._secs = secs; def._c = name;
    return def;
  }

  /* ------------------------------------------------------------------ sequencer player */
  function Player(E, name, t0) {
    const def = compile(name), ctx = E.ctx, self = this, RV = def.rev || {}, PN = def.pan || {};
    this.E = E; this.def = def; this.name = name; this.oi = 0; this.bi = 0; this.pass = 0; this.nextBar = t0; this.stopAt = 0; this.lfos = [];
    const out = this.out = ctx.createGain(); out.gain.value = 0; out.connect(E.musicBus);
    const wet = this.wet = ctx.createGain(); wet.gain.value = 0; wet.connect(E.revIn);
    this.fades = [out, wet];
    const lp = (f, q) => { const n = ctx.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = f; n.Q.value = q || 0.7; return n; };
    const hpf = (f) => { const n = ctx.createBiquadFilter(); n.type = 'highpass'; n.frequency.value = f; n.Q.value = 0.6; return n; };
    const rv = (k, d) => (RV[k] == null ? d : RV[k]);
    const route = (node, panV, rev, dest) => {                      // node -> [pan] -> dest (+ reverb send)
      let last = node;
      if (panV && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = panV; node.connect(p); last = p; }
      last.connect(dest || out);
      if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; last.connect(s); s.connect(wet); }
      return node;
    };
    this.leadIn = route(lp(5200), PN.lead == null ? 0.12 : PN.lead, rv('lead', 0.25));
    this.lead2In = route(lp(4200), PN.lead2 == null ? -0.22 : PN.lead2, rv('lead2', rv('ctr', 0.25)));
    this.pump = ctx.createGain(); route(this.pump, 0, rv('pad', 0.35));         // pads + arps breathe with the kick
    this.padIn = lp(def.padCut || 1500, 0.6); this.padIn.connect(this.pump);
    try {                                                                       // two slow modulated delays = string-ensemble width
      [[0.011, 0.6, -0.6], [0.017, 0.83, 0.6]].forEach((c) => {
        const d = ctx.createDelay(0.05), l = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
        d.delayTime.value = c[0]; l.frequency.value = c[1]; lg.gain.value = 0.0028; l.connect(lg); lg.connect(d.delayTime); l.start(t0);
        g.gain.value = 0.6; self.padIn.connect(d); d.connect(g); route(g, c[2], 0, self.pump); self.lfos.push(l);
      });
    } catch (e) {}
    this.arpIn = route(lp(def.arpCut || 2800, 1.2), 0.4, 0, this.pump);
    this.stabIn = route(lp(2600, 0.8), -0.25, rv('stab', 0.2));
    this.bassIn = route(lp(def.bassCut || 640, 0.9), 0, 0);
    const ek = def.echo || 0;
    if (ek > 0) {                                                               // dotted-eighth echo on melodies and plucks
      const dl = ctx.createDelay(1.5), fb = ctx.createGain(), fl = lp(2400), eo = ctx.createGain(), as = ctx.createGain();
      dl.delayTime.value = Math.min(1.4, (60 / def.bpm) * 0.75); fb.gain.value = 0.28; eo.gain.value = ek; as.gain.value = 0.6;
      this.leadIn.connect(dl); this.lead2In.connect(dl); this.arpIn.connect(as); as.connect(dl);
      dl.connect(fl); fl.connect(fb); fb.connect(dl); fl.connect(eo); eo.connect(out);
    }
    this.drumIn = ctx.createGain(); this.drumIn.connect(out);
    this.snIn = route(hpf(1400), 0, rv('drums', 0.08), this.drumIn);
    this.hatIn = route(hpf(7200), -0.3, 0);
    this.crIn = route(hpf(4800), 0.15, 0.25);
    try { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.3; lg.gain.value = 7; l.connect(lg); l.start(t0); this.lfos.push(l); this.vib = lg; } catch (e) { this.vib = null; }
    this.schedule = function (until) {
      const now = ctx.currentTime;
      if (!E.offline && self.nextBar < now - 0.25) self.nextBar = now + 0.03;      // fell behind (tab was busy): skip ahead
      let guard = 0; const max = E.offline ? 4096 : 64;
      while (self.nextBar < until && guard++ < max) { if (self.stopAt && self.nextBar > self.stopAt) break; self.bar(self.nextBar); }
    };
    this.dispose = function () { self.lfos.forEach((l) => { try { l.stop(); } catch (e) {} }); try { out.disconnect(); wet.disconnect(); } catch (e) {} };
  }
  Player.prototype.warp = function (x) {            // swing: stretch the first half of each beat
    const sw = this.def.swing || 0; if (!sw) return x;
    const b = x * 4, i = Math.floor(b), f = b - i;
    const g = f < 0.5 ? (f * (0.5 + sw)) / 0.5 : 0.5 + sw + ((f - 0.5) * (0.5 - sw)) / 0.5;
    return (i + g) / 4;
  };
  Player.prototype.bar = function (t0) {
    const def = this.def, ord = def.order[this.oi], sec = def._secs[ord[0]], bi = this.bi, nb = sec.n;
    const barDur = 240 / def.bpm, chs = sec.ch[bi], E = this.E, V = def.vol || {}, self = this;
    let fl = ord[1] || '';
    if (this.pass > 0 && fl.indexOf('q') < 0) {                    // later passes are never identical: swap the lead voice, or open over a drum break
      const v = (this.pass + this.oi) % 3;
      if (v === 1 && fl.indexOf('n') < 0) fl = fl.indexOf('w') >= 0 ? fl.replace('w', '') : fl + 'w';
      else if (v === 2 && nb >= 8 && bi < 4 && fl.indexOf('x') < 0) fl += 'b';
    }
    const has = (c) => fl.indexOf(c) >= 0;
    const quiet = has('q'), noMel = quiet || has('n'), noDrum = quiet || has('b'), dv = (has('s') ? 0.6 : 1) * (has('x') ? 1.12 : 1);
    const chordAt = (x) => chs[Math.min(chs.length - 1, Math.floor(x * chs.length + 1e-6))];
    if (V.pad > 0 && !has('p')) for (let j = 0; j < chs.length; j++) this.pad(chs[j], t0 + (j / chs.length) * barDur, barDur / chs.length);
    if (sec.bass && V.bass > 0) this.chordal(sec.bass, 'bass', bi, t0, barDur, chordAt);
    if (!noMel) {
      if (sec.lead) this.melody(sec.lead, 'lead', bi, nb, t0, barDur, chordAt, fl);
      if (sec.lead2) this.melody(sec.lead2, 'lead2', bi, nb, t0, barDur, chordAt, fl);
    }
    if (sec.ctr && has('c')) this.melody(sec.ctr, 'ctr', bi, nb, t0, barDur, chordAt, fl);
    if (sec.arp && V.arp > 0 && !has('a')) this.chordal(sec.arp, 'arp', bi, t0, barDur, chordAt);
    const line = (arr, fn) => {
      if (!arr) return; const bar = arr[bi % arr.length], n = bar.length;
      for (let i = 0; i < n; i++) { const ch = bar[i]; if (ch !== '.') fn(t0 + self.warp(i / n) * barDur, ch, i / n); }
    };
    const hum = () => 0.88 + Math.random() * 0.24, acc = (ch) => (ch === 'X' ? 1 : ch === 'x' ? 0.68 : 0.32);
    if (V.stab > 0 && !quiet) line(sec.stab, (t, ch, x) => self.stab(chordAt(x), t));
    if (!noDrum) {
      line(sec.k, (t, ch) => { kick(E, self.drumIn, t, (V.k || 0) * (ch === 'X' ? 1 : 0.88) * dv); self.duckAt(t); });
      line(sec.s, (t, ch) => self.snare(t, (V.s || 0) * acc(ch) * hum() * dv));
      line(sec.h, (t, ch) => nhit(E, self.hatIn, t, ch === 'O' ? 0.16 : 0.035, (V.h || 0) * (ch === 'X' ? 1.25 : ch === 'o' ? 0.42 : 0.8) * hum() * dv));
      if (has('x') && bi === 0) nhit(E, self.crIn, t0, 1.1, 0.065);
      if (def.fill && bi === nb - 1 && nb >= 4 && sec.s) this.fill(t0, barDur, V);
    }
    line(sec.r, (t) => tickHit(E, self.drumIn, t, V.r || 0));
    this.bi++;
    if (this.bi >= nb) { this.bi = 0; this.oi++; if (this.oi >= def.order.length) { this.oi = def.loopFrom || 0; this.pass++; } }
    this.nextBar = t0 + barDur;
  };
  Player.prototype.snare = function (t, vol) {
    nhit(this.E, this.snIn, t, 0.11, vol);
    drumTone(this.E, this.drumIn, t, 200, 150, 0.05, 0.07, vol * 0.55, 'triangle');
  };
  Player.prototype.duckAt = function (t) { const g = this.pump.gain; try { g.setTargetAtTime(0.58, t, 0.004); g.setTargetAtTime(1, t + 0.035, 0.085); } catch (e) {} };
  Player.prototype.fill = function (t0, barDur, V) {                // into the next section: snare crescendo or a tom run
    const E = this.E, st = barDur / 16, v = V.s || 0.14;
    if ((this.oi + this.pass) % 2) for (let i = 0; i < 4; i++) this.snare(t0 + barDur * 0.75 + i * st, v * (0.45 + i * 0.2));
    else [215, 160, 120].forEach((f, i) => tom(E, this.drumIn, t0 + barDur * (0.75 + i / 12), (V.k || 0.4) * 0.5, f));
  };
  Player.prototype.melody = function (bars, part, bi, nb, t0, barDur, chordAt, fl) {
    const bar = bars[bi % bars.length], n = bar.length; if (!n) return;
    const def = this.def, I = def.inst || {}, V = def.vol || {}, sc = SCALES[def.scale] || SCALES.major, E = this.E;
    const semi = (deg) => sc[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
    const lead = part === 'lead', up = lead && fl.indexOf('o') >= 0 ? 12 : 0;
    const inst = lead ? (fl.indexOf('w') >= 0 && I.alt ? I.alt : I.lead) : (I[part] || I.lead);
    const base = lead ? def.leadBase : part === 'lead2' ? (def.lead2Base || def.leadBase - 12) : (def.ctrBase || def.leadBase - 12);
    const vol = V[part] || (part === 'ctr' ? 0.07 : 0.1), dest = lead ? this.leadIn : this.lead2In, gate = def.gate || 0.9;
    for (let i = 0; i < n; i++) {
      const tk = bar[i]; if (typeof tk !== 'object') continue;
      let dur = barDur / n, j = i + 1, b = bi, cur = bar;
      for (;;) {                                                                    // extend through holds (may cross bar lines)
        if (j >= cur.length) { b++; if (b >= nb) break; cur = bars[b % bars.length]; j = 0; if (!cur.length) break; }
        if (cur[j] !== HOLD) break;
        dur += barDur / cur.length; j++;
      }
      let m = base + semi(tk.d) + tk.a + up; while (m > 91) m -= 12;                // never shrill
      const t = t0 + this.warp(i / n) * barDur;
      mnote(E, dest, inst, mtof(m), t, dur * gate, vol, this.vib, false);
      if (lead && fl.indexOf('h') >= 0) {                                           // harmony: nearest chord tone a third or more below
        const ch = chordAt(i / n), pcs = ch.tones.map((x) => (def.root + ch.root + x) % 12); let hm = m - 3;
        while (pcs.indexOf(((hm % 12) + 12) % 12) < 0 && hm > m - 10) hm--;
        mnote(E, this.lead2In, I.harm || (inst === 'picc' || inst === 'flute' || inst === 'bell' ? 'flute' : 'horn'), mtof(hm), t, dur * gate, vol * 0.5, null, true);
      }
    }
  };
  Player.prototype.chordal = function (bars, part, bi, t0, barDur, chordAt) {
    const bar = bars[bi % bars.length], n = bar.length; if (!n) return;
    const def = this.def, I = def.inst || {}, V = def.vol || {}, E = this.E, bass = part === 'bass', lo = bass ? (def.bassLo || 36) : (def.arpLo || 60);
    for (let i = 0; i < n; i++) {
      const tk = bar[i]; if (typeof tk !== 'object') continue;
      let dur = barDur / n, j = i + 1; while (j < n && bar[j] === HOLD) { dur += barDur / n; j++; }
      const ch = chordAt(i / n), k = ((tk.d % 7) + 7) % 7;
      const tone = k === 2 ? ch.tones[1] : k === 4 ? ch.tones[2] : k === 6 ? (ch.tones[3] != null ? ch.tones[3] : 12) : 0;
      let m = def.root + ch.root; while (m < lo) m += 12; while (m >= lo + 12) m -= 12;   // keep chord roots in one octave
      m += tone + 12 * Math.floor(tk.d / 7) + tk.a;
      const t = t0 + this.warp(i / n) * barDur;
      if (bass) mnote(E, this.bassIn, I.bass || 'bassA', mtof(m), t, dur * (def.bassGate || 0.7), V.bass, null, false);
      else mnote(E, this.arpIn, I.arp || 'chip', mtof(m), t, dur * 0.9, V.arp, null, true);
    }
  };
  const voicing = (def, ch, lo, n) => (n === 2 ? [0, 2] : [0, 1, 2]).map((i) => lo + ((((def.root + ch.root + ch.tones[i] - lo) % 12) + 12) % 12));
  Player.prototype.pad = function (ch, t, dur) {
    const def = this.def, ms = voicing(def, ch, def.padLo || 55, def.padN);
    for (let i = 0; i < ms.length; i++) mnote(this.E, this.padIn, (def.inst || {}).pad || 'pad', mtof(ms[i]), t, dur * 0.97, def.vol.pad, null, false);
  };
  Player.prototype.stab = function (ch, t) {
    const def = this.def, ms = voicing(def, ch, def.stabLo || 60);
    for (let i = 0; i < 3; i++) mnote(this.E, this.stabIn, (def.inst || {}).stab || 'pluck', mtof(ms[i]), t, 0.12, def.vol.stab, null, true);
  };

  /* one-shot stinger; returns a player-like object */
  function stinger(E, name, t0) {
    const st = STINGERS[name], ctx = E.ctx, beat = 60 / st.bpm;
    const out = ctx.createGain(); out.gain.value = 1; out.connect(E.musicBus);
    const wet = ctx.createGain(); wet.gain.value = 0.3; out.connect(wet); wet.connect(E.revIn);
    const mk = (type, f) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.connect(out); return n; };
    const lead = mk('lowpass', 5000), mid = mk('lowpass', 1800), low = mk('lowpass', 650), sn = mk('highpass', 1400), cr = mk('highpass', 4800);
    const at = (n) => t0 + n[0] * beat, len = (n) => n[2] * beat * 0.94;
    (st.mel || []).forEach((n) => mnote(E, lead, st.lead, mtof(n[1]), at(n), len(n), st.lead === 'brass' ? 0.13 : 0.19, null, false));
    (st.har || []).forEach((n) => mnote(E, lead, 'horn', mtof(n[1]), at(n), len(n), 0.085, null, false));
    (st.pad || []).forEach((n) => mnote(E, mid, 'pad', mtof(n[1]), at(n), len(n), 0.03, null, false));
    (st.bass || []).forEach((n) => mnote(E, low, 'tuba', mtof(n[1]), at(n), len(n), 0.2, null, false));
    if (st.roll) { const a = st.roll[0], b = st.roll[1], n = Math.round((b - a) * 4); for (let i = 0; i < n; i++) nhit(E, sn, t0 + (a + i / 4) * beat, 0.09, 0.06 + 0.1 * (i / n)); }
    (st.timp || []).forEach((n) => tom(E, out, t0 + n[0] * beat, 0.3, n[1]));
    if (st.crash != null) { nhit(E, cr, t0 + st.crash * beat, 1.2, 0.09); kick(E, out, t0 + st.crash * beat, 0.4); }
    return { out, fades: [out], name, then: st.then, stopAt: t0 + st.len * beat + 0.4, dispose() { try { out.disconnect(); wet.disconnect(); } catch (e) {} } };
  }

  /* looping decoded-audio player for external tracks */
  function bufPlayer(E, key) {
    const ctx = E.ctx, slot = ext[key], out = ctx.createGain(); out.gain.value = 0;
    const lvl = ctx.createGain(); lvl.gain.value = slot.gain || 1;
    const src = ctx.createBufferSource(); src.buffer = slot.buf; src.loop = true;
    src.connect(lvl); lvl.connect(out); out.connect(E.musicBus); src.start();
    return { out, fades: [out], stopAt: 0, ext: key, dispose() { try { src.stop(); } catch (e) {} try { out.disconnect(); } catch (e) {} } };
  }

  /* ------------------------------------------------------------------ transport */
  const srcKey = (tr) => (!tr ? null : (EXT_KEY[tr] && ext[EXT_KEY[tr]] && ext[EXT_KEY[tr]].buf) ? 'ext:' + EXT_KEY[tr] : tr);
  function fadeOutAll(E, secs) {
    const now = E.ctx.currentTime;
    for (let i = 0; i < players.length; i++) {
      const p = players[i]; if (p.fading) continue;
      p.fading = true; p.stopAt = now + secs + 0.1;
      (p.fades || [p.out]).forEach((gn) => {
        try { if (gn.gain.cancelAndHoldAtTime) gn.gain.cancelAndHoldAtTime(now); else gn.gain.cancelScheduledValues(now); } catch (e) {}
        try { gn.gain.setTargetAtTime(0, now, secs / 4); } catch (e) {}
      });
    }
  }
  function spawn(E, track, t, fadeIn) {
    const key = srcKey(track), now = E.ctx.currentTime; let p = null;
    try {
      if (STINGERS[track]) p = stinger(E, track, t + 0.04);
      else if (key.slice(0, 4) === 'ext:') p = bufPlayer(E, EXT_KEY[track]);
      else if (TRACKS[track]) p = new Player(E, track, t);
    } catch (e) { p = null; }
    if (!p) return null;
    if (!STINGERS[track]) p.fades.forEach((gn) => { gn.gain.setValueAtTime(0, now); gn.gain.setTargetAtTime(1, now, fadeIn || 0.16); });
    players.push(p);
    if (p.schedule) p.schedule(now + LOOKAHEAD);
    return p;
  }
  function applyTrack() {
    const E = eng; if (!E || E.ctx.state !== 'running') return;
    const key = srcKey(wantTrack);
    if (wantTrack === curTrack && key === curKey) return;
    if (key && key === curKey && players.some((p) => !p.fading)) { curTrack = wantTrack; return; }   // that source is already playing (external loop / loop after a stinger)
    const now = E.ctx.currentTime;
    fadeOutAll(E, STINGERS[wantTrack] ? 0.3 : 0.6);
    curTrack = wantTrack; curKey = key;
    if (wantTrack) spawn(E, wantTrack, now + 0.08);
  }
  function tick() {
    const E = eng; if (!E || E.ctx.state !== 'running') return;
    const now = E.ctx.currentTime;
    for (let i = players.length - 1; i >= 0; i--) {
      const p = players[i];
      if (p.stopAt && now >= p.stopAt) {
        const cont = p.then && !p.fading && curTrack === p.name;                  // a stinger ended naturally: bring its follow-up loop in
        p.dispose(); players.splice(i, 1);
        if (cont && spawn(E, p.then, now + 0.1, 0.7)) curKey = srcKey(p.then);
        continue;
      }
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
  /* data sanity: every melody note must be in the track's scale or the bar's chord; `soft` lists long non-chord notes for review */
  function checkScore() {
    const issues = [], soft = [], info = {};
    Object.keys(TRACKS).forEach((name) => {
      let def; try { def = compile(name); } catch (e) { issues.push(name + ': ' + e.message); return; }
      const sc = SCALES[def.scale]; if (!sc) { issues.push(name + ': unknown scale'); return; }
      let bars = 0, intro = 0;
      def.order.forEach((o, i) => { const s = def._secs[o[0]]; if (!s) { issues.push(name + ': order names missing section ' + o[0]); return; } if (i < (def.loopFrom || 0)) intro += s.n; else bars += s.n; });
      info[name] = { bpm: def.bpm, loopBars: bars, loopSecs: +(bars * 240 / def.bpm).toFixed(1), introSecs: +(intro * 240 / def.bpm).toFixed(1) };
      Object.keys(def._secs).forEach((k) => {
        const s = def._secs[k];
        ['lead', 'lead2', 'ctr'].forEach((part) => {
          const bs = s[part]; if (!bs) return;
          if (bs.length !== s.n) issues.push(name + '.' + k + '.' + part + ': ' + bs.length + ' bars but ' + s.n + ' chords');
          bs.forEach((bar, bi) => {
            if ([4, 6, 8, 12, 16, 24, 32].indexOf(bar.length) < 0) issues.push(name + '.' + k + '.' + part + ' bar ' + (bi + 1) + ': ' + bar.length + ' tokens');
            const chs = s.ch[bi % s.n];
            bar.forEach((tk, i) => {
              if (typeof tk !== 'object') return;
              const ch = chs[Math.min(chs.length - 1, Math.floor((i / bar.length) * chs.length + 1e-6))];
              const pc = (((sc[((tk.d % 7) + 7) % 7] + tk.a) % 12) + 12) % 12, inChord = ch.tones.some((x) => (ch.root + x) % 12 === pc);
              if (sc.indexOf(pc) < 0 && !inChord) issues.push(name + '.' + k + '.' + part + ' bar ' + (bi + 1) + ' token ' + (i + 1) + ': pitch class ' + pc + ' is outside the scale and chord ' + ch.sym);
              let len = 1; while (i + len < bar.length && bar[i + len] === HOLD) len++;
              if (!inChord && len / bar.length >= 0.25) soft.push(name + '.' + k + '.' + part + ' bar ' + (bi + 1) + ' token ' + (i + 1) + ' (' + ch.sym + ')');
            });
          });
        });
        ['bass', 'arp'].forEach((part) => { (s[part] || []).forEach((bar) => bar.forEach((tk) => { if (typeof tk === 'object' && [0, 2, 4, 6].indexOf(((tk.d % 7) + 7) % 7) < 0) issues.push(name + '.' + k + '.' + part + ': token is not a chord tone (use 1 3 5 7)'); })); });
        ['k', 's', 'h', 'r', 'stab'].forEach((part) => { (s[part] || []).forEach((bar, bi) => { if (bar.length % 4 && bar.length % 6) issues.push(name + '.' + k + '.' + part + ' bar ' + (bi + 1) + ': ' + bar.length + ' steps'); }); });
      });
    });
    return { issues, soft, info };
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
    /* test hooks (not part of the game API): offline-render a track / stinger / sfx. raw = resolve with the AudioBuffer */
    _render(what, secs, raw) {
      if (!OAC) return Promise.resolve(null);
      try {
        const sr = 44100, ctx = new OAC(2, Math.ceil(sr * secs), sr), E = makeEngine(ctx);
        E.offline = true; applyLevels(E, true);
        if (SFX[what]) SFX[what](E, 0.05, 1, 1);
        else if (TRACKS[what]) { const p = new Player(E, what, 0.05); p.fades.forEach((gn) => { gn.gain.value = 1; }); p.schedule(secs); }
        else if (STINGERS[what]) stinger(E, what, 0.05);
        return ctx.startRendering().then((buf) => {
          if (raw) return buf;
          let peak = 0, sum = 0, n = 0;
          for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += a * a; n++; } }
          return { peak, rms: Math.sqrt(sum / n) };
        });
      } catch (e) { return Promise.resolve({ error: String(e) }); }
    },
    _check: checkScore,
    _debug() { return { dead, state: eng ? eng.ctx.state : 'none', track: curTrack, key: curKey, want: wantTrack, players: players.length, voices: eng ? eng.voices : 0, sfxVoices: eng ? eng.sfxVoices : 0, musicVoices: eng ? sounding(eng, eng.ctx.currentTime) : 0, musicOscs: eng ? eng.mv : 0 }; },
    SFX_NAMES: Object.keys(SFX),
    TRACK_NAMES: Object.keys(TRACKS).concat(Object.keys(STINGERS)),
  };
  window.AudioSys = AudioSys;
})();
