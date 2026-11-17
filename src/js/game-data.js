/* game-data.js — static definitions for the action game. Internal namespace window.PK (lead-owned). */
(function () {
  'use strict';
  const PK = (window.PK = window.PK || {});
  const COL = (PK.COL = {
    M: '#a3b85e', A: '#4da8ff', I: '#b77dff', N: '#ff5e4f', S: '#ffa01f', X: '#8fa0ad',
    brass: '#f2bb3d', paper: '#f4e7c6', ink: '#0c1924', ink2: '#132737', good: '#38b876', bad: '#ee4f4f', fg: '#f6eedb',
  });

  /* ---------- weapons: lv[i] = what level i+1 adds (shown on the upgrade card). hook = study-guide fact. ---------- */
  PK.WEAPONS = {
    blaster: { name: 'Fact Blaster', icon: '💡', key: 'S', max: 6,
      hook: 'M.A.I.N. = Militarism, Alliances, Imperialism, Nationalism.',
      lv: ['Fires fact bolts at the nearest enemy.', '+1 bolt', '+40% damage, bolts pierce 1 enemy', '+1 bolt', 'Fires 25% faster', '+1 bolt, +1 pierce'] },
    cannon: { name: 'Dreadnought Cannon', icon: '🚢', key: 'M', max: 6,
      hook: 'Germany and Great Britain raced to build the biggest battleships.',
      lv: ['Lobs a shell that explodes in a big blast.', 'Bigger blast, +25% damage', '+1 shell', 'Bigger blast, +25% damage', '+1 shell', 'Huge blast, reloads faster'] },
    orbs: { name: 'Alliance Orbs', icon: '🤝', key: 'A', max: 6,
      hook: 'Alliances: countries agree to defend and support each other if attacked.',
      lv: ['Two allied orbs circle you and smash enemies.', '+1 orb', 'Wider orbit, +damage', '+1 orb', '+1 orb, spins faster', '+1 orb, +damage'] },
    chain: { name: 'Chain Reaction', icon: '⚡', key: 'S', max: 6,
      hook: 'One assassination set off a chain reaction that pulled all of Europe into war.',
      lv: ['Lightning jumps between 3 enemies.', '+1 jump, +damage', '+1 jump, fires faster', '+1 jump, +damage', '+1 jump, fires faster', '+2 jumps, +damage'] },
    boomerang: { name: 'Scramble Boomerang', icon: '🌍', key: 'I', max: 6,
      hook: 'Imperialism: European powers scrambled to grab colonies in Africa.',
      lv: ['Flies out, grabs gems, and comes back. Hits twice.', 'Flies farther, +damage', '+1 boomerang', 'Bigger, +damage', 'Throws faster', '+1 boomerang'] },
    trail: { name: 'Powder Trail', icon: '🧨', key: 'S', max: 6,
      hook: 'Europe was a powder keg. The assassination lit the fuse.',
      lv: ['Leaves a burning fuse trail behind you.', 'Burns longer', 'Wider flames, +damage', 'Burns longer', 'Wider flames, +damage', 'Burns hotter: +60% damage'] },
    aura: { name: 'Neutral Zone', icon: '🕊️', key: 'X', max: 6,
      hook: 'Isolationism: staying out of other countries\' conflicts — the USA in 1914.',
      lv: ['A keep-out zone hurts and slows enemies near you.', 'Bigger zone', '+damage, slows more', 'Bigger zone', '+damage, slows more', 'Huge zone, pushes enemies back'] },
    press: { name: 'Extra! Extra!', icon: '📰', key: 'N', max: 6,
      hook: 'June 28, 1914: Archduke Franz Ferdinand is assassinated in Sarajevo.',
      lv: ['Newspapers fly out in every direction.', '+2 papers, +damage', 'Papers pierce more', '+2 papers, +damage', 'Prints faster', '+4 papers, pierce more'] },
  };

  /* ---------- passives: 5 levels each ---------- */
  PK.PASSIVES = {
    power: { name: 'Arms Buildup', icon: '⚔️', key: 'M', max: 5, per: '+12% damage',
      hook: 'Militarism: building up strong armies to get ready for war.' },
    haste: { name: 'War Plans', icon: '⏱️', key: 'M', max: 5, per: 'Weapons fire 8% faster',
      hook: 'Nations had detailed war plans ready, so leaders chose war quickly.' },
    boots: { name: 'Mobilize!', icon: '🥾', key: 'A', max: 5, per: '+9% move speed',
      hook: 'Russia mobilized its army to defend its ally, Serbia.' },
    magnet: { name: 'Raw Materials', icon: '🧲', key: 'I', max: 5, per: '+30% pickup range',
      hook: 'Colonies gave raw materials: rubber, oil, gold, diamonds, cotton.' },
    armor: { name: 'Naval Armor', icon: '🛡️', key: 'M', max: 5, per: 'Take 1 less damage per hit',
      hook: 'Great Britain had the world\'s best navy. Germany tried to match it.' },
    heart: { name: 'National Pride', icon: '❤️', key: 'N', max: 5, per: '+20 max HP and heal 20',
      hook: 'Nationalism: extreme pride and devotion to your own nation.' },
    regen: { name: 'Field Rations', icon: '🍎', key: 'X', max: 5, per: 'Heal +0.4 HP every second',
      hook: 'Communism was NOT a cause — it rose in Russia during the war (1917).' },
    luck: { name: 'Lucky Telegram', icon: '🍀', key: 'S', max: 5, per: '+6% critical hit chance',
      hook: 'The assassination was the spark. M.A.I.N. were the long-term causes.' },
    area: { name: 'Empire Size', icon: '🗺️', key: 'I', max: 5, per: '+10% size for blasts, orbs and zones',
      hook: 'Imperialism: stronger countries taking over weaker territories.' },
    scholar: { name: 'Study Guide', icon: '📚', key: 'X', max: 5, per: '+10% XP from gems',
      hook: 'Bears Ate Green Oranges: Bulgaria, Austria-Hungary, Germany, Ottoman Empire.' },
    greed: { name: 'New Markets', icon: '💰', key: 'I', max: 5, per: '+15% coins',
      hook: 'Colonies were new markets to sell manufactured goods.' },
  };

  /* ---------- enemies ---------- */
  PK.ENEMIES = {
    recruit: { key: 'M', name: 'Recruit', r: 10, hp: 9, spd: 74, dmg: 6, xp: 1, ai: 'chase' },
    brute: { key: 'M', name: 'Brute', r: 18, hp: 32, spd: 46, dmg: 13, xp: 4, ai: 'chase', kb: 0.35 },
    gunboat: { key: 'M', name: 'Gunboat', r: 16, hp: 24, spd: 52, dmg: 8, xp: 4, ai: 'gun' },
    link: { key: 'A', name: 'Ally', r: 12, hp: 13, spd: 72, dmg: 8, xp: 2, ai: 'link' },
    envoy: { key: 'A', name: 'Envoy', r: 9, hp: 7, spd: 86, dmg: 5, xp: 1, ai: 'chase' },
    grabber: { key: 'I', name: 'Grabber', r: 14, hp: 20, spd: 92, dmg: 8, xp: 3, ai: 'grab' },
    scout: { key: 'I', name: 'Scout', r: 9, hp: 7, spd: 96, dmg: 5, xp: 1, ai: 'chase' },
    zealot: { key: 'N', name: 'Zealot', r: 13, hp: 15, spd: 88, dmg: 11, xp: 3, ai: 'dash' },
    patriot: { key: 'N', name: 'Patriot', r: 9, hp: 8, spd: 100, dmg: 6, xp: 1, ai: 'chase' },
    spark: { key: 'S', name: 'Spark', r: 8, hp: 6, spd: 132, dmg: 5, xp: 1, ai: 'wobble' },
  };

  /* ---------- acts: waves = [fromSecond, spawnsPerSecond, {type:weight}] ---------- */
  PK.ACTS = [
    { key: 'M', n: 1, name: 'MILITARISM', color: COL.M, music: 'act1', len: 100, hp: 1.0,
      def: 'Building up strong armies and navies, and glorifying military power, to get ready for war.',
      boss: 'dreadnought', bossName: 'THE DREADNOUGHT', bossHp: 1500,
      bossLine: 'Germany and Great Britain raced to build the biggest battleships.',
      waves: [[0, 1.4, { recruit: 1 }], [16, 1.9, { recruit: 6, brute: 1 }], [42, 2.4, { recruit: 7, brute: 1.5, gunboat: 0.8 }], [72, 3.0, { recruit: 7, brute: 2.2, gunboat: 1.2 }]] },
    { key: 'A', n: 2, name: 'ALLIANCES', color: COL.A, music: 'act2', len: 105, hp: 2.4, rate: 1.4,
      def: 'Agreements between countries to defend and support each other if attacked.',
      boss: 'pact', bossName: 'THE PACT TWINS', bossHp: 3000,
      bossLine: 'Hit one ally and the other joins the fight. That is how a local conflict became a world war.',
      waves: [[0, 2.2, { envoy: 5, link: 1 }], [25, 2.9, { envoy: 5, link: 2, recruit: 2 }], [55, 3.5, { envoy: 5, link: 3, brute: 1.5 }], [80, 4.2, { envoy: 5, link: 4, brute: 2, gunboat: 1 }]] },
    { key: 'I', n: 3, name: 'IMPERIALISM', color: COL.I, music: 'act3', len: 110, hp: 4.6, rate: 1.5,
      def: 'A stronger country takes over weaker territories and colonies for land, resources and power.',
      boss: 'emperor', bossName: 'EMPEROR GRAB', bossHp: 5200,
      bossLine: 'The Scramble for Africa: rivals competing for colonies, raw materials and new markets.',
      waves: [[0, 2.8, { scout: 6, grabber: 1 }], [25, 3.5, { scout: 6, grabber: 2, envoy: 2, link: 1 }], [55, 4.2, { scout: 6, grabber: 3, brute: 2, link: 1.5 }], [85, 5, { scout: 6, grabber: 4, brute: 2, gunboat: 1.5, link: 2 }]] },
    { key: 'N', n: 4, name: 'NATIONALISM', color: COL.N, music: 'act4', len: 110, hp: 8, rate: 1.6,
      def: 'Extreme pride, loyalty and devotion to your own nation or ethnic group, often believing it is superior.',
      boss: 'general', bossName: 'GENERAL PRIDE', bossHp: 8000,
      bossLine: 'Intense national pride made countries unwilling to back down.',
      waves: [[0, 3.4, { patriot: 6, zealot: 1 }], [25, 4.2, { patriot: 6, zealot: 2, scout: 2, grabber: 1 }], [55, 5, { patriot: 6, zealot: 3, brute: 2, link: 2 }], [85, 5.8, { patriot: 6, zealot: 4, brute: 2, gunboat: 2, grabber: 2, link: 2 }]] },
    { key: 'S', n: 5, name: 'THE SPARK', color: COL.S, music: 'act5', len: 115, hp: 12, rate: 1.7,
      def: 'June 28, 1914, Sarajevo: Gavrilo Princip assassinates Archduke Franz Ferdinand. The fuse is lit.',
      boss: 'spark', bossName: 'THE SPARK', bossHp: 13000,
      bossLine: 'The assassination of Archduke Franz Ferdinand was the spark that started the war.',
      waves: [[0, 4.5, { spark: 8, patriot: 2, zealot: 1 }], [25, 5.5, { spark: 8, zealot: 2, grabber: 2, link: 2 }], [55, 6.5, { spark: 8, zealot: 3, brute: 3, gunboat: 2, link: 2 }], [85, 7.5, { spark: 9, zealot: 3, brute: 3, gunboat: 2, grabber: 3, link: 3 }]] },
  ];

  /* little lines shown when a kill streak pops — every one is a study-guide fact */
  PK.STREAK_LINES = [
    'CHAIN REACTION!', 'M · A · I · N', 'BEARS ATE GREEN ORANGES', 'POWDER KEG!', 'SARAJEVO, 1914', 'ARMS RACE!',
    'SCRAMBLE FOR AFRICA', 'ALLIES ASSEMBLE', 'THE SPARK!', 'MOBILIZE!',
  ];
  /* tips cycled on the pause screen */
  PK.TIPS = [
    'The four M.A.I.N. causes: Militarism, Alliances, Imperialism, Nationalism.',
    'Central Powers: Germany, Austria-Hungary, Ottoman Empire, Bulgaria. "Bears Ate Green Oranges."',
    'Allied Powers: Great Britain, France, Russia, Italy (joined 1915), Serbia.',
    'The USA was neutral when the war began. That policy is called isolationism.',
    'Isolationism and Communism are NOT causes of WWI.',
    'The spark: Archduke Franz Ferdinand, heir to Austria-Hungary, assassinated June 28, 1914 in Sarajevo.',
    'The assassin, Gavrilo Princip, was tied to a nationalist group connected to Serbia.',
    'Chain reaction: assassination, then Austria-Hungary declares war on Serbia, then Russia mobilizes, then Germany declares war on Russia and France, then Great Britain declares war on Germany.',
    'Great Britain joined after Germany invaded Belgium.',
    'Britain had the best navy. Germany built a rival navy. The race made both feel LESS safe.',
    'Europeans competed most to colonize Africa — the "Scramble for Africa."',
    'Long-term causes: armies building up, colonies, alliances. The spark: the assassination.',
  ];
})();
