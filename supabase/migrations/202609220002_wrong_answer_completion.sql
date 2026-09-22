BEGIN;
ALTER TABLE public.cosmath_wrong_answers ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.cosmath_save_wrong_answer_status(
  p_id uuid, p_student_id text, p_record_date date, p_total_wrong integer,
  p_corrected_count integer, p_memo text, p_expected_version integer, p_completed boolean
) RETURNS public.cosmath_wrong_answers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved public.cosmath_wrong_answers;
BEGIN
  IF p_completed IS NULL THEN RAISE EXCEPTION 'Completion status required'; END IF;
  saved := public.cosmath_save_wrong_answer(p_id,p_student_id,p_record_date,p_total_wrong,p_corrected_count,p_memo,p_expected_version);
  UPDATE public.cosmath_wrong_answers SET completed=p_completed
    WHERE id=saved.id AND academy_id=public.cosmath_current_academy_id() RETURNING * INTO saved;
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.cosmath_save_wrong_answer_status(uuid,text,date,integer,integer,text,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cosmath_save_wrong_answer_status(uuid,text,date,integer,integer,text,integer,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
