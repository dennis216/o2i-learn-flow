import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeQuestionBankMath } from '../../../src/lib/questionBankMath.ts';
import { privateDirectory, sha256, verifySnapshot } from './snapshot.mjs';

const [directory] = process.argv.slice(2);
assert.ok(directory, 'Usage: node --experimental-strip-types convert.mjs <private-snapshot-directory>');
const privatePath = privateDirectory(directory);
const manifest = verifySnapshot(privatePath);
const snapshot = JSON.parse(readFileSync(resolve(privatePath, 'snapshot.json'), 'utf8'));
const python = fileURLToPath(new URL('./convert.py', import.meta.url));
const conversionVersion = 'svg-v1-' + sha256(readFileSync(python)).slice(0, 12);
const converted = JSON.parse(execFileSync('python3', [python], { input: JSON.stringify(snapshot.rows), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
assert.deepEqual(converted.map(q => q.source_id), snapshot.rows.map(r => r.source.id));
for (const q of converted.filter(q => q.status === 'converted_unreviewed')) {
 const failures = [q.stem, q.solution, ...q.options].flatMap(text => analyzeQuestionBankMath(text).issues);
 if (failures.length) { q.status = 'excluded'; q.reason = 'latex_validation_failed'; }
}
const payload = JSON.stringify({ snapshot_sha256: manifest.snapshot_sha256, conversion_version: conversionVersion, items: converted }, null, 2) + '\n';
const output = resolve(privatePath, conversionVersion + '.json');
if (existsSync(output)) assert.equal(readFileSync(output, 'utf8'), payload, 'Conversion changed without a version change.');
else writeFileSync(output, payload, { flag: 'wx', mode: 0o600 });
const reasons = {};
for (const q of converted.filter(q => q.status === 'excluded')) reasons[q.reason] = (reasons[q.reason] ?? 0) + 1;
console.log(JSON.stringify({ conversion_version: conversionVersion, total: converted.length, converted_unreviewed: converted.filter(q => q.status === 'converted_unreviewed').length, excluded: converted.filter(q => q.status === 'excluded').length, reasons, output_sha256: sha256(payload) }));
