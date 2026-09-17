-- Permanent tenant-scoped deletion for student administration.
BEGIN;

CREATE OR REPLACE FUNCTION public.cosmath_delete_student(p_student_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tenant uuid := public.cosmath_current_academy_id(); affected integer;
BEGIN
  IF tenant IS NULL THEN RAISE EXCEPTION 'Workspace required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cosmath_students WHERE id = p_student_id AND academy_id = tenant) THEN RETURN false; END IF;
  DELETE FROM public.cosmath_reports WHERE student_id = p_student_id AND academy_id = tenant;
  DELETE FROM public.cosmath_wrong_answers WHERE student_id = p_student_id AND academy_id = tenant;
  DELETE FROM public.cosmath_students WHERE id = p_student_id AND academy_id = tenant;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END $$;

CREATE OR REPLACE FUNCTION public.cosmath_delete_class(p_class_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tenant uuid := public.cosmath_current_academy_id(); affected integer;
BEGIN
  IF tenant IS NULL THEN RAISE EXCEPTION 'Workspace required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cosmath_classes WHERE id = p_class_id AND academy_id = tenant) THEN RETURN false; END IF;
  DELETE FROM public.cosmath_reports
    WHERE academy_id = tenant AND (
      lesson_id IN (SELECT id FROM public.cosmath_lessons WHERE class_id = p_class_id AND academy_id = tenant)
      OR student_id IN (SELECT id FROM public.cosmath_students WHERE class_id = p_class_id AND academy_id = tenant)
    );
  DELETE FROM public.cosmath_wrong_answers
    WHERE academy_id = tenant AND student_id IN (SELECT id FROM public.cosmath_students WHERE class_id = p_class_id AND academy_id = tenant);
  DELETE FROM public.cosmath_lessons WHERE class_id = p_class_id AND academy_id = tenant;
  DELETE FROM public.cosmath_students WHERE class_id = p_class_id AND academy_id = tenant;
  DELETE FROM public.cosmath_classes WHERE id = p_class_id AND academy_id = tenant;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END $$;

REVOKE ALL ON FUNCTION public.cosmath_delete_student(text), public.cosmath_delete_class(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmath_delete_student(text), public.cosmath_delete_class(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
