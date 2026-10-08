-- Editable academy exam documents. Original upload previews stay in the browser.
BEGIN;
CREATE TABLE IF NOT EXISTS public.cosmath_typing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL DEFAULT public.cosmath_current_academy_id() REFERENCES public.cosmath_academies(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 150),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cosmath_typing_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cosmath_typing_documents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cosmath_typing_documents TO authenticated;
CREATE POLICY typing_academy_access ON public.cosmath_typing_documents FOR ALL TO authenticated
  USING (academy_id = public.cosmath_current_academy_id())
  WITH CHECK (academy_id = public.cosmath_current_academy_id());
CREATE INDEX typing_documents_academy_updated ON public.cosmath_typing_documents(academy_id, updated_at DESC);
NOTIFY pgrst, 'reload schema';
COMMIT;
