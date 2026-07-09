-- 1. cosmath_settings 테이블 생성
-- key: 'cosmath_common_data', 'cosmath_overrides_data', 'cosmath_student_data' 등
CREATE TABLE IF NOT EXISTS cosmath_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. RLS (Row Level Security) 비활성화
-- 이 서비스는 사용자 로그인(인증)을 구현하지 않는 내부용 툴이므로 RLS를 비활성화하는 것이 가장 간단합니다.
ALTER TABLE cosmath_settings DISABLE ROW LEVEL SECURITY;

-- 3. 테이블 권한 부여
-- RLS를 비활성화하더라도 API Gateway(PostgREST)에서 익명(anon) 및 인증(authenticated) 사용자 역할에 대해 권한이 정상 부여되어 있어야 합니다.
GRANT ALL ON TABLE public.cosmath_settings TO anon;
GRANT ALL ON TABLE public.cosmath_settings TO authenticated;
GRANT ALL ON TABLE public.cosmath_settings TO service_role;
