# Historical comparison fixtures

`legacy-zh-CN.json` is the frozen translation corpus used only by the archived `prepare-game.mjs --out` comparison tool and its validation tests. It is not loaded by the playable game and is not a translation-authoring input.

Maintain current English/Chinese game text directly in `public/games/limit-arena.js`. Do not change this fixture expecting a browser translation to change.
