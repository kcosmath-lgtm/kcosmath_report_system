-- Treat each student's report as a rolling record instead of a daily record.
-- Existing history is preserved; the newest report and lesson are returned and
-- subsequent saves update those same rows through cosmath_save_report_batch.
BEGIN;

CREATE OR REPLACE FUNCTION public.cosmath_load_report_day(p_date date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH tenant AS (
    SELECT public.cosmath_current_academy_id() AS id
  ),
  latest_lessons AS (
    SELECT DISTINCT ON (l.class_id) l.*
    FROM public.cosmath_lessons l, tenant t
    WHERE l.academy_id = t.id
    ORDER BY l.class_id, l.report_date DESC, l.updated_at DESC, l.id DESC
  ),
  latest_reports AS (
    SELECT DISTINCT ON (r.student_id) r.*
    FROM public.cosmath_reports r
    JOIN public.cosmath_lessons l
      ON l.id = r.lesson_id AND l.academy_id = r.academy_id
    JOIN tenant t ON r.academy_id = t.id
    ORDER BY r.student_id, l.report_date DESC, r.updated_at DESC, r.id DESC
  )
  SELECT jsonb_build_object(
    'lessons', coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM latest_lessons l), '[]'::jsonb),
    'reports', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM latest_reports r), '[]'::jsonb)
  )
$$;

REVOKE ALL ON FUNCTION public.cosmath_load_report_day(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmath_load_report_day(date) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
