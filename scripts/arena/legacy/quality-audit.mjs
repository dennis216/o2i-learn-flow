// Read-only quality audit for the formal question bank: where the correct option lands in
// Practice, and stems that refer to a figure the version does not carry. Writes the per-question
// list only to a private directory outside the repository; prints aggregate counts only.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateDirectory } from './snapshot.mjs';

// "shown below", "the graph of f' is shown", "in the figure", "the table above" ...
const FIGURE_PHRASE = /\b(?:shown|pictured|depicted|illustrated|sketched|drawn|given)\s+(?:below|above|here|at (?:the )?(?:right|left))\b|\b(?:below|above)\s+is\b|\b(?:in|from|on|using)\s+the\s+(?:graph|figure|diagram|picture|table|sketch)\b|\bthe\s+(?:graph|figure|diagram|table)\s+(?:below|above)\b|\b(?:figure|diagram)\b/i;
const TABLE_PHRASE = /\btable\b/i;
const GRAPH_PHRASE = /\b(?:graph|figure|diagram|picture|sketch|curve|plot)\b/i;
const MARKDOWN_TABLE = /^\s*\|.*\|\s*$/m;

export function auditRow(row) {
  const options = row.options ?? [];
  const correct = options.flatMap((o, i) => o.is_correct ? [i] : []);
  const figurePhrase = FIGURE_PHRASE.test(row.stem);
  const hasTable = MARKDOWN_TABLE.test(row.stem), hasImage = !!row.image_url;
  // A table reference is satisfied by an inline table; anything else that reads as a picture needs an image.
  const needsPicture = figurePhrase && (GRAPH_PHRASE.test(row.stem) || !TABLE_PHRASE.test(row.stem));
  const needsTable = figurePhrase && TABLE_PHRASE.test(row.stem);
  const issues = [
    ...(correct.length === 1 ? [] : ['correct_option_count_' + correct.length]),
    ...(needsPicture && !hasImage ? ['figure_language_without_image'] : []),
    ...(needsTable && !hasTable && !hasImage ? ['table_language_without_table'] : []),
    ...(figurePhrase && !row.requires_figure && !hasTable ? ['figure_language_but_requires_figure_false'] : []),
    ...(row.requires_figure && !hasImage ? ['requires_figure_without_image'] : []),
  ];
  return {
    external_id: row.external_id, status: row.status, version_id: row.version_id, version_number: row.version_number,
    is_current: row.is_current, legacy: row.external_id.startsWith('arena_legacy_'),
    // Practice shows options ORDER BY order_index,id and labels them with the stored key.
    practice_correct_position: correct.length === 1 ? 'ABCDEF'[correct[0]] : null,
    practice_correct_key: correct.length === 1 ? options[correct[0]].key : null,
    requires_figure: row.requires_figure, image_url: row.image_url ?? null, has_inline_table: hasTable,
    figure_language: figurePhrase, source_has_graph: row.source_has_graph ?? null, source_has_table: row.source_has_table ?? null,
    issues,
  };
}

export function summarize(items) {
  const groups = {};
  for (const item of items) {
    const name = (item.legacy ? 'legacy' : 'other') + ':' + item.status;
    const g = groups[name] ??= { questions: 0, practice_correct_position: {}, issues: {} };
    g.questions++;
    const p = item.practice_correct_position ?? 'invalid';
    g.practice_correct_position[p] = (g.practice_correct_position[p] ?? 0) + 1;
    for (const issue of item.issues) g.issues[issue] = (g.issues[issue] ?? 0) + 1;
    if (item.legacy && item.issues.includes('figure_language_without_image')) {
      const key = 'figure_missing_source_' + (item.source_has_graph ? 'had_graph' : 'had_no_graph');
      g.issues[key] = (g.issues[key] ?? 0) + 1;
    }
  }
  return groups;
}

// Current version for published questions, newest version otherwise. Option order matches Practice.
export const auditQuery = `BEGIN READ ONLY; SET LOCAL timezone='UTC';
SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.external_id),'[]'::jsonb) AS rows FROM (
  SELECT q.external_id,q.status::text AS status,v.id AS version_id,v.version_number,(v.id=q.current_version_id) AS is_current,
    v.stem,v.requires_figure,v.image_url,
    (SELECT jsonb_agg(jsonb_build_object('key',o.option_key,'is_correct',o.is_correct) ORDER BY o.order_index,o.id)
       FROM public.question_options o WHERE o.question_version_id=v.id) AS options,
    CASE WHEN a.id IS NULL THEN NULL ELSE a.graph IS NOT NULL END AS source_has_graph,
    CASE WHEN a.id IS NULL THEN NULL ELSE a.table_html IS NOT NULL END AS source_has_table
  FROM public.questions q
  JOIN LATERAL (SELECT * FROM public.question_versions x WHERE x.question_id=q.id
    ORDER BY (x.id=q.current_version_id) DESC,x.version_number DESC LIMIT 1) v ON true
  LEFT JOIN public.arena_questions a ON q.external_id='arena_legacy_'||a.id
) r; COMMIT;`;

async function checkImage(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const type = response.headers.get('content-type') ?? '';
    const bytes = response.ok ? (await response.arrayBuffer()).byteLength : 0;
    return response.ok && type.startsWith('image/') && bytes > 0 ? 'ok' : `failed_${response.status}_${type.split(';')[0] || 'no_type'}`;
  } catch (error) { return 'failed_' + (error.name || 'error'); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory] = process.argv.slice(2);
  assert.ok(directory, 'Usage: quality-audit.mjs <private-directory-outside-repo>');
  const base = privateDirectory(directory);
  const project = 'lxoaeaewcrshjkigzyqe', token = process.env.SUPABASE_ACCESS_TOKEN ?? readFileSync(resolve(homedir(), '.supabase/access-token'), 'utf8').trim();
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, { method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: auditQuery, read_only: true }), signal: AbortSignal.timeout(60000) });
  const result = await response.json();
  assert.ok(response.ok, 'Read-only audit failed: ' + String(result.message ?? response.status).split('\n')[0]);
  const rows = result[0]?.rows; assert.ok(Array.isArray(rows), 'Unexpected audit result shape');
  const items = rows.map(auditRow);
  for (const item of items) if (item.image_url) {
    item.image_load = await checkImage(item.image_url);
    if (item.image_load !== 'ok') item.issues.push('image_load_' + item.image_load);
  }
  const report = { at: new Date().toISOString(), project, read_only: true, summary: summarize(items), items };
  const file = resolve(base, `quality-audit-${report.at.replaceAll(':', '-')}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ file, read_only: true, summary: report.summary }, null, 2));
}
