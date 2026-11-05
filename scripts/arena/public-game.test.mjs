import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const game = readFileSync(new URL('../../public/games/limit-arena.html', import.meta.url), 'utf8');

test('the public game holds no question data or test hooks', () => {
  for (const banned of ['QBANK', '"exp":', '"stem":', 'correctKey', '__dbg', 'render_game_to_text', 'advanceTime']) {
    assert.ok(!game.includes(banned), banned);
  }
  assert.ok(game.length < 800_000, 'the game grew enough to suggest question data came back');
});

test('the public game gets questions only through its host page', () => {
  assert.ok(game.includes('limit-arena-host'));
  assert.ok(!/fetch\(|supabase|XMLHttpRequest/i.test(game));
});
