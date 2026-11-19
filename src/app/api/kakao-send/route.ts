import { NextResponse } from 'next/server';

const BRIDGE_URL = 'http://127.0.0.1:5005';

async function isBridgeAlive(): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE_URL}/health`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const ok = await isBridgeAlive();
  if (!ok) {
    return NextResponse.json(
      {
        ok: false,
        requiresDesktopApp: true,
        downloadUrl: '/downloads/Cosmath-Desktop-App.exe',
        error: '카카오톡 자동 발송은 코스매스 PC 데스크톱 앱을 다운로드하여 실행해야 사용할 수 있습니다.',
      },
      { status: 503 }
    );
  }
  try {
    const res = await fetch(`${BRIDGE_URL}/status`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ ok: false, requiresDesktopApp: true }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body?.action || 'send';

  const ok = await isBridgeAlive();
  if (!ok) {
    return NextResponse.json(
      {
        ok: false,
        requiresDesktopApp: true,
        downloadUrl: '/downloads/Cosmath-Desktop-App.exe',
        error:
          '카카오톡 자동 발송은 코스매스 PC 데스크톱 앱에서만 사용 가능합니다. 먼저 데스크톱 앱을 다운로드하여 실행해 주세요.',
      },
      { status: 503 }
    );
  }

  const endpoint = action === 'stop' ? '/stop' : '/send-reports';
  try {
    const res = await fetch(`${BRIDGE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `발송 요청 전달 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}
