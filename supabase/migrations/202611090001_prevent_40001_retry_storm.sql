-- Replace ERRCODE='40001' (serialization_failure, which triggers ~600 PostgREST retries)
-- with ERRCODE='PT409' (HTTP 409 Conflict, non-retryable) across all optimistic-concurrency RPCs.
BEGIN;

CREATE OR REPLACE FUNCTION public.cosmath_save_student_daily(p_items jsonb) RETURNS jsonb
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
   IF NOT FOUND THEN RAISE EXCEPTION 'Record changed' USING ERRCODE='PT409'; END IF;
  END IF;
  saved_wrong:=public.cosmath_save_wrong_answer_homework((w->>'id')::uuid,w->>'student_id',(w->>'record_date')::date,
   (w->>'total_wrong')::integer,(w->>'corrected_count')::integer,w->>'memo',(w->>'version')::integer,
   coalesce((w->>'completed')::boolean,false),w->>'homework_status');
  output:=output||jsonb_build_array(jsonb_build_object('daily',to_jsonb(saved),'wrong',to_jsonb(saved_wrong)));
 END LOOP;
 RETURN output;
END $$;

CREATE OR REPLACE FUNCTION public.cosmath_edit_student(p_id text,p_name text,p_grade text,p_expected_version integer)
RETURNS public.cosmath_students LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved public.cosmath_students;
BEGIN
 IF p_name IS NULL OR p_grade IS NULL OR char_length(trim(p_name)) NOT BETWEEN 1 AND 100 OR char_length(trim(p_grade)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid student details'; END IF;
 UPDATE public.cosmath_students SET name=trim(p_name),grade=trim(p_grade),version=version+1
 WHERE id=p_id AND academy_id=public.cosmath_current_academy_id() AND active AND version=p_expected_version RETURNING * INTO saved;
 IF NOT FOUND THEN RAISE EXCEPTION 'Student changed' USING ERRCODE='PT409'; END IF;
 RETURN saved;
END $$;

DO $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'cosmath_save_progress_base'
 ) THEN
  EXECUTE $fn$
   CREATE OR REPLACE FUNCTION public.cosmath_save_progress_base(p_book jsonb,p_entry jsonb DEFAULT NULL) RETURNS jsonb
   LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $body$
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
     IF NOT FOUND THEN RAISE EXCEPTION 'Progress changed' USING ERRCODE='PT409'; END IF;
    END IF;
    IF p_entry IS NOT NULL THEN
     IF p_entry->>'book_id' IS DISTINCT FROM saved.id::text OR jsonb_typeof(p_entry->'unit_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid entry'; END IF;
     FOR unit IN SELECT value FROM jsonb_array_elements(p_entry->'unit_ids') LOOP
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(saved.units) u WHERE u->>'id'=unit#>>'{}') THEN RAISE EXCEPTION 'Unknown unit'; END IF;
     END LOOP;
     INSERT INTO public.cosmath_progress_entries(id,academy_id,book_id,record_date,unit_ids,scope,homework,due_date,memo,states)
      VALUES((p_entry->>'id')::uuid,tenant,saved.id,(p_entry->>'record_date')::date,p_entry->'unit_ids',p_entry->>'scope',p_entry->>'homework',nullif(p_entry->>'due_date','')::date,p_entry->>'memo',saved.states) RETURNING * INTO entry;
    ELSE
     INSERT INTO public.cosmath_progress_entries(id,academy_id,book_id,record_date,unit_ids,states,memo)
      VALUES(gen_random_uuid(),tenant,saved.id,(now() AT TIME ZONE 'Asia/Seoul')::date,'[]',saved.states,'단원 상태 변경') RETURNING * INTO entry;
    END IF;
    RETURN jsonb_build_object('book',to_jsonb(saved),'entry',to_jsonb(entry));
   END $body$;
  $fn$;

  EXECUTE $fn$
   CREATE OR REPLACE FUNCTION public.cosmath_save_progress(p_book jsonb,p_entry jsonb DEFAULT NULL) RETURNS jsonb
   LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $body$
   DECLARE result jsonb; saved public.cosmath_progress_books; entry public.cosmath_progress_entries; pages integer:=coalesce((p_book->>'total_pages')::integer,0); done integer:=coalesce((p_book->>'completed_page')::integer,0);
   BEGIN
    IF pages<0 OR pages>10000 OR done<0 OR done>pages THEN RAISE EXCEPTION 'Invalid page progress'; END IF;
    IF (p_book->>'version')::integer>0 AND NOT EXISTS(SELECT 1 FROM public.cosmath_progress_books WHERE id=(p_book->>'id')::uuid AND academy_id=public.cosmath_current_academy_id() AND NOT archived AND total_pages=pages) THEN RAISE EXCEPTION 'Book changed' USING ERRCODE='PT409'; END IF;
    result:=public.cosmath_save_progress_base(p_book,p_entry);
    UPDATE public.cosmath_progress_books SET total_pages=pages,completed_page=done WHERE id=(result->'book'->>'id')::uuid RETURNING * INTO saved;
    UPDATE public.cosmath_progress_entries SET units_snapshot=saved.units,total_pages_snapshot=pages,completed_page=done WHERE id=(result->'entry'->>'id')::uuid RETURNING * INTO entry;
    RETURN jsonb_build_object('book',to_jsonb(saved),'entry',to_jsonb(entry));
   END $body$;
  $fn$;
 END IF;
END $$;

DO $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'cosmath_manage_class_book'
 ) THEN
  EXECUTE $fn$
   CREATE OR REPLACE FUNCTION public.cosmath_manage_class_book(p_action text,p_book jsonb,p_students jsonb DEFAULT '[]') RETURNS jsonb
   LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $body$
   DECLARE tenant uuid:=public.cosmath_current_academy_id(); saved public.cosmath_class_books; b public.cosmath_progress_books; student text; output jsonb:='[]'; u jsonb;
   BEGIN
    IF tenant IS NULL THEN RAISE EXCEPTION 'No workspace'; END IF;
    IF p_action='save' THEN
     IF NOT EXISTS(SELECT 1 FROM public.cosmath_classes WHERE id=(p_book->>'class_id')::uuid AND academy_id=tenant) THEN RAISE EXCEPTION 'Invalid class'; END IF;
     IF jsonb_typeof(p_book->'units') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid units'; END IF;
     IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_book->'units'))<>jsonb_array_length(p_book->'units') THEN RAISE EXCEPTION 'Duplicate units'; END IF;
     FOR u IN SELECT value FROM jsonb_array_elements(p_book->'units') LOOP
      IF coalesce(u->>'id','')='' OR coalesce(trim(u->>'name'),'')='' OR length(u->>'name')>200 OR u->>'group' IS NULL THEN RAISE EXCEPTION 'Invalid unit'; END IF;
     END LOOP;
     IF (p_book->>'version')::integer=0 THEN
      INSERT INTO public.cosmath_class_books(id,academy_id,class_id,title,curriculum,course,units,total_pages) VALUES((p_book->>'id')::uuid,tenant,(p_book->>'class_id')::uuid,p_book->>'title',p_book->>'curriculum',p_book->>'course',p_book->'units',(p_book->>'total_pages')::integer) RETURNING * INTO saved;
     ELSE
      UPDATE public.cosmath_class_books SET title=p_book->>'title',curriculum=p_book->>'curriculum',course=p_book->>'course',units=p_book->'units',total_pages=(p_book->>'total_pages')::integer,version=version+1 WHERE id=(p_book->>'id')::uuid AND academy_id=tenant AND class_id=(p_book->>'class_id')::uuid AND version=(p_book->>'version')::integer AND NOT archived RETURNING * INTO saved;
      IF NOT FOUND THEN RAISE EXCEPTION 'Book changed' USING ERRCODE='PT409'; END IF;
      UPDATE public.cosmath_progress_books assigned_book SET title=saved.title,curriculum=saved.curriculum,course=saved.course,units=saved.units,total_pages=saved.total_pages,completed_page=least(assigned_book.completed_page,saved.total_pages),states=coalesce((SELECT jsonb_object_agg(key,value) FROM jsonb_each(assigned_book.states) WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(saved.units) catalog_unit WHERE catalog_unit->>'id'=key)),'{}'),version=assigned_book.version+1 WHERE library_id=saved.id AND academy_id=tenant AND NOT archived;
     END IF;
     RETURN to_jsonb(saved);
    END IF;
    SELECT * INTO saved FROM public.cosmath_class_books WHERE id=(p_book->>'id')::uuid AND academy_id=tenant AND NOT archived FOR UPDATE;
    IF NOT FOUND OR saved.version IS DISTINCT FROM (p_book->>'version')::integer THEN RAISE EXCEPTION 'Book changed' USING ERRCODE='PT409'; END IF;
    IF p_action='delete' THEN
     UPDATE public.cosmath_class_books SET archived=true,version=version+1 WHERE id=saved.id;
     UPDATE public.cosmath_progress_books SET archived=true,version=version+1 WHERE library_id=saved.id AND academy_id=tenant;
     RETURN to_jsonb(saved);
    END IF;
    IF p_action<>'assign' OR jsonb_typeof(p_students) IS DISTINCT FROM 'array' OR jsonb_array_length(p_students) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid action'; END IF;
    FOR student IN SELECT DISTINCT value#>>'{}' FROM jsonb_array_elements(p_students) LOOP
     IF NOT EXISTS(SELECT 1 FROM public.cosmath_students WHERE id=student AND academy_id=tenant AND class_id=saved.class_id AND active) THEN RAISE EXCEPTION 'Student outside class'; END IF;
     SELECT * INTO b FROM public.cosmath_progress_books WHERE student_id=student AND library_id=saved.id AND NOT archived;
     IF NOT FOUND THEN
      INSERT INTO public.cosmath_progress_books(id,academy_id,student_id,title,curriculum,course,units,states,library_id,total_pages) VALUES(gen_random_uuid(),tenant,student,saved.title,saved.curriculum,saved.course,saved.units,'{}',saved.id,saved.total_pages) RETURNING * INTO b;
     END IF;
     output:=output||jsonb_build_array(to_jsonb(b));
    END LOOP;
    RETURN output;
   END $body$;
  $fn$;
 END IF;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
