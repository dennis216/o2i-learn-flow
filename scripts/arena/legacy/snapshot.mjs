// Read-only production export. Real content must remain outside the repository.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const hasGraph = q => q.graph != null;
const hasTable = q => Boolean(q.table_html?.trim());

export function inventory(rows) {
  assert.ok(Array.isArray(rows) && rows.length, 'Empty legacy bank.');
  assert.equal(new Set(rows.map(r => r.source.id)).size, rows.length, 'Duplicate source IDs.');
  const groups = { text: [], graph: [], table: [], mixed: [] };
  const units = {};
  const stems = new Map();
  for (const { source: q, source_sha256: hash } of rows) {
    assert.match(q.id, /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/, 'Unexpected legacy ID.');
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(q.unit) && q.unit >= 1 && q.unit <= 10);
    assert.ok([1, 2, 3].includes(q.tier));
    assert.ok([q.stem, q.explanation, q.topic].every(v => typeof v === 'string' && v.trim()));
    assert.ok(Array.isArray(q.options) && q.options.length === 4 && q.options.every(v => typeof v === 'string' && v.trim()));
    const kind = hasGraph(q) ? hasTable(q) ? 'mixed' : 'graph' : hasTable(q) ? 'table' : 'text';
    groups[kind].push(q);
    units[q.unit] = (units[q.unit] ?? 0) + 1;
    const stem = q.stem.trim().toLowerCase().replace(/\s+/g, ' ');
    stems.set(stem, [...(stems.get(stem) ?? []), q.id]);
  }
  for (const group of Object.values(groups)) group.sort((a, b) => a.unit - b.unit || natural(a.id, b.id));
  const pilot = [];
  for (let unit = 1; unit <= 10; unit++) {
    const q = groups.text.find(q => q.unit === unit);
    if (q) pilot.push(q.id);
  }
  pilot.push(...groups.graph.slice(0, 5).map(q => q.id), ...groups.table.slice(0, 5).map(q => q.id));
  const selected = new Set(pilot);
  const batches = [{ id: 'pilot', source_ids: pilot }];
  for (const [kind, items] of Object.entries(groups)) {
    for (let unit = 1; unit <= 10; unit++) {
      const ids = items.filter(q => q.unit === unit && !selected.has(q.id)).map(q => q.id);
      for (let n = 0; n < ids.length; n += 50) batches.push({ id: `${kind}-u${unit}-${n / 50 + 1}`, source_ids: ids.slice(n, n + 50) });
    }
  }
  assert.equal(batches.flatMap(b => b.source_ids).length, rows.length, 'Batch coverage mismatch.');
  assert.equal(new Set(batches.flatMap(b => b.source_ids)).size, rows.length, 'Batch overlap.');
  return {
    total: rows.length, active: rows.filter(r => r.source.active).length, units,
    representations: Object.fromEntries(Object.entries(groups).map(([kind, values]) => [kind, values.length])),
    same_stem_groups: [...stems.values()].filter(ids => ids.length > 1).map(ids => ids.sort(natural)),
    items: rows.map(r => ({ source_id: r.source.id, external_id: `arena_legacy_${r.source.id}`, source_sha256: r.source_sha256, status: 'pending' })),
    batches,
  };
}

export function privateDirectory(path, repository = root) {
  const output = resolve(path);
  let parent = output;
  while (!existsSync(parent)) parent = dirname(parent);
  const actual = resolve(realpathSync(parent), relative(parent, output));
  const rel = relative(realpathSync(repository), actual);
  assert.ok(isAbsolute(rel) || rel === '..' || rel.startsWith('../'), 'Export directory must be outside the repository, including symlinks.');
  return actual;
}

export function verifySnapshot(directory) {
  const raw = readFileSync(resolve(directory, 'snapshot.json'), 'utf8');
  const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
  assert.equal(sha256(raw), manifest.snapshot_sha256, 'Frozen snapshot changed.');
  const snapshot = JSON.parse(raw);
  assert.deepEqual(inventory(snapshot.rows), manifest.inventory, 'Frozen inventory changed.');
  return manifest;
}

export const exportQuery = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL timezone='UTC';
SELECT jsonb_build_object(
 'exported_at',now(),
 'rows',(SELECT jsonb_agg(jsonb_build_object('source',to_jsonb(q),'source_sha256',encode(extensions.digest(to_jsonb(q)::text,'sha256'),'hex')) ORDER BY q.unit,length(q.id),q.id) FROM public.arena_questions q),
 'topics',(SELECT jsonb_agg(jsonb_build_object('id',t.id,'topic_code',t.topic_code,'title',t.title,'is_bc_only',t.is_bc_only,'unit',u.unit_number) ORDER BY u.unit_number,t.order_index,t.id) FROM public.curriculum_topics t JOIN public.curriculum_units u ON u.id=t.unit_id),
 'skills',(SELECT jsonb_agg(jsonb_build_object('id',id,'skill_code',skill_code,'description',description) ORDER BY skill_code) FROM public.curriculum_practice_skills),
 'existing_external_ids',(SELECT jsonb_agg(external_id ORDER BY external_id) FROM public.questions),
 'existing_stem_hashes',(SELECT jsonb_agg(DISTINCT md5(lower(regexp_replace(btrim(stem),'\\s+',' ','g')))) FROM public.question_versions)
) AS snapshot;
COMMIT;`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, outputArgument] = process.argv.slice(2);
  assert.ok(['export', 'verify'].includes(mode) && outputArgument, 'Usage: node snapshot.mjs export|verify <private-directory>');
  const output = privateDirectory(outputArgument);
  if (mode === 'verify') {
    const manifest = verifySnapshot(output);
    console.log(JSON.stringify({ verified: true, total: manifest.inventory.total, snapshot_sha256: manifest.snapshot_sha256 }));
  } else {
    assert.ok(!existsSync(output), 'Choose a new export directory; frozen inputs are never overwritten.');
    const project = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8').match(/^project_id\s*=\s*"([a-z]+)"/m)?.[1];
    assert.equal(project, 'lxoaeaewcrshjkigzyqe', 'Unexpected production project.');
    const token = process.env.SUPABASE_ACCESS_TOKEN ?? readFileSync(resolve(homedir(), '.supabase/access-token'), 'utf8').trim();
    const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: exportQuery, read_only: true }), signal: AbortSignal.timeout(45000),
    });
    assert.ok(response.ok, `Read-only export failed: HTTP ${response.status}`);
    const result = await response.json();
    const snapshot = result[0]?.snapshot;
    assert.ok(snapshot?.rows, 'Unexpected export result.');
    const summary = inventory(snapshot.rows);
    const raw = JSON.stringify(snapshot, null, 2) + '\n';
    const manifest = { project, exported_at: snapshot.exported_at, snapshot_sha256: sha256(raw), inventory: summary };
    mkdirSync(output, { recursive: true, mode: 0o700 });
    writeFileSync(resolve(output, 'snapshot.json'), raw, { flag: 'wx', mode: 0o600 });
    writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    verifySnapshot(output);
    console.log(JSON.stringify({ exported: true, total: summary.total, active: summary.active, representations: summary.representations, batches: summary.batches.length, snapshot_sha256: manifest.snapshot_sha256 }));
  }
}
