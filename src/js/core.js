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
      const inRun = !!(window.Game && Game.isRunning && Game.isRunning());
      root.classList.toggle('low', inRun);   /* during a run toasts sit at the bottom, clear of the HUD */
      const t = U.el('div', { class: 'toast ' + (opts.kind || ''), html, role: 'status' });
      root.appendChild(t);
      while (root.children.length > (inRun ? 1 : 2)) root.removeChild(root.firstChild);   /* calm: never a stack of notices */
      setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, opts.ms || 2200);
    },
  };

  /* Overlays: while anything is open in #modals (a question, a picker, the pause menu, Study Notes, the Practice Test…)
     the pages and HUD behind it are inert, so Tab / Space / Enter can never press a button the player cannot see, and
     keyboard focus moves into the overlay. When the last overlay closes, focus returns to where it was. */
  function guardOverlays() {
    const modals = document.getElementById('modals'); if (!modals || !window.MutationObserver) return;
    const behind = ['screens', 'hud'].map((id) => document.getElementById(id)).filter(Boolean);
    let was = false, back = null;
    const sync = () => {
      const open = modals.children.length > 0;
      if (open && !was) { const a = document.activeElement; back = a && a !== document.body && !modals.contains(a) ? a : null; }
      behind.forEach((n) => { if (open) { n.inert = true; n.setAttribute('inert', ''); } else { n.inert = false; n.removeAttribute('inert'); } });
      if (open) {
        /* give the overlay's own focus() a frame to run first; only step in when focus is still outside it */
        requestAnimationFrame(() => {
          const top = modals.lastElementChild, a = document.activeElement;
          if (!top || (a && top.contains(a))) return;
          if (!top.hasAttribute('tabindex')) top.setAttribute('tabindex', '-1');
          try { top.focus({ preventScroll: true }); } catch (e) {}
        });
      } else if (was) {
        const b = back; back = null;
        if (b && b.isConnected && b.offsetParent !== null) { try { b.focus({ preventScroll: true }); } catch (e) {} }
      }
      was = open;
    };
    new MutationObserver(sync).observe(modals, { childList: true });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', guardOverlays); else guardOverlays();
})();
