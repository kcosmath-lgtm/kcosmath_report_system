-- Run once in the Supabase SQL Editor before deploying the new application.
-- Transactional: a failure rolls back schema, migration and legacy write protection.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cosmath_settings (
  key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cosmath_legacy_backup (
  key text PRIMARY KEY, value jsonb NOT NULL, source_updated_at timestamptz, backed_up_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.cosmath_legacy_backup FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS public.cosmath_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public.cosmath_migrations FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.cosmath_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cosmath_students (
  id text PRIMARY KEY, class_id uuid NOT NULL REFERENCES public.cosmath_classes(id),
  name text NOT NULL CHECK (length(trim(name)) > 0), grade text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cosmath_students_class_idx ON public.cosmath_students(class_id);
CREATE TABLE IF NOT EXISTS public.cosmath_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL REFERENCES public.cosmath_classes(id),
  report_date date NOT NULL, common_data jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(common_data) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, report_date)
);
CREATE TABLE IF NOT EXISTS public.cosmath_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lesson_id uuid NOT NULL REFERENCES public.cosmath_lessons(id),
  student_id text NOT NULL REFERENCES public.cosmath_students(id),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, student_id)
);
CREATE INDEX IF NOT EXISTS cosmath_lessons_date_idx ON public.cosmath_lessons(report_date);
CREATE INDEX IF NOT EXISTS cosmath_reports_student_idx ON public.cosmath_reports(student_id);

-- Never seed from source-code student constants. Import only the current DB state.
DO $$
DECLARE
  v_students jsonb; v_common jsonb; v_overrides jsonb; v_group jsonb; v_student jsonb;
  v_class uuid; v_lesson uuid; v_date date; v_match text[]; v_entry record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.cosmath_migrations WHERE id = 'normalized_reports_v1') THEN RETURN; END IF;
  LOCK TABLE public.cosmath_settings IN ACCESS EXCLUSIVE MODE;
  INSERT INTO public.cosmath_legacy_backup(key, value, source_updated_at)
    SELECT key, value, updated_at FROM public.cosmath_settings
    WHERE key IN ('cosmath_student_data', 'cosmath_common_data', 'cosmath_overrides_data')
    ON CONFLICT (key) DO NOTHING;
  SELECT value INTO v_students FROM public.cosmath_settings WHERE key = 'cosmath_student_data';
  SELECT value INTO v_common FROM public.cosmath_settings WHERE key = 'cosmath_common_data';
  SELECT value INTO v_overrides FROM public.cosmath_settings WHERE key = 'cosmath_overrides_data';
  v_students := coalesce(v_students, '[]'); v_common := coalesce(v_common, '{}'); v_overrides := coalesce(v_overrides, '{}');
  IF jsonb_typeof(v_students) <> 'array' OR jsonb_typeof(v_common) <> 'object' OR jsonb_typeof(v_overrides) <> 'object' THEN
    RAISE EXCEPTION 'Invalid legacy JSON. Migration stopped; no data changed.';
  END IF;
  -- An ambiguous duplicate must be reviewed rather than resetting the whole list.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_students) g CROSS JOIN LATERAL jsonb_array_elements(g->'students') s GROUP BY s->>'id' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate legacy student IDs. Resolve duplicates before migration; no data changed.';
  END IF;
  v_match := regexp_match(v_common->>'date', '(\d{4})\D+(\d{1,2})\D+(\d{1,2})');
  v_date := CASE WHEN v_match IS NULL THEN (now() AT TIME ZONE 'Asia/Seoul')::date ELSE make_date(v_match[1]::int, v_match[2]::int, v_match[3]::int) END;
  FOR v_group IN SELECT value FROM jsonb_array_elements(v_students) LOOP
    INSERT INTO public.cosmath_classes(name) VALUES (v_group->>'group') ON CONFLICT(name) DO UPDATE SET name = excluded.name RETURNING id INTO v_class;
    FOR v_student IN SELECT value FROM jsonb_array_elements(v_group->'students') LOOP
      INSERT INTO public.cosmath_students(id, class_id, name, grade)
        VALUES (v_student->>'id', v_class, v_student->>'name', coalesce(v_student->>'grade', ''));
    END LOOP;
    IF v_common <> '{}' OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_group->'students') s WHERE v_overrides ? (s->>'id')) THEN
      INSERT INTO public.cosmath_lessons(class_id, report_date, common_data) VALUES (v_class, v_date, v_common) RETURNING id INTO v_lesson;
      INSERT INTO public.cosmath_reports(lesson_id, student_id, snapshot)
        SELECT v_lesson, s.id, v_common || coalesce(v_overrides->s.id, '{}') || jsonb_build_object('name', s.name, 'grade', s.grade, 'group', v_group->>'group', 'classId', v_class)
        FROM public.cosmath_students s WHERE s.class_id = v_class;
    END IF;
  END LOOP;
  -- Preserve report overrides whose student has already disappeared from the list.
  FOR v_entry IN SELECT key, value FROM jsonb_each(v_overrides) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.cosmath_students WHERE id = v_entry.key) THEN
      INSERT INTO public.cosmath_classes(name) VALUES ('이관된 과거 기록') ON CONFLICT(name) DO UPDATE SET name = excluded.name RETURNING id INTO v_class;
      INSERT INTO public.cosmath_students(id, class_id, name, grade, active)
        VALUES(v_entry.key, v_class, coalesce(nullif(v_entry.value->>'name', ''), '기존 학생 ' || v_entry.key), coalesce(v_entry.value->>'grade', ''), false);
      INSERT INTO public.cosmath_lessons(class_id, report_date, common_data) VALUES(v_class, v_date, v_common)
        ON CONFLICT(class_id, report_date) DO UPDATE SET common_data = excluded.common_data RETURNING id INTO v_lesson;
      INSERT INTO public.cosmath_reports(lesson_id, student_id, snapshot)
        SELECT v_lesson, s.id, v_common || v_entry.value || jsonb_build_object('name', s.name, 'grade', s.grade, 'group', '이관된 과거 기록', 'classId', v_class)
        FROM public.cosmath_students s WHERE s.id = v_entry.key;
    END IF;
  END LOOP;
  INSERT INTO public.cosmath_migrations(id) VALUES ('normalized_reports_v1');
END $$;

CREATE OR REPLACE FUNCTION public.cosmath_load_report_day(p_date date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'lessons', coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.cosmath_lessons l WHERE report_date = p_date), '[]'),
    'reports', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.cosmath_reports r JOIN public.cosmath_lessons l ON l.id = r.lesson_id WHERE l.report_date = p_date), '[]')
  );
$$;

-- Version checks and all selected writes commit together, or none do.
CREATE OR REPLACE FUNCTION public.cosmath_save_report_batch(p_lessons jsonb, p_reports jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item jsonb; lesson_ids uuid[] := '{}'; report_ids uuid[] := '{}'; affected integer;
BEGIN
  IF jsonb_typeof(p_lessons) IS DISTINCT FROM 'array' OR jsonb_typeof(p_reports) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Expected arrays'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_lessons) ORDER BY value->>'id' LOOP
    IF (item->>'expected_version')::int = 0 THEN
      INSERT INTO public.cosmath_lessons(id, class_id, report_date, common_data)
        VALUES ((item->>'id')::uuid, (item->>'class_id')::uuid, (item->>'report_date')::date, item->'common_data');
    ELSE
      UPDATE public.cosmath_lessons SET common_data = item->'common_data', version = version + 1, updated_at = now()
        WHERE id = (item->>'id')::uuid AND class_id = (item->>'class_id')::uuid AND report_date = (item->>'report_date')::date AND version = (item->>'expected_version')::int;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> 1 THEN RAISE EXCEPTION 'Lesson changed in another window' USING ERRCODE = '40001'; END IF;
    END IF;
    lesson_ids := array_append(lesson_ids, (item->>'id')::uuid);
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_reports) ORDER BY value->>'id' LOOP
    IF (item->>'expected_version')::int = 0 THEN
      -- Lock the student so archiving and creating a new report cannot race.
      PERFORM 1 FROM public.cosmath_students s JOIN public.cosmath_lessons l ON l.class_id = s.class_id
        WHERE s.id = item->>'student_id' AND s.active AND l.id = (item->>'lesson_id')::uuid FOR UPDATE OF s;
      IF NOT FOUND THEN RAISE EXCEPTION 'Student archived or class changed' USING ERRCODE = '40001'; END IF;
      INSERT INTO public.cosmath_reports(id, lesson_id, student_id, snapshot)
        VALUES ((item->>'id')::uuid, (item->>'lesson_id')::uuid, item->>'student_id', item->'snapshot');
    ELSE
      UPDATE public.cosmath_reports SET snapshot = item->'snapshot', version = version + 1, updated_at = now()
        WHERE id = (item->>'id')::uuid AND lesson_id = (item->>'lesson_id')::uuid AND student_id = item->>'student_id' AND version = (item->>'expected_version')::int;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> 1 THEN RAISE EXCEPTION 'Report changed in another window' USING ERRCODE = '40001'; END IF;
    END IF;
    report_ids := array_append(report_ids, (item->>'id')::uuid);
  END LOOP;
  RETURN jsonb_build_object(
    'lessons', coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.cosmath_lessons l WHERE id = ANY(lesson_ids)), '[]'),
    'reports', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.cosmath_reports r WHERE id = ANY(report_ids)), '[]')
  );
END $$;

-- Preserve the existing internal-app access model; report writes only through CAS RPC.
REVOKE ALL ON public.cosmath_classes, public.cosmath_students, public.cosmath_lessons, public.cosmath_reports FROM anon, authenticated;
GRANT SELECT, INSERT ON public.cosmath_classes TO anon, authenticated;
GRANT SELECT, INSERT ON public.cosmath_students TO anon, authenticated;
GRANT UPDATE(active, version) ON public.cosmath_students TO anon, authenticated;
GRANT SELECT ON public.cosmath_lessons, public.cosmath_reports TO anon, authenticated;
REVOKE ALL ON FUNCTION public.cosmath_save_report_batch(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cosmath_load_report_day(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmath_save_report_batch(jsonb, jsonb), public.cosmath_load_report_day(date) TO anon, authenticated;

-- Old tabs must not continue writing the retired JSON keys after cutover.
CREATE OR REPLACE FUNCTION public.cosmath_block_legacy_writes() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP <> 'INSERT' AND OLD.key IN ('cosmath_student_data', 'cosmath_common_data', 'cosmath_overrides_data'))
    OR (TG_OP <> 'DELETE' AND NEW.key IN ('cosmath_student_data', 'cosmath_common_data', 'cosmath_overrides_data')) THEN
    RAISE EXCEPTION 'Storage migrated. Reload the updated application.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cosmath_legacy_readonly ON public.cosmath_settings;
CREATE TRIGGER cosmath_legacy_readonly BEFORE INSERT OR UPDATE OR DELETE ON public.cosmath_settings FOR EACH ROW EXECUTE FUNCTION public.cosmath_block_legacy_writes();

NOTIFY pgrst, 'reload schema';
COMMIT;
