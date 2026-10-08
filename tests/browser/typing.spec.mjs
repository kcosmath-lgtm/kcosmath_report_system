import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import JSZip from "jszip";

const user = { id: "10000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "teacher@example.test", user_metadata: {}, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
test.beforeEach(async ({ page }) => {
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-url-for-build.supabase.co").hostname;
  const token = ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 86400, aud: "authenticated", role: "authenticated" })).toString("base64url"), "test-signature"].join(".");
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: `sb-${host.split(".")[0]}-auth-token`, session: { access_token: token, refresh_token: "test", expires_at: Math.floor(Date.now() / 1000) + 86400, expires_in: 86400, token_type: "bearer", user },
  });
  await page.route(`https://${host}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.includes("cosmath_has_typing_access") ? true
      : path.includes("cosmath_typing_access_status") ? { allowed: true, can_manage: false }
      : path.includes("cosmath_get_my_workspace") ? { id: "20000000-0000-4000-8000-000000000001", name: "테스트 학원", role: "owner" }
      : path.includes("/auth/v1/user") ? user : [];
    return route.fulfill({ json: data, headers: { "access-control-allow-origin": "*" } });
  });
});

test("sample exam edits, native equation downloads, PDF output and mobile layout", async ({ page }, testInfo) => {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/typing");
  await page.getByRole("button", { name: "예시 시험지 4문항으로 시작" }).click();
  await expect(page.locator("[data-problem]")).toHaveCount(4);
  await expect(page.locator(".katex-error")).toHaveCount(0);
  await page.getByRole("textbox", { name: "시험지 제목", exact: true }).fill("수학 복습 시험지");
  await page.getByRole("textbox", { name: "문제 본문", exact: true }).first().fill("$\\frac{1}{2}$의 값은?");
  await expect(page.locator("[data-problem]").first()).toContainText("의 값은?");
  const overflowing = await page.locator("[data-problem]").evaluateAll(nodes => nodes.some(n => n.scrollHeight > n.clientHeight + 2));
  expect(overflowing).toBe(false);
  const [word] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Word", exact: true }).click()]);
  expect(word.suggestedFilename()).toBe("수학 복습 시험지.docx");
  const wordZip = await JSZip.loadAsync(readFileSync(await word.path()));
  expect(await wordZip.file("word/document.xml").async("string")).toContain("<m:f>");
  const [hangul] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "한글 HWPX", exact: true }).click()]);
  expect(hangul.suggestedFilename()).toBe("수학 복습 시험지.hwpx");
  const hwpxZip = await JSZip.loadAsync(readFileSync(await hangul.path()));
  expect(await hwpxZip.file("Contents/section0.xml").async("string")).toContain("<hp:equation");
  await page.screenshot({ path: testInfo.outputPath("typing-desktop.png"), fullPage: true });
  await page.emulateMedia({ media: "print" });
  const pdfPath = testInfo.outputPath("exam.pdf");
  await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)) });
  const pdf = await task.promise;
  expect(pdf.numPages).toBe(1);
  const pdfText = (await (await pdf.getPage(1)).getTextContent()).items.map(item => item.str || "").join(" ");
  expect(pdfText.replace(/\s/g, "")).toContain("수학복습시험지"); await task.destroy();
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: /시험지 타이핑/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("typing-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("image upload uses server OCR without a client key and editing survives reload", async ({ page }) => {
  await page.route("**/api/typing/extract", async route => {
    const data = route.request().postDataJSON();
    expect(data.mimeType).toBe("image/jpeg"); expect(data.apiKey).toBeUndefined(); expect(data.model).toBeUndefined();
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    await route.fulfill({ json: { problems: [{ number: "7", question: "$x^2$의 값은?", choices: ["1", "2", "3", "4", "5"] }], model: "gemini-3.1-flash-lite" } });
  });
  await page.goto("/typing");
  await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles({ name: "exam.png", mimeType: "image/png", buffer: await page.getByRole("heading", { name: /시험지 타이핑/ }).screenshot() });
  await expect(page.getByRole("button", { name: "선택 페이지 인식" })).toBeVisible();
  await expect(page.getByLabel("Gemini API 키")).toHaveCount(0);
  await page.getByRole("button", { name: "선택 페이지 인식" }).click();
  await expect(page.locator("[data-problem]")).toHaveCount(1);
  await expect(page.locator("[data-problem]")).toContainText("7.");
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator("[data-problem]")).toHaveCount(1);
});

test("PDF pages render with the bundled worker and unauthenticated OCR is rejected", async ({ page, context, request }) => {
  const response = await request.post("/api/typing/extract", { data: { image: "abc", mimeType: "image/jpeg" } });
  expect(response.status()).toBe(401);
  const sheet = await context.newPage();
  await sheet.setContent('<html><body><h1>Mathematics</h1><p>1. Find x + 2.</p></body></html>');
  const sourcePdf = await sheet.pdf({ format: "A4" }); await sheet.close();
  await page.goto("/typing");
  await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles({ name: "exam.pdf", mimeType: "application/pdf", buffer: sourcePdf });
  await expect(page.getByRole("button", { name: /1\. exam.pdf · 1쪽/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "exam.pdf · 1쪽" })).toBeVisible();
  await expect(page.getByRole("button", { name: "선택 페이지 인식" })).toBeEnabled();
});

test("wrong-answer homework report action sits at the top right", async ({ page }, testInfo) => {
  await page.goto("/errors");
  const button = page.getByRole("link", { name: "오답·숙제 보고서", exact: true });
  await expect(button).toBeVisible();
  const bounds = await button.boundingBox();
  expect(bounds.x).toBeGreaterThan(1000); expect(bounds.y).toBeLessThan(65);
  await page.screenshot({ path: testInfo.outputPath("errors-report-action.png") });
});

test("unapproved users cannot mount the typing editor or restore its drafts", async ({ page }) => {
  await page.route("**/rest/v1/rpc/cosmath_has_typing_access", route => route.fulfill({ json: false }));
  await page.goto("/typing");
  await expect(page.getByRole("heading", { name: "시험지 타이핑 사용 권한이 필요합니다" })).toBeVisible();
  await expect(page.getByRole("button", { name: "예시 시험지 4문항으로 시작" })).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.route("**/rest/v1/rpc/cosmath_has_typing_access", route => route.fulfill({ json: true }));
  await page.getByRole("button", { name: "권한 다시 확인" }).click();
  await expect(page.getByRole("button", { name: "예시 시험지 4문항으로 시작" })).toBeVisible();
});

test("designated managers can grant and revoke typing access from settings", async ({ page }) => {
  let allowed = false;
  await page.route("**/rest/v1/rpc/cosmath_typing_access_status", route => route.fulfill({ json: { allowed: true, can_manage: true } }));
  await page.route("**/rest/v1/rpc/cosmath_list_typing_users", route => route.fulfill({ json: [{ user_id: "teacher-2", email: "staff@example.test", full_name: "강사", academy_name: "테스트 학원", allowed, can_manage: false }] }));
  await page.route("**/rest/v1/rpc/cosmath_set_typing_access", route => { const body = route.request().postDataJSON(); expect(body.p_user_id).toBe("teacher-2"); allowed = body.p_allowed; return route.fulfill({ json: null }); });
  await page.goto("/settings");
  await page.getByRole("button", { name: "staff@example.test 사용 허용", exact: true }).click();
  await expect(page.getByRole("button", { name: "staff@example.test 사용 차단", exact: true })).toBeEnabled();
  expect(allowed).toBe(true);
  await page.getByRole("button", { name: "staff@example.test 사용 차단", exact: true }).click();
  await expect(page.getByRole("button", { name: "staff@example.test 사용 허용", exact: true })).toBeEnabled();
  expect(allowed).toBe(false);
});


test('long boxed questions paginate and separate figures appear in preview and exports', async ({ page }, testInfo) => {
  await page.goto('/typing');
  await expect(page.getByRole('img', { name: 'COSMATH MATH ACADEMY' })).toBeVisible();
  await page.getByRole('button', { name: '예시 시험지 4문항으로 시작' }).click();
  await page.getByRole('textbox', { name: '보기 / 조건 박스', exact: true }).first().fill(Array.from({length: 21}, (_, i) => '조건 ' + (i + 1) + '. 값을 확인하시오.').join('\n'));
  await expect(page.locator('article')).toHaveCount(2);
  const buffer = await page.getByRole('heading', { name: /시험지 타이핑/ }).screenshot();
  await page.getByLabel('그림 별도 첨부').first().setInputFiles({ name: 'graph.png', mimeType: 'image/png', buffer });
  await expect(page.getByRole('img', { name: '1번 첨부 그림 미리보기' })).toBeVisible();
  await expect(page.locator('[data-problem] img')).toHaveCount(1);
  const fits = await page.locator('[data-problem]').evaluateAll(nodes => nodes.every(n => n.getBoundingClientRect().bottom <= n.closest('article').getBoundingClientRect().bottom - 5));
  expect(fits).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('long-question.png'), fullPage: true });
  await page.emulateMedia({ media: 'print' });
  const bytes = await page.pdf({ preferCSSPageSize: true });
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const pdf = await task.promise; expect(pdf.numPages).toBe(2); await task.destroy();
});
