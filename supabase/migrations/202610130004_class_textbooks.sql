BEGIN;
CREATE TABLE public.cosmath_class_books (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), academy_id uuid NOT NULL DEFAULT public.cosmath_current_academy_id(),
 class_id uuid NOT NULL, title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 150),
 curriculum text NOT NULL, course text NOT NULL, units jsonb NOT NULL CHECK(jsonb_typeof(units)='array' AND jsonb_array_length(units) BETWEEN 1 AND 300),
 total_pages integer NOT NULL DEFAULT 0 CHECK(total_pages BETWEEN 0 AND 10000), version integer NOT NULL DEFAULT 1, archived boolean NOT NULL DEFAULT false,
 UNIQUE(id,academy_id), FOREIGN KEY(class_id,academy_id) REFERENCES public.cosmath_classes(id,academy_id) ON DELETE CASCADE
);
ALTER TABLE public.cosmath_class_books ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cosmath_class_books FROM anon,authenticated;
GRANT SELECT ON public.cosmath_class_books TO authenticated;
CREATE POLICY class_books_read ON public.cosmath_class_books FOR SELECT TO authenticated USING(academy_id=public.cosmath_current_academy_id());
ALTER TABLE public.cosmath_progress_books ADD COLUMN library_id uuid, ADD COLUMN total_pages integer NOT NULL DEFAULT 0 CHECK(total_pages BETWEEN 0 AND 10000), ADD COLUMN completed_page integer NOT NULL DEFAULT 0 CHECK(completed_page BETWEEN 0 AND total_pages), ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.cosmath_progress_books ADD FOREIGN KEY(library_id,academy_id) REFERENCES public.cosmath_class_books(id,academy_id) ON DELETE SET NULL (library_id);
CREATE UNIQUE INDEX progress_library_student ON public.cosmath_progress_books(student_id,library_id) WHERE NOT archived AND library_id IS NOT NULL;
ALTER TABLE public.cosmath_progress_entries ADD COLUMN units_snapshot jsonb, ADD COLUMN total_pages_snapshot integer NOT NULL DEFAULT 0, ADD COLUMN completed_page integer NOT NULL DEFAULT 0;
UPDATE public.cosmath_progress_entries e SET units_snapshot=b.units FROM public.cosmath_progress_books b WHERE b.id=e.book_id;
INSERT INTO public.cosmath_class_books(academy_id,class_id,title,curriculum,course,units)
 SELECT DISTINCT b.academy_id,s.class_id,b.title,b.curriculum,b.course,b.units FROM public.cosmath_progress_books b JOIN public.cosmath_students s ON s.id=b.student_id AND s.academy_id=b.academy_id;
UPDATE public.cosmath_progress_books b SET library_id=c.id FROM public.cosmath_class_books c, public.cosmath_students s
 WHERE b.student_id=s.id AND s.class_id=c.class_id AND b.academy_id=c.academy_id AND b.title=c.title AND b.course=c.course AND b.curriculum=c.curriculum AND b.units=c.units
 AND b.id=(SELECT min(b2.id::text)::uuid FROM public.cosmath_progress_books b2 WHERE b2.student_id=b.student_id AND b2.title=b.title AND b2.units=b.units AND b2.course=b.course AND b2.curriculum=b.curriculum);

ALTER FUNCTION public.cosmath_save_progress(jsonb,jsonb) RENAME TO cosmath_save_progress_base;
REVOKE ALL ON FUNCTION public.cosmath_save_progress_base(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.cosmath_save_progress(p_book jsonb,p_entry jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; saved public.cosmath_progress_books; entry public.cosmath_progress_entries; pages integer:=coalesce((p_book->>'total_pages')::integer,0); done integer:=coalesce((p_book->>'completed_page')::integer,0);
BEGIN
 IF pages<0 OR pages>10000 OR done<0 OR done>pages THEN RAISE EXCEPTION 'Invalid page progress'; END IF;
 IF (p_book->>'version')::integer>0 AND NOT EXISTS(SELECT 1 FROM public.cosmath_progress_books WHERE id=(p_book->>'id')::uuid AND academy_id=public.cosmath_current_academy_id() AND NOT archived AND total_pages=pages) THEN RAISE EXCEPTION 'Book changed' USING ERRCODE='40001'; END IF;
 result:=public.cosmath_save_progress_base(p_book,p_entry);
 UPDATE public.cosmath_progress_books SET total_pages=pages,completed_page=done WHERE id=(result->'book'->>'id')::uuid RETURNING * INTO saved;
 UPDATE public.cosmath_progress_entries SET units_snapshot=saved.units,total_pages_snapshot=pages,completed_page=done WHERE id=(result->'entry'->>'id')::uuid RETURNING * INTO entry;
 RETURN jsonb_build_object('book',to_jsonb(saved),'entry',to_jsonb(entry));
END $$;
REVOKE ALL ON FUNCTION public.cosmath_save_progress(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cosmath_save_progress(jsonb,jsonb) TO authenticated;

CREATE FUNCTION public.cosmath_manage_class_book(p_action text,p_book jsonb,p_students jsonb DEFAULT '[]') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
   IF NOT FOUND THEN RAISE EXCEPTION 'Book changed' USING ERRCODE='40001'; END IF;
   UPDATE public.cosmath_progress_books assigned_book SET title=saved.title,curriculum=saved.curriculum,course=saved.course,units=saved.units,total_pages=saved.total_pages,completed_page=least(assigned_book.completed_page,saved.total_pages),states=coalesce((SELECT jsonb_object_agg(key,value) FROM jsonb_each(assigned_book.states) WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(saved.units) catalog_unit WHERE catalog_unit->>'id'=key)),'{}'),version=assigned_book.version+1 WHERE library_id=saved.id AND academy_id=tenant AND NOT archived;
  END IF;
  RETURN to_jsonb(saved);
 END IF;
 SELECT * INTO saved FROM public.cosmath_class_books WHERE id=(p_book->>'id')::uuid AND academy_id=tenant AND NOT archived FOR UPDATE;
 IF NOT FOUND OR saved.version IS DISTINCT FROM (p_book->>'version')::integer THEN RAISE EXCEPTION 'Book changed' USING ERRCODE='40001'; END IF;
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
END $$;
REVOKE ALL ON FUNCTION public.cosmath_manage_class_book(text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cosmath_manage_class_book(text,jsonb,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
