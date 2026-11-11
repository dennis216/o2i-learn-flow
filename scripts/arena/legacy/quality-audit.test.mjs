import assert from 'node:assert/strict';
import test from 'node:test';
import { auditRow, summarize, auditQuery } from './quality-audit.mjs';

const row = (overrides = {}) => ({ external_id: 'arena_legacy_synthetic', status: 'approved', version_id: 'v', version_number: 1, is_current: true,
  stem: 'Find $\\lim_{x\\to 0} x$.', requires_figure: false, image_url: null, source_has_graph: false, source_has_table: false,
  options: [{ key: 'A', is_correct: true }, { key: 'B', is_correct: false }, { key: 'C', is_correct: false }, { key: 'D', is_correct: false }], ...overrides });

test('reports the Practice display position of the correct option', () => {
  assert.equal(auditRow(row()).practice_correct_position, 'A');
  const shuffled = row({ options: [{ key: 'A', is_correct: false }, { key: 'B', is_correct: false }, { key: 'C', is_correct: true }, { key: 'D', is_correct: false }] });
  assert.equal(auditRow(shuffled).practice_correct_position, 'C');
  assert.deepEqual(auditRow(row({ options: [{ key: 'A', is_correct: false }, { key: 'B', is_correct: false }] })).issues, ['correct_option_count_0']);
});

test('flags figure language that has no image, but not analytic uses of "graph" or tables shown inline', () => {
  assert.deepEqual(auditRow(row({ stem: 'The graph of $f$ is shown below. Find $f(2)$.' })).issues,
    ['figure_language_without_image', 'figure_language_but_requires_figure_false']);
  assert.deepEqual(auditRow(row({ stem: 'The graph of $f$ is shown below.', requires_figure: true, image_url: 'https://x/y.png' })).issues, []);
  assert.deepEqual(auditRow(row({ stem: 'What is the slope of the graph of $y=x^2$ at $x=1$?' })).issues, []);
  assert.deepEqual(auditRow(row({ stem: 'The table below gives values of $f$.\n\n| x | f |\n| --- | --- |\n| 1 | 2 |' })).issues, []);
  assert.deepEqual(auditRow(row({ stem: 'Using the table below, estimate $f\'(1)$.' })).issues,
    ['table_language_without_table', 'figure_language_but_requires_figure_false']);
  assert.deepEqual(auditRow(row({ requires_figure: true })).issues, ['requires_figure_without_image']);
});

test('summary separates legacy and other questions by status and records whether the source had a graph', () => {
  const items = [row(), row({ stem: 'In the figure, find the area.' }), row({ external_id: 'ced_1', status: 'draft',
    options: [{ key: 'A', is_correct: false }, { key: 'B', is_correct: true }, { key: 'C', is_correct: false }, { key: 'D', is_correct: false }] })].map(auditRow);
  const summary = summarize(items);
  assert.deepEqual(summary['legacy:approved'].practice_correct_position, { A: 2 });
  assert.equal(summary['legacy:approved'].issues.figure_missing_source_had_no_graph, 1);
  assert.deepEqual(summary['other:draft'].practice_correct_position, { B: 1 });
});

test('query is a read-only transaction that never writes', () => {
  assert.match(auditQuery, /^BEGIN READ ONLY;/);
  assert.doesNotMatch(auditQuery, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|TRUNCATE)\b/i);
});
