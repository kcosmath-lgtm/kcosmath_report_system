-- Report saves overwrite the same class/day and student report in commit order.
-- Keep academy isolation and atomic batches; other features retain version checks.
BEGIN;
CREATE OR REPLACE FUNCTION public.cosmath_save_report_batch(p_lessons jsonb, p_reports jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item jsonb; tenant uuid := public.cosmath_current_academy_id();
  saved_id uuid; target_lesson uuid; lesson_map jsonb := '{}';
  lesson_ids uuid[] := '{}'; report_ids uuid[] := '{}';
BEGIN
  IF tenant IS NULL THEN RAISE EXCEPTION 'Workspace required'; END IF;
  IF jsonb_typeof(p_lessons) IS DISTINCT FROM 'array' OR jsonb_typeof(p_reports) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Expected arrays';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant::text, 72910422));
  FOR item IN SELECT value FROM jsonb_array_elements(p_lessons) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.cosmath_classes WHERE id=(item->>'class_id')::uuid AND academy_id=tenant) THEN
      RAISE EXCEPTION 'Class not found';
    END IF;
    -- Rolling reports reuse an existing lesson ID even on a later editing day.
    UPDATE public.cosmath_lessons SET common_data=common_data || coalesce(item->'patch',item->'common_data'), version=version+1, updated_at=now()
      WHERE id=(item->>'id')::uuid AND academy_id=tenant AND class_id=(item->>'class_id')::uuid
      RETURNING id INTO saved_id;
    IF NOT FOUND THEN
    INSERT INTO public.cosmath_lessons(id,academy_id,class_id,report_date,common_data)
      VALUES ((item->>'id')::uuid,tenant,(item->>'class_id')::uuid,(item->>'report_date')::date,item->'common_data')
    ON CONFLICT (class_id,report_date) DO UPDATE
      SET common_data=cosmath_lessons.common_data || coalesce(item->'patch',EXCLUDED.common_data), version=cosmath_lessons.version+1, updated_at=now()
      WHERE cosmath_lessons.academy_id=tenant
    RETURNING id INTO saved_id;
    END IF;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'Class not found'; END IF;
    lesson_map := lesson_map || jsonb_build_object(item->>'id',saved_id);
    lesson_ids := array_append(lesson_ids,saved_id);
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_reports) LOOP
    target_lesson := coalesce((lesson_map->>(item->>'lesson_id'))::uuid,(item->>'lesson_id')::uuid);
    PERFORM 1 FROM public.cosmath_students s
      JOIN public.cosmath_lessons l ON l.class_id=s.class_id AND l.academy_id=s.academy_id
      WHERE s.id=item->>'student_id' AND s.academy_id=tenant AND l.id=target_lesson
        AND (s.active OR EXISTS (SELECT 1 FROM public.cosmath_reports r WHERE r.lesson_id=l.id AND r.student_id=s.id AND r.academy_id=tenant))
      FOR UPDATE OF s;
    IF NOT FOUND THEN RAISE EXCEPTION 'Student archived or class changed' USING ERRCODE='PT409'; END IF;
    UPDATE public.cosmath_reports SET snapshot=snapshot || coalesce(item->'patch',item->'snapshot'), version=version+1, updated_at=now()
      WHERE id=(item->>'id')::uuid AND academy_id=tenant AND student_id=item->>'student_id'
      RETURNING id INTO saved_id;
    IF NOT FOUND THEN
    INSERT INTO public.cosmath_reports(id,academy_id,lesson_id,student_id,snapshot)
      VALUES ((item->>'id')::uuid,tenant,target_lesson,item->>'student_id',item->'snapshot')
    ON CONFLICT (lesson_id,student_id) DO UPDATE
      SET snapshot=cosmath_reports.snapshot || coalesce(item->'patch',EXCLUDED.snapshot), version=cosmath_reports.version+1, updated_at=now()
      WHERE cosmath_reports.academy_id=tenant
    RETURNING id INTO saved_id;
    END IF;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
    report_ids := array_append(report_ids,saved_id);
  END LOOP;
  RETURN jsonb_build_object(
    'lessons',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.cosmath_lessons l WHERE l.academy_id=tenant AND l.id=ANY(lesson_ids)),'[]'),
    'reports',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.cosmath_reports r WHERE r.academy_id=tenant AND r.id=ANY(report_ids)),'[]')
  );
END $$;
REVOKE ALL ON FUNCTION public.cosmath_save_report_batch(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cosmath_save_report_batch(jsonb,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
