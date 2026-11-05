import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const name='o2i-reconciliation-baseline-'+process.pid;
const d=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const sql=s=>d(['exec','-i',name,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],s);
d(['run','--pull','never','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust','public.ecr.aws/supabase/postgres:17.11.0.002']);
try {
 for(let n=0;;n++){try{if(sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated')")==='2')break;}catch{}if(n>120)throw Error('Not ready');await new Promise(r=>setTimeout(r,200));}
 const source=readFileSync('supabase/migrations/20261104000100_arena_game.sql','utf8');
 sql(`DO $$ DECLARE r record; BEGIN FOR r IN SELECT evtname FROM pg_event_trigger LOOP EXECUTE format('ALTER EVENT TRIGGER %I DISABLE',r.evtname); END LOOP; END $$;
 CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
 CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO postgres,anon,authenticated; GRANT USAGE,CREATE ON SCHEMA public TO postgres;
 SET ROLE postgres;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
 ${source}`);
 const catalog=JSON.parse(sql('SET search_path=public,pg_catalog;'+readFileSync('scripts/migrations/arena-catalog.sql','utf8')));
 writeFileSync('docs/database-reconciliation/arena-baseline.json',JSON.stringify({source_md5:createHash('md5').update(source).digest('hex'),postgres_major:17,catalog},null,2)+'\n');
 console.log('Baseline built from unchanged Arena migration in disposable PostgreSQL.');
}finally{d(['rm','-f',name]);}
