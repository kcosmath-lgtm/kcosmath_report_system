-- Business conflicts must return HTTP 409, not trigger PostgREST transaction retries.
-- Preserve tenant checks, optimistic versions and atomic batch rollback.
BEGIN;

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
      IF affected <> 1 THEN RAISE EXCEPTION 'Lesson changed in another window' USING ERRCODE = 'PT409'; END IF;
    END IF;
    lesson_ids := array_append(lesson_ids, (item->>'id')::uuid);
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_reports) ORDER BY value->>'id' LOOP
    IF (item->>'expected_version')::int = 0 THEN
      PERFORM 1 FROM public.cosmath_students s JOIN public.cosmath_lessons l ON l.class_id = s.class_id AND l.academy_id = s.academy_id
        WHERE s.id = item->>'student_id' AND s.academy_id = tenant AND s.active AND l.id = (item->>'lesson_id')::uuid FOR UPDATE OF s;
      IF NOT FOUND THEN RAISE EXCEPTION 'Student archived or class changed' USING ERRCODE = 'PT409'; END IF;
      INSERT INTO public.cosmath_reports(id, academy_id, lesson_id, student_id, snapshot)
        VALUES ((item->>'id')::uuid, tenant, (item->>'lesson_id')::uuid, item->>'student_id', item->'snapshot');
    ELSE
      UPDATE public.cosmath_reports SET snapshot = item->'snapshot', version = version + 1, updated_at = now()
        WHERE id = (item->>'id')::uuid AND academy_id = tenant AND lesson_id = (item->>'lesson_id')::uuid AND student_id = item->>'student_id' AND version = (item->>'expected_version')::int;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> 1 THEN RAISE EXCEPTION 'Report changed in another window' USING ERRCODE = 'PT409'; END IF;
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
  IF saved.id IS NULL THEN RAISE EXCEPTION 'Wrong answer record changed' USING ERRCODE = 'PT409'; END IF;
  RETURN saved;
END $$;


NOTIFY pgrst, 'reload schema';
COMMIT;
