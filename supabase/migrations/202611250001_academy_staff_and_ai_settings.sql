-- Academy Staff Directory (원장님 · 선생님 · 조교쌤 · 실장님) & Academy-wide AI Persona / Exam Style Settings
BEGIN;

-- 1. 학원 구성원(원장님 · 선생님 · 조교쌤 · 실장님) 테이블
CREATE TABLE IF NOT EXISTS public.cosmath_academy_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL DEFAULT public.cosmath_current_academy_id() REFERENCES public.cosmath_academies(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT '선생님' CHECK (role IN ('원장님', '선생님', '조교쌤', '실장님')),
  assigned_classes text NOT NULL DEFAULT '',
  duties text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cosmath_academy_staff_academy
  ON public.cosmath_academy_staff (academy_id, created_at ASC);

ALTER TABLE public.cosmath_academy_staff ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cosmath_academy_staff TO authenticated;

DROP POLICY IF EXISTS academy_staff_academy_access ON public.cosmath_academy_staff;
CREATE POLICY academy_staff_academy_access ON public.cosmath_academy_staff
  FOR ALL TO authenticated
  USING (academy_id = public.cosmath_current_academy_id())
  WITH CHECK (academy_id = public.cosmath_current_academy_id());

-- 2. 학원 공통 AI 캐릭터(페르소나 · 시스템 프롬프트) 및 시험지 기본 스타일 테이블
CREATE TABLE IF NOT EXISTS public.cosmath_academy_ai_settings (
  academy_id uuid PRIMARY KEY DEFAULT public.cosmath_current_academy_id() REFERENCES public.cosmath_academies(id) ON DELETE CASCADE,
  persona_id text NOT NULL DEFAULT 'veteran_director',
  custom_prompt text NOT NULL DEFAULT '',
  exam_style jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cosmath_academy_ai_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cosmath_academy_ai_settings TO authenticated;

DROP POLICY IF EXISTS academy_ai_settings_academy_access ON public.cosmath_academy_ai_settings;
CREATE POLICY academy_ai_settings_academy_access ON public.cosmath_academy_ai_settings
  FOR ALL TO authenticated
  USING (academy_id = public.cosmath_current_academy_id())
  WITH CHECK (academy_id = public.cosmath_current_academy_id());

COMMIT;
