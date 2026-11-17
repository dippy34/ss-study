/* save.js — the ONLY module that touches localStorage. Exposes window.Save.
   Each module keeps its own namespace:  const S = Save.ns('quiz', {mastery:{}, streak:0});  ...mutate S...  Save.commit(); */
(function () {
  'use strict';
  const KEY = 'powderkeg1914.save.v1';
  let timer = null;
  const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
  const Save = {
    data: {},
    load() {
      try { const s = localStorage.getItem(KEY); const d = s ? JSON.parse(s) : null; this.data = d && typeof d === 'object' ? d : {}; }
      catch (e) { this.data = {}; }
      return this.data;
    },
    /* get-or-create a namespace object, filling in any missing default keys (shallow) */
    ns(name, defaults) {
      let d = this.data[name];
      if (!d || typeof d !== 'object') d = this.data[name] = {};
      if (defaults) for (const k in defaults) if (!(k in d)) d[k] = clone(defaults[k]);
      return d;
    },
    /* debounced write */
    commit() { if (timer) return; timer = setTimeout(() => { timer = null; this.flush(); }, 400); },
    flush() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable: play on without saving */ } },
    /* wipe everything (settings screen). Caller should reload its own state afterwards. */
    reset() { this.data = {}; try { localStorage.removeItem(KEY); } catch (e) {} },
  };
  Save.load();
  /* shared settings namespace used by audio + game + settings screen */
  Save.ns('settings', { music: 0.55, sfx: 0.8, muted: false, shake: true, dmgNumbers: true });
  window.addEventListener('pagehide', () => Save.flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) Save.flush(); });
  window.Save = Save;
})();
