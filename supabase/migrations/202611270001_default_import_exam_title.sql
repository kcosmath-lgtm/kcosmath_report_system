-- Add default_import_exam_title to cosmath_academy_ai_settings and provide RPCs for academy default exam title
BEGIN;

ALTER TABLE public.cosmath_academy_ai_settings
  ADD COLUMN IF NOT EXISTS default_import_exam_title text NOT NULL DEFAULT 'EOM테스트';

CREATE OR REPLACE FUNCTION public.cosmath_get_default_import_exam_title()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_academy_id uuid := public.cosmath_current_academy_id();
  v_title text;
BEGIN
  IF v_academy_id IS NULL THEN
    RETURN 'EOM테스트';
  END IF;

  SELECT default_import_exam_title
    INTO v_title
    FROM public.cosmath_academy_ai_settings
   WHERE academy_id = v_academy_id;

  RETURN coalesce(nullif(trim(v_title), ''), 'EOM테스트');
END;
$$;

CREATE OR REPLACE FUNCTION public.cosmath_set_default_import_exam_title(p_title text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_academy_id uuid := public.cosmath_current_academy_id();
  v_clean text := coalesce(nullif(trim(p_title), ''), 'EOM테스트');
BEGIN
  IF v_academy_id IS NULL THEN
    RAISE EXCEPTION 'Academy workspace required';
  END IF;

  IF char_length(v_clean) > 100 THEN
    RAISE EXCEPTION '기본 시험명은 100자 이하로 입력해 주세요.';
  END IF;

  INSERT INTO public.cosmath_academy_ai_settings (
    academy_id,
    default_import_exam_title,
    updated_by,
    updated_at
  )
  VALUES (
    v_academy_id,
    v_clean,
    auth.uid(),
    now()
  )
  ON CONFLICT (academy_id) DO UPDATE
    SET default_import_exam_title = EXCLUDED.default_import_exam_title,
        updated_by = auth.uid(),
        updated_at = now();

  RETURN v_clean;
END;
$$;

REVOKE ALL ON FUNCTION public.cosmath_get_default_import_exam_title() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cosmath_set_default_import_exam_title(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmath_get_default_import_exam_title() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cosmath_set_default_import_exam_title(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
