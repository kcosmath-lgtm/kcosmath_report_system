-- Global allowlist: creating an academy does NOT grant paid OCR access.
BEGIN;
CREATE TABLE public.cosmath_typing_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  can_manage boolean NOT NULL DEFAULT false,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cosmath_typing_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cosmath_typing_access FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.cosmath_has_typing_access() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.cosmath_typing_access WHERE user_id=auth.uid())
$$;
CREATE FUNCTION public.cosmath_typing_access_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('allowed', public.cosmath_has_typing_access(),
    'can_manage', EXISTS (SELECT 1 FROM public.cosmath_typing_access WHERE user_id=auth.uid() AND can_manage))
$$;
CREATE FUNCTION public.cosmath_list_typing_users() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cosmath_typing_access WHERE user_id=auth.uid() AND can_manage) THEN
    RAISE EXCEPTION '타이핑 권한 관리자만 사용자를 확인할 수 있습니다.' USING ERRCODE='42501';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    SELECT u.id AS user_id, u.email, coalesce(u.raw_user_meta_data->>'full_name','') AS full_name,
      a.name AS academy_name, (p.user_id IS NOT NULL) AS allowed, coalesce(p.can_manage,false) AS can_manage
    FROM auth.users u JOIN public.cosmath_academy_members m ON m.user_id=u.id
    JOIN public.cosmath_academies a ON a.id=m.academy_id
    LEFT JOIN public.cosmath_typing_access p ON p.user_id=u.id
    ORDER BY coalesce(p.can_manage,false) DESC, u.email, u.id
  ) x);
END $$;
CREATE FUNCTION public.cosmath_set_typing_access(p_user_id uuid, p_allowed boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cosmath_typing_access WHERE user_id=auth.uid() AND can_manage) THEN
    RAISE EXCEPTION '타이핑 권한 관리자만 변경할 수 있습니다.' USING ERRCODE='42501';
  END IF;
  IF p_allowed IS NULL OR NOT EXISTS (SELECT 1 FROM public.cosmath_academy_members WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION '학원에 가입한 사용자를 선택해 주세요.' USING ERRCODE='PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cosmath_typing_access WHERE user_id=p_user_id AND can_manage) THEN
    RAISE EXCEPTION '관리자 권한은 이 화면에서 변경할 수 없습니다.' USING ERRCODE='PT409';
  END IF;
  IF p_allowed THEN
    INSERT INTO public.cosmath_typing_access(user_id,granted_by) VALUES (p_user_id,auth.uid()) ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM public.cosmath_typing_access WHERE user_id=p_user_id AND NOT can_manage;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.cosmath_has_typing_access(), public.cosmath_typing_access_status(), public.cosmath_list_typing_users(), public.cosmath_set_typing_access(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cosmath_has_typing_access(), public.cosmath_typing_access_status(), public.cosmath_list_typing_users(), public.cosmath_set_typing_access(uuid,boolean) TO authenticated;
DROP POLICY typing_academy_access ON public.cosmath_typing_documents;
CREATE POLICY typing_academy_access ON public.cosmath_typing_documents FOR ALL TO authenticated
  USING (academy_id=public.cosmath_current_academy_id() AND public.cosmath_has_typing_access())
  WITH CHECK (academy_id=public.cosmath_current_academy_id() AND public.cosmath_has_typing_access());

-- Only the explicitly designated account can manage the global allowlist.
-- This account must already have signed in to appear in auth.users.
INSERT INTO public.cosmath_typing_access(user_id,can_manage)
  SELECT id,true FROM auth.users WHERE lower(email)='kcosmath@gmail.com'
  ON CONFLICT (user_id) DO UPDATE SET can_manage=true;
NOTIFY pgrst, 'reload schema';
COMMIT;
