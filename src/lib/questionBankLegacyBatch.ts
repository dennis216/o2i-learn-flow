import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../integrations/supabase/types.ts';
import { QUESTION_HEADERS, OPTION_HEADERS, legacyArenaSource, type LegacyArenaSource, type WorkbookSheet } from './questionBankImport.ts';

export interface LegacyBatchAsset { path: string; sha256: string; bytes: Uint8Array<ArrayBuffer>; previewUrl: string }
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Arena batch object');
  return value as Record<string, unknown>;
};
const rows = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) throw new Error('Missing Arena batch rows');
  return value.map(object);
};
const digest = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
  .map(n => n.toString(16).padStart(2, '0')).join('');

/** Explicit native intake; ordinary XLSX never receives this source context. Server rechecks provenance. */
export async function parseLegacyArenaBatch(value: unknown, publicImageBase: string) {
  const batch = object(value), questions = rows(batch.questions), options = rows(batch.options), sources = rows(batch.sources);
  if (!questions.length || questions.length > 50) throw new Error('Arena batches contain 1–50 questions');
  const legacySources = new Map<string, LegacyArenaSource>();
  for (const source of sources) {
    const id = `arena_legacy_${source.source_id}`, evidence = legacyArenaSource(source, id);
    if (!evidence || evidence.batch_id !== batch.batch_id || evidence.conversion_version !== batch.conversion_version || legacySources.has(id))
      throw new Error('Invalid or duplicate Arena source evidence');
    legacySources.set(id, evidence);
  }
  if (legacySources.size !== questions.length) throw new Error('Every Arena question needs one unique source');
  const ids = new Set<string>();
  for (const question of questions) {
    if (typeof question.external_id !== 'string' || !legacySources.has(question.external_id) || ids.has(question.external_id)) throw new Error('Invalid or duplicate Arena identity');
    ids.add(question.external_id);
    if (question.calculator_policy !== 'no_calculator') throw new Error('This intake requires non-calculator questions');
    for (const field of ['human_review_status', 'math_review_status', 'source_rights_status', 'taxonomy_review_status', 'render_review_status'])
      if (question[field] !== 'pending') throw new Error('Arena intake cannot claim human approval');
    if (question.reviewed_by || question.reviewed_at) throw new Error('Arena intake cannot invent a human reviewer');
  }
  const assets: LegacyBatchAsset[] = [];
  for (const asset of rows(batch.assets)) {
    if (typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256) || asset.path !== `arena-legacy/${asset.sha256}.png`
      || typeof asset.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.base64)) throw new Error('Invalid Arena image');
    if (assets.some(a => a.path === asset.path)) throw new Error('Duplicate Arena image');
    const bytes = Uint8Array.from(atob(asset.base64), c => c.charCodeAt(0));
    if (bytes.length < 8 || Array.from(bytes.slice(0, 8)).join(',') !== '137,80,78,71,13,10,26,10' || await digest(bytes) !== asset.sha256)
      throw new Error('Arena image bytes do not match their hash');
    if (!questions.some(q => q.image_url === publicImageBase + asset.path)) throw new Error('Unreferenced Arena image');
    assets.push({ path: asset.path, sha256: asset.sha256, bytes, previewUrl: `data:image/png;base64,${asset.base64}` });
  }
  for (const q of questions) if ((q.requires_figure || q.image_url) && !assets.some(a => q.image_url === publicImageBase + a.path))
    throw new Error('Arena question is missing its checked image');
  const sheetRows = (items: Record<string, unknown>[], headers: readonly string[]) => items.map(item => headers.map(header => {
    const cell = item[header];
    if (cell != null && !['string', 'number', 'boolean'].includes(typeof cell)) throw new Error('Invalid Arena cell');
    return cell == null ? null : cell as string | number | boolean;
  }));
  const sheets: WorkbookSheet[] = [
    { sheet: 'Questions', data: [[...QUESTION_HEADERS], ...sheetRows(questions, QUESTION_HEADERS)] },
    { sheet: 'Options', data: [[...OPTION_HEADERS], ...sheetRows(options, OPTION_HEADERS)] },
    { sheet: 'Instructions', data: [['Native Arena batch; human review pending.']] },
  ];
  return { sheets, legacySources, assets };
}

/** Called only by Save drafts. Existing images are verified, never overwritten. */
export async function uploadLegacyArenaAssets(client: SupabaseClient<Database>, assets: readonly LegacyBatchAsset[]) {
  const bucket = client.storage.from('practice-images');
  for (const asset of assets) {
    if (await digest(asset.bytes) !== asset.sha256) throw new Error('Arena image changed after preview');
    const existing = await bucket.download(asset.path);
    if (existing.error) {
      const uploaded = await bucket.upload(asset.path, new Blob([asset.bytes], { type: 'image/png' }), { contentType: 'image/png', upsert: false });
      if (uploaded.error) {
        const raced = await bucket.download(asset.path);
        if (raced.error || !raced.data || await digest(new Uint8Array(await raced.data.arrayBuffer())) !== asset.sha256)
          throw new Error('Arena image upload failed; no drafts were saved');
      }
    }
    const stored = await bucket.download(asset.path);
    if (stored.error || !stored.data || await digest(new Uint8Array(await stored.data.arrayBuffer())) !== asset.sha256)
      throw new Error('Arena image readback failed; no drafts were saved');
  }
}
