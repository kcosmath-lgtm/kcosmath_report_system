import { NextResponse } from 'next/server';

/**
 * 코스매스 데스크톱 앱(Windows 전용) 버전 및 자동 업데이트 메타데이터 API
 * 데스크톱 앱을 새로 빌드해 업데이트를 배포할 때 version 값을 올리면,
 * 기존에 앱을 설치한 사용자들이 앱을 켤 때 자동으로 업데이트 알림을 받고 최신 버전으로 교체됩니다.
 */
export const DESKTOP_APP_RELEASE = {
  version: '1.0.1',
  appName: '코스매스 리포트 · 카카오톡 통합 데스크톱 앱',
  downloadUrl: 'https://kcosmath-report-system.vercel.app/downloads/Cosmath-Desktop-App.exe',
  fallbackPath: '/downloads/Cosmath-Desktop-App.exe',
  forceUpdate: false,
  updatedAt: '2026-11-19',
  releaseNotes:
    '• Vercel 클라우드(Supabase) 실시간 연동 및 카카오톡 PC 원클릭 자동 발송 엔진 통합\n• 동명이인 학년 자동 구분 및 클립보드 다이렉트 이미지 전송 지원\n• 앱 실행 시 자동 버전 체크 및 원클릭 업데이트 지원',
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
