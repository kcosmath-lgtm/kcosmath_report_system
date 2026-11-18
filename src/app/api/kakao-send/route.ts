import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';

const BRIDGE_URL = 'http://127.0.0.1:5005';
const PYTHON_PATHS = [
  'c:\\Users\\user\\auto_kakao_system_fail\\.venv\\Scripts\\python.exe',
  'python',
];
const SCRIPT_PATHS = [
  'c:\\Users\\user\\auto_kakao_system\\app.py',
  'c:\\Users\\user\\auto_kakao_system_fail\\app.py',
];

async function isBridgeAlive(): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE_URL}/health`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureBridgeStarted(): Promise<boolean> {
  if (await isBridgeAlive()) return true;

  const pyExe = PYTHON_PATHS.find(p => p === 'python' || fs.existsSync(p)) || 'python';
  const scriptPath = SCRIPT_PATHS.find(p => fs.existsSync(p));
  if (!scriptPath) return false;

  try {
    // 백그라운드로 로컬 브릿지 서버만 기동
    const child = spawn(
      pyExe,
      ['-c', 'import app, time; app.start_bridge_server(); time.sleep(86400)'],
      {
        cwd: scriptPath.replace(/\\app\.py$/i, ''),
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }
    );
    child.unref();

    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (await isBridgeAlive()) return true;
    }
  } catch {
    // ignore spawn error on serverless environments
  }
  return false;
}

export async function GET() {
  const ok = await ensureBridgeStarted();
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: '로컬 카카오톡 발송 엔진에 연결할 수 없습니다.' },
      { status: 503 }
    );
  }
  try {
    const res = await fetch(`${BRIDGE_URL}/status`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = body?.action || 'send';

  const ok = await ensureBridgeStarted();
  if (!ok) {
    return NextResponse.json(
      {
        ok: false,
        error:
          '카카오톡 통합 발송 엔진이 실행 중이지 않습니다. 바탕화면의 [코스매스_카톡통합앱_실행.bat]을 실행해 주세요.',
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
