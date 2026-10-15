BEGIN;
CREATE TABLE public.cosmath_progress_books (
 id uuid PRIMARY KEY,
 academy_id uuid NOT NULL DEFAULT public.cosmath_current_academy_id() REFERENCES public.cosmath_academies(id),
 student_id text NOT NULL,
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
 curriculum text NOT NULL CHECK (length(trim(curriculum)) BETWEEN 1 AND 100),
 course text NOT NULL CHECK (length(trim(course)) BETWEEN 1 AND 100),
 units jsonb NOT NULL CHECK (jsonb_typeof(units)='array' AND jsonb_array_length(units) BETWEEN 1 AND 300),
 states jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(states)='object'),
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,academy_id),
 FOREIGN KEY(student_id,academy_id) REFERENCES public.cosmath_students(id,academy_id) ON DELETE CASCADE
);
CREATE TABLE public.cosmath_progress_entries (
 id uuid PRIMARY KEY,
 academy_id uuid NOT NULL DEFAULT public.cosmath_current_academy_id(),
 book_id uuid NOT NULL,
 record_date date NOT NULL,
 unit_ids jsonb NOT NULL CHECK (jsonb_typeof(unit_ids)='array'),
 scope text NOT NULL DEFAULT '' CHECK(length(scope)<=2000),
 homework text NOT NULL DEFAULT '' CHECK(length(homework)<=2000),
 due_date date CHECK(due_date>=record_date),
 memo text NOT NULL DEFAULT '' CHECK(length(memo)<=2000),
 states jsonb NOT NULL CHECK(jsonb_typeof(states)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(book_id,academy_id) REFERENCES public.cosmath_progress_books(id,academy_id) ON DELETE CASCADE
);
CREATE INDEX progress_books_student ON public.cosmath_progress_books(academy_id,student_id);
CREATE INDEX progress_entries_book ON public.cosmath_progress_entries(academy_id,book_id,record_date);
ALTER TABLE public.cosmath_progress_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cosmath_progress_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cosmath_progress_books,public.cosmath_progress_entries FROM anon,authenticated;
GRANT SELECT ON public.cosmath_progress_books,public.cosmath_progress_entries TO authenticated;
CREATE POLICY progress_books_read ON public.cosmath_progress_books FOR SELECT TO authenticated USING(academy_id=public.cosmath_current_academy_id());
CREATE POLICY progress_entries_read ON public.cosmath_progress_entries FOR SELECT TO authenticated USING(academy_id=public.cosmath_current_academy_id());

-- Immutable textbook outline; every save records the resulting progress snapshot.
CREATE FUNCTION public.cosmath_save_progress(p_book jsonb,p_entry jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tenant uuid:=public.cosmath_current_academy_id(); saved public.cosmath_progress_books;
 entry public.cosmath_progress_entries; unit jsonb; pair record;
BEGIN
 IF tenant IS NULL OR jsonb_typeof(p_book) IS DISTINCT FROM 'object' OR
  NOT EXISTS(SELECT 1 FROM public.cosmath_students WHERE id=p_book->>'student_id' AND academy_id=tenant AND active) THEN
  RAISE EXCEPTION 'Invalid student';
 END IF;
 IF jsonb_typeof(p_book->'units') IS DISTINCT FROM 'array' OR jsonb_typeof(p_book->'states') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid outline'; END IF;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_book->'units')) <> jsonb_array_length(p_book->'units') THEN RAISE EXCEPTION 'Duplicate units'; END IF;
 FOR unit IN SELECT value FROM jsonb_array_elements(p_book->'units') LOOP
  IF coalesce(unit->>'id','')='' OR coalesce(trim(unit->>'name'),'')='' OR length(unit->>'name')>200
    OR unit->>'group' IS NULL OR length(unit->>'group')>200 THEN RAISE EXCEPTION 'Invalid unit'; END IF;
 END LOOP;
 FOR pair IN SELECT * FROM jsonb_each_text(p_book->'states') LOOP
  IF pair.value IS NULL OR pair.value NOT IN ('미시작','진행 중','완료') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_book->'units') u WHERE u->>'id'=pair.key) THEN RAISE EXCEPTION 'Invalid state'; END IF;
 END LOOP;
 IF (p_book->>'version')::integer=0 THEN
  INSERT INTO public.cosmath_progress_books(id,academy_id,student_id,title,curriculum,course,units,states)
   VALUES((p_book->>'id')::uuid,tenant,p_book->>'student_id',p_book->>'title',p_book->>'curriculum',p_book->>'course',p_book->'units',p_book->'states') RETURNING * INTO saved;
 ELSE
  UPDATE public.cosmath_progress_books SET states=p_book->'states',version=version+1,updated_at=now()
   WHERE id=(p_book->>'id')::uuid AND academy_id=tenant AND student_id=p_book->>'student_id'
   AND version=(p_book->>'version')::integer AND units=p_book->'units' AND title=p_book->>'title'
   AND curriculum=p_book->>'curriculum' AND course=p_book->>'course' RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'Progress changed' USING ERRCODE='40001'; END IF;
 END IF;
 IF p_entry IS NOT NULL THEN
  IF p_entry->>'book_id' IS DISTINCT FROM saved.id::text OR jsonb_typeof(p_entry->'unit_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid entry'; END IF;
  FOR unit IN SELECT value FROM jsonb_array_elements(p_entry->'unit_ids') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(saved.units) u WHERE u->>'id'=unit#>>'{}') THEN RAISE EXCEPTION 'Unknown unit'; END IF;
  END LOOP;
  INSERT INTO public.cosmath_progress_entries(id,academy_id,book_id,record_date,unit_ids,scope,homework,due_date,memo,states)
   VALUES((p_entry->>'id')::uuid,tenant,saved.id,(p_entry->>'record_date')::date,p_entry->'unit_ids',p_entry->>'scope',p_entry->>'homework',nullif(p_entry->>'due_date','')::date,p_entry->>'memo',saved.states) RETURNING * INTO entry;
 ELSE
  -- Also retain a snapshot for status-only changes, using the academy's local day.
  INSERT INTO public.cosmath_progress_entries(id,academy_id,book_id,record_date,unit_ids,states,memo)
   VALUES(gen_random_uuid(),tenant,saved.id,(now() AT TIME ZONE 'Asia/Seoul')::date,'[]',saved.states,'단원 상태 변경') RETURNING * INTO entry;
 END IF;
 RETURN jsonb_build_object('book',to_jsonb(saved),'entry',to_jsonb(entry));
END $$;
REVOKE ALL ON FUNCTION public.cosmath_save_progress(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cosmath_save_progress(jsonb,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
