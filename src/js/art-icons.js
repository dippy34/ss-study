/* art-icons.js — the game's icon set. Exposes PK.icon(name, px) -> <canvas> and PK.iconURL(name, px) -> data URL.
   BASELINE STUB: draws the emoji stand-in. The icon artist replaces the drawing with real vector icons. */
(function () {
  'use strict';
  const PK = (window.PK = window.PK || {});
  const EMOJI = {
    blaster: '💡', cannon: '🚢', orbs: '🤝', chain: '⚡', boomerang: '🌍', trail: '🧨', aura: '🕊️', press: '📰',
    power: '⚔️', haste: '⏱️', boots: '🥾', magnet: '🧲', armor: '🛡️', heart: '❤️', regen: '🍎', luck: '🍀', area: '🗺️', scholar: '📚', greed: '💰',
    odmg: '🔥', ohp: '🏠', ocd: '🎯', heal: '❤️', coins: '💰',
    coin: '🪙', hp: '❤️', xp: '💎', clock: '⏱️', skull: '💀', star: '⭐', crown: '👑', chest: '🎁', lock: '🔒', check: '✔️', cross: '✖️',
    gear: '⚙️', book: '📖', pencil: '📝', trophy: '🏆', chart: '📊', help: '❓', sound: '🔊', mute: '🔇', home: '🏠', back: '◀', play: '▶', pause: '⏸', shop: '🛠️', fuse: '🧨', keg: '🛢️', bolt: '⚡', shield: '🛡️', flame: '🔥',
  };
  PK.ICON_NAMES = Object.keys(EMOJI);
  PK.icon = function (name, px) {
    px = px || 24; const dpr = Math.min(window.devicePixelRatio || 1, 3), c = document.createElement('canvas');
    c.width = c.height = Math.round(px * dpr); c.style.width = c.style.height = px + 'px'; c.className = 'pk-icon'; c.setAttribute('aria-hidden', 'true');
    const x = c.getContext('2d'); x.scale(dpr, dpr); x.font = Math.round(px * 0.78) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(EMOJI[name] || '•', px / 2, px / 2 + px * 0.04);
    return c;
  };
  const urls = {};
  PK.iconURL = function (name, px) { const k = name + '@' + px; return urls[k] || (urls[k] = PK.icon(name, px).toDataURL()); };
})();
