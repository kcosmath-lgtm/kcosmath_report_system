-- Adds Google-auth-ready academy workspaces and tenant isolation.
-- Apply only after all earlier migrations. Existing data is preserved in one
-- unclaimed workspace and is claimed by the first authenticated owner.
BEGIN;

CREATE TABLE public.cosmath_academies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cosmath_academy_members (
  academy_id uuid NOT NULL REFERENCES public.cosmath_academies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (academy_id, user_id),
  UNIQUE (user_id)
);

REVOKE ALL ON public.cosmath_academies, public.cosmath_academy_members FROM anon, authenticated;
GRANT SELECT ON public.cosmath_academies, public.cosmath_academy_members TO authenticated;

CREATE OR REPLACE FUNCTION public.cosmath_current_academy_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT academy_id FROM public.cosmath_academy_members WHERE user_id = auth.uid() LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.cosmath_current_academy_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmath_current_academy_id() TO authenticated;

ALTER TABLE public.cosmath_classes ADD COLUMN academy_id uuid REFERENCES public.cosmath_academies(id);
ALTER TABLE public.cosmath_students ADD COLUMN academy_id uuid REFERENCES public.cosmath_academies(id);
ALTER TABLE public.cosmath_lessons ADD COLUMN academy_id uuid REFERENCES public.cosmath_academies(id);
ALTER TABLE public.cosmath_reports ADD COLUMN academy_id uuid REFERENCES public.cosmath_academies(id);
ALTER TABLE public.cosmath_wrong_answers ADD COLUMN academy_id uuid REFERENCES public.cosmath_academies(id);
ALTER TABLE public.cosmath_handoffs ADD COLUMN academy_id uuid REFERENCES public.cosmath_academies(id);

DO $$
DECLARE legacy_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.cosmath_classes)
    OR EXISTS (SELECT 1 FROM public.cosmath_handoffs)
    OR EXISTS (SELECT 1 FROM public.cosmath_wrong_answers) THEN
    INSERT INTO public.cosmath_academies(name) VALUES ('기존 COSMATH 학원') RETURNING id INTO legacy_id;
    UPDATE public.cosmath_classes SET academy_id = legacy_id;
    UPDATE public.cosmath_students s SET academy_id = c.academy_id FROM public.cosmath_classes c WHERE c.id = s.class_id;
    UPDATE public.cosmath_lessons l SET academy_id = c.academy_id FROM public.cosmath_classes c WHERE c.id = l.class_id;
    UPDATE public.cosmath_reports r SET academy_id = l.academy_id FROM public.cosmath_lessons l WHERE l.id = r.lesson_id;
    UPDATE public.cosmath_wrong_answers w SET academy_id = s.academy_id FROM public.cosmath_students s WHERE s.id = w.student_id;
    UPDATE public.cosmath_handoffs SET academy_id = legacy_id;
  END IF;
END $$;

ALTER TABLE public.cosmath_classes ALTER COLUMN academy_id SET NOT NULL, ALTER COLUMN academy_id SET DEFAULT public.cosmath_current_academy_id();
ALTER TABLE public.cosmath_students ALTER COLUMN academy_id SET NOT NULL, ALTER COLUMN academy_id SET DEFAULT public.cosmath_current_academy_id();
ALTER TABLE public.cosmath_lessons ALTER COLUMN academy_id SET NOT NULL, ALTER COLUMN academy_id SET DEFAULT public.cosmath_current_academy_id();
ALTER TABLE public.cosmath_reports ALTER COLUMN academy_id SET NOT NULL, ALTER COLUMN academy_id SET DEFAULT public.cosmath_current_academy_id();
ALTER TABLE public.cosmath_wrong_answers ALTER COLUMN academy_id SET NOT NULL, ALTER COLUMN academy_id SET DEFAULT public.cosmath_current_academy_id();
ALTER TABLE public.cosmath_handoffs ALTER COLUMN academy_id SET NOT NULL, ALTER COLUMN academy_id SET DEFAULT public.cosmath_current_academy_id();

ALTER TABLE public.cosmath_classes DROP CONSTRAINT cosmath_classes_name_key;
ALTER TABLE public.cosmath_classes ADD CONSTRAINT cosmath_classes_academy_name_key UNIQUE (academy_id, name);
ALTER TABLE public.cosmath_classes ADD CONSTRAINT cosmath_classes_id_academy_key UNIQUE (id, academy_id);
ALTER TABLE public.cosmath_students ADD CONSTRAINT cosmath_students_id_academy_key UNIQUE (id, academy_id);
ALTER TABLE public.cosmath_lessons ADD CONSTRAINT cosmath_lessons_id_academy_key UNIQUE (id, academy_id);
ALTER TABLE public.cosmath_students ADD CONSTRAINT cosmath_students_class_academy_fk FOREIGN KEY (class_id, academy_id) REFERENCES public.cosmath_classes(id, academy_id);
ALTER TABLE public.cosmath_lessons ADD CONSTRAINT cosmath_lessons_class_academy_fk FOREIGN KEY (class_id, academy_id) REFERENCES public.cosmath_classes(id, academy_id);
ALTER TABLE public.cosmath_reports ADD CONSTRAINT cosmath_reports_lesson_academy_fk FOREIGN KEY (lesson_id, academy_id) REFERENCES public.cosmath_lessons(id, academy_id);
ALTER TABLE public.cosmath_reports ADD CONSTRAINT cosmath_reports_student_academy_fk FOREIGN KEY (student_id, academy_id) REFERENCES public.cosmath_students(id, academy_id);
ALTER TABLE public.cosmath_wrong_answers ADD CONSTRAINT cosmath_wrong_answers_student_academy_fk FOREIGN KEY (student_id, academy_id) REFERENCES public.cosmath_students(id, academy_id);
CREATE INDEX cosmath_classes_academy_idx ON public.cosmath_classes(academy_id);
CREATE INDEX cosmath_students_academy_idx ON public.cosmath_students(academy_id);
CREATE INDEX cosmath_lessons_academy_date_idx ON public.cosmath_lessons(academy_id, report_date);
CREATE INDEX cosmath_reports_academy_idx ON public.cosmath_reports(academy_id);
CREATE INDEX cosmath_wrong_answers_academy_date_idx ON public.cosmath_wrong_answers(academy_id, record_date);
CREATE INDEX cosmath_handoffs_academy_date_idx ON public.cosmath_handoffs(academy_id, handoff_date);

ALTER TABLE public.cosmath_academies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosmath_academy_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosmath_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosmath_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosmath_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosmath_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosmath_wrong_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosmath_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY academy_member_read ON public.cosmath_academies FOR SELECT TO authenticated
  USING (id = public.cosmath_current_academy_id());
CREATE POLICY own_membership_read ON public.cosmath_academy_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY classes_member_access ON public.cosmath_classes FOR ALL TO authenticated
  USING (academy_id = public.cosmath_current_academy_id()) WITH CHECK (academy_id = public.cosmath_current_academy_id());
CREATE POLICY students_member_access ON public.cosmath_students FOR ALL TO authenticated
  USING (academy_id = public.cosmath_current_academy_id()) WITH CHECK (academy_id = public.cosmath_current_academy_id());
CREATE POLICY lessons_member_access ON public.cosmath_lessons FOR SELECT TO authenticated
  USING (academy_id = public.cosmath_current_academy_id());
CREATE POLICY reports_member_access ON public.cosmath_reports FOR SELECT TO authenticated
  USING (academy_id = public.cosmath_current_academy_id());
CREATE POLICY wrong_answers_member_read ON public.cosmath_wrong_answers FOR SELECT TO authenticated
  USING (academy_id = public.cosmath_current_academy_id());
CREATE POLICY handoffs_member_read ON public.cosmath_handoffs FOR SELECT TO authenticated
  USING (academy_id = public.cosmath_current_academy_id());

REVOKE ALL ON public.cosmath_classes, public.cosmath_students, public.cosmath_lessons, public.cosmath_reports, public.cosmath_wrong_answers, public.cosmath_handoffs FROM anon, authenticated;
GRANT SELECT, INSERT ON public.cosmath_classes TO authenticated;
GRANT SELECT, INSERT ON public.cosmath_students TO authenticated;
GRANT UPDATE(active, version) ON public.cosmath_students TO authenticated;
GRANT SELECT ON public.cosmath_lessons, public.cosmath_reports, public.cosmath_wrong_answers, public.cosmath_handoffs TO authenticated;

CREATE OR REPLACE FUNCTION public.cosmath_get_my_workspace() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(x) FROM (
    SELECT a.id, a.name, m.role FROM public.cosmath_academy_members m
    JOIN public.cosmath_academies a ON a.id = m.academy_id
    WHERE m.user_id = auth.uid() LIMIT 1
  ) x
$$;
CREATE OR REPLACE FUNCTION public.cosmath_create_workspace(p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE academy public.cosmath_academies; result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF length(trim(p_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid academy name'; END IF;
  PERFORM pg_advisory_xact_lock(72910421);
  SELECT a.* INTO academy FROM public.cosmath_academies a
    JOIN public.cosmath_academy_members m ON m.academy_id = a.id WHERE m.user_id = auth.uid() LIMIT 1;
  IF academy.id IS NULL THEN
    SELECT * INTO academy FROM public.cosmath_academies WHERE created_by IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF academy.id IS NULL THEN
      INSERT INTO public.cosmath_academies(name, created_by) VALUES (trim(p_name), auth.uid()) RETURNING * INTO academy;
    ELSE
      UPDATE public.cosmath_academies SET name = trim(p_name), created_by = auth.uid() WHERE id = academy.id RETURNING * INTO academy;
    END IF;
    INSERT INTO public.cosmath_academy_members(academy_id, user_id, role) VALUES (academy.id, auth.uid(), 'owner');
  END IF;
  SELECT jsonb_build_object('id', academy.id, 'name', academy.name, 'role', m.role) INTO result
    FROM public.cosmath_academy_members m WHERE m.academy_id = academy.id AND m.user_id = auth.uid();
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.cosmath_get_my_workspace(), public.cosmath_create_workspace(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmath_get_my_workspace(), public.cosmath_create_workspace(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cosmath_load_report_day(p_date date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'lessons', coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.cosmath_lessons l WHERE l.academy_id = public.cosmath_current_academy_id() AND l.report_date = p_date), '[]'),
    'reports', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.cosmath_reports r JOIN public.cosmath_lessons l ON l.id = r.lesson_id WHERE r.academy_id = public.cosmath_current_academy_id() AND l.report_date = p_date), '[]')
  )
$$;

CREATE OR REPLACE FUNCTION public.cosmath_save_report_batch(p_lessons jsonb, p_reports jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item jsonb; lesson_ids uuid[] := '{}'; report_ids uuid[] := '{}'; affected integer; tenant uuid := public.cosmath_current_academy_id();
BEGIN
  IF tenant IS NULL THEN RAISE EXCEPTION 'Workspace required'; END IF;
  IF jsonb_typeof(p_lessons) IS DISTINCT FROM 'array' OR jsonb_typeof(p_reports) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Expected arrays'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_lessons) ORDER BY value->>'id' LOOP
    IF (item->>'expected_version')::int = 0 THEN
      INSERT INTO public.cosmath_lessons(id, academy_id, class_id, report_date, common_data)
        SELECT (item->>'id')::uuid, tenant, (item->>'class_id')::uuid, (item->>'report_date')::date, item->'common_data'
        FROM public.cosmath_classes WHERE id = (item->>'class_id')::uuid AND academy_id = tenant;
      IF NOT FOUND THEN RAISE EXCEPTION 'Class not found'; END IF;
    ELSE
      UPDATE public.cosmath_lessons SET common_data = item->'common_data', version = version + 1, updated_at = now()
        WHERE id = (item->>'id')::uuid AND academy_id = tenant AND class_id = (item->>'class_id')::uuid AND report_date = (item->>'report_date')::date AND version = (item->>'expected_version')::int;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> 1 THEN RAISE EXCEPTION 'Lesson changed in another window' USING ERRCODE = '40001'; END IF;
    END IF;
    lesson_ids := array_append(lesson_ids, (item->>'id')::uuid);
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_reports) ORDER BY value->>'id' LOOP
    IF (item->>'expected_version')::int = 0 THEN
      PERFORM 1 FROM public.cosmath_students s JOIN public.cosmath_lessons l ON l.class_id = s.class_id AND l.academy_id = s.academy_id
        WHERE s.id = item->>'student_id' AND s.academy_id = tenant AND s.active AND l.id = (item->>'lesson_id')::uuid FOR UPDATE OF s;
      IF NOT FOUND THEN RAISE EXCEPTION 'Student archived or class changed' USING ERRCODE = '40001'; END IF;
      INSERT INTO public.cosmath_reports(id, academy_id, lesson_id, student_id, snapshot)
        VALUES ((item->>'id')::uuid, tenant, (item->>'lesson_id')::uuid, item->>'student_id', item->'snapshot');
    ELSE
      UPDATE public.cosmath_reports SET snapshot = item->'snapshot', version = version + 1, updated_at = now()
        WHERE id = (item->>'id')::uuid AND academy_id = tenant AND lesson_id = (item->>'lesson_id')::uuid AND student_id = item->>'student_id' AND version = (item->>'expected_version')::int;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> 1 THEN RAISE EXCEPTION 'Report changed in another window' USING ERRCODE = '40001'; END IF;
    END IF;
    report_ids := array_append(report_ids, (item->>'id')::uuid);
  END LOOP;
  RETURN jsonb_build_object(
    'lessons', coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.cosmath_lessons l WHERE l.academy_id = tenant AND id = ANY(lesson_ids)), '[]'),
    'reports', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.cosmath_reports r WHERE r.academy_id = tenant AND id = ANY(report_ids)), '[]')
  );
END $$;

CREATE OR REPLACE FUNCTION public.cosmath_save_wrong_answer(p_id uuid, p_student_id text, p_record_date date, p_total_wrong integer, p_corrected_count integer, p_memo text, p_expected_version integer)
RETURNS public.cosmath_wrong_answers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved public.cosmath_wrong_answers; tenant uuid := public.cosmath_current_academy_id();
BEGIN
  IF tenant IS NULL THEN RAISE EXCEPTION 'Workspace required'; END IF;
  IF p_total_wrong < 0 OR p_corrected_count < 0 OR p_corrected_count > p_total_wrong OR length(p_memo) > 2000 THEN RAISE EXCEPTION 'Invalid wrong answer counts'; END IF;
  IF p_expected_version = 0 THEN
    INSERT INTO public.cosmath_wrong_answers(id, academy_id, student_id, record_date, total_wrong, corrected_count, memo)
      SELECT p_id, tenant, p_student_id, p_record_date, p_total_wrong, p_corrected_count, p_memo FROM public.cosmath_students WHERE id = p_student_id AND academy_id = tenant AND active RETURNING * INTO saved;
  ELSE
    UPDATE public.cosmath_wrong_answers SET total_wrong=p_total_wrong, corrected_count=p_corrected_count, memo=p_memo, version=version+1, updated_at=now()
      WHERE id=p_id AND academy_id=tenant AND student_id=p_student_id AND record_date=p_record_date AND version=p_expected_version RETURNING * INTO saved;
  END IF;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'Wrong answer record changed' USING ERRCODE = '40001'; END IF;
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.cosmath_add_handoff(p_id uuid, p_date date, p_author text, p_title text, p_content text)
RETURNS public.cosmath_handoffs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved public.cosmath_handoffs; tenant uuid := public.cosmath_current_academy_id();
BEGIN
  IF tenant IS NULL THEN RAISE EXCEPTION 'Workspace required'; END IF;
  IF length(trim(p_author)) NOT BETWEEN 1 AND 100 OR length(trim(p_title)) NOT BETWEEN 1 AND 200 OR length(trim(p_content)) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Invalid handoff'; END IF;
  INSERT INTO public.cosmath_handoffs(id,academy_id,handoff_date,author,title,content) VALUES(p_id,tenant,p_date,trim(p_author),trim(p_title),trim(p_content)) RETURNING * INTO saved;
  RETURN saved;
END $$;
CREATE OR REPLACE FUNCTION public.cosmath_delete_handoff(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected integer;
BEGIN
  DELETE FROM public.cosmath_handoffs WHERE id=p_id AND academy_id=public.cosmath_current_academy_id();
  GET DIAGNOSTICS affected = ROW_COUNT; RETURN affected = 1;
END $$;

REVOKE ALL ON FUNCTION public.cosmath_load_report_day(date), public.cosmath_save_report_batch(jsonb,jsonb), public.cosmath_save_wrong_answer(uuid,text,date,integer,integer,text,integer), public.cosmath_add_handoff(uuid,date,text,text,text), public.cosmath_delete_handoff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmath_load_report_day(date), public.cosmath_save_report_batch(jsonb,jsonb), public.cosmath_save_wrong_answer(uuid,text,date,integer,integer,text,integer), public.cosmath_add_handoff(uuid,date,text,text,text), public.cosmath_delete_handoff(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
