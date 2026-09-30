BEGIN;
ALTER TABLE public.cosmath_wrong_answers
  ADD COLUMN homework_status text CHECK (homework_status IN ('O', '△', 'X'));

CREATE OR REPLACE FUNCTION public.cosmath_save_wrong_answer_homework(
  p_id uuid, p_student_id text, p_record_date date, p_total_wrong integer,
  p_corrected_count integer, p_memo text, p_expected_version integer,
  p_completed boolean, p_homework_status text
) RETURNS public.cosmath_wrong_answers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved public.cosmath_wrong_answers;
BEGIN
  IF p_homework_status IS NOT NULL AND p_homework_status NOT IN ('O', '△', 'X') THEN
    RAISE EXCEPTION 'Invalid homework status' USING ERRCODE = '22023';
  END IF;
  saved := public.cosmath_save_wrong_answer_status(
    p_id,p_student_id,p_record_date,p_total_wrong,p_corrected_count,p_memo,p_expected_version,p_completed);
  UPDATE public.cosmath_wrong_answers SET homework_status=p_homework_status
    WHERE id=saved.id AND academy_id=public.cosmath_current_academy_id() RETURNING * INTO saved;
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.cosmath_save_wrong_answer_homework(uuid,text,date,integer,integer,text,integer,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cosmath_save_wrong_answer_homework(uuid,text,date,integer,integer,text,integer,boolean,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
