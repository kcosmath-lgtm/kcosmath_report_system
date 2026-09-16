BEGIN;
CREATE TABLE IF NOT EXISTS public.cosmath_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), handoff_date date NOT NULL,
  author text NOT NULL CHECK (length(trim(author)) BETWEEN 1 AND 100),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  content text NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cosmath_handoffs_date_idx ON public.cosmath_handoffs(handoff_date, created_at DESC);
CREATE OR REPLACE FUNCTION public.cosmath_add_handoff(p_id uuid, p_date date, p_author text, p_title text, p_content text)
RETURNS public.cosmath_handoffs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved public.cosmath_handoffs;
BEGIN
  IF length(trim(p_author)) NOT BETWEEN 1 AND 100 OR length(trim(p_title)) NOT BETWEEN 1 AND 200 OR length(trim(p_content)) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Invalid handoff'; END IF;
  INSERT INTO public.cosmath_handoffs(id, handoff_date, author, title, content) VALUES(p_id, p_date, trim(p_author), trim(p_title), trim(p_content)) RETURNING * INTO saved;
  RETURN saved;
END $$;
REVOKE ALL ON public.cosmath_handoffs FROM anon, authenticated;
GRANT SELECT ON public.cosmath_handoffs TO anon, authenticated;
REVOKE ALL ON FUNCTION public.cosmath_add_handoff(uuid, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmath_add_handoff(uuid, date, text, text, text) TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.cosmath_delete_handoff(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected integer;
BEGIN
  DELETE FROM public.cosmath_handoffs WHERE id = p_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END $$;
REVOKE ALL ON FUNCTION public.cosmath_delete_handoff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmath_delete_handoff(uuid) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
