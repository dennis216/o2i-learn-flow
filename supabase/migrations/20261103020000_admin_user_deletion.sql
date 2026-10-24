-- Permanent account deletion never cascades into public content or rewrites provenance.
CREATE TABLE public.admin_user_deletion_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,target_user_id uuid NOT NULL,
 target_email text NOT NULL,outcome text NOT NULL CHECK(outcome IN ('deleted','failed')),
 details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.admin_user_deletion_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.admin_user_deletion_audit TO authenticated;
CREATE POLICY owner_read_deletion_audit ON public.admin_user_deletion_audit FOR SELECT TO authenticated
 USING(public.has_admin_module('users'));
CREATE TABLE public.admin_user_deletion_requests (
 target_user_id uuid PRIMARY KEY,actor_id uuid NOT NULL,target_email text NOT NULL,
 expires_at timestamptz NOT NULL,personal_data jsonb NOT NULL
);
ALTER TABLE public.admin_user_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_user_deletion_requests FROM anon,authenticated;

-- Public content must remain safe even when a new reference appears concurrently.
DO $preserve_content$ DECLARE f record; BEGIN
 FOR f IN SELECT c.oid,c.conrelid::regclass AS relation,c.conname,pg_get_constraintdef(c.oid) AS definition
 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE c.contype='f' AND n.nspname='public' AND c.confrelid IN ('auth.users'::regclass,'public.profiles'::regclass)
 AND c.confdeltype='c' AND t.relname NOT IN ('profiles','user_roles','user_login_events','enrollments','practice_attempts','user_progress',
 'ai_chat_history','ai_tutor_sessions','question_practice_sessions','question_practice_attempts') LOOP
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I,ADD CONSTRAINT %I %s',f.relation,f.conname,f.conname,replace(f.definition,'ON DELETE CASCADE','ON DELETE RESTRICT'));
 END LOOP;
END $preserve_content$;

CREATE FUNCTION public.inspect_user_deletion(_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE email_value text;profile_id uuid; f record; n bigint; parent_value uuid; blockers jsonb:='[]';personal jsonb:='[]';
BEGIN
 SELECT email INTO email_value FROM auth.users WHERE id=_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Account not found.'; END IF;
 SELECT id INTO profile_id FROM public.profiles WHERE user_id=_user_id;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='super_admin') THEN
  blockers:=blockers||jsonb_build_array(jsonb_build_object('table','user_roles','reason','Super Admin accounts are protected.','count',1));
 END IF;
 FOR f IN SELECT c.conrelid::regclass AS relation,c.confrelid,child.relname AS table_name,
  a.attname AS column_name,b.attname AS parent_column,c.confdeltype,cardinality(c.conkey) AS key_count
 FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
 JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=c.confkey[1]
 WHERE c.contype='f' AND ns.nspname='public' AND c.confrelid IN ('auth.users'::regclass,'public.profiles'::regclass)
 LOOP
  IF f.key_count<>1 THEN RAISE EXCEPTION 'Deletion requires review of a composite account reference.'; END IF;
  parent_value:=CASE WHEN f.confrelid='auth.users'::regclass OR f.parent_column='user_id' THEN _user_id ELSE profile_id END;
  EXECUTE format('SELECT count(*) FROM %s WHERE %I=$1',f.relation,f.column_name) INTO n USING parent_value;
  IF n=0 THEN CONTINUE; END IF;
  IF f.table_name IN ('profiles','user_roles','user_login_events','enrollments','practice_attempts','user_progress',
   'ai_chat_history','ai_tutor_sessions','question_practice_sessions','question_practice_attempts') AND f.confdeltype='c' THEN
   personal:=personal||jsonb_build_array(jsonb_build_object('table',f.table_name,'column',f.column_name,'count',n));
  ELSE
   blockers:=blockers||jsonb_build_array(jsonb_build_object('table',f.table_name,'column',f.column_name,'count',n,
    'reason','Associated content or provenance must be reviewed before permanent deletion.'));
  END IF;
 END LOOP;
 SELECT count(*) INTO n FROM storage.objects o WHERE to_jsonb(o)->>'owner'=_user_id::text
  OR to_jsonb(o)->>'owner_id'=_user_id::text OR o.metadata->>'user_id'=_user_id::text
  OR o.metadata->>'creator'=_user_id::text OR split_part(o.name,'/',1)=_user_id::text;
 IF n>0 THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('table','storage.objects','count',n,
  'reason','Owned files must be reviewed or transferred before permanent deletion.')); END IF;
 RETURN jsonb_build_object('user_id',_user_id,'email',email_value,'can_delete',jsonb_array_length(blockers)=0,
  'blockers',blockers,'personal_data',personal);
END $$;
REVOKE ALL ON FUNCTION public.inspect_user_deletion(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.preview_user_deletion(_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF NOT public.has_admin_module('users') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Super Admin access is required.'; END IF;
 IF _user_id=auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='You cannot delete your own account.'; END IF;
 RETURN public.inspect_user_deletion(_user_id);
END $$;
REVOKE ALL ON FUNCTION public.preview_user_deletion(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_user_deletion(uuid) TO authenticated;

CREATE FUNCTION public.prepare_user_deletion(_user_id uuid,_email text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE preview jsonb;
BEGIN
 IF NOT public.has_admin_module('users') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Super Admin access is required.'; END IF;
 PERFORM 1 FROM auth.users WHERE id=_user_id FOR UPDATE;
 preview:=public.preview_user_deletion(_user_id);
 IF lower(btrim(_email)) IS DISTINCT FROM lower(preview->>'email') THEN RAISE EXCEPTION 'Type the target email address to confirm deletion.'; END IF;
 IF NOT (preview->>'can_delete')::boolean THEN RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='Account has associated content or files. Resolve the listed blockers first.',DETAIL=(preview->'blockers')::text; END IF;
 INSERT INTO public.admin_user_deletion_requests VALUES(_user_id,auth.uid(),preview->>'email',clock_timestamp()+interval '2 minutes',preview->'personal_data')
 ON CONFLICT(target_user_id) DO UPDATE SET actor_id=EXCLUDED.actor_id,target_email=EXCLUDED.target_email,
 expires_at=EXCLUDED.expires_at,personal_data=EXCLUDED.personal_data;
 RETURN preview;
END $$;
REVOKE ALL ON FUNCTION public.prepare_user_deletion(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_user_deletion(uuid,text) TO authenticated;

-- The Auth Admin API uses a separate transaction. Recheck the grant and all blockers inside that delete.
CREATE FUNCTION public.guard_admin_user_deletion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE request public.admin_user_deletion_requests%ROWTYPE; preview jsonb;
BEGIN
 SELECT * INTO request FROM public.admin_user_deletion_requests WHERE target_user_id=OLD.id FOR UPDATE;
 IF NOT FOUND OR request.expires_at<clock_timestamp() OR request.actor_id=OLD.id
 OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=request.actor_id AND role='super_admin') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='A current Super Admin deletion confirmation is required.';
 END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=OLD.id FOR UPDATE;
 preview:=public.inspect_user_deletion(OLD.id);
 IF request.target_email IS DISTINCT FROM OLD.email OR NOT (preview->>'can_delete')::boolean THEN
  RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='Account changed or still has associated content. Refresh the deletion preview.';
 END IF;
 INSERT INTO public.admin_user_deletion_audit(actor_id,target_user_id,target_email,outcome,details)
 VALUES(request.actor_id,OLD.id,OLD.email,'deleted',jsonb_build_object('personal_data',preview->'personal_data'));
 DELETE FROM public.admin_user_deletion_requests WHERE target_user_id=OLD.id;
 RETURN OLD;
END $$;
CREATE TRIGGER guard_admin_user_deletion BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.guard_admin_user_deletion();
REVOKE ALL ON FUNCTION public.guard_admin_user_deletion() FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.admin_user_deletion_audit,public.admin_user_deletion_requests TO service_role;
NOTIFY pgrst,'reload schema';

-- Serialize ownership-bearing uploads with Auth deletion, including legacy Storage owner fields.
CREATE FUNCTION public.guard_storage_account_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE owner_value text:=coalesce(nullif(to_jsonb(NEW)->>'owner_id',''),nullif(to_jsonb(NEW)->>'owner',''),
 nullif(NEW.metadata->>'user_id',''),nullif(NEW.metadata->>'creator',''),
 CASE WHEN NEW.bucket_id IN ('avatars','solution-images') THEN split_part(NEW.name,'/',1) END);
BEGIN
 IF owner_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  PERFORM 1 FROM auth.users WHERE id=owner_value::uuid FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='The file owner account no longer exists.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_storage_account_owner BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.guard_storage_account_owner();
REVOKE ALL ON FUNCTION public.guard_storage_account_owner() FROM PUBLIC,anon,authenticated;
