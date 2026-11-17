/* data.js — the study guide ("Causes of World War I" answer key) as structured data + a question bank.
   Exposes window.STUDY. Every graded item comes straight from the answer key. */
(function () {
  'use strict';

  /* ---------- Part 1: key vocabulary ---------- */
  const terms = [
    { id: 'militarism', name: 'Militarism', letter: 'M', cause: true, key: 'M',
      def: 'Building up strong armed forces (army and navy) and glorifying military power to prepare for war.',
      short: 'Building up strong armed forces and glorifying military power to prepare for war',
      example: 'Germany and Great Britain competed in a naval arms race to build the biggest battleships; major European powers doubled their armies before 1914.',
      clue: 'building up strong armies to get ready for war',
      connect: 'European nations spent years building massive armies, stockpiling weapons, and creating detailed war plans. Because countries were already armed and ready to fight, leaders were quicker to choose war instead of peaceful compromise when a crisis broke out.',
      connectShort: 'Countries were already armed with war plans ready, so leaders were quicker to choose war instead of peaceful compromise.' },
    { id: 'alliances', name: 'Alliances', letter: 'A', cause: true, key: 'A',
      def: 'Agreements or partnerships between countries to defend and support each other if attacked.',
      short: 'Agreements between countries to defend and support each other if attacked',
      example: 'Europe split into two rival teams — the Allied Powers and the Central Powers — which turned a local conflict into a world war.',
      clue: 'agree to support one another if attacked',
      connect: 'Europe was divided into two armed, rival teams that promised to defend each other. Even a small disagreement between two countries threatened to drag every major nation into a massive war.',
      connectShort: 'Europe was split into two armed, rival teams, so even a small disagreement could drag every major nation into war.' },
    { id: 'imperialism', name: 'Imperialism', letter: 'I', cause: true, key: 'I',
      def: 'When a stronger country takes over or controls weaker territories/colonies for land, resources, and power.',
      short: 'A stronger country taking over or controlling weaker territories and colonies for land, resources, and power',
      example: 'European powers competed fiercely to colonize Africa and Asia ("Scramble for Africa"), creating jealousy and distrust.',
      clue: 'extending military, economic, or political influence around the globe',
      connect: 'Competition for colonies in Africa and Asia created intense rivalries and distrust among European powers, making them view each other as enemies long before 1914.',
      connectShort: 'Competing for colonies in Africa and Asia created rivalries and distrust, so nations saw each other as enemies long before 1914.' },
    { id: 'nationalism', name: 'Nationalism', letter: 'N', cause: true, key: 'N',
      def: "Extreme pride, loyalty, and devotion to one's own nation or ethnic group, often believing it is superior to others.",
      short: "Extreme pride, loyalty, and devotion to one's own nation or ethnic group",
      example: 'Slavic nationalists in Serbia wanted freedom from Austria-Hungary, leading Gavrilo Princip to assassinate Archduke Franz Ferdinand.',
      clue: "extreme pride or devotion to one's country",
      connect: 'Intense national pride made countries unwilling to back down from conflicts, while ethnic groups living inside empires (such as Serbs in Austria-Hungary) were willing to use violence to win independence.',
      connectShort: 'Intense pride made countries unwilling to back down, and ethnic groups inside empires were willing to use violence to win independence.' },
    { id: 'isolationism', name: 'Isolationism', letter: '', cause: false, key: 'X',
      def: "A policy of staying completely out of other countries' conflicts, alliances, and political affairs.",
      short: "Staying completely out of other countries' conflicts, alliances, and political affairs",
      note: "NOT a cause of WWI: this describes the United States' policy of neutrality in 1914, when it refused to join the fighting in Europe.",
      clue: "strict non-involvement in other nations' affairs" },
    { id: 'communism', name: 'Communism', letter: '', cause: false, key: 'X',
      def: 'An economic and political system where the government controls property and resources, and wealth is shared among citizens.',
      short: 'A system where the government controls property and resources, and wealth is shared among citizens',
      note: 'NOT a cause of WWI: communism did not start WWI. It rose in Russia during the war (the 1917 Russian Revolution) due to wartime hardship.' },
  ];
  const T = {}; terms.forEach((t) => { T[t.id] = t; });
  const causeNames = ['Militarism', 'Alliances', 'Imperialism', 'Nationalism'];
  const MAIN = 'M.A.I.N. = Militarism, Alliances, Imperialism, Nationalism.';

  /* ---------- Part 2: the two sides ---------- */
  const central = ['Germany', 'Austria-Hungary', 'Ottoman Empire', 'Bulgaria'];
  const allied = ['Great Britain', 'France', 'Russia', 'Italy', 'Serbia', 'Belgium', 'Japan'];
  const alliedMain = ['Great Britain', 'France', 'Russia', 'Italy', 'Serbia'];
  const neutral = ['United States'];
  const mnemonic = { phrase: 'Bears Ate Green Oranges', words: [['Bears', 'Bulgaria'], ['Ate', 'Austria-Hungary'], ['Green', 'Germany'], ['Oranges', 'Ottoman Empire']] };
  const CENTRAL4 = 'The four Central Powers: Germany, Austria-Hungary, Ottoman Empire, Bulgaria ("Bears Ate Green Oranges").';
  const ALLIED5 = 'Allied Powers: Great Britain, France, Russia, Italy, Serbia (also Belgium and Japan). Not the USA — it was neutral when the war began.';
  const sideOf = (c) => (central.indexOf(c) >= 0 ? 'central' : allied.indexOf(c) >= 0 ? 'allied' : 'neutral');
  const sideLabel = { allied: 'Allied Powers', central: 'Central Powers', neutral: 'Neutral in 1914' };
  const sideWhy = (c) => {
    const s = sideOf(c);
    if (s === 'central') return c + ' was a Central Power. ' + CENTRAL4;
    if (s === 'neutral') return 'The United States was neutral when the war began in 1914 (isolationism). Do NOT list it as an Allied Power.';
    if (c === 'Italy') return 'Italy is an Allied Power — it switched sides to join the Allies in 1915.';
    return c + ' was an Allied Power. ' + ALLIED5;
  };
  const allianceLine = 'Alliances turned a local conflict into a world war. When one country went to war, its allies were pulled in too.';

  /* ---------- Part 4: the spark ---------- */
  const chain = [
    'Archduke Franz Ferdinand is assassinated in Sarajevo.',
    'Austria-Hungary declares war on Serbia.',
    'Russia mobilizes its army to defend Serbia.',
    'Germany declares war on Russia and France.',
    'Great Britain declares war on Germany after Germany invades Belgium.',
  ];
  const chainLine = 'The chain reaction: 1) Archduke assassinated in Sarajevo → 2) Austria-Hungary declares war on Serbia → 3) Russia mobilizes to defend Serbia → 4) Germany declares war on Russia and France → 5) Great Britain declares war on Germany after Germany invades Belgium.';
  const L_WHY = 'Long-term cause: it built up pressure for years before 1914, like a powder keg.';
  const S_WHY = 'Spark: the assassination of Archduke Franz Ferdinand is the one event that lit the fuse.';
  const longOrSpark = [
    { text: 'The build-up of armies', ans: 'L', fact: 'ls:armies' },
    { text: 'The assassination of Archduke Franz Ferdinand', ans: 'S', fact: 'ls:assassination' },
    { text: 'Competing for colonies in Africa', ans: 'L', fact: 'ls:colonies' },
    { text: 'Secret and defensive alliances', ans: 'L', fact: 'ls:alliances' },
    /* the same four ideas, reworded */
    { text: 'The naval arms race between Germany and Great Britain', ans: 'L', fact: 'ls:armies', variant: true },
    { text: 'The "Scramble for Africa"', ans: 'L', fact: 'ls:colonies', variant: true },
    { text: 'Europe splitting into two rival teams that promised to defend each other', ans: 'L', fact: 'ls:alliances', variant: true },
    { text: 'Gavrilo Princip assassinating the Archduke in Sarajevo', ans: 'S', fact: 'ls:assassination', variant: true },
    { text: 'What happened in Sarajevo on June 28, 1914', ans: 'S', fact: 'ls:assassination', variant: true },
    { text: 'The M.A.I.N. causes building up pressure for years', ans: 'L', fact: 'spark:keg', variant: true },
  ];
  const story = {
    parts: [
      'Archduke Franz Ferdinand was the heir to the throne of ', '. On June 28, ', ', he was assassinated while visiting the city of ',
      '. The assassin, ', ', was part of a nationalist group connected to the country of ', '. This assassination is considered the ', ' that started the war.',
    ],
    blanks: [
      { answer: 'Austria-Hungary', options: ['Austria-Hungary', 'Germany', 'Serbia', 'Russia'], fact: 'spark:heir' },
      { answer: '1914', options: ['1914', '1915', '1917', '1900'], fact: 'spark:date' },
      { answer: 'Sarajevo', options: ['Sarajevo', 'Berlin', 'Paris', 'London'], fact: 'spark:city' },
      { answer: 'Gavrilo Princip', options: ['Gavrilo Princip', 'Kaiser Wilhelm II', 'Tsar Nicholas II', 'Otto von Bismarck'], fact: 'spark:assassin' },
      { answer: 'Serbia', options: ['Serbia', 'Russia', 'Germany', 'Bulgaria'], fact: 'spark:serbia' },
      { answer: 'spark', options: ['spark', 'powder keg', 'alliance', 'colony'], fact: 'spark:spark' },
    ],
  };
  const storyLine = 'Archduke Franz Ferdinand, heir to the throne of Austria-Hungary, was assassinated in Sarajevo on June 28, 1914 by Gavrilo Princip, who was part of a nationalist group connected to Serbia. This was the spark that started the war.';
  const kegLine = 'The M.A.I.N. causes built up pressure like a powder keg. One event — the assassination — lit the fuse.';

  /* ---------- Part 3: competition between nations ---------- */
  const compete = {
    intro: 'Before the war, European powers competed for land, resources, and military strength. That competition built up tension long before the first shot.',
    africa: 'Africa',
    benefits: [
      'Raw materials / natural resources (such as rubber, oil, gold, diamonds, cotton, or minerals)',
      'New markets to sell manufactured goods',
      'Wealth, land/territory, or global power and prestige',
    ],
    suspicion: 'European nations often wanted the same land and resources, leading to border disputes and near-clashes. Each country worried that its rivals would grow richer and stronger, creating jealousy and distrust across Europe.',
    bestNavy: 'Great Britain',
    rivalNavy: 'Germany',
    lessSafe: 'Every time Germany built new warships (like Dreadnoughts), Great Britain saw it as a direct threat to its empire and built even more ships in response. Instead of creating security, the constant buildup made both nations fear a surprise attack and prepare for war.',
  };

  /* ---------- facts: the readiness denominator ---------- */
  const facts = [];
  const factById = {};
  const fact = (id, topic, key, label, pill) => { const f = { id, topic, key, label }; if (pill) f.pill = pill; facts.push(f); factById[id] = f; };
  terms.forEach((t) => fact('def:' + t.id, 'vocab', t.key, 'Definition of ' + t.name));
  terms.forEach((t) => fact('ex:' + t.id, 'vocab', t.key, t.cause ? 'WWI example of ' + t.name : (t.id === 'isolationism' ? 'Isolationism = the USA staying neutral in 1914' : 'Communism rose in Russia during the war (1917)')));
  terms.forEach((t) => { if (t.clue) fact('clue:' + t.id, 'vocab', t.key, 'Clue words for ' + t.name); });
  fact('cause:main', 'vocab', 'S', 'The four M.A.I.N. causes', 'M.A.I.N.');
  fact('cause:isolationism', 'vocab', 'X', 'Isolationism is NOT a cause of WWI');
  fact('cause:communism', 'vocab', 'X', 'Communism is NOT a cause of WWI');
  central.concat(allied, neutral).forEach((c) => fact('side:' + c, 'sides', 'A', c + ': ' + sideLabel[sideOf(c)], 'THE TWO SIDES'));
  fact('sides:central4', 'sides', 'A', 'Name all four Central Powers', 'THE TWO SIDES');
  fact('sides:allied4', 'sides', 'A', 'Name four Allied Powers (not the USA)', 'THE TWO SIDES');
  fact('sides:mnemonic', 'sides', 'A', '"Bears Ate Green Oranges"', 'THE TWO SIDES');
  fact('sides:italy1915', 'sides', 'A', 'Italy switched sides to join the Allies in 1915', 'THE TWO SIDES');
  fact('sides:local-world', 'sides', 'A', 'Alliances turned a local conflict into a world war');
  fact('imp:africa', 'compete', 'I', 'Africa was the continent colonized the most');
  fact('imp:resources', 'compete', 'I', 'Colonies gave raw materials / natural resources');
  fact('imp:benefits', 'compete', 'I', 'Colonies gave new markets, wealth, land, power, prestige');
  fact('imp:suspicion', 'compete', 'I', 'Why competing for colonies bred suspicion');
  fact('mil:best-navy', 'compete', 'M', "Great Britain had the world's best navy");
  fact('mil:rival-navy', 'compete', 'M', 'Germany built a rival navy');
  fact('mil:less-safe', 'compete', 'M', 'Why the naval race made both sides less safe');
  fact('connect:M', 'compete', 'M', 'How militarism made war more likely');
  fact('connect:A', 'compete', 'A', 'How alliances made war more likely');
  fact('connect:I', 'compete', 'I', 'How imperialism made war more likely');
  fact('connect:N', 'compete', 'N', 'How nationalism made war more likely');
  fact('spark:keg', 'spark', 'S', 'M.A.I.N. = powder keg; one event lit the fuse');
  fact('spark:heir', 'spark', 'S', 'Franz Ferdinand: heir to the throne of Austria-Hungary');
  fact('spark:date', 'spark', 'S', 'Assassinated June 28, 1914');
  fact('spark:city', 'spark', 'S', 'Assassinated in Sarajevo');
  fact('spark:assassin', 'spark', 'S', 'The assassin: Gavrilo Princip');
  fact('spark:serbia', 'spark', 'N', "Princip's nationalist group was connected to Serbia");
  fact('spark:spark', 'spark', 'S', 'The assassination = the spark');
  chain.forEach((s, i) => fact('chain:' + (i + 1), 'spark', i < 2 ? 'S' : 'A', 'Chain reaction step ' + (i + 1), 'CHAIN REACTION'));
  fact('chain:order', 'spark', 'A', 'The whole chain reaction in order', 'CHAIN REACTION');
  fact('ls:armies', 'spark', 'M', 'Build-up of armies = long-term cause', 'LONG-TERM OR SPARK');
  fact('ls:assassination', 'spark', 'S', 'The assassination = spark', 'LONG-TERM OR SPARK');
  fact('ls:colonies', 'spark', 'I', 'Competing for colonies = long-term cause', 'LONG-TERM OR SPARK');
  fact('ls:alliances', 'spark', 'A', 'Secret and defensive alliances = long-term cause', 'LONG-TERM OR SPARK');

  /* ---------- question bank ---------- */
  const questions = [];
  const counts = {};
  const shuffled = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  const some = (arr, n, not) => shuffled(arr.filter((x) => x !== not)).slice(0, n);
  function add(factId, type, q, choices, answer, explain, extra) {
    const f = factById[factId];
    if (!f) { if (window.console) console.warn('STUDY: unknown fact', factId); return; }
    counts[factId] = (counts[factId] || 0) + 1;
    questions.push(Object.assign({ id: factId + '#' + counts[factId], fact: factId, topic: f.topic, key: f.key, type, q, choices, answer, explain }, extra || null));
  }
  /* MC: the FIRST choice is the right one (the quiz shuffles at ask time). TF: fixed True/False. */
  const MC = (f, q, choices, explain) => add(f, 'mc', q, choices, 0, explain);
  const TF = (f, q, truth, explain) => add(f, 'tf', 'True or false: ' + q, ['True', 'False'], truth ? 0 : 1, explain);
  const FIXED = (f, q, choices, answer, explain) => add(f, 'mc', q, choices, answer, explain, { fixed: true });

  /* -- vocabulary: definitions, examples, clue words -- */
  terms.forEach((t) => {
    const others = terms.filter((o) => o.id !== t.id);
    const why = t.name + ': ' + t.def;
    MC('def:' + t.id, 'Which term means: "' + t.short + '"?', [t.name].concat(some(others, 3).map((o) => o.name)), why);
    MC('def:' + t.id, 'What ' + (t.id === 'alliances' ? 'are' : 'is') + ' ' + t.name.toLowerCase() + '?', [t.short].concat(some(others, 3).map((o) => o.short)), why);
    MC('def:' + t.id, 'Pick the best definition of ' + t.name.toLowerCase() + '.', [t.short].concat(some(others, 3).map((o) => o.short)), why);
    if (t.clue) {
      const clueOthers = others.filter((o) => o.clue);
      const cw = 'Clue words "' + t.clue + '" → ' + t.name + '.';
      MC('clue:' + t.id, 'Clue words: "' + t.clue + '." Which term matches?', [t.name].concat(some(others, 3).map((o) => o.name)), cw);
      MC('clue:' + t.id, 'Which clue phrase matches ' + t.name.toLowerCase() + '?', [t.clue].concat(some(clueOthers, 3).map((o) => o.clue)), cw);
    }
  });
  [
    ['militarism', 'ex:militarism', 'Germany and Great Britain competed in a naval arms race to build the biggest battleships.'],
    ['militarism', 'ex:militarism', 'Major European powers doubled their armies before 1914.'],
    ['militarism', 'connect:M', 'Nations spent years building massive armies, stockpiling weapons, and creating detailed war plans.'],
    ['alliances', 'ex:alliances', 'Europe split into two rival teams — the Allied Powers and the Central Powers.'],
    ['alliances', 'connect:A', 'Countries promised to defend each other, so a small disagreement could drag every major nation into war.'],
    ['imperialism', 'ex:imperialism', 'European powers competed fiercely to colonize Africa and Asia.'],
    ['imperialism', 'ex:imperialism', 'The "Scramble for Africa" created jealousy and distrust.'],
    ['nationalism', 'ex:nationalism', 'Slavs in Serbia, loyal to their own people, wanted freedom from Austria-Hungary.'],
    ['nationalism', 'connect:N', 'Serbs living inside Austria-Hungary were willing to use violence to win independence.'],
    ['nationalism', 'connect:N', 'Intense pride in their own country made nations unwilling to back down from conflicts.'],
  ].forEach((e) => {
    const t = T[e[0]];
    MC(e[1], 'Which M.A.I.N. cause does this show? "' + e[2] + '"', [t.name].concat(causeNames.filter((n) => n !== t.name)),
      t.name + ' — ' + (e[1].indexOf('connect') === 0 ? t.connectShort : t.example));
  });
  MC('ex:militarism', 'Before 1914, what did the major European powers do to their armies?', ['Doubled them', 'Tripled them', 'Kept them the same size', 'Cut them in half'], 'Militarism: major European powers doubled their armies before 1914.');
  MC('ex:militarism', 'Which is a WWI example of militarism?', ['Germany and Great Britain racing to build the biggest battleships', 'The United States staying neutral in 1914', 'Serbs wanting freedom from Austria-Hungary', 'Europeans competing for colonies in Africa'], 'Militarism: ' + T.militarism.example);
  MC('ex:alliances', 'Europe split into two rival teams. What were they called?', ['The Allied Powers and the Central Powers', 'The Northern Powers and the Southern Powers', 'The Colonial Powers and the Neutral Powers', 'The Naval Powers and the Army Powers'], 'Alliances: ' + T.alliances.example);
  MC('ex:alliances', 'Which is a WWI example of alliances?', ['Europe splitting into the Allied Powers and the Central Powers', 'The "Scramble for Africa"', 'Germany building Dreadnoughts', 'The 1917 Russian Revolution'], 'Alliances: ' + T.alliances.example);
  MC('ex:imperialism', 'Which is a WWI example of imperialism?', ['European powers competing to colonize Africa and Asia', 'Countries promising to defend each other if attacked', 'Armies doubling in size before 1914', 'Gavrilo Princip assassinating the Archduke'], 'Imperialism: ' + T.imperialism.example);
  MC('ex:imperialism', 'European powers raced fiercely to grab colonies. That race was called the…', ['Scramble for Africa', 'Naval Arms Race', 'Powder Keg', 'Chain Reaction'], 'Imperialism: ' + T.imperialism.example);
  MC('ex:nationalism', 'Which M.A.I.N. cause best explains why Gavrilo Princip assassinated the Archduke?', ['Nationalism', 'Militarism', 'Imperialism', 'Alliances'], 'Nationalism: ' + T.nationalism.example);
  MC('ex:nationalism', 'What did Slavic nationalists in Serbia want?', ['Freedom from Austria-Hungary', 'More colonies in Africa', 'The biggest navy in the world', 'To stay neutral like the United States'], 'Nationalism: ' + T.nationalism.example);
  MC('ex:isolationism', "Which term describes the United States' position when the war began in 1914?", ['Isolationism', 'Imperialism', 'Militarism', 'Communism'], T.isolationism.note);
  MC('ex:isolationism', 'In 1914 the United States refused to join the fighting in Europe. That policy of neutrality is called…', ['Isolationism', 'Nationalism', 'Alliances', 'Imperialism'], T.isolationism.note);
  MC('ex:isolationism', 'Which country followed a policy of isolationism (neutrality) in 1914?', ['The United States', 'Germany', 'Russia', 'Austria-Hungary'], T.isolationism.note);
  TF('ex:isolationism', 'The United States joined the fighting as soon as the war began in 1914.', false, T.isolationism.note);
  MC('ex:communism', 'In which country did communism rise during the war?', ['Russia', 'Germany', 'Serbia', 'Great Britain'], T.communism.note);
  MC('ex:communism', 'Communism rose in Russia during the Russian Revolution. What year was it?', ['1917', '1914', '1915', '1900'], T.communism.note);
  MC('ex:communism', 'Why did communism rise in Russia during the war?', ['Wartime hardship', 'The naval arms race', 'The Scramble for Africa', 'A policy of neutrality'], T.communism.note);
  MC('ex:communism', 'The 1917 Russian Revolution goes with which term?', ['Communism', 'Isolationism', 'Imperialism', 'Militarism'], T.communism.note);

  /* -- causes vs. not causes -- */
  terms.filter((t) => t.cause).forEach((t) => TF('cause:main', t.name + ' was one of the M.A.I.N. causes of World War I.', true, MAIN));
  ['M', 'A', 'I', 'N'].forEach((L, i) => {
    const wrong = { M: ['Mobilization', 'Monarchy', 'Markets'], A: ['Assassination', 'Africa', 'Armies'], I: ['Isolationism', 'Italy', 'Independence'], N: ['Neutrality', 'Navy', 'Nations'] }[L];
    MC('cause:main', 'In M.A.I.N., what does the "' + L + '" stand for?', [causeNames[i]].concat(wrong), MAIN);
  });
  MC('cause:main', 'What do the letters M.A.I.N. stand for?', ['Militarism, Alliances, Imperialism, Nationalism', 'Militarism, Alliances, Isolationism, Nationalism', 'Militarism, Assassination, Imperialism, Neutrality', 'Monarchy, Alliances, Imperialism, Communism'], MAIN);
  MC('cause:main', 'Which list has ONLY real causes of World War I?', ['Militarism, Alliances, Imperialism, Nationalism', 'Militarism, Communism, Imperialism, Nationalism', 'Isolationism, Alliances, Imperialism, Nationalism', 'Militarism, Alliances, Isolationism, Communism'], MAIN + ' Isolationism and communism are NOT causes.');
  TF('cause:isolationism', 'Isolationism was one of the causes of World War I.', false, T.isolationism.note);
  MC('cause:isolationism', 'Which of these is NOT a cause of World War I?', ['Isolationism', 'Militarism', 'Alliances', 'Nationalism'], T.isolationism.note);
  MC('cause:isolationism', 'Why is isolationism NOT a cause of WWI?', ['It describes the United States staying neutral and out of the fighting in 1914', 'It was a secret alliance between Germany and Austria-Hungary', 'It was the race to build the biggest battleships', 'It was the competition for colonies in Africa'], T.isolationism.note);
  MC('cause:isolationism', 'Which two vocabulary terms are NOT causes of WWI?', ['Isolationism and Communism', 'Militarism and Alliances', 'Imperialism and Nationalism', 'Nationalism and Communism'], 'Isolationism (the USA staying neutral in 1914) and communism (rose in Russia during the war, 1917) are NOT causes of WWI.');
  TF('cause:communism', 'Communism was one of the causes of World War I.', false, T.communism.note);
  MC('cause:communism', 'Which of these is NOT a cause of World War I?', ['Communism', 'Imperialism', 'Alliances', 'Militarism'], T.communism.note);
  MC('cause:communism', 'Why is communism NOT a cause of WWI?', ['It did not start the war — it rose in Russia during the war (1917)', 'It was the reason Germany invaded Belgium', 'It was the naval race between Great Britain and Germany', 'It was the nationalist group connected to Serbia'], T.communism.note);
  TF('cause:communism', 'Communism rose in Russia BEFORE World War I and helped start it.', false, T.communism.note);

  /* -- the two sides -- */
  const sideChoices = [sideLabel.allied, sideLabel.central, sideLabel.neutral];
  const sideIdx = { allied: 0, central: 1, neutral: 2 };
  central.concat(allied, neutral).forEach((c) => {
    const s = sideOf(c);
    const q = c === 'Italy' ? 'Italy switched sides in 1915. Which side did it join?' : c === 'United States' ? 'Where did the United States stand when the war began in 1914?' : 'Which side was ' + (c === 'Ottoman Empire' ? 'the ' : '') + c + ' on?';
    FIXED('side:' + c, q, sideChoices, sideIdx[s], sideWhy(c));
    if (s !== 'neutral') {
      const subj = (c === 'Ottoman Empire' ? 'The ' : '') + c;
      TF('side:' + c, c === 'Italy' ? 'After switching sides in 1915, Italy fought alongside the Central Powers.' : subj + ' was one of the Central Powers.', s === 'central', sideWhy(c));
      TF('side:' + c, subj + ' was one of the Allied Powers.', s === 'allied', sideWhy(c));
    }
  });
  central.forEach((c) => {
    MC('side:' + c, 'Which of these countries was a Central Power?', [c].concat(some(alliedMain, 3)), sideWhy(c));
    const rest = central.filter((x) => x !== c);
    const wrong = { Germany: ['Great Britain', 'Russia', 'Serbia'], 'Austria-Hungary': ['Serbia', 'France', 'Italy'], 'Ottoman Empire': ['Russia', 'France', 'Japan'], Bulgaria: ['Serbia', 'Italy', 'Belgium'] }[c];
    const r3 = rest.map((x) => (x === 'Ottoman Empire' ? 'the Ottoman Empire' : x));
    MC('sides:central4', r3[0] + ', ' + r3[1] + ', and ' + r3[2] + ' were three of the Central Powers. Who was the fourth?', [c].concat(wrong), CENTRAL4);
  });
  alliedMain.forEach((a) => {
    MC('side:' + a, 'Which of these countries was an Allied Power?', [a].concat(some(central, 3)), sideWhy(a));
    MC('sides:central4', 'Which of these was NOT a Central Power?', [a].concat(some(central, 3)), CENTRAL4 + ' ' + a + ' was an Allied Power.');
  });
  central.forEach((c) => MC('sides:allied4', 'Which of these was NOT one of the Allied Powers?', [c].concat(some(alliedMain, 3)), ALLIED5 + ' ' + c + ' was a Central Power.'));
  MC('sides:central4', 'Which list shows all four Central Powers?', ['Germany, Austria-Hungary, Ottoman Empire, Bulgaria', 'Germany, Austria-Hungary, Italy, Russia', 'Great Britain, France, Russia, Serbia', 'Germany, Ottoman Empire, Bulgaria, France'], CENTRAL4);
  MC('sides:central4', 'How many Central Powers do you need to know?', ['Four', 'Two', 'Six', 'Seven'], CENTRAL4);
  MC('sides:allied4', 'Which list shows four Allied Powers?', ['Great Britain, France, Russia, Serbia', 'Germany, France, Russia, Italy', 'Great Britain, France, United States, Bulgaria', 'Bulgaria, Ottoman Empire, Russia, Serbia'], ALLIED5);
  MC('sides:allied4', 'Great Britain, France, and Russia were Allied Powers. Which of these was one too?', ['Serbia', 'Bulgaria', 'Germany', 'Ottoman Empire'], ALLIED5);
  MC('side:United States', 'Which country should NOT be on your list of Allied Powers for 1914?', ['United States', 'France', 'Russia', 'Great Britain'], sideWhy('United States'));
  MC('side:United States', 'Why is the USA left off the list of Allied Powers?', ['It was neutral when the war began', 'It was one of the Central Powers', 'It switched sides in 1915', 'It was a colony in Africa'], sideWhy('United States'));
  TF('side:United States', 'The United States was one of the Allied Powers when the war began in 1914.', false, sideWhy('United States'));
  MC('sides:mnemonic', '"Bears Ate Green Oranges" helps you remember the…', ['four Central Powers', 'Allied Powers', 'four M.A.I.N. causes', 'steps of the chain reaction'], 'Bears Ate Green Oranges = Bulgaria, Austria-Hungary, Germany, Ottoman Empire — the four Central Powers.');
  [['Bears', 'Bulgaria', ['Belgium', 'Great Britain', 'Russia']], ['Ate', 'Austria-Hungary', ['Africa', 'the Allied Powers', 'Serbia']], ['Green', 'Germany', ['Great Britain', 'Gavrilo Princip', 'France']]]
    .forEach((m) => MC('sides:mnemonic', 'In "Bears Ate Green Oranges," what does "' + m[0] + '" stand for?', [m[1]].concat(m[2]), 'Bears Ate Green Oranges = Bulgaria, Austria-Hungary, Germany, Ottoman Empire — the four Central Powers.'));
  MC('sides:mnemonic', 'Which of these is NOT one of the countries in "Bears Ate Green Oranges"?', ['Great Britain', 'Germany', 'Bulgaria', 'Austria-Hungary'], 'Bears Ate Green Oranges = Bulgaria, Austria-Hungary, Germany, Ottoman Empire — the four Central Powers. Great Britain was an Allied Power.');
  const italyWhy = 'Italy switched sides to join the Allies in 1915.';
  MC('sides:italy1915', 'What did Italy do in 1915?', ['Switched sides to join the Allies', 'Switched sides to join the Central Powers', 'Declared itself neutral for good', 'Invaded Belgium'], italyWhy);
  MC('sides:italy1915', 'In what year did Italy switch sides to join the Allies?', ['1915', '1914', '1917', '1900'], italyWhy);
  MC('sides:italy1915', 'Which country switched sides to join the Allies in 1915?', ['Italy', 'Bulgaria', 'Russia', 'Serbia'], italyWhy);
  TF('sides:italy1915', 'Italy switched sides to join the Central Powers in 1915.', false, italyWhy);
  MC('sides:local-world', 'What turned a local conflict into a world war?', ['Alliances', 'Isolationism', 'Communism', 'Colonies in Africa'], allianceLine);
  MC('sides:local-world', 'Because of alliances, what happened when one country went to war?', ['Its allies were pulled in too', 'Its allies stayed neutral', 'The war stayed small and local', 'Its colonies became independent'], allianceLine);
  TF('sides:local-world', 'Alliances kept the conflict small and local.', false, allianceLine);
  TF('sides:local-world', 'When one country went to war, its allies were pulled in too.', true, allianceLine);

  /* -- competition between nations -- */
  MC('imp:africa', 'Which continent were European countries competing to colonize the most?', ['Africa', 'South America', 'Australia', 'Antarctica'], 'Africa — the "Scramble for Africa."');
  MC('imp:africa', 'The "Scramble" was a race for colonies on which continent?', ['Africa', 'North America', 'Europe', 'Australia'], 'Africa — the "Scramble for Africa."');
  TF('imp:africa', 'European countries competed to colonize Africa more than any other continent.', true, 'Africa — the "Scramble for Africa."');
  const resWhy = 'Colonies gave raw materials / natural resources such as rubber, oil, gold, diamonds, cotton, or minerals.';
  const benWhy = 'From colonies, countries hoped to gain raw materials, new markets to sell manufactured goods, and wealth, land, global power and prestige.';
  MC('imp:resources', 'Which is something countries hoped to GET from their colonies?', ['Raw materials like rubber, oil, gold, diamonds, and cotton', 'A promise to stay neutral', 'Smaller armies and navies', 'Fewer places to sell goods'], resWhy);
  MC('imp:resources', 'Rubber, oil, gold, diamonds, and cotton are all examples of…', ['raw materials from colonies', 'manufactured goods', 'alliances', 'Dreadnoughts'], resWhy);
  MC('imp:resources', 'Which group lists natural resources countries wanted from colonies?', ['Rubber, oil, gold, diamonds', 'Battleships, armies, war plans', 'Treaties, promises, partnerships', 'Flags, pride, loyalty'], resWhy);
  MC('imp:benefits', 'Besides raw materials, colonies gave a country new ______ to sell its manufactured goods.', ['markets', 'factories', 'alliances', 'navies'], benWhy);
  MC('imp:benefits', 'Which was NOT something a country hoped to gain from colonies?', ['Staying out of world affairs', 'Raw materials and natural resources', 'New markets to sell manufactured goods', 'Global power and prestige'], benWhy);
  MC('imp:benefits', 'Why did European countries want colonies?', ['For raw materials, new markets, wealth, land, and global power', 'To stay out of other countries\' conflicts', 'To share wealth equally among citizens', 'To shrink their armies'], benWhy);
  MC('imp:suspicion', 'How did competing for colonies make European countries more suspicious of each other?', ['They wanted the same land and resources, and feared rivals would grow richer and stronger', 'They agreed to share every colony equally', 'They stopped building armies and navies', 'They all joined the same alliance'], compete.suspicion);
  MC('imp:suspicion', 'Wanting the same land and resources led to border disputes, near-clashes, and feelings of…', ['jealousy and distrust', 'pride and loyalty', 'safety and security', 'neutrality and calm'], compete.suspicion);
  MC('imp:suspicion', 'What did each country worry about as its rivals grabbed colonies?', ['That rivals would grow richer and stronger', 'That rivals would become neutral', 'That rivals would give up their navies', 'That rivals would run out of colonies to sell'], compete.suspicion);
  MC('mil:best-navy', "Which country had the world's best navy before WWI?", ['Great Britain', 'Germany', 'Russia', 'Austria-Hungary'], "Great Britain had the world's best navy; Germany tried to build a rival navy to match it.");
  TF('mil:best-navy', "Germany had the world's best navy before WWI.", false, "Great Britain had the world's best navy; Germany tried to build a rival navy to match it.");
  MC('mil:best-navy', "Germany tried to match the best navy in the world. Whose navy was that?", ['Great Britain', 'France', 'Russia', 'Italy'], "Great Britain had the world's best navy; Germany tried to build a rival navy to match it.");
  TF('mil:rival-navy', "Germany tried to build a navy to rival Great Britain's.", true, "Germany tried to build a navy to rival Great Britain's — the naval arms race.");
  MC('mil:rival-navy', "Which country tried to build a rival navy to match Great Britain's?", ['Germany', 'France', 'Russia', 'Serbia'], "Germany tried to build a navy to rival Great Britain's — the naval arms race.");
  MC('mil:rival-navy', 'The naval arms race was between which two countries?', ['Germany and Great Britain', 'France and Russia', 'Serbia and Austria-Hungary', 'Italy and Bulgaria'], 'Germany and Great Britain competed in a naval arms race to build the biggest battleships.');
  MC('mil:less-safe', 'Why did the naval race make both countries feel LESS safe?', ['Each time Germany built warships, Britain saw a threat and built even more, so both feared a surprise attack', 'Both countries ran out of sailors', 'The ships were too slow to be useful', 'They agreed to share one navy'], compete.lessSafe);
  MC('mil:less-safe', 'When Germany built new warships, how did Great Britain respond?', ['It built even more ships', 'It gave up its navy', 'It joined the Central Powers', 'It became neutral'], compete.lessSafe);
  MC('mil:less-safe', 'What were Dreadnoughts?', ['Powerful new warships', 'Secret defensive alliances', 'Colonies in Africa', 'Nationalist groups in Serbia'], compete.lessSafe);
  TF('mil:less-safe', 'The naval race made Great Britain and Germany feel safer.', false, compete.lessSafe);
  MC('mil:less-safe', 'The constant naval buildup made both nations fear a ______ and prepare for war.', ['surprise attack', 'peace treaty', 'new colony', 'revolution'], compete.lessSafe);
  terms.filter((t) => t.cause).forEach((t) => {
    const others = terms.filter((o) => o.cause && o.id !== t.id);
    MC('connect:' + t.letter, 'How did ' + t.name.toLowerCase() + ' make war more likely, even before the spark?', [t.connectShort].concat(others.map((o) => o.connectShort)), t.name + ': ' + t.connect);
    MC('connect:' + t.letter, 'Which M.A.I.N. cause is this? "' + t.connectShort + '"', [t.name].concat(others.map((o) => o.name)), t.name + ': ' + t.connect);
  });
  MC('connect:M', 'Because countries were already armed and ready to fight, leaders were quicker to choose…', ['war instead of peaceful compromise', 'peace instead of war', 'neutrality', 'new colonies'], 'Militarism: ' + T.militarism.connect);
  MC('connect:A', 'Europe was divided into two armed, rival teams. Why was that dangerous?', ['Even a small disagreement could drag every major nation into a massive war', 'No country had any friends', 'Nobody had an army', 'It kept every conflict local'], 'Alliances: ' + T.alliances.connect);
  MC('connect:I', 'Competition for colonies made European powers view each other as…', ['enemies long before 1914', 'allies who must defend each other', 'neutral countries', 'future colonies'], 'Imperialism: ' + T.imperialism.connect);
  MC('connect:N', 'What were some ethnic groups inside empires (such as Serbs in Austria-Hungary) willing to do?', ['Use violence to win independence', 'Give up and stay quiet', 'Build the biggest navy', 'Colonize Africa'], 'Nationalism: ' + T.nationalism.connect);

  /* -- the spark -- */
  MC('spark:keg', 'The M.A.I.N. causes built up pressure like a…', ['powder keg', 'spark', 'Dreadnought', 'colony'], kegLine);
  MC('spark:keg', 'In the powder keg picture, what "lit the fuse"?', ['The assassination of Archduke Franz Ferdinand', 'The Scramble for Africa', 'The naval arms race', 'The United States staying neutral'], kegLine);
  MC('spark:keg', 'If the assassination was the spark, what was the powder keg?', ['The M.A.I.N. causes building up pressure', 'The city of Sarajevo', 'The United States', 'The Russian Revolution'], kegLine);
  MC('spark:heir', 'Archduke Franz Ferdinand was heir to the throne of…', ['Austria-Hungary', 'Germany', 'Serbia', 'Russia'], storyLine);
  MC('spark:heir', 'Who was the heir to the throne of Austria-Hungary?', ['Archduke Franz Ferdinand', 'Gavrilo Princip', 'Kaiser Wilhelm II', 'Tsar Nicholas II'], storyLine);
  MC('spark:date', 'On what date was Archduke Franz Ferdinand assassinated?', ['June 28, 1914', 'June 28, 1917', 'July 4, 1914', 'June 28, 1915'], storyLine);
  MC('spark:date', 'In what year was the Archduke assassinated?', ['1914', '1915', '1917', '1900'], storyLine);
  TF('spark:date', 'Archduke Franz Ferdinand was assassinated in 1917.', false, storyLine);
  MC('spark:city', 'In which city was the Archduke assassinated?', ['Sarajevo', 'Berlin', 'Paris', 'London'], storyLine);
  MC('spark:city', 'What happened in Sarajevo on June 28, 1914?', ['Archduke Franz Ferdinand was assassinated', 'Germany invaded Belgium', 'Italy switched sides', 'The Russian Revolution began'], storyLine);
  MC('spark:assassin', 'Who assassinated Archduke Franz Ferdinand?', ['Gavrilo Princip', 'Kaiser Wilhelm II', 'Tsar Nicholas II', 'Otto von Bismarck'], storyLine);
  MC('spark:assassin', 'Who was Gavrilo Princip?', ['The assassin of Archduke Franz Ferdinand', 'The heir to the throne of Austria-Hungary', 'The leader of Germany\'s navy', 'A neutral American'], storyLine);
  MC('spark:serbia', 'Gavrilo Princip was part of a nationalist group connected to which country?', ['Serbia', 'Russia', 'Germany', 'Bulgaria'], storyLine);
  TF('spark:serbia', "Gavrilo Princip's nationalist group was connected to Germany.", false, storyLine);
  MC('spark:spark', 'The assassination of Archduke Franz Ferdinand is considered the ______ that started the war.', ['spark', 'long-term cause', 'alliance', 'colony'], storyLine);
  MC('spark:spark', 'Which event is the SPARK of World War I?', ['The assassination of Archduke Franz Ferdinand', 'The naval arms race', 'The Scramble for Africa', 'Europe splitting into two rival teams'], S_WHY);
  TF('spark:spark', 'The assassination of Archduke Franz Ferdinand is the spark that started the war.', true, S_WHY);
  /* chain reaction */
  for (let i = 0; i < 4; i++) MC('chain:' + (i + 2), 'What happened right AFTER this? "' + chain[i] + '"', [chain[i + 1]].concat(chain.filter((s, j) => j !== i && j !== i + 1)), chainLine);
  for (let i = 1; i < 5; i++) MC('chain:' + i, 'What happened right BEFORE this? "' + chain[i] + '"', [chain[i - 1]].concat(chain.filter((s, j) => j !== i && j !== i - 1)), chainLine);
  const ord = ['Step 1 (first)', 'Step 2', 'Step 3', 'Step 4', 'Step 5 (last)'];
  chain.forEach((s, i) => FIXED('chain:' + (i + 1), 'Which step of the chain reaction is this? "' + s + '"', ord, i, chainLine));
  MC('chain:order', 'Which event came FIRST in the chain reaction?', [chain[0], chain[1], chain[2], chain[4]], chainLine);
  MC('chain:order', 'Which event came LAST in the chain reaction?', [chain[4], chain[3], chain[2], chain[1]], chainLine);
  MC('chain:order', 'Which shows the chain reaction in the right order?', [
    'Assassination → Austria-Hungary declares war → Russia mobilizes → Germany declares war → Great Britain declares war',
    'Assassination → Russia mobilizes → Austria-Hungary declares war → Great Britain declares war → Germany declares war',
    'Germany declares war → Assassination → Austria-Hungary declares war → Russia mobilizes → Great Britain declares war',
    'Assassination → Germany declares war → Great Britain declares war → Austria-Hungary declares war → Russia mobilizes'], chainLine);
  MC('chain:2', 'After the assassination, Austria-Hungary declared war on…', ['Serbia', 'Russia', 'France', 'Great Britain'], chainLine);
  MC('chain:3', 'Why did Russia mobilize its army?', ['To defend its ally, Serbia', 'To invade Belgium', 'To colonize Africa', 'To help Austria-Hungary'], chainLine);
  MC('chain:3', 'Which country mobilized its army to defend Serbia?', ['Russia', 'Germany', 'Bulgaria', 'Ottoman Empire'], chainLine);
  MC('chain:4', 'Germany declared war on Russia and which other country?', ['France', 'Serbia', 'Austria-Hungary', 'Bulgaria'], chainLine);
  MC('chain:5', 'Why did Great Britain declare war on Germany?', ['Germany invaded Belgium', 'Germany built a navy', 'Germany colonized Africa', 'Germany assassinated the Archduke'], chainLine);
  MC('chain:5', 'Which country did Germany invade to reach France?', ['Belgium', 'Serbia', 'Italy', 'Bulgaria'], chainLine);
  /* long-term cause or spark */
  longOrSpark.forEach((x) => add(x.fact, 'tf', 'Long-term cause or spark? "' + x.text + '"', ['Long-term cause', 'Spark'], x.ans === 'L' ? 0 : 1, x.ans === 'L' ? L_WHY : S_WHY));
  MC('ls:assassination', 'Which of these is the SPARK, not a long-term cause?', ['The assassination of Archduke Franz Ferdinand', 'The build-up of armies', 'Competing for colonies in Africa', 'Secret and defensive alliances'], S_WHY);
  MC('ls:armies', 'Which of these is a LONG-TERM cause of WWI?', ['The build-up of armies', 'The assassination of Archduke Franz Ferdinand', 'The United States staying neutral', 'The 1917 Russian Revolution'], L_WHY);
  MC('ls:colonies', 'Which of these is a LONG-TERM cause of WWI?', ['Competing for colonies in Africa', 'The assassination in Sarajevo', 'Communism rising in Russia', 'Isolationism in the United States'], L_WHY);
  MC('ls:alliances', 'Which of these is a LONG-TERM cause of WWI?', ['Secret and defensive alliances', 'The assassination of Archduke Franz Ferdinand', 'Communism', 'Isolationism'], L_WHY);

  window.STUDY = {
    terms, central, allied, alliedMain, neutral, mnemonic, chain, longOrSpark, story, compete, facts, questions,
    sideOf, sideLabel, sideWhy,
    lines: { main: MAIN, central4: CENTRAL4, allied5: ALLIED5, alliance: allianceLine, chain: chainLine, story: storyLine, keg: kegLine, longTerm: L_WHY, spark: S_WHY },
    topics: [
      { id: 'vocab', name: 'Key Vocabulary', part: 1 }, { id: 'sides', name: 'The Two Sides', part: 2 },
      { id: 'compete', name: 'Competition Between Nations', part: 3 }, { id: 'spark', name: 'The Spark', part: 4 },
    ],
  };
})();
