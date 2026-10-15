BEGIN;
CREATE FUNCTION public.cosmath_save_progress_batch(p_items jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; output jsonb:='[]';
BEGIN
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid batch'; END IF;
 IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid batch'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->'book'->>'id' LOOP
  IF jsonb_typeof(item->'entry') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Missing entry'; END IF;
  output:=output||jsonb_build_array(public.cosmath_save_progress(item->'book',item->'entry'));
 END LOOP;
 RETURN output;
END $$;
REVOKE ALL ON FUNCTION public.cosmath_save_progress_batch(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cosmath_save_progress_batch(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
