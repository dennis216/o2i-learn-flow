// Forward-only source compatibility; existing question rows and review hashes are untouched.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
const write = (path, value) => writeFileSync(new URL('../../../' + path, import.meta.url), value);
const version = '20261105020000', name = 'question_bank_legacy_arena_source';
const fn = (path, name) => {
 const match = read(path).match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$[\\s\\S]*?\\$\\$;`));
 assert.ok(match, name); return match[0].replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
};
const replace = (text, before, after) => {
 assert.equal(text.split(before).length, 2, 'Expected one source match: ' + before.slice(0, 80));
 return text.replace(before, () => after);
};
const helper = `CREATE FUNCTION public.question_bank_legacy_arena_source(_evidence jsonb,_external_id text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions SET timezone='UTC' AS $$
 SELECT coalesce(jsonb_typeof(_evidence->'legacy_arena')='object'
  AND jsonb_typeof(_evidence->'legacy_arena'->'source_id')='string'
  AND (_evidence->'legacy_arena'->>'source_sha256') ~ '^[a-f0-9]{64}$'
  AND nullif(btrim(_evidence->'legacy_arena'->>'batch_id'),'') IS NOT NULL
  AND nullif(btrim(_evidence->'legacy_arena'->>'conversion_version'),'') IS NOT NULL
  AND (_external_id IS NULL OR _external_id='arena_legacy_'||(_evidence->'legacy_arena'->>'source_id'))
  AND EXISTS(SELECT 1 FROM public.arena_questions q WHERE q.id=_evidence->'legacy_arena'->>'source_id'
   AND encode(extensions.digest(to_jsonb(q)::text,'sha256'),'hex')=_evidence->'legacy_arena'->>'source_sha256'),false);
$$;
REVOKE ALL ON FUNCTION public.question_bank_legacy_arena_source(jsonb,text) FROM PUBLIC,anon,authenticated;
`;
const oldSave = fn('supabase/migrations/20261004000000_question_bank_draft_import.sql','save_question_bank_drafts');
const start = oldSave.indexOf('    source_document_value :=');
const end = oldSave.indexOf('    SELECT id INTO topic_id_value', start);
assert.ok(start>0 && end>start);
let save = oldSave.slice(0,start) + `    IF item->'import_evidence' ? 'legacy_arena' THEN
      IF NOT public.question_bank_legacy_arena_source(item->'import_evidence',external_id_value)
       OR item->>'source_document' IS DISTINCT FROM 'Legacy Arena bank'
       OR nullif(item->>'source_page','') IS NOT NULL
       OR nullif(item->>'source_question_number','') IS NOT NULL
       OR nullif(item->>'source_locator','') IS NOT NULL THEN
        RAISE EXCEPTION 'Draft save rejected: invalid or changed legacy Arena source.' USING ERRCODE='23514';
      END IF;
      source_document_value:='Legacy Arena bank';source_page_start:=NULL;source_page_end:=NULL;
      printed_number:=NULL;locator:=NULL;
    ELSE
${oldSave.slice(start,end)}    END IF;

` + oldSave.slice(end);
save = replace(save, 'CASE WHEN source_page_end > source_page_start THEN source_page_text ELSE NULL END',
 "CASE WHEN item->'import_evidence' ? 'legacy_arena' THEN 'arena:'||(item->'import_evidence'->'legacy_arena'->>'source_id') WHEN source_page_end > source_page_start THEN source_page_text ELSE NULL END");
const oldEdit = fn('supabase/migrations/20261018000000_question_bank_draft_management.sql','update_question_bank_draft_metadata');
const pageStart = oldEdit.indexOf("  page_text := _metadata->>'source_page';");
const pageEnd = oldEdit.indexOf('  before_values :=',pageStart);
assert.ok(pageStart>0 && pageEnd>pageStart);
let edit = oldEdit.slice(0,pageStart)+`  IF v.import_evidence ? 'legacy_arena' THEN
    IF NOT public.question_bank_legacy_arena_source(v.import_evidence,q.external_id)
      OR nullif(_metadata->>'source_page','') IS NOT NULL OR nullif(_metadata->>'source_locator','') IS NOT NULL THEN
      RAISE EXCEPTION 'Draft update rejected: legacy Arena provenance is read-only or changed.' USING ERRCODE='23514';
    END IF;
    page_start:=NULL;page_end:=NULL;page_text:=NULL;locator:=NULL;
  ELSE
${oldEdit.slice(pageStart,pageEnd)}  END IF;
`+oldEdit.slice(pageEnd);
edit=replace(edit,"('calculator_policy','source_locator','practice_skill_codes')", "('calculator_policy','source_locator','practice_skill_codes','source_page')");
edit=replace(edit,"OR jsonb_typeof(_metadata->'source_locator') NOT IN ('string','null')", "OR jsonb_typeof(_metadata->'source_locator') NOT IN ('string','null')\n    OR jsonb_typeof(_metadata->'source_page') NOT IN ('string','null')");
const oldIssues=fn('supabase/migrations/20261020000000_question_bank_simple_publication.sql','question_bank_content_issues');
const issueStart=oldIssues.indexOf("  IF btrim(v.source_document)");
const issueEnd=oldIssues.indexOf('  IF v.requires_figure',issueStart);
assert.ok(issueStart>0 && issueEnd>issueStart);
const issues=oldIssues.slice(0,issueStart)+`  IF v.import_evidence ? 'legacy_arena' THEN
    IF NOT public.question_bank_legacy_arena_source(v.import_evidence,(SELECT external_id FROM public.questions WHERE id=_question_id))
      OR v.source_document<>'Legacy Arena bank' OR v.source_page IS NOT NULL
      OR v.source_question_number IS NOT NULL OR v.source_locator IS NOT NULL
      OR v.source_reference IS DISTINCT FROM 'arena:'||(v.import_evidence->'legacy_arena'->>'source_id') THEN
      issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_LEGACY_SOURCE','field','source_document','message','The legacy Arena source changed or is incomplete.'));
    END IF;
  ELSE
${oldIssues.slice(issueStart,issueEnd)}  END IF;
`+oldIssues.slice(issueEnd);
const source=`-- Verified legacy Arena provenance uses the existing evidence object. No new version columns,
-- no historical row updates, and no invalidation of existing PDF review fingerprints.
${helper}
ALTER TABLE public.question_versions ALTER COLUMN source_page DROP NOT NULL;
ALTER TABLE public.question_versions DROP CONSTRAINT question_versions_source_identity_check;
ALTER TABLE public.question_versions ADD CONSTRAINT question_versions_source_identity_check CHECK (
 nullif(btrim(source_question_number),'') IS NOT NULL OR nullif(btrim(source_locator),'') IS NOT NULL
 OR (import_evidence ? 'legacy_arena' AND public.question_bank_legacy_arena_source(import_evidence)));
ALTER TABLE public.question_versions ADD CONSTRAINT question_versions_source_page_kind CHECK (
 CASE WHEN import_evidence ? 'legacy_arena' THEN source_page IS NULL
  AND source_document='Legacy Arena bank' AND source_question_number IS NULL AND source_locator IS NULL
  AND source_reference IS NOT DISTINCT FROM 'arena:'||(import_evidence->'legacy_arena'->>'source_id')
  AND public.question_bank_legacy_arena_source(import_evidence)
 ELSE source_page IS NOT NULL AND source_page>0 END);

${save}

${edit}

${issues}
`;
write(`supabase/migrations/${version}_${name}.sql`,source);
const digest=s=>createHash('md5').update(s).digest('hex');
const signatures=['save_question_bank_drafts(jsonb)','update_question_bank_draft_metadata(uuid,uuid,text,jsonb)','question_bank_content_issues(uuid,uuid)'];
const matches=(signature,sql)=>`EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.${signature}') AND md5(replace(prosrc,E'\\r',''))='${digest(sql.match(/AS \$\$([\s\S]*?)\$\$/)[1])}')`;
const baseline=[oldSave,oldEdit,oldIssues].map((sql,i)=>matches(signatures[i],sql)).join(' AND ');
const installed=[save,edit,issues].map((sql,i)=>matches(signatures[i],sql)).join(' AND ');
const absent=`NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}') AND to_regprocedure('public.question_bank_legacy_arena_source(jsonb,text)') IS NULL`;
write('docs/arena/legacy-import/00_preflight_readonly.sql',`-- No question content or account data.\nSELECT (${baseline}) AS known_functions_match,(${absent}) AS target_absent,to_regclass('public.arena_questions') IS NOT NULL AS legacy_table_present;\n`);
write('docs/arena/legacy-import/10_source_deploy.sql',`-- Targeted source compatibility only. Does not import, review, publish or alter existing questions.\nBEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='30s';\nDO $deploy$\nDECLARE source_sql text:=$legacy_source$${source}$legacy_source$;\nBEGIN\n LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;\n IF NOT (${absent}) OR NOT (${baseline}) THEN RAISE EXCEPTION 'Legacy source baseline mismatch or already installed; stop.'; END IF;\n EXECUTE source_sql;\n IF NOT (${installed}) THEN RAISE EXCEPTION 'Legacy source post-install check failed; rollback.'; END IF;\n INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${name}',ARRAY[source_sql]);\nEND;\n$deploy$;\nCOMMIT;\n`);
write('docs/arena/legacy-import/20_source_verify_readonly.sql',`SELECT (${installed}) AND EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}' AND name='${name}' AND cardinality(statements)=1 AND md5(statements[1])='${digest(source)}') AND NOT has_function_privilege('authenticated','public.question_bank_legacy_arena_source(jsonb,text)','EXECUTE') AND NOT has_function_privilege('anon','public.question_bank_legacy_arena_source(jsonb,text)','EXECUTE') AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.question_versions'::regclass AND conname='question_versions_source_page_kind' AND convalidated) AS all_checks_pass;\n`);
console.log('Generated guarded legacy source migration and release SQL.');
