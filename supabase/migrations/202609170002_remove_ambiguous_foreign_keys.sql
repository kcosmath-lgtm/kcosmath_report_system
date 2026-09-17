-- Composite tenant-aware foreign keys supersede the original single-column
-- relationships. Keeping both makes PostgREST embedding ambiguous.
BEGIN;

ALTER TABLE public.cosmath_students
  DROP CONSTRAINT IF EXISTS cosmath_students_class_id_fkey;
ALTER TABLE public.cosmath_lessons
  DROP CONSTRAINT IF EXISTS cosmath_lessons_class_id_fkey;
ALTER TABLE public.cosmath_reports
  DROP CONSTRAINT IF EXISTS cosmath_reports_lesson_id_fkey,
  DROP CONSTRAINT IF EXISTS cosmath_reports_student_id_fkey;
ALTER TABLE public.cosmath_wrong_answers
  DROP CONSTRAINT IF EXISTS cosmath_wrong_answers_student_id_fkey;

NOTIFY pgrst, 'reload schema';
COMMIT;
