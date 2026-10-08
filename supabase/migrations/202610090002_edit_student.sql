BEGIN;
CREATE FUNCTION public.cosmath_edit_student(p_id text,p_name text,p_grade text,p_expected_version integer)
RETURNS public.cosmath_students LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved public.cosmath_students;
BEGIN
 IF p_name IS NULL OR p_grade IS NULL OR char_length(trim(p_name)) NOT BETWEEN 1 AND 100 OR char_length(trim(p_grade)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid student details'; END IF;
 UPDATE public.cosmath_students SET name=trim(p_name),grade=trim(p_grade),version=version+1
 WHERE id=p_id AND academy_id=public.cosmath_current_academy_id() AND active AND version=p_expected_version RETURNING * INTO saved;
 IF NOT FOUND THEN RAISE EXCEPTION 'Student changed' USING ERRCODE='40001'; END IF;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.cosmath_edit_student(text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cosmath_edit_student(text,text,text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
