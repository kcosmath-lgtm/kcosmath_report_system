-- Open AI & Typing features to all academy members and enforce academy-level percentage (%) quotas (daily / weekly / monthly).
BEGIN;

CREATE TABLE IF NOT EXISTS public.cosmath_academy_ai_quotas (
  academy_id uuid PRIMARY KEY REFERENCES public.cosmath_academies(id) ON DELETE CASCADE,
  daily_capacity numeric(10,2) NOT NULL DEFAULT 100 CHECK (daily_capacity > 0),
  weekly_capacity numeric(10,2) NOT NULL DEFAULT 400 CHECK (weekly_capacity > 0),
  monthly_capacity numeric(10,2) NOT NULL DEFAULT 1200 CHECK (monthly_capacity > 0),
  is_blocked boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cosmath_academy_ai_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cosmath_academy_ai_quotas FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.cosmath_ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES public.cosmath_academies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  units numeric(10,2) NOT NULL DEFAULT 1 CHECK (units >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cosmath_ai_usage_logs_academy_created
  ON public.cosmath_ai_usage_logs (academy_id, created_at DESC);

ALTER TABLE public.cosmath_ai_usage_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cosmath_ai_usage_logs FROM PUBLIC, anon, authenticated;

-- Table for AI-generated & variant math problems in the Problem Studio
CREATE TABLE IF NOT EXISTS public.cosmath_generated_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL DEFAULT public.cosmath_current_academy_id() REFERENCES public.cosmath_academies(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  grade smallint NOT NULL DEFAULT 1 CHECK (grade BETWEEN 1 AND 3),
  subject text NOT NULL DEFAULT '공통수학',
  unit text NOT NULL DEFAULT '',
  difficulty text NOT NULL DEFAULT '중',
  source_label text NOT NULL DEFAULT '',
  question text NOT NULL,
  box_content text NOT NULL DEFAULT '',
  choices jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer text NOT NULL DEFAULT '',
  solution text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cosmath_generated_problems_academy
  ON public.cosmath_generated_problems (academy_id, created_at DESC);

ALTER TABLE public.cosmath_generated_problems ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cosmath_generated_problems TO authenticated;

DROP POLICY IF EXISTS generated_problems_academy_access ON public.cosmath_generated_problems;
CREATE POLICY generated_problems_academy_access ON public.cosmath_generated_problems
  FOR ALL TO authenticated
  USING (academy_id = public.cosmath_current_academy_id())
  WITH CHECK (academy_id = public.cosmath_current_academy_id());

-- All authenticated academy members now have typing & AI access unless their academy is explicitly blocked.
CREATE OR REPLACE FUNCTION public.cosmath_has_typing_access() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cosmath_academy_members m
    LEFT JOIN public.cosmath_academy_ai_quotas q ON q.academy_id = m.academy_id
    WHERE m.user_id = auth.uid()
      AND coalesce(q.is_blocked, false) = false
  )
$$;

-- Compute percentage usage (0~100%) for Daily, Weekly, Monthly windows in Asia/Seoul timezone
CREATE OR REPLACE FUNCTION public.cosmath_get_ai_quota_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_academy_id uuid;
  v_academy_name text;
  v_daily_cap numeric(10,2) := 100;
  v_weekly_cap numeric(10,2) := 400;
  v_monthly_cap numeric(10,2) := 1200;
  v_blocked boolean := false;
  v_now_kst timestamp;
  v_day_start timestamptz;
  v_week_start timestamptz;
  v_month_start timestamptz;
  v_day_used numeric(10,2) := 0;
  v_week_used numeric(10,2) := 0;
  v_month_used numeric(10,2) := 0;
  v_daily_pct numeric(6,1);
  v_weekly_pct numeric(6,1);
  v_monthly_pct numeric(6,1);
  v_can_manage boolean;
BEGIN
  SELECT m.academy_id, a.name
    INTO v_academy_id, v_academy_name
    FROM public.cosmath_academy_members m
    JOIN public.cosmath_academies a ON a.id = m.academy_id
   WHERE m.user_id = auth.uid()
   LIMIT 1;

  v_can_manage := EXISTS (
    SELECT 1 FROM public.cosmath_typing_access WHERE user_id = auth.uid() AND can_manage
  );

  IF v_academy_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'can_manage', v_can_manage,
      'daily_pct', 0,
      'weekly_pct', 0,
      'monthly_pct', 0,
      'daily_remaining_pct', 100,
      'weekly_remaining_pct', 100,
      'monthly_remaining_pct', 100,
      'is_blocked', false
    );
  END IF;

  SELECT coalesce(q.daily_capacity, 100),
         coalesce(q.weekly_capacity, 400),
         coalesce(q.monthly_capacity, 1200),
         coalesce(q.is_blocked, false)
    INTO v_daily_cap, v_weekly_cap, v_monthly_cap, v_blocked
    FROM public.cosmath_academy_ai_quotas q
   WHERE q.academy_id = v_academy_id;

  IF NOT FOUND THEN
    v_daily_cap := 100;
    v_weekly_cap := 400;
    v_monthly_cap := 1200;
    v_blocked := false;
  END IF;

  v_now_kst := now() AT TIME ZONE 'Asia/Seoul';
  v_day_start := date_trunc('day', v_now_kst) AT TIME ZONE 'Asia/Seoul';
  v_week_start := date_trunc('week', v_now_kst) AT TIME ZONE 'Asia/Seoul';
  v_month_start := date_trunc('month', v_now_kst) AT TIME ZONE 'Asia/Seoul';

  SELECT coalesce(sum(units) FILTER (WHERE created_at >= v_day_start), 0),
         coalesce(sum(units) FILTER (WHERE created_at >= v_week_start), 0),
         coalesce(sum(units) FILTER (WHERE created_at >= v_month_start), 0)
    INTO v_day_used, v_week_used, v_month_used
    FROM public.cosmath_ai_usage_logs
   WHERE academy_id = v_academy_id
     AND created_at >= LEAST(v_week_start, v_month_start);

  v_daily_pct := LEAST(100.0, round((v_day_used / GREATEST(v_daily_cap, 1)) * 100.0, 1));
  v_weekly_pct := LEAST(100.0, round((v_week_used / GREATEST(v_weekly_cap, 1)) * 100.0, 1));
  v_monthly_pct := LEAST(100.0, round((v_month_used / GREATEST(v_monthly_cap, 1)) * 100.0, 1));

  RETURN jsonb_build_object(
    'academy_id', v_academy_id,
    'academy_name', v_academy_name,
    'allowed', (NOT v_blocked AND v_daily_pct < 100 AND v_weekly_pct < 100 AND v_monthly_pct < 100),
    'can_manage', v_can_manage,
    'is_blocked', v_blocked,
    'daily_pct', v_daily_pct,
    'weekly_pct', v_weekly_pct,
    'monthly_pct', v_monthly_pct,
    'daily_remaining_pct', GREATEST(0.0, round(100.0 - v_daily_pct, 1)),
    'weekly_remaining_pct', GREATEST(0.0, round(100.0 - v_weekly_pct, 1)),
    'monthly_remaining_pct', GREATEST(0.0, round(100.0 - v_monthly_pct, 1)),
    'reset_daily_at', (date_trunc('day', v_now_kst) + interval '1 day') AT TIME ZONE 'Asia/Seoul',
    'reset_weekly_at', (date_trunc('week', v_now_kst) + interval '1 week') AT TIME ZONE 'Asia/Seoul',
    'reset_monthly_at', (date_trunc('month', v_now_kst) + interval '1 month') AT TIME ZONE 'Asia/Seoul'
  );
END $$;

-- Atomically check & consume academy AI quota in percentage terms
CREATE OR REPLACE FUNCTION public.cosmath_consume_ai_quota(p_action text, p_units numeric DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_academy_id uuid;
  v_daily_cap numeric(10,2) := 100;
  v_weekly_cap numeric(10,2) := 400;
  v_monthly_cap numeric(10,2) := 1200;
  v_blocked boolean := false;
  v_now_kst timestamp;
  v_day_start timestamptz;
  v_week_start timestamptz;
  v_month_start timestamptz;
  v_day_used numeric(10,2) := 0;
  v_week_used numeric(10,2) := 0;
  v_month_used numeric(10,2) := 0;
  v_next_daily_pct numeric(6,1);
  v_next_weekly_pct numeric(6,1);
  v_next_monthly_pct numeric(6,1);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'UNAUTHORIZED', 'message', '로그인이 필요합니다.');
  END IF;

  SELECT m.academy_id INTO v_academy_id
    FROM public.cosmath_academy_members m
   WHERE m.user_id = auth.uid()
   LIMIT 1;

  IF v_academy_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'NO_ACADEMY', 'message', '학원 가입이 필요합니다.');
  END IF;

  -- Serialize concurrent quota checks per academy
  PERFORM 1 FROM public.cosmath_academies WHERE id = v_academy_id FOR UPDATE;

  SELECT coalesce(q.daily_capacity, 100),
         coalesce(q.weekly_capacity, 400),
         coalesce(q.monthly_capacity, 1200),
         coalesce(q.is_blocked, false)
    INTO v_daily_cap, v_weekly_cap, v_monthly_cap, v_blocked
    FROM public.cosmath_academy_ai_quotas q
   WHERE q.academy_id = v_academy_id;

  IF NOT FOUND THEN
    v_daily_cap := 100;
    v_weekly_cap := 400;
    v_monthly_cap := 1200;
    v_blocked := false;
  END IF;

  IF v_blocked THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'ACADEMY_BLOCKED', 'message', '현재 학원의 AI 사용이 관리자에 의해 일시 중지되었습니다.');
  END IF;

  v_now_kst := now() AT TIME ZONE 'Asia/Seoul';
  v_day_start := date_trunc('day', v_now_kst) AT TIME ZONE 'Asia/Seoul';
  v_week_start := date_trunc('week', v_now_kst) AT TIME ZONE 'Asia/Seoul';
  v_month_start := date_trunc('month', v_now_kst) AT TIME ZONE 'Asia/Seoul';

  SELECT coalesce(sum(units) FILTER (WHERE created_at >= v_day_start), 0),
         coalesce(sum(units) FILTER (WHERE created_at >= v_week_start), 0),
         coalesce(sum(units) FILTER (WHERE created_at >= v_month_start), 0)
    INTO v_day_used, v_week_used, v_month_used
    FROM public.cosmath_ai_usage_logs
   WHERE academy_id = v_academy_id
     AND created_at >= LEAST(v_week_start, v_month_start);

  IF (v_day_used / GREATEST(v_daily_cap, 1)) * 100.0 >= 100.0 OR ((v_day_used + GREATEST(p_units, 0)) / GREATEST(v_daily_cap, 1)) * 100.0 > 100.0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'DAILY_LIMIT_REACHED',
      'period', 'daily',
      'message', '우리 학원의 오늘 AI 사용 한도(100%)에 도달했습니다. 자정에 자동 초기화됩니다.',
      'daily_pct', LEAST(100.0, round((v_day_used / GREATEST(v_daily_cap, 1)) * 100.0, 1)),
      'weekly_pct', LEAST(100.0, round((v_week_used / GREATEST(v_weekly_cap, 1)) * 100.0, 1)),
      'monthly_pct', LEAST(100.0, round((v_month_used / GREATEST(v_monthly_cap, 1)) * 100.0, 1))
    );
  END IF;

  IF (v_week_used / GREATEST(v_weekly_cap, 1)) * 100.0 >= 100.0 OR ((v_week_used + GREATEST(p_units, 0)) / GREATEST(v_weekly_cap, 1)) * 100.0 > 100.0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'WEEKLY_LIMIT_REACHED',
      'period', 'weekly',
      'message', '우리 학원의 이번 주 AI 사용 한도(100%)에 도달했습니다. 월요일 0시에 초기화됩니다.',
      'daily_pct', LEAST(100.0, round((v_day_used / GREATEST(v_daily_cap, 1)) * 100.0, 1)),
      'weekly_pct', LEAST(100.0, round((v_week_used / GREATEST(v_weekly_cap, 1)) * 100.0, 1)),
      'monthly_pct', LEAST(100.0, round((v_month_used / GREATEST(v_monthly_cap, 1)) * 100.0, 1))
    );
  END IF;

  IF (v_month_used / GREATEST(v_monthly_cap, 1)) * 100.0 >= 100.0 OR ((v_month_used + GREATEST(p_units, 0)) / GREATEST(v_monthly_cap, 1)) * 100.0 > 100.0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'code', 'MONTHLY_LIMIT_REACHED',
      'period', 'monthly',
      'message', '우리 학원의 이번 달 AI 사용 한도(100%)에 도달했습니다. 다음 달 1일 0시에 초기화됩니다.',
      'daily_pct', LEAST(100.0, round((v_day_used / GREATEST(v_daily_cap, 1)) * 100.0, 1)),
      'weekly_pct', LEAST(100.0, round((v_week_used / GREATEST(v_weekly_cap, 1)) * 100.0, 1)),
      'monthly_pct', LEAST(100.0, round((v_month_used / GREATEST(v_monthly_cap, 1)) * 100.0, 1))
    );
  END IF;

  INSERT INTO public.cosmath_ai_usage_logs (academy_id, user_id, action, units)
  VALUES (v_academy_id, auth.uid(), coalesce(nullif(trim(p_action), ''), 'ai_action'), GREATEST(p_units, 0));

  v_next_daily_pct := LEAST(100.0, round(((v_day_used + GREATEST(p_units, 0)) / GREATEST(v_daily_cap, 1)) * 100.0, 1));
  v_next_weekly_pct := LEAST(100.0, round(((v_week_used + GREATEST(p_units, 0)) / GREATEST(v_weekly_cap, 1)) * 100.0, 1));
  v_next_monthly_pct := LEAST(100.0, round(((v_month_used + GREATEST(p_units, 0)) / GREATEST(v_monthly_cap, 1)) * 100.0, 1));

  RETURN jsonb_build_object(
    'allowed', true,
    'daily_pct', v_next_daily_pct,
    'weekly_pct', v_next_weekly_pct,
    'monthly_pct', v_next_monthly_pct,
    'daily_remaining_pct', GREATEST(0.0, round(100.0 - v_next_daily_pct, 1)),
    'weekly_remaining_pct', GREATEST(0.0, round(100.0 - v_next_weekly_pct, 1)),
    'monthly_remaining_pct', GREATEST(0.0, round(100.0 - v_next_monthly_pct, 1))
  );
END $$;

-- Manager RPC: list all academies and their current daily/weekly/monthly % usage
CREATE OR REPLACE FUNCTION public.cosmath_list_academy_ai_quotas() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now_kst timestamp := now() AT TIME ZONE 'Asia/Seoul';
  v_day_start timestamptz := date_trunc('day', v_now_kst) AT TIME ZONE 'Asia/Seoul';
  v_week_start timestamptz := date_trunc('week', v_now_kst) AT TIME ZONE 'Asia/Seoul';
  v_month_start timestamptz := date_trunc('month', v_now_kst) AT TIME ZONE 'Asia/Seoul';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cosmath_typing_access WHERE user_id = auth.uid() AND can_manage) THEN
    RAISE EXCEPTION '권한 관리자만 학원별 AI 사용량을 조회할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    FROM (
      SELECT
        a.id AS academy_id,
        a.name AS academy_name,
        (SELECT count(*) FROM public.cosmath_academy_members m WHERE m.academy_id = a.id) AS member_count,
        coalesce(q.daily_capacity, 100) AS daily_capacity,
        coalesce(q.weekly_capacity, 400) AS weekly_capacity,
        coalesce(q.monthly_capacity, 1200) AS monthly_capacity,
        coalesce(q.is_blocked, false) AS is_blocked,
        LEAST(100.0, round((coalesce(u.day_used, 0) / GREATEST(coalesce(q.daily_capacity, 100), 1)) * 100.0, 1)) AS daily_pct,
        LEAST(100.0, round((coalesce(u.week_used, 0) / GREATEST(coalesce(q.weekly_capacity, 400), 1)) * 100.0, 1)) AS weekly_pct,
        LEAST(100.0, round((coalesce(u.month_used, 0) / GREATEST(coalesce(q.monthly_capacity, 1200), 1)) * 100.0, 1)) AS monthly_pct
      FROM public.cosmath_academies a
      LEFT JOIN public.cosmath_academy_ai_quotas q ON q.academy_id = a.id
      LEFT JOIN LATERAL (
        SELECT
          sum(units) FILTER (WHERE created_at >= v_day_start) AS day_used,
          sum(units) FILTER (WHERE created_at >= v_week_start) AS week_used,
          sum(units) FILTER (WHERE created_at >= v_month_start) AS month_used
        FROM public.cosmath_ai_usage_logs l
        WHERE l.academy_id = a.id
          AND l.created_at >= LEAST(v_week_start, v_month_start)
      ) u ON true
      ORDER BY a.name, a.id
    ) r
  );
END $$;

-- Manager RPC: update an academy's quota capacities (or scale factor) and blocked status
CREATE OR REPLACE FUNCTION public.cosmath_set_academy_ai_quota(
  p_academy_id uuid,
  p_daily_capacity numeric,
  p_weekly_capacity numeric,
  p_monthly_capacity numeric,
  p_is_blocked boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cosmath_typing_access WHERE user_id = auth.uid() AND can_manage) THEN
    RAISE EXCEPTION '권한 관리자만 학원 한도를 변경할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.cosmath_academy_ai_quotas (academy_id, daily_capacity, weekly_capacity, monthly_capacity, is_blocked, updated_at)
  VALUES (
    p_academy_id,
    GREATEST(1, coalesce(p_daily_capacity, 100)),
    GREATEST(1, coalesce(p_weekly_capacity, 400)),
    GREATEST(1, coalesce(p_monthly_capacity, 1200)),
    coalesce(p_is_blocked, false),
    now()
  )
  ON CONFLICT (academy_id) DO UPDATE
    SET daily_capacity = EXCLUDED.daily_capacity,
        weekly_capacity = EXCLUDED.weekly_capacity,
        monthly_capacity = EXCLUDED.monthly_capacity,
        is_blocked = EXCLUDED.is_blocked,
        updated_at = now();
END $$;

-- Manager RPC: reset an academy's usage back to 0% for daily / weekly / monthly
CREATE OR REPLACE FUNCTION public.cosmath_reset_academy_ai_usage(p_academy_id uuid, p_period text DEFAULT 'daily') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now_kst timestamp := now() AT TIME ZONE 'Asia/Seoul';
  v_since timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cosmath_typing_access WHERE user_id = auth.uid() AND can_manage) THEN
    RAISE EXCEPTION '권한 관리자만 사용량을 초기화할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  IF p_period = 'daily' THEN
    v_since := date_trunc('day', v_now_kst) AT TIME ZONE 'Asia/Seoul';
  ELSIF p_period = 'weekly' THEN
    v_since := date_trunc('week', v_now_kst) AT TIME ZONE 'Asia/Seoul';
  ELSE
    v_since := LEAST(
      date_trunc('week', v_now_kst) AT TIME ZONE 'Asia/Seoul',
      date_trunc('month', v_now_kst) AT TIME ZONE 'Asia/Seoul'
    );
  END IF;

  DELETE FROM public.cosmath_ai_usage_logs
   WHERE academy_id = p_academy_id
     AND created_at >= v_since;
END $$;

REVOKE ALL ON FUNCTION
  public.cosmath_get_ai_quota_status(),
  public.cosmath_consume_ai_quota(text, numeric),
  public.cosmath_list_academy_ai_quotas(),
  public.cosmath_set_academy_ai_quota(uuid, numeric, numeric, numeric, boolean),
  public.cosmath_reset_academy_ai_usage(uuid, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.cosmath_get_ai_quota_status(),
  public.cosmath_consume_ai_quota(text, numeric),
  public.cosmath_list_academy_ai_quotas(),
  public.cosmath_set_academy_ai_quota(uuid, numeric, numeric, numeric, boolean),
  public.cosmath_reset_academy_ai_usage(uuid, text)
TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
