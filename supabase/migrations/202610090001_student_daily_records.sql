BEGIN;
CREATE TABLE public.cosmath_student_daily_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 academy_id uuid NOT NULL DEFAULT public.cosmath_current_academy_id() REFERENCES public.cosmath_academies(id),
 student_id text NOT NULL,
 record_date date NOT NULL,
 attendance text NOT NULL DEFAULT '' CHECK (attendance IN ('','출석','지각','결석','조퇴')),
 reason text NOT NULL DEFAULT '' CHECK (char_length(reason)<=2000),
 exams jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(exams)='array' AND jsonb_array_length(exams)<=20),
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(student_id,record_date),
 FOREIGN KEY(student_id,academy_id) REFERENCES public.cosmath_students(id,academy_id) ON DELETE CASCADE
);
ALTER TABLE public.cosmath_student_daily_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cosmath_student_daily_records FROM anon,authenticated;
GRANT SELECT ON public.cosmath_student_daily_records TO authenticated;
CREATE POLICY daily_academy_read ON public.cosmath_student_daily_records FOR SELECT TO authenticated
 USING (academy_id=public.cosmath_current_academy_id());
CREATE INDEX daily_academy_date ON public.cosmath_student_daily_records(academy_id,record_date);
CREATE FUNCTION public.cosmath_save_student_daily(p_items jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tenant uuid:=public.cosmath_current_academy_id(); item jsonb; d jsonb; w jsonb; exam jsonb;
 saved public.cosmath_student_daily_records; saved_wrong public.cosmath_wrong_answers; output jsonb:='[]';
BEGIN
 IF tenant IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)>500 THEN RAISE EXCEPTION 'Invalid batch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(tenant::text,72910423));
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  d:=item->'daily'; w:=item->'wrong';
  IF d->>'student_id' IS DISTINCT FROM w->>'student_id' OR d->>'record_date' IS DISTINCT FROM w->>'record_date'
   OR NOT EXISTS(SELECT 1 FROM public.cosmath_students WHERE id=d->>'student_id' AND academy_id=tenant AND active)
   OR jsonb_typeof(d->'exams') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid student record'; END IF;
  FOR exam IN SELECT value FROM jsonb_array_elements(d->'exams') LOOP
   IF coalesce(trim(exam->>'name'),'')='' OR jsonb_typeof(exam->'score') IS DISTINCT FROM 'number'
    OR jsonb_typeof(exam->'max_score') IS DISTINCT FROM 'number' OR (exam->>'score')::numeric<0
    OR (exam->>'max_score')::numeric<=0 OR (exam->>'score')::numeric>(exam->>'max_score')::numeric THEN RAISE EXCEPTION 'Invalid exam'; END IF;
  END LOOP;
  IF (d->>'version')::integer=0 THEN
   INSERT INTO public.cosmath_student_daily_records(id,academy_id,student_id,record_date,attendance,reason,exams)
    VALUES((d->>'id')::uuid,tenant,d->>'student_id',(d->>'record_date')::date,d->>'attendance',d->>'reason',d->'exams') RETURNING * INTO saved;
  ELSE
   UPDATE public.cosmath_student_daily_records SET attendance=d->>'attendance',reason=d->>'reason',exams=d->'exams',version=version+1,updated_at=now()
    WHERE id=(d->>'id')::uuid AND academy_id=tenant AND student_id=d->>'student_id' AND record_date=(d->>'record_date')::date AND version=(d->>'version')::integer RETURNING * INTO saved;
   IF NOT FOUND THEN RAISE EXCEPTION 'Record changed' USING ERRCODE='40001'; END IF;
  END IF;
  saved_wrong:=public.cosmath_save_wrong_answer_homework((w->>'id')::uuid,w->>'student_id',(w->>'record_date')::date,
   (w->>'total_wrong')::integer,(w->>'corrected_count')::integer,w->>'memo',(w->>'version')::integer,
   coalesce((w->>'completed')::boolean,false),w->>'homework_status');
  output:=output||jsonb_build_array(jsonb_build_object('daily',to_jsonb(saved),'wrong',to_jsonb(saved_wrong)));
 END LOOP;
 RETURN output;
END $$;
REVOKE ALL ON FUNCTION public.cosmath_save_student_daily(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cosmath_save_student_daily(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
