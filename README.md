# Powder Keg 1914

A survive-the-horde arcade game for studying the **Causes of World War I**. Your weapons fire by themselves; every
level-up asks one study-guide question. Get it right and you choose your upgrade.

**Play:** open `index.html` in any browser (phone or computer). Nothing to install, no downloads, works offline
once the fonts have loaded.

## How it teaches

- **Five acts in order — M, A, I, N, then the Spark** — each in its own place with its own monsters and boss:
  a battleship deck for Militarism, a treaty hall for Alliances, a colonial map for Imperialism, a city square for
  Nationalism, and a Sarajevo street at night for the Spark.
- **Monsters behave like their cause.** Alliance creatures are chained together and call each other in when one is
  hit, Imperialism grabbers steal your gems and grow, Nationalism zealots charge and never back down.
- **Level up → question → upgrade.** Miss it and you see the right answer and why; that fact comes back soon.
- **Treasure chests → bonus rounds** built from the study guide: Pick a Side, name the Central Powers, put the
  Chain Reaction in order, Long-term or Spark?, Clue Match, Fill the Telegram, M.A.I.N. or Not?
- **Boss shields** only break with a right answer. Go down and a 3-question **Last Stand** can revive you.
- **Quiz Readiness** tracks all 65 facts. A fact is mastered after two right answers in a row.
  Tap the readiness card for a **Quick Review** of your weakest facts.
- **Practice Test** (with type-the-answer questions) and **Study Notes** are on the title screen.

Coins buy permanent upgrades and unlock agents, and beating the Spark unlocks harder Danger levels.

## Controls

| | |
|---|---|
| Move | WASD / arrow keys, or drag anywhere on a touch screen |
| Answer | tap, or keys 1–4 |
| Pause | Esc or P, or the pause button |

## Project layout

Everything is plain JavaScript and CSS, drawn in code: no images, no audio files, no libraries.

```
index.html              built single-file game (generated — do not edit)
build.py                bundles src/ into index.html and dist/artifact.html
src/base.css            design tokens + shared components
src/js/data.js          study-guide facts and the 236-question bank
src/js/quiz.js          question cards, bonus rounds, quick review, practice test, study notes, mastery tracking
src/js/game.js          the engine: weapons, monsters, bosses, level-up / chest / revive flows, simulator
src/js/game-data.js     weapons, boosts, monsters, acts and the balance knobs (PK.TUNE)
src/js/game-stage.js    frame orchestrator: camera, draw order, art hooks with built-in fallbacks
src/js/game-ui.js       in-run HUD, boss bar, act cards, upgrade picker, pause
src/js/art-world.js     the five environments
src/js/art-creatures.js the ten monsters           src/js/art-bosses.js   the five bosses
src/js/art-hero.js      the eight agents + pickups  src/js/art-fx.js       projectiles and effects
src/js/art-icons.js     the icon set
src/js/meta.js          title, agents, shop, awards, settings, results
src/js/audio.js         procedural music and sound effects
src/js/save.js          the only code that touches localStorage
```

Rebuild after editing anything in `src/`:

```
python3 build.py
```

## Balance tools

The engine can play itself without drawing, about a thousand times faster than real time. In the browser console:

```js
await Game.debug.sim({ bot: 'average', acc: 0.7, danger: 0 })   // one whole run -> {summary, marks}
await Game.debug.bench({ weapon: 'cannon', lvl: 6, act: 4 })     // one weapon alone against a steady horde
```

`bot` is `'casual'`, `'average'` or `'skilled'`; `acc` is the share of questions answered right. The difficulty
curve (`PK.TUNE` and the per-act tables in `game-data.js`) was tuned so that an average player with no upgrades
usually reaches Act 4, wins about one run in ten, and wins most runs once about half the shop is bought — and so
that knowing the answers matters more than reflexes.
