BEGIN;

CREATE TABLE IF NOT EXISTS public.cosmath_wrong_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL REFERENCES public.cosmath_students(id),
  record_date date NOT NULL,
  total_wrong integer NOT NULL DEFAULT 0 CHECK (total_wrong >= 0),
  corrected_count integer NOT NULL DEFAULT 0 CHECK (corrected_count >= 0 AND corrected_count <= total_wrong),
  memo text NOT NULL DEFAULT '' CHECK (length(memo) <= 2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, record_date)
);
CREATE INDEX IF NOT EXISTS cosmath_wrong_answers_date_idx ON public.cosmath_wrong_answers(record_date);

CREATE OR REPLACE FUNCTION public.cosmath_save_wrong_answer(
  p_id uuid, p_student_id text, p_record_date date, p_total_wrong integer,
  p_corrected_count integer, p_memo text, p_expected_version integer
) RETURNS public.cosmath_wrong_answers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved public.cosmath_wrong_answers;
BEGIN
  IF p_total_wrong < 0 OR p_corrected_count < 0 OR p_corrected_count > p_total_wrong OR length(p_memo) > 2000 THEN
    RAISE EXCEPTION 'Invalid wrong answer counts';
  END IF;
  IF p_expected_version = 0 THEN
    INSERT INTO public.cosmath_wrong_answers(id, student_id, record_date, total_wrong, corrected_count, memo)
      SELECT p_id, p_student_id, p_record_date, p_total_wrong, p_corrected_count, p_memo
      FROM public.cosmath_students WHERE id = p_student_id AND active
      RETURNING * INTO saved;
  ELSE
    UPDATE public.cosmath_wrong_answers SET total_wrong = p_total_wrong, corrected_count = p_corrected_count,
      memo = p_memo, version = version + 1, updated_at = now()
      WHERE id = p_id AND student_id = p_student_id AND record_date = p_record_date AND version = p_expected_version
      RETURNING * INTO saved;
  END IF;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'Wrong answer record changed' USING ERRCODE = '40001'; END IF;
  RETURN saved;
END $$;

REVOKE ALL ON public.cosmath_wrong_answers FROM anon, authenticated;
GRANT SELECT ON public.cosmath_wrong_answers TO anon, authenticated;
REVOKE ALL ON FUNCTION public.cosmath_save_wrong_answer(uuid, text, date, integer, integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmath_save_wrong_answer(uuid, text, date, integer, integer, text, integer) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
