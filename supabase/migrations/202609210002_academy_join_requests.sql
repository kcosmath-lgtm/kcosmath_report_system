-- Academy owners approve teachers into the existing fully editable staff role.
BEGIN;

CREATE TABLE public.cosmath_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES public.cosmath_academies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  UNIQUE (academy_id, user_id)
);
CREATE UNIQUE INDEX cosmath_one_pending_request ON public.cosmath_join_requests(user_id) WHERE status = 'pending';
ALTER TABLE public.cosmath_join_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cosmath_join_requests FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.cosmath_search_academies(p_query text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF length(trim(coalesce(p_query,''))) < 2 THEN RETURN '[]'::jsonb; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    SELECT a.id, a.name FROM public.cosmath_academies a
    WHERE strpos(lower(a.name), lower(trim(p_query))) > 0
      AND EXISTS (SELECT 1 FROM public.cosmath_academy_members m WHERE m.academy_id=a.id AND m.role='owner')
    ORDER BY a.name, a.id LIMIT 20
  ) x);
END $$;

CREATE FUNCTION public.cosmath_my_join_request() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(x) FROM (
    SELECT r.id, r.academy_id, a.name AS academy_name, r.status, r.created_at
    FROM public.cosmath_join_requests r JOIN public.cosmath_academies a ON a.id=r.academy_id
    WHERE r.user_id=auth.uid() AND r.status IN ('pending','rejected')
    ORDER BY (r.status='pending') DESC, r.created_at DESC LIMIT 1
  ) x
$$;

CREATE FUNCTION public.cosmath_request_academy_access(p_academy_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  -- Share the membership lock with create_workspace and review to serialize joins.
  PERFORM pg_advisory_xact_lock(72910421);
  IF public.cosmath_current_academy_id() IS NOT NULL THEN RAISE EXCEPTION '이미 소속된 학원이 있습니다.' USING ERRCODE='PT409'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cosmath_academy_members WHERE academy_id=p_academy_id AND role='owner') THEN
    RAISE EXCEPTION '가입 요청을 받을 수 없는 학원입니다.' USING ERRCODE='PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cosmath_join_requests WHERE user_id=auth.uid() AND status='pending' AND academy_id<>p_academy_id) THEN
    RAISE EXCEPTION '기존 요청을 취소한 뒤 다른 학원에 요청해 주세요.' USING ERRCODE='PT409';
  END IF;
  INSERT INTO public.cosmath_join_requests(academy_id,user_id) VALUES (p_academy_id,auth.uid())
  ON CONFLICT (academy_id,user_id) DO UPDATE SET status='pending', created_at=now(), reviewed_at=NULL, reviewed_by=NULL;
  RETURN public.cosmath_my_join_request();
END $$;

CREATE FUNCTION public.cosmath_cancel_join_request(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(72910421);
  UPDATE public.cosmath_join_requests SET status='cancelled'
    WHERE id=p_id AND user_id=auth.uid() AND status IN ('pending','rejected');
  IF NOT FOUND THEN RAISE EXCEPTION '요청 상태가 변경되었습니다. 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
END $$;

CREATE FUNCTION public.cosmath_pending_join_requests() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cosmath_academy_members WHERE user_id=auth.uid() AND role='owner') THEN
    RAISE EXCEPTION '학원 운영자만 요청을 확인할 수 있습니다.' USING ERRCODE='42501';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
    SELECT r.id, r.created_at, u.email, coalesce(u.raw_user_meta_data->>'full_name','') AS full_name
    FROM public.cosmath_join_requests r JOIN auth.users u ON u.id=r.user_id
    WHERE r.academy_id=public.cosmath_current_academy_id() AND r.status='pending'
    ORDER BY r.created_at, r.id
  ) x);
END $$;

CREATE FUNCTION public.cosmath_review_join_request(p_id uuid, p_approve boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE request public.cosmath_join_requests;
BEGIN
  PERFORM pg_advisory_xact_lock(72910421);
  SELECT r.* INTO request FROM public.cosmath_join_requests r
    JOIN public.cosmath_academy_members m ON m.academy_id=r.academy_id
    WHERE r.id=p_id AND m.user_id=auth.uid() AND m.role='owner' FOR UPDATE OF r;
  IF request.id IS NULL THEN RAISE EXCEPTION '학원 운영자만 처리할 수 있습니다.' USING ERRCODE='42501'; END IF;
  IF request.status<>'pending' OR p_approve IS NULL THEN RAISE EXCEPTION '이미 처리된 요청입니다.' USING ERRCODE='PT409'; END IF;
  IF p_approve THEN
    IF EXISTS (SELECT 1 FROM public.cosmath_academy_members WHERE user_id=request.user_id) THEN
      RAISE EXCEPTION '이미 소속된 학원이 있는 계정입니다.' USING ERRCODE='PT409';
    END IF;
    INSERT INTO public.cosmath_academy_members(academy_id,user_id,role) VALUES(request.academy_id,request.user_id,'staff');
  END IF;
  UPDATE public.cosmath_join_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    reviewed_at=now(), reviewed_by=auth.uid() WHERE id=p_id;
END $$;

REVOKE ALL ON FUNCTION public.cosmath_search_academies(text), public.cosmath_my_join_request(), public.cosmath_request_academy_access(uuid), public.cosmath_cancel_join_request(uuid), public.cosmath_pending_join_requests(), public.cosmath_review_join_request(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cosmath_search_academies(text), public.cosmath_my_join_request(), public.cosmath_request_academy_access(uuid), public.cosmath_cancel_join_request(uuid), public.cosmath_pending_join_requests(), public.cosmath_review_join_request(uuid,boolean) TO authenticated;

-- Keep legacy claiming behavior and existing owners; withdraw requests when creating a workspace.
CREATE OR REPLACE FUNCTION public.cosmath_create_workspace(p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE academy public.cosmath_academies; result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid academy name'; END IF;
  PERFORM pg_advisory_xact_lock(72910421);
  SELECT a.* INTO academy FROM public.cosmath_academies a
    JOIN public.cosmath_academy_members m ON m.academy_id=a.id WHERE m.user_id=auth.uid() LIMIT 1;
  IF academy.id IS NULL THEN
    SELECT * INTO academy FROM public.cosmath_academies WHERE created_by IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF academy.id IS NULL THEN
      INSERT INTO public.cosmath_academies(name,created_by) VALUES(trim(p_name),auth.uid()) RETURNING * INTO academy;
    ELSE
      UPDATE public.cosmath_academies SET name=trim(p_name),created_by=auth.uid() WHERE id=academy.id RETURNING * INTO academy;
    END IF;
    INSERT INTO public.cosmath_academy_members(academy_id,user_id,role) VALUES(academy.id,auth.uid(),'owner');
  END IF;
  UPDATE public.cosmath_join_requests SET status='cancelled' WHERE user_id=auth.uid() AND status='pending';
  SELECT jsonb_build_object('id',academy.id,'name',academy.name,'role',m.role) INTO result
    FROM public.cosmath_academy_members m WHERE m.academy_id=academy.id AND m.user_id=auth.uid();
  RETURN result;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
