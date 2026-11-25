import { NextResponse } from 'next/server';

/**
 * 코스매스 데스크톱 앱(Windows 전용) 버전 및 자동 업데이트 메타데이터 API
 * 데스크톱 앱을 새로 빌드해 업데이트를 배포할 때 version 값을 올리면,
 * 기존에 앱을 설치한 사용자들이 앱을 켤 때 자동으로 업데이트 알림을 받고 최신 버전으로 교체됩니다.
 */
export const DESKTOP_APP_RELEASE = {
  version: '1.0.2',
  appName: '코스매스 리포트 · 카카오톡 통합 데스크톱 앱',
  downloadUrl: 'https://kcosmath-report-system.vercel.app/downloads/Cosmath-Desktop-App.exe',
  fallbackPath: '/downloads/Cosmath-Desktop-App.exe',
  forceUpdate: false,
  updatedAt: '2026-11-25',
  releaseNotes:
    '• 연속 발송 후 백스페이스 10회 자동 초기화 매크로 적용 (다음 학생 발송 시 멈춤 현상 해결)\n• 동작 1개당 최소 대기 시간을 0.1초로 단축 지원\n• Vercel 클라우드(Supabase) 실시간 연동 및 원클릭 업데이트 지원',
};

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      ...DESKTOP_APP_RELEASE,
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
