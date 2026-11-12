-- Solution Requests as threads: public or admin-only questions, numbered replies, official answers,
-- solved / closed flags, reports and a daily question limit.
-- Forward-only and additive. The production frontend that is still live reads the table directly,
-- inserts directly and only updates rows that carry solution_text, so those paths keep working.
-- All new reads and writes go through the sr_* functions below.

-- 1. Permissions: a new "answers" module that every admin account type has.
CREATE OR REPLACE FUNCTION public.has_admin_module(_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.role()='authenticated' AND _module IN ('courses','questions','playground','team','users','answers')
 AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND
 (role='super_admin' OR (role='admin' AND _module<>'users')
 OR (role='course_admin' AND _module IN ('courses','playground','answers'))
 OR (role='question_admin' AND _module IN ('questions','playground','answers'))))
$$;
REVOKE ALL ON FUNCTION public.has_admin_module(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_admin_module(text) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_admin_access() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('courses',public.has_admin_module('courses'),'questions',public.has_admin_module('questions'),
 'playground',public.has_admin_module('playground'),'team',public.has_admin_module('team'),'users',public.has_admin_module('users'),
 'answers',public.has_admin_module('answers'))
$$;
REVOKE ALL ON FUNCTION public.get_admin_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.has_admin_storage_access(_bucket text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN _bucket IN ('course-videos','course-images','course-games','roadmap-videos') THEN public.has_admin_module('courses')
 WHEN _bucket IN ('practice-images','question-images') THEN public.has_admin_module('questions')
 WHEN _bucket='solution-images' THEN public.has_admin_module('answers')
 WHEN _bucket='team-photos' THEN public.has_admin_module('team')
 ELSE public.has_role(auth.uid(),'admin') END
$$;
REVOKE ALL ON FUNCTION public.has_admin_storage_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_admin_storage_access(text) TO anon,authenticated,service_role;

-- 2. Question table: new columns and the new status set.
ALTER TABLE public.solution_requests
 ADD COLUMN is_anonymous boolean NOT NULL DEFAULT true,
 ADD COLUMN image_paths text[] NOT NULL DEFAULT '{}',
 ADD COLUMN solved_at timestamptz,
 ADD COLUMN solved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 ADD COLUMN closed_at timestamptz,
 ADD COLUMN closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 ADD COLUMN hidden_at timestamptz,
 ADD COLUMN hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 ADD COLUMN edited_at timestamptz,
 ADD COLUMN reply_count integer NOT NULL DEFAULT 0,
 ADD COLUMN reply_floor_seq integer NOT NULL DEFAULT 0,
 ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now();
COMMENT ON COLUMN public.solution_requests.solution_text IS 'Retired. Answers are rows in solution_request_replies. Never write: the old frontend loops on it.';
COMMENT ON COLUMN public.solution_requests.solution_image_url IS 'Retired. See solution_text.';
COMMENT ON COLUMN public.solution_requests.is_anonymous IS 'Hide the author from other students. Admins always see the author.';

DO $status$
DECLARE c record;
BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.solution_requests'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) ILIKE '%status%' LOOP
  EXECUTE format('ALTER TABLE public.solution_requests DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $status$;
UPDATE public.solution_requests SET status=CASE WHEN status IN ('completed','solved') THEN 'answered' ELSE 'awaiting' END;
UPDATE public.solution_requests SET is_public=false WHERE is_public IS NULL;
UPDATE public.solution_requests SET last_activity_at=created_at;
UPDATE public.solution_requests SET image_paths=ARRAY[regexp_replace(split_part(image_url,'?',1),'^.*/solution-images/','')]
 WHERE image_url IS NOT NULL AND image_url<>'';
ALTER TABLE public.solution_requests
 ALTER COLUMN status SET DEFAULT 'awaiting',
 ALTER COLUMN status SET NOT NULL,
 ALTER COLUMN is_public SET DEFAULT false,
 ALTER COLUMN is_public SET NOT NULL,
 ADD CONSTRAINT solution_requests_status_check CHECK (status IN ('awaiting','replied','answered','solved')),
 ADD CONSTRAINT solution_requests_image_count CHECK (cardinality(image_paths)<=3);
CREATE INDEX solution_requests_public_activity ON public.solution_requests(last_activity_at DESC) WHERE is_public AND hidden_at IS NULL;
CREATE INDEX solution_requests_owner_activity ON public.solution_requests(user_id,last_activity_at DESC);
CREATE INDEX solution_requests_open_queue ON public.solution_requests(created_at) WHERE status IN ('awaiting','replied') AND closed_at IS NULL;
CREATE INDEX solution_requests_image_paths ON public.solution_requests USING gin(image_paths);

-- 3. Replies, reports and the question quota. No table policies: only the sr_* functions touch them.
CREATE TABLE public.solution_request_replies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.solution_requests(id) ON DELETE CASCADE,
 floor integer NOT NULL,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 body text NOT NULL DEFAULT '',
 image_path text,
 is_anonymous boolean NOT NULL DEFAULT false,
 is_official boolean NOT NULL DEFAULT false,
 quoted_reply_id uuid REFERENCES public.solution_request_replies(id) ON DELETE SET NULL,
 quoted_floor integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 edited_at timestamptz,
 hidden_at timestamptz,
 hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 UNIQUE(request_id,floor),
 CHECK (char_length(body)<=5000),
 CHECK (body<>'' OR image_path IS NOT NULL),
 CHECK (NOT (is_official AND is_anonymous))
);
CREATE INDEX solution_request_replies_user_time ON public.solution_request_replies(user_id,created_at);
CREATE INDEX solution_request_replies_image ON public.solution_request_replies(image_path) WHERE image_path IS NOT NULL;
ALTER TABLE public.solution_request_replies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.solution_requests ADD COLUMN accepted_reply_id uuid
 REFERENCES public.solution_request_replies(id) ON DELETE SET NULL;

CREATE TABLE public.solution_request_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.solution_requests(id) ON DELETE CASCADE,
 reply_id uuid REFERENCES public.solution_request_replies(id) ON DELETE CASCADE,
 reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX solution_request_reports_once ON public.solution_request_reports
 (reporter_id,request_id,coalesce(reply_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX solution_request_reports_open ON public.solution_request_reports(created_at) WHERE resolved_at IS NULL;
ALTER TABLE public.solution_request_reports ENABLE ROW LEVEL SECURITY;

-- Kept when a question is withdrawn, so deleting and re-posting does not reset the limit.
CREATE TABLE public.solution_request_quota(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX solution_request_quota_user_time ON public.solution_request_quota(user_id,created_at);
ALTER TABLE public.solution_request_quota ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.solution_request_replies,public.solution_request_reports,public.solution_request_quota FROM anon,authenticated;
GRANT ALL ON public.solution_request_replies,public.solution_request_reports,public.solution_request_quota TO service_role;

-- 4. Direct table access left for the old frontend: own or public (not hidden) rows, own inserts. No direct updates.
DROP POLICY IF EXISTS "Users can update their own requests" ON public.solution_requests;
DROP POLICY IF EXISTS "Users can view public requests or their own" ON public.solution_requests;
CREATE POLICY "Users can view public requests or their own" ON public.solution_requests FOR SELECT
 USING ((is_public AND hidden_at IS NULL) OR auth.uid()=user_id);

-- 5. Helpers.
CREATE FUNCTION public.sr_fail(_code text,_detail text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql VOLATILE AS $$
BEGIN
 RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE=_code,DETAIL=coalesce(_detail,_code);
END $$;

CREATE FUNCTION public.sr_is_answerer() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.has_admin_module('answers') $$;

CREATE FUNCTION public.sr_can_view(_is_public boolean,_hidden_at timestamptz,_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT (_is_public AND _hidden_at IS NULL) OR (auth.uid() IS NOT NULL AND auth.uid()=_owner) OR public.sr_is_answerer()
$$;

CREATE FUNCTION public.sr_require_user() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
 IF auth.uid() IS NULL THEN PERFORM public.sr_fail('SR_AUTH','Sign in first.'); END IF;
 RETURN auth.uid();
END $$;

-- New uploads go to r/<random>.<ext> so a path never reveals the uploader; the Storage owner records who uploaded it.
-- Older uploads live under <user id>/ and stay valid.
CREATE FUNCTION public.sr_owns_image(_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,storage AS $$
 SELECT auth.uid() IS NOT NULL AND _name IS NOT NULL AND (split_part(_name,'/',1)=auth.uid()::text
  OR EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='solution-images' AND o.name=_name
   AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=auth.uid()::text))
$$;

CREATE FUNCTION public.sr_clean_images(_paths text[],_max integer) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,storage AS $$
DECLARE p text; result text[]:='{}';
BEGIN
 FOREACH p IN ARRAY coalesce(_paths,'{}') LOOP
  IF p IS NULL OR p='' OR p=ANY(result) THEN CONTINUE; END IF;
  IF p !~ '^(r|[0-9a-f-]{36})/[A-Za-z0-9._-]{1,200}$' OR NOT public.sr_owns_image(p)
   OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='solution-images' AND name=p) THEN
   PERFORM public.sr_fail('SR_IMAGE','Upload the image again.');
  END IF;
  result:=result||p;
 END LOOP;
 IF cardinality(result)>_max THEN PERFORM public.sr_fail('SR_IMAGE_COUNT',format('At most %s images.',_max)); END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.sr_clean_text(_value text,_max integer,_required boolean,_field text) RETURNS text
LANGUAGE plpgsql VOLATILE AS $$
DECLARE v text:=btrim(coalesce(_value,''));
BEGIN
 IF _required AND v='' THEN PERFORM public.sr_fail('SR_REQUIRED',_field); END IF;
 IF char_length(v)>_max THEN PERFORM public.sr_fail('SR_TOO_LONG',_field); END IF;
 RETURN v;
END $$;

-- Recomputes status and counters from the replies; status is never set by hand.
CREATE FUNCTION public.sr_refresh(_request uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.solution_requests r SET
  status=CASE WHEN r.solved_at IS NOT NULL THEN 'solved'
   WHEN EXISTS(SELECT 1 FROM public.solution_request_replies p WHERE p.request_id=r.id AND p.hidden_at IS NULL AND p.is_official) THEN 'answered'
   WHEN EXISTS(SELECT 1 FROM public.solution_request_replies p WHERE p.request_id=r.id AND p.hidden_at IS NULL AND p.user_id<>r.user_id) THEN 'replied'
   ELSE 'awaiting' END,
  reply_count=(SELECT count(*) FROM public.solution_request_replies p WHERE p.request_id=r.id AND p.hidden_at IS NULL),
  last_activity_at=greatest(r.created_at,(SELECT max(p.created_at) FROM public.solution_request_replies p WHERE p.request_id=r.id))
 WHERE r.id=_request
$$;

CREATE FUNCTION public.sr_after_reply_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.sr_refresh(coalesce(NEW.request_id,OLD.request_id));
 RETURN NULL;
END $$;
CREATE TRIGGER sr_after_reply_change AFTER INSERT OR UPDATE OR DELETE ON public.solution_request_replies
 FOR EACH ROW EXECUTE FUNCTION public.sr_after_reply_change();

-- Every insert (new functions and the old frontend's direct insert) gets clean server-owned fields and uses quota.
CREATE FUNCTION public.sr_before_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE used integer;
BEGIN
 NEW.title:=btrim(coalesce(NEW.title,''));
 IF NEW.title='' THEN PERFORM public.sr_fail('SR_REQUIRED','title'); END IF;
 IF char_length(NEW.title)>200 THEN PERFORM public.sr_fail('SR_TOO_LONG','title'); END IF;
 IF char_length(coalesce(NEW.description,''))>5000 THEN PERFORM public.sr_fail('SR_TOO_LONG','description'); END IF;
 IF NOT public.sr_is_answerer() THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('solution_request_quota:'||NEW.user_id::text,0));
  SELECT count(*) INTO used FROM public.solution_request_quota WHERE user_id=NEW.user_id AND created_at>now()-interval '24 hours';
  IF used>=5 THEN PERFORM public.sr_fail('SR_DAILY_LIMIT','At most 5 questions in 24 hours.'); END IF;
 END IF;
 INSERT INTO public.solution_request_quota(user_id) VALUES(NEW.user_id);
 IF cardinality(NEW.image_paths)=0 AND coalesce(NEW.image_url,'')<>'' THEN
  NEW.image_paths:=ARRAY[regexp_replace(split_part(NEW.image_url,'?',1),'^.*/solution-images/','')];
 END IF;
 IF cardinality(NEW.image_paths)>0 THEN NEW.image_url:=NEW.image_paths[1]; END IF;
 NEW.status:='awaiting'; NEW.solution_text:=NULL; NEW.solution_image_url:=NULL; NEW.accepted_reply_id:=NULL;
 NEW.solved_at:=NULL; NEW.solved_by:=NULL; NEW.closed_at:=NULL; NEW.closed_by:=NULL; NEW.hidden_at:=NULL; NEW.hidden_by:=NULL;
 NEW.edited_at:=NULL; NEW.reply_count:=0; NEW.reply_floor_seq:=0;
 NEW.is_public:=coalesce(NEW.is_public,false); NEW.created_at:=now(); NEW.updated_at:=now(); NEW.last_activity_at:=now();
 RETURN NEW;
END $$;
CREATE TRIGGER sr_before_insert BEFORE INSERT ON public.solution_requests FOR EACH ROW EXECUTE FUNCTION public.sr_before_insert();

-- 6. Reads. Author identity is resolved here: anonymous authors are only named for answer admins.
CREATE FUNCTION public.sr_author(_user uuid,_anonymous boolean,_official boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'name',CASE WHEN _anonymous AND NOT public.sr_is_answerer() THEN NULL
   ELSE nullif(btrim((SELECT full_name FROM public.profiles WHERE user_id=_user)),'') END,
  'anonymous',_anonymous,'official',_official,'is_mine',auth.uid() IS NOT NULL AND auth.uid()=_user)
$$;

CREATE FUNCTION public.sr_summary_json(r public.solution_requests) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('id',r.id,'title',r.title,'description',coalesce(r.description,''),'problem_type',r.problem_type,
  'status',r.status,'is_public',r.is_public,'is_anonymous',r.is_anonymous,'is_closed',r.closed_at IS NOT NULL,
  'is_hidden',r.hidden_at IS NOT NULL,'created_at',r.created_at,'edited_at',r.edited_at,'last_activity_at',r.last_activity_at,
  'reply_count',r.reply_count,'image_paths',to_jsonb(r.image_paths),
  'has_official',EXISTS(SELECT 1 FROM public.solution_request_replies p WHERE p.request_id=r.id AND p.is_official AND p.hidden_at IS NULL),
  'author',public.sr_author(r.user_id,r.is_anonymous,false),
  'open_reports',CASE WHEN public.sr_is_answerer() THEN
   (SELECT count(*) FROM public.solution_request_reports x WHERE x.request_id=r.id AND x.resolved_at IS NULL) END)
$$;

CREATE FUNCTION public.sr_list(_scope text,_status text DEFAULT NULL,_problem_type public.problem_type DEFAULT NULL,
 _include_closed boolean DEFAULT true,_visibility text DEFAULT NULL,_offset integer DEFAULT 0,_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE lim integer:=least(greatest(coalesce(_limit,20),1),50); v_offset integer:=greatest(coalesce(_offset,0),0); items jsonb;
 queue boolean:=coalesce(_status='needs_answer',false);
BEGIN
 IF _scope NOT IN ('mine','public','admin') THEN PERFORM public.sr_fail('SR_INVALID','scope'); END IF;
 IF _status IS NOT NULL AND _status NOT IN ('awaiting','replied','answered','solved','needs_answer') THEN PERFORM public.sr_fail('SR_INVALID','status'); END IF;
 IF _scope='mine' THEN PERFORM public.sr_require_user(); END IF;
 IF _scope='admin' AND NOT public.sr_is_answerer() THEN PERFORM public.sr_fail('SR_FORBIDDEN','Answer admins only.'); END IF;
 SELECT coalesce(jsonb_agg(public.sr_summary_json(r) ORDER BY
   CASE WHEN queue THEN extract(epoch FROM r.created_at) ELSE -extract(epoch FROM r.last_activity_at) END, r.id),'[]')
 INTO items FROM (
  SELECT * FROM public.solution_requests r WHERE
   CASE _scope WHEN 'mine' THEN r.user_id=auth.uid() WHEN 'public' THEN r.is_public AND r.hidden_at IS NULL ELSE true END
   AND (_status IS NULL OR (queue AND r.status IN ('awaiting','replied') AND r.closed_at IS NULL) OR r.status=_status)
   AND (_problem_type IS NULL OR r.problem_type=_problem_type)
   AND (coalesce(_include_closed,true) OR r.closed_at IS NULL)
   AND (_scope<>'admin' OR _visibility IS NULL OR (_visibility='public')=r.is_public)
  ORDER BY CASE WHEN queue THEN extract(epoch FROM r.created_at) ELSE -extract(epoch FROM r.last_activity_at) END, r.id
  OFFSET v_offset LIMIT lim+1) r;
 RETURN jsonb_build_object('items',
  (SELECT coalesce(jsonb_agg(e ORDER BY n),'[]') FROM jsonb_array_elements(items) WITH ORDINALITY x(e,n) WHERE n<=lim),
  'has_more',jsonb_array_length(items)>lim);
END $$;

CREATE FUNCTION public.sr_get(_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.solution_requests; admin boolean:=public.sr_is_answerer(); mine boolean; replies jsonb; reports jsonb;
BEGIN
 SELECT * INTO r FROM public.solution_requests WHERE id=_id;
 IF NOT FOUND OR NOT public.sr_can_view(r.is_public,r.hidden_at,r.user_id) THEN PERFORM public.sr_fail('SR_NOT_FOUND','Question not found.'); END IF;
 mine:=auth.uid() IS NOT NULL AND auth.uid()=r.user_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'floor',p.floor,
   'body',CASE WHEN p.hidden_at IS NULL OR admin THEN p.body END,
   'image_path',CASE WHEN p.hidden_at IS NULL OR admin THEN p.image_path END,
   'is_hidden',p.hidden_at IS NOT NULL,'is_op',p.user_id=r.user_id,'is_accepted',p.id=r.accepted_reply_id,
   'created_at',p.created_at,'edited_at',p.edited_at,
   'author',public.sr_author(p.user_id,p.is_anonymous,p.is_official),
   'quote',CASE WHEN p.quoted_floor IS NULL THEN NULL ELSE jsonb_build_object('floor',p.quoted_floor,
     'excerpt',CASE WHEN q.id IS NULL OR (q.hidden_at IS NOT NULL AND NOT admin) THEN NULL ELSE left(q.body,140) END,
     'missing',q.id IS NULL) END,
   'open_reports',CASE WHEN admin THEN (SELECT count(*) FROM public.solution_request_reports x WHERE x.reply_id=p.id AND x.resolved_at IS NULL) END
  ) ORDER BY p.floor),'[]') INTO replies
 FROM public.solution_request_replies p LEFT JOIN public.solution_request_replies q ON q.id=p.quoted_reply_id
 WHERE p.request_id=r.id;
 IF admin THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'reply_id',x.reply_id,'floor',p.floor,'reason',x.reason,'created_at',x.created_at,
   'reporter',coalesce(nullif(btrim(pr.full_name),''),'?')) ORDER BY x.created_at),'[]') INTO reports
  FROM public.solution_request_reports x LEFT JOIN public.solution_request_replies p ON p.id=x.reply_id
  LEFT JOIN public.profiles pr ON pr.user_id=x.reporter_id
  WHERE x.request_id=r.id AND x.resolved_at IS NULL;
 END IF;
 RETURN jsonb_build_object('request',public.sr_summary_json(r)||jsonb_build_object(
   'accepted_reply_id',r.accepted_reply_id,'solved_at',r.solved_at,'closed_at',r.closed_at,
   'can_edit',mine,'can_manage',mine OR admin,'can_moderate',admin,
   'can_reply',auth.uid() IS NOT NULL AND r.closed_at IS NULL),
  'replies',replies,'reports',reports,'viewer',jsonb_build_object('signed_in',auth.uid() IS NOT NULL,'is_answerer',admin));
END $$;

CREATE FUNCTION public.sr_quota() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('limit',5,'unlimited',public.sr_is_answerer(),
  'used',(SELECT count(*) FROM public.solution_request_quota WHERE user_id=auth.uid() AND created_at>now()-interval '24 hours'))
$$;

CREATE FUNCTION public.sr_admin_summary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.sr_is_answerer() THEN PERFORM public.sr_fail('SR_FORBIDDEN','Answer admins only.'); END IF;
 RETURN jsonb_build_object(
  'needs_answer',(SELECT count(*) FROM public.solution_requests WHERE status IN ('awaiting','replied') AND closed_at IS NULL),
  'open_reports',(SELECT count(*) FROM public.solution_request_reports WHERE resolved_at IS NULL));
END $$;

CREATE FUNCTION public.sr_list_reports() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.sr_is_answerer() THEN PERFORM public.sr_fail('SR_FORBIDDEN','Answer admins only.'); END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'request_id',x.request_id,'request_title',r.title,'reply_id',x.reply_id,
   'floor',p.floor,'excerpt',left(coalesce(p.body,r.title),140),'reason',x.reason,'created_at',x.created_at,
   'reporter',coalesce(nullif(btrim(pr.full_name),''),'?')) ORDER BY x.created_at),'[]')
  FROM public.solution_request_reports x JOIN public.solution_requests r ON r.id=x.request_id
  LEFT JOIN public.solution_request_replies p ON p.id=x.reply_id LEFT JOIN public.profiles pr ON pr.user_id=x.reporter_id
  WHERE x.resolved_at IS NULL);
END $$;

-- 7. Question writes.
CREATE FUNCTION public.sr_lock_request(_id uuid) RETURNS public.solution_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.solution_requests;
BEGIN
 SELECT * INTO r FROM public.solution_requests WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT public.sr_can_view(r.is_public,r.hidden_at,r.user_id) THEN PERFORM public.sr_fail('SR_NOT_FOUND','Question not found.'); END IF;
 RETURN r;
END $$;

CREATE FUNCTION public.sr_create(_title text,_description text,_problem_type public.problem_type,_image_paths text[],
 _is_public boolean,_is_anonymous boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public.sr_require_user(); new_id uuid;
BEGIN
 INSERT INTO public.solution_requests(user_id,title,description,problem_type,image_paths,is_public,is_anonymous)
 VALUES(uid,public.sr_clean_text(_title,120,true,'title'),nullif(public.sr_clean_text(_description,5000,false,'description'),''),
  coalesce(_problem_type,'other'),public.sr_clean_images(_image_paths,3),coalesce(_is_public,false),coalesce(_is_anonymous,true))
 RETURNING id INTO new_id;
 RETURN new_id;
END $$;

-- Returns the caller's image paths that are no longer used, so the client can delete the files.
CREATE FUNCTION public.sr_update(_id uuid,_title text,_description text,_problem_type public.problem_type,_image_paths text[],
 _is_public boolean,_is_anonymous boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public.sr_require_user(); r public.solution_requests; t text; d text; imgs text[]; changed boolean;
BEGIN
 r:=public.sr_lock_request(_id);
 IF r.user_id<>uid THEN PERFORM public.sr_fail('SR_FORBIDDEN','Only the author can edit this question.'); END IF;
 t:=public.sr_clean_text(_title,120,true,'title');
 d:=nullif(public.sr_clean_text(_description,5000,false,'description'),'');
 -- Images already on the question may stay even if they predate the current path rules.
 imgs:=ARRAY(SELECT p FROM unnest(coalesce(_image_paths,'{}')) p WHERE p=ANY(r.image_paths))
  ||public.sr_clean_images(ARRAY(SELECT p FROM unnest(coalesce(_image_paths,'{}')) p WHERE NOT p=ANY(r.image_paths)),3);
 IF cardinality(imgs)>3 THEN PERFORM public.sr_fail('SR_IMAGE_COUNT','At most 3 images.'); END IF;
 changed:=t IS DISTINCT FROM r.title OR d IS DISTINCT FROM r.description
  OR coalesce(_problem_type,'other') IS DISTINCT FROM r.problem_type OR imgs IS DISTINCT FROM r.image_paths;
 UPDATE public.solution_requests SET title=t,description=d,problem_type=coalesce(_problem_type,'other'),image_paths=imgs,
  image_url=imgs[1],is_public=coalesce(_is_public,r.is_public),is_anonymous=coalesce(_is_anonymous,r.is_anonymous),
  edited_at=CASE WHEN changed THEN now() ELSE r.edited_at END
 WHERE id=r.id;
 RETURN jsonb_build_object('removed_images',to_jsonb(ARRAY(SELECT p FROM unnest(r.image_paths) p
  WHERE NOT p=ANY(imgs) AND public.sr_owns_image(p))));
END $$;

CREATE FUNCTION public.sr_withdraw(_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public.sr_require_user(); r public.solution_requests; imgs text[];
BEGIN
 r:=public.sr_lock_request(_id);
 IF r.user_id<>uid THEN PERFORM public.sr_fail('SR_FORBIDDEN','Only the author can withdraw this question.'); END IF;
 imgs:=ARRAY(SELECT p FROM unnest(r.image_paths) p WHERE public.sr_owns_image(p))
  ||ARRAY(SELECT image_path FROM public.solution_request_replies WHERE request_id=r.id AND user_id=uid AND image_path IS NOT NULL);
 UPDATE public.solution_requests SET accepted_reply_id=NULL WHERE id=r.id;
 DELETE FROM public.solution_requests WHERE id=r.id;
 RETURN jsonb_build_object('removed_images',to_jsonb(imgs));
END $$;

CREATE FUNCTION public.sr_set_solved(_id uuid,_solved boolean,_accepted_reply uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public.sr_require_user(); r public.solution_requests;
BEGIN
 r:=public.sr_lock_request(_id);
 IF r.user_id<>uid AND NOT public.sr_is_answerer() THEN PERFORM public.sr_fail('SR_FORBIDDEN','Only the author or an admin can do this.'); END IF;
 IF _solved AND _accepted_reply IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.solution_request_replies
  WHERE id=_accepted_reply AND request_id=r.id AND hidden_at IS NULL) THEN
  PERFORM public.sr_fail('SR_NOT_FOUND','Reply not found.');
 END IF;
 UPDATE public.solution_requests SET
  solved_at=CASE WHEN _solved THEN coalesce(r.solved_at,now()) END,solved_by=CASE WHEN _solved THEN uid END,
  accepted_reply_id=CASE WHEN _solved THEN _accepted_reply END
 WHERE id=r.id;
 PERFORM public.sr_refresh(r.id);
END $$;

CREATE FUNCTION public.sr_set_closed(_id uuid,_closed boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public.sr_require_user(); r public.solution_requests;
BEGIN
 r:=public.sr_lock_request(_id);
 IF r.user_id<>uid AND NOT public.sr_is_answerer() THEN PERFORM public.sr_fail('SR_FORBIDDEN','Only the author or an admin can do this.'); END IF;
 UPDATE public.solution_requests SET closed_at=CASE WHEN _closed THEN coalesce(r.closed_at,now()) END,
  closed_by=CASE WHEN _closed THEN uid END WHERE id=r.id;
END $$;

CREATE FUNCTION public.sr_hide_request(_id uuid,_hidden boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public.sr_require_user();
BEGIN
 IF NOT public.sr_is_answerer() THEN PERFORM public.sr_fail('SR_FORBIDDEN','Answer admins only.'); END IF;
 UPDATE public.solution_requests SET hidden_at=CASE WHEN _hidden THEN now() END,hidden_by=CASE WHEN _hidden THEN uid END WHERE id=_id;
 IF NOT FOUND THEN PERFORM public.sr_fail('SR_NOT_FOUND','Question not found.'); END IF;
 IF _hidden THEN UPDATE public.solution_request_reports SET resolved_at=now(),resolved_by=uid
  WHERE request_id=_id AND reply_id IS NULL AND resolved_at IS NULL; END IF;
END $$;

-- 8. Reply writes.
CREATE FUNCTION public.sr_reply(_request uuid,_body text,_image_path text DEFAULT NULL,_is_anonymous boolean DEFAULT false,
 _quoted_reply uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public.sr_require_user(); r public.solution_requests; official boolean:=public.sr_is_answerer();
 v_body text; v_img text[]; quoted integer; recent integer; new_id uuid;
BEGIN
 r:=public.sr_lock_request(_request);
 IF r.closed_at IS NOT NULL THEN PERFORM public.sr_fail('SR_CLOSED','This thread is closed.'); END IF;
 IF NOT official THEN
  SELECT count(*) INTO recent FROM public.solution_request_replies WHERE user_id=uid AND created_at>now()-interval '1 hour';
  IF recent>=30 THEN PERFORM public.sr_fail('SR_RATE_LIMIT','Too many replies in the last hour.'); END IF;
 END IF;
 v_body:=public.sr_clean_text(_body,5000,false,'body');
 v_img:=public.sr_clean_images(CASE WHEN _image_path IS NULL THEN '{}' ELSE ARRAY[_image_path] END,1);
 IF v_body='' AND cardinality(v_img)=0 THEN PERFORM public.sr_fail('SR_REQUIRED','body'); END IF;
 IF _quoted_reply IS NOT NULL THEN
  SELECT floor INTO quoted FROM public.solution_request_replies WHERE id=_quoted_reply AND request_id=r.id;
  IF NOT FOUND THEN PERFORM public.sr_fail('SR_NOT_FOUND','Quoted reply not found.'); END IF;
 END IF;
 UPDATE public.solution_requests SET reply_floor_seq=reply_floor_seq+1 WHERE id=r.id RETURNING reply_floor_seq INTO r.reply_floor_seq;
 INSERT INTO public.solution_request_replies(request_id,floor,user_id,body,image_path,is_anonymous,is_official,quoted_reply_id,quoted_floor)
 VALUES(r.id,r.reply_floor_seq,uid,v_body,v_img[1],NOT official AND coalesce(_is_anonymous,false),official,_quoted_reply,quoted)
 RETURNING id INTO new_id;
 RETURN new_id;
END $$;

CREATE FUNCTION public.sr_lock_own_reply(_reply uuid) RETURNS public.solution_request_replies
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.solution_request_replies; r public.solution_requests;
BEGIN
 SELECT * INTO p FROM public.solution_request_replies WHERE id=_reply FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.sr_fail('SR_NOT_FOUND','Reply not found.'); END IF;
 r:=public.sr_lock_request(p.request_id);
 IF p.user_id<>auth.uid() THEN PERFORM public.sr_fail('SR_FORBIDDEN','Only the author can change this reply.'); END IF;
 RETURN p;
END $$;

CREATE FUNCTION public.sr_edit_reply(_reply uuid,_body text,_image_path text DEFAULT NULL,_is_anonymous boolean DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public.sr_require_user(); p public.solution_request_replies; v_body text; v_img text;
BEGIN
 p:=public.sr_lock_own_reply(_reply);
 IF p.hidden_at IS NOT NULL THEN PERFORM public.sr_fail('SR_FORBIDDEN','A hidden reply cannot be edited.'); END IF;
 IF EXISTS(SELECT 1 FROM public.solution_requests WHERE id=p.request_id AND closed_at IS NOT NULL) THEN
  PERFORM public.sr_fail('SR_CLOSED','This thread is closed.');
 END IF;
 v_body:=public.sr_clean_text(_body,5000,false,'body');
 v_img:=CASE WHEN _image_path IS NULL THEN NULL WHEN _image_path=p.image_path THEN p.image_path
  ELSE (public.sr_clean_images(ARRAY[_image_path],1))[1] END;
 IF v_body='' AND v_img IS NULL THEN PERFORM public.sr_fail('SR_REQUIRED','body'); END IF;
 UPDATE public.solution_request_replies SET body=v_body,image_path=v_img,
  is_anonymous=NOT p.is_official AND coalesce(_is_anonymous,p.is_anonymous),
  edited_at=CASE WHEN v_body IS DISTINCT FROM p.body OR v_img IS DISTINCT FROM p.image_path THEN now() ELSE p.edited_at END
 WHERE id=p.id;
 RETURN jsonb_build_object('removed_images',CASE WHEN p.image_path IS NOT NULL AND p.image_path IS DISTINCT FROM v_img
  AND public.sr_owns_image(p.image_path) THEN jsonb_build_array(p.image_path) ELSE '[]'::jsonb END);
END $$;

CREATE FUNCTION public.sr_delete_reply(_reply uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public.sr_require_user(); p public.solution_request_replies;
BEGIN
 p:=public.sr_lock_own_reply(_reply);
 DELETE FROM public.solution_request_replies WHERE id=p.id;
 RETURN jsonb_build_object('removed_images',CASE WHEN p.image_path IS NOT NULL AND public.sr_owns_image(p.image_path)
  THEN jsonb_build_array(p.image_path) ELSE '[]'::jsonb END);
END $$;

CREATE FUNCTION public.sr_hide_reply(_reply uuid,_hidden boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public.sr_require_user(); p public.solution_request_replies;
BEGIN
 IF NOT public.sr_is_answerer() THEN PERFORM public.sr_fail('SR_FORBIDDEN','Answer admins only.'); END IF;
 SELECT * INTO p FROM public.solution_request_replies WHERE id=_reply FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.sr_fail('SR_NOT_FOUND','Reply not found.'); END IF;
 UPDATE public.solution_request_replies SET hidden_at=CASE WHEN _hidden THEN now() END,hidden_by=CASE WHEN _hidden THEN uid END WHERE id=p.id;
 IF _hidden THEN
  UPDATE public.solution_requests SET accepted_reply_id=NULL WHERE id=p.request_id AND accepted_reply_id=p.id;
  UPDATE public.solution_request_reports SET resolved_at=now(),resolved_by=uid WHERE reply_id=p.id AND resolved_at IS NULL;
 END IF;
END $$;

-- 9. Reports.
CREATE FUNCTION public.sr_report(_request uuid,_reply uuid,_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public.sr_require_user(); r public.solution_requests; author uuid; inserted integer;
BEGIN
 r:=public.sr_lock_request(_request);
 IF _reply IS NULL THEN author:=r.user_id;
 ELSE
  SELECT user_id INTO author FROM public.solution_request_replies WHERE id=_reply AND request_id=r.id;
  IF NOT FOUND THEN PERFORM public.sr_fail('SR_NOT_FOUND','Reply not found.'); END IF;
 END IF;
 IF author=uid THEN PERFORM public.sr_fail('SR_INVALID','You cannot report your own post.'); END IF;
 INSERT INTO public.solution_request_reports(request_id,reply_id,reporter_id,reason)
 VALUES(r.id,_reply,uid,public.sr_clean_text(_reason,500,true,'reason')) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 RETURN jsonb_build_object('status',CASE WHEN inserted=1 THEN 'reported' ELSE 'already_reported' END);
END $$;

CREATE FUNCTION public.sr_resolve_report(_report uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=public.sr_require_user();
BEGIN
 IF NOT public.sr_is_answerer() THEN PERFORM public.sr_fail('SR_FORBIDDEN','Answer admins only.'); END IF;
 UPDATE public.solution_request_reports SET resolved_at=now(),resolved_by=uid WHERE id=_report AND resolved_at IS NULL;
END $$;

-- 10. Images: visible to whoever can see the question or (not hidden) reply that uses them.
CREATE FUNCTION public.can_view_solution_image(_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.sr_owns_image(_name) OR public.sr_is_answerer()
 OR EXISTS(SELECT 1 FROM public.solution_requests r WHERE r.image_paths @> ARRAY[_name]
  AND public.sr_can_view(r.is_public,r.hidden_at,r.user_id))
 OR EXISTS(SELECT 1 FROM public.solution_request_replies p JOIN public.solution_requests r ON r.id=p.request_id
  WHERE p.image_path=_name AND p.hidden_at IS NULL AND public.sr_can_view(r.is_public,r.hidden_at,r.user_id))
$$;
DROP POLICY IF EXISTS "Users can view own or public solution images" ON storage.objects;
CREATE POLICY "Users can view own or public solution images" ON storage.objects FOR SELECT
 USING (bucket_id='solution-images' AND public.can_view_solution_image(name));
DROP POLICY IF EXISTS "Users can upload unnamed solution images" ON storage.objects;
CREATE POLICY "Users can upload unnamed solution images" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='solution-images' AND name ~ '^r/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|gif)$');
DROP POLICY IF EXISTS "Users can delete their own solution images" ON storage.objects;
CREATE POLICY "Users can delete their own solution images" ON storage.objects FOR DELETE TO authenticated
 USING (bucket_id='solution-images' AND public.sr_owns_image(name));

-- 11. Function privileges. Supabase grants new functions to anon and authenticated by default.
DO $grants$
DECLARE f text;
BEGIN
 FOREACH f IN ARRAY ARRAY['sr_fail(text,text)','sr_is_answerer()','sr_owns_image(text)','sr_can_view(boolean,timestamptz,uuid)','sr_require_user()',
  'sr_clean_images(text[],integer)','sr_clean_text(text,integer,boolean,text)','sr_refresh(uuid)','sr_after_reply_change()',
  'sr_before_insert()','sr_author(uuid,boolean,boolean)','sr_summary_json(public.solution_requests)','sr_lock_request(uuid)',
  'sr_lock_own_reply(uuid)','sr_list(text,text,public.problem_type,boolean,text,integer,integer)','sr_get(uuid)','sr_quota()',
  'sr_admin_summary()','sr_list_reports()','sr_create(text,text,public.problem_type,text[],boolean,boolean)',
  'sr_update(uuid,text,text,public.problem_type,text[],boolean,boolean)','sr_withdraw(uuid)','sr_set_solved(uuid,boolean,uuid)',
  'sr_set_closed(uuid,boolean)','sr_hide_request(uuid,boolean)','sr_reply(uuid,text,text,boolean,uuid)',
  'sr_edit_reply(uuid,text,text,boolean)','sr_delete_reply(uuid)','sr_hide_reply(uuid,boolean)','sr_report(uuid,uuid,text)',
  'sr_resolve_report(uuid)','can_view_solution_image(text)'] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC,anon,authenticated',f);
 END LOOP;
 -- Policies and the storage check call these as the requesting role.
 FOREACH f IN ARRAY ARRAY['sr_is_answerer()','sr_owns_image(text)','sr_can_view(boolean,timestamptz,uuid)','can_view_solution_image(text)',
  'sr_list(text,text,public.problem_type,boolean,text,integer,integer)','sr_get(uuid)'] LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon,authenticated',f);
 END LOOP;
 FOREACH f IN ARRAY ARRAY['sr_quota()','sr_admin_summary()','sr_list_reports()',
  'sr_create(text,text,public.problem_type,text[],boolean,boolean)','sr_update(uuid,text,text,public.problem_type,text[],boolean,boolean)',
  'sr_withdraw(uuid)','sr_set_solved(uuid,boolean,uuid)','sr_set_closed(uuid,boolean)','sr_hide_request(uuid,boolean)',
  'sr_reply(uuid,text,text,boolean,uuid)','sr_edit_reply(uuid,text,text,boolean)','sr_delete_reply(uuid)',
  'sr_hide_reply(uuid,boolean)','sr_report(uuid,uuid,text)','sr_resolve_report(uuid)'] LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated',f);
 END LOOP;
END $grants$;

NOTIFY pgrst,'reload schema';
