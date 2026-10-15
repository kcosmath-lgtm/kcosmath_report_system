BEGIN;
CREATE FUNCTION public.cosmath_add_progress_books(p_books jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE book jsonb; output jsonb:='[]';
BEGIN
 IF jsonb_typeof(p_books) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid batch'; END IF;
 IF jsonb_array_length(p_books) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid batch'; END IF;
 FOR book IN SELECT value FROM jsonb_array_elements(p_books) LOOP
  IF (book->>'version')::integer IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Expected new book'; END IF;
  output:=output||jsonb_build_array(public.cosmath_save_progress(book,NULL));
 END LOOP;
 RETURN output;
END $$;
REVOKE ALL ON FUNCTION public.cosmath_add_progress_books(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cosmath_add_progress_books(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
