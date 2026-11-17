/* core.js — tiny shared helpers. Exposes window.U and window.Toast. */
(function () {
  'use strict';
  const U = {
    $: (s, r) => (r || document).querySelector(s),
    $$: (s, r) => Array.from((r || document).querySelectorAll(s)),
    /* U.el('div', {class:'x', html:'<b>hi</b>', text:'..', onclick:fn, dataset:{k:v}, style:{k:v}, hidden:true}, ...children) */
    el(tag, attrs, ...kids) {
      const e = document.createElement(tag);
      if (attrs) for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (v === true) e.setAttribute(k, '');
        else e.setAttribute(k, v);
      }
      const add = (c) => {
        if (c == null || c === false) return;
        if (Array.isArray(c)) c.forEach(add);
        else e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      };
      kids.forEach(add);
      return e;
    },
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
    fmtTime(sec) { sec = Math.max(0, Math.floor(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; },
    fmtNum(n) { n = Math.round(n); return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(n); },
    esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    isTouch: () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
  };
  window.U = U;

  /* Toast.show('<b>Saved</b>', {kind:'good'|'bad'|'', ms:2200}) */
  window.Toast = {
    show(html, opts) {
      opts = opts || {};
      const root = document.getElementById('toasts');
      if (!root) return;
      root.classList.toggle('low', !!(window.Game && Game.isRunning && Game.isRunning()));   /* during a run toasts sit at the bottom, clear of the HUD */
      const t = U.el('div', { class: 'toast ' + (opts.kind || ''), html });
      root.appendChild(t);
      while (root.children.length > 3) root.removeChild(root.firstChild);
      setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, opts.ms || 2200);
    },
  };
})();
