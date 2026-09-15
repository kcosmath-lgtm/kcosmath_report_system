-- Run after supabase_schema.sql. Explicit preview data only; never runs on app load.
BEGIN;
INSERT INTO public.cosmath_classes(name) VALUES ('[예시] 보고서 확인반') ON CONFLICT(name) DO NOTHING;
INSERT INTO public.cosmath_students(id, class_id, name, grade)
SELECT example.id, c.id, example.name, example.grade
FROM public.cosmath_classes c
CROSS JOIN (VALUES
  ('cosmath-example-preview-elementary', '김예시', '초6'),
  ('cosmath-example-preview-middle', '이예시', '중2'),
  ('cosmath-example-preview-high', '박예시', '고1')
) AS example(id, name, grade)
WHERE c.name = '[예시] 보고서 확인반'
ON CONFLICT(id) DO NOTHING;
COMMIT;
