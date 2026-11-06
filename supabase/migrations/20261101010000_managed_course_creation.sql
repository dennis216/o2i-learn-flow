-- Course creation and canonical outline initialization are one transaction.
CREATE FUNCTION public.create_managed_course(_details jsonb,_scope public.question_course_scope DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE cid uuid; framework uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 IF jsonb_typeof(_details) IS DISTINCT FROM 'object' OR nullif(btrim(_details->>'title'),'') IS NULL OR length(_details->>'title')>200 OR (_details->>'level') NOT IN ('beginner','intermediate','advanced') OR nullif(_details->>'level','') IS NULL OR (_details->>'price')::numeric<0 OR (_details->>'price') IS NULL OR (_details->>'price')::numeric::text IN ('NaN','Infinity','-Infinity') OR NOT EXISTS(SELECT 1 FROM public.subjects WHERE name=_details->>'subject' AND category=_details->>'category') THEN RAISE EXCEPTION 'Provide valid course details and an existing subject.'; END IF;
 IF _scope IS NOT NULL THEN
 IF _scope NOT IN ('AB','BC') THEN RAISE EXCEPTION 'Choose AB or BC as the curriculum template.'; END IF;
 SELECT id INTO framework FROM public.curriculum_frameworks WHERE code='AP-CALCULUS-2026';
 IF framework IS NULL THEN RAISE EXCEPTION 'The AP Calculus curriculum template is unavailable.'; END IF;
 END IF;
 IF _details->>'subject'='AP Calc' AND _scope IS NULL THEN RAISE EXCEPTION 'Choose an AB or BC curriculum template for AP Calculus.'; END IF;
 INSERT INTO public.courses(title,description,level,subject,category,price,instructor_id,is_published,practice_course_scope)
 VALUES(btrim(_details->>'title'),coalesce(_details->>'description',''),_details->>'level',_details->>'subject',_details->>'category',(_details->>'price')::numeric,auth.uid(),coalesce((_details->>'is_published')::boolean,false),_scope) RETURNING id INTO cid;
 IF _scope IS NOT NULL THEN
 INSERT INTO public.course_curriculum_units(course_id,unit_id,order_index) SELECT cid,id,unit_number FROM public.curriculum_units WHERE framework_id=framework AND (_scope='BC' OR NOT is_bc_only);
 PERFORM public.initialize_course_outline(cid);
 END IF;
 RETURN cid;
END;
$$;
REVOKE ALL ON FUNCTION public.create_managed_course(jsonb,public.question_course_scope) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_managed_course(jsonb,public.question_course_scope) TO authenticated;
NOTIFY pgrst,'reload schema';
