# Powder Keg 1914

A survive-the-horde arcade game for studying the **Causes of World War I**. Your weapons fire by themselves; every
level-up asks one study-guide question. Get it right and you choose your upgrade.

**Play:** open `index.html` in any browser (phone or computer). Nothing to install.

## How it teaches

- **Five acts in order — M, A, I, N, then the Spark** — each with its own monsters and a boss.
  Militarism brutes, Alliance creatures that call their allies when you hit one, Imperialism grabbers that steal
  your gems, Nationalism zealots that charge and never back down.
- **Level up → question → upgrade.** Miss it and you see the right answer; that question comes back soon.
- **Treasure chests → bonus rounds** built from the study guide: Pick a Side, name the Central Powers,
  put the Chain Reaction in order, Long-term or Spark?, Clue Match, Fill the Telegram, M.A.I.N. or Not?
- **Boss shields** only break with a right answer. Go down and a 3-question **Last Stand** can revive you.
- **Quiz Readiness** tracks all 65 facts from the study guide. Every bar at 100% means you are ready.
- **Practice Test** (with type-the-answer questions) and **Study Notes** are on the main menu.

Coins buy permanent upgrades and characters, and beating the game unlocks harder Danger levels.

## Controls

| | |
|---|---|
| Move | WASD / arrow keys, or drag anywhere on a touch screen |
| Answer | tap, or keys 1–4 |
| Pause | Esc or P, or the pause button |

## Project layout

```
index.html          built single-file game (generated — do not edit)
build.py            bundles src/ into index.html and dist/artifact.html
src/base.css        design tokens + shared components
src/js/data.js      study-guide facts and the question bank
src/js/quiz.js      question cards, bonus rounds, practice test, study notes, mastery tracking
src/js/game*.js     the action game (data, renderer, engine)
src/js/meta.js      menus, shop, characters, achievements, results
src/js/audio.js     procedural sound effects and music (no audio files)
```

Rebuild after editing anything in `src/`:

```
python3 build.py
```
