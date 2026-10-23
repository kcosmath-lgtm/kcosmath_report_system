import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../../src/data/mock-exams.json', import.meta.url), 'utf8'));
const gradeCount = grade => `${catalog.exams.filter(exam => exam.grade === grade).length}건`;

test('math archive filters grades, subjects and years and opens stored originals', async ({ page, request }) => {
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url-for-build.supabase.co').hostname;
  const user = { id: '10000000-0000-4000-8000-000000000001', email: 'test@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {} };
  const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 86400, role: 'authenticated' })).toString('base64url'), 'signature'].join('.');
  await page.addInitScript(({ host, user, token }) => localStorage.setItem(`sb-${host.split('.')[0]}-auth-token`, JSON.stringify({ access_token: token, refresh_token: 'test', expires_at: Math.floor(Date.now() / 1000) + 86400, user })), { host, user, token });
  await page.route(`https://${host}/**`, route => route.fulfill({ json: route.request().url().includes('cosmath_get_my_workspace') ? { id: 'academy', name: 'Test', role: 'owner' } : user }));
  await page.goto('/question-bank');
  const library = page.getByRole('region', { name: '학년별 모의고사' });
  await expect(library.getByRole('status')).toContainText(gradeCount(1));
  await library.getByRole('button', { name: /^고3/ }).click();
  await library.getByLabel('시행 연도').selectOption('2025');
  await library.getByLabel('수학 과목').selectOption('미적분');
  await expect(library.getByRole('heading', { level: 3 }).first()).toContainText('미적분');
  const original = library.getByRole('link', { name: /문제 새 창에서 열기/ }).first();
  const response = await request.get(await original.getAttribute('href'));
  expect(response.ok()).toBe(true);
  expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await library.getByRole('searchbox').fill('존재하지않는시험');
  await expect(library.getByText('조건에 맞는 자료가 없습니다. 검색 조건을 바꿔 주세요.')).toBeVisible();
  await library.getByRole('searchbox').fill('');
  await library.getByRole('button', { name: /^고2/ }).click();
  await expect(library.getByRole('status')).toContainText(gradeCount(2));
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/question-bank-mobile.png', fullPage: true });
});
