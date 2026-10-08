import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import JSZip from "jszip";

test('preview eraser supports undo, comparison, cancellation and persistent PNG export without AI', async ({ page }) => {
  let aiCalls = 0;
  await page.route('**/api/typing/clean-figure', route => { aiCalls++; return route.abort(); });
  await page.goto('/typing');
  await page.getByRole('button', { name: '예시 시험지 4문항으로 시작' }).click();
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 80;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 100, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('그림 별도 첨부').first().setInputFiles({ name: 'ink.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  const problem = page.locator('[data-problem]').first();
  const open = async () => {
    await problem.getByRole('button', { name: '문항 1 그림 편집', exact: true }).click();
    await page.getByRole('button', { name: '손글씨 지우기', exact: true }).click();
    await expect(page.getByRole('button', { name: '지우기 적용', exact: true })).toBeEnabled();
  };
  await open();
  const canvas = page.getByLabel('손글씨 지우기 캔버스');
  const pixel = () => canvas.evaluate(node => [...node.getContext('2d').getImageData(50, 40, 1, 1).data]);
  await expect.poll(pixel).toEqual([0, 0, 0, 255]);
  await canvas.click(); await expect.poll(pixel).toEqual([255, 255, 255, 255]);
  await page.keyboard.press('Control+z');
  await expect.poll(pixel).toEqual([0, 0, 0, 255]);
  await expect(page.getByRole('button', { name: '되돌리기', exact: true })).toBeDisabled();
  await canvas.click();
  await page.getByRole('button', { name: '되돌리기', exact: true }).click();
  await expect.poll(pixel).toEqual([0, 0, 0, 255]);
  await page.getByLabel('그림 확대').selectOption('2');
  await page.getByLabel('브러시 크기').fill('20');
  await canvas.click(); await expect.poll(pixel).toEqual([255, 255, 255, 255]);
  await page.getByLabel('원본 비교', { exact: true }).check();
  await expect(page.getByAltText('지우기 전 원본')).toBeVisible();
  await page.getByLabel('원본 비교', { exact: true }).uncheck();
  await page.getByRole('button', { name: '원본 복원', exact: true }).click();
  await expect.poll(pixel).toEqual([0, 0, 0, 255]);
  await canvas.click();
  await page.getByRole('button', { name: '지우기 취소', exact: true }).click();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await open(); await expect.poll(pixel).toEqual([0, 0, 0, 255]);
  await canvas.click(); await page.getByRole('button', { name: '지우기 적용', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const saved = await problem.locator('img').getAttribute('src');
  expect(saved).not.toBe('data:image/png;base64,' + image);
  await page.waitForTimeout(800); await page.reload();
  await expect(problem.locator('img')).toHaveAttribute('src', saved);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Word', exact: true }).click()]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const media = Object.values(zip.files).filter(file => file.name.startsWith('word/media/') && !file.dir);
  expect(await Promise.all(media.map(file => file.async('base64')))).toContain(saved.split(',')[1]);
  expect(aiCalls).toBe(0);
});

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
  // A deployment may remove old lazy chunks. Exports must already be loaded.
  await page.route("**/_next/static/chunks/**", route => route.abort());
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


test('recognized tables are editable and survive JSON restore and document exports', async ({ page }) => {
  await page.route('**/api/typing/extract', route => route.fulfill({ json: { problems: [{ number: '1', question: '표에서 A+B+C의 값은?', choices: ['2','4','6','8','10'], tables: [{ caption: '표 1', rows: [['$x$','1','5','8','B'], ['$y$','4','A','32','48']] }, { caption: '표 2', rows: [['$x$','-5','-3','1','4'], ['$y$','-6','-10','C','$\\frac{15}{2}$']] }] }] } }));
  await page.goto('/typing');
  await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles({ name: 'table.png', mimeType: 'image/png', buffer: await page.getByRole('heading', { name: /시험지 타이핑/ }).screenshot() });
  await page.getByRole('button', { name: '선택 페이지 인식' }).click();
  await expect(page.locator('[data-problem] table')).toHaveCount(2);
  await expect(page.locator('[data-problem] table').first().locator('td')).toHaveCount(10);
  await page.getByRole('textbox', { name: '문항 1 표 1 2행 3열', exact: true }).fill('$a^2$');
  await expect(page.locator('[data-problem] table').first().locator('td').nth(7).locator('.katex')).toHaveCount(1);
  await page.getByRole('button', { name: '표 추가', exact: true }).click();
  await expect(page.locator('[data-problem] table')).toHaveCount(3);
  await page.getByRole('button', { name: '행 추가', exact: true }).last().click();
  await page.getByRole('button', { name: '열 추가', exact: true }).last().click();
  await expect(page.locator('[data-problem] table').last().locator('td')).toHaveCount(9);
  const [word] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Word', exact: true }).click()]);
  const zip = await JSZip.loadAsync(readFileSync(await word.path()));
  expect((await zip.file('word/document.xml').async('string')).match(/<w:tbl>/g)).toHaveLength(6);
  await page.waitForTimeout(800); await page.reload();
  await expect(page.locator('[data-problem] table')).toHaveCount(3);
});

test('JBIG2 scanned PDF renders its printed body instead of only annotations', async ({ page }, testInfo) => {
  test.skip(!process.env.TYPING_REVIEW_PDF, 'Set TYPING_REVIEW_PDF to a local JBIG2 regression document.');
  const warnings = []; page.on('console', msg => { if (/Jbig2Error|JBig2 failed|UnknownErrorException/.test(msg.text())) warnings.push(msg.text()); });
  let decoderLoaded = false;
  page.on('response', response => { if (response.url().includes('/typing/wasm/jbig2.wasm') && response.ok()) decoderLoaded = true; });
  await page.goto('/typing');
  await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles({ name: 'scanned.pdf', mimeType: 'application/pdf', buffer: readFileSync(process.env.TYPING_REVIEW_PDF) });
  await expect(page.getByRole('button', { name: /6\. scanned.pdf/ })).toBeVisible({ timeout: 30000 });
  expect(warnings).toEqual([]); expect(decoderLoaded).toBe(true);
  const ink = await page.locator('img[alt="scanned.pdf · 1쪽"]').evaluate(async img => {
    await img.decode(); const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    const {data} = ctx.getImageData(Math.floor(canvas.width * .1), Math.floor(canvas.height * .32), Math.floor(canvas.width * .36), Math.floor(canvas.height * .055));
    let dark = 0; for(let i=0;i<data.length;i+=4) if(data[i]<100 && data[i+1]<100 && data[i+2]<100) dark++;
    return dark;
  });
  expect(ink).toBeGreaterThan(1000);
  await page.getByRole('img', { name: 'scanned.pdf · 1쪽' }).screenshot({ path: testInfo.outputPath('jbig2-fixed.png') });
});


test('coordinate choices never overlap and Korean box statements keep variables inline', async ({ page }, testInfo) => {
  await page.route('**/api/typing/extract', route => route.fulfill({ json: { problems: [{
    number: '3', question: '그림은 반비례 관계의 그래프이다. 이 그래프 위의 점이 아닌 것은?', points: '4점',
    boxContent: 'ㄱ.\n$$x$$\n쪽의 책을 하루에 10장씩\n$$y$$\n일 동안 읽었다. ㄴ. 200g에 1000원인 소고기를\n$x$\ng 샀을 때의 가격은\n$y$\n원이다.\nㄷ. 두 사람의 일의 양은 같다.',
    choices: ['$(-10,4/5)$', '$(-4,2)$', '$(6,-3/4)$', '$(16,-1/2)$', '$(20,-2/5)$'],
  }] } }));
  await page.goto('/typing');
  await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles({ name: 'layout.png', mimeType: 'image/png', buffer: await page.getByRole('heading', { name: /시험지 타이핑/ }).screenshot() });
  await page.getByRole('button', { name: '선택 페이지 인식' }).click();
  const problem = page.locator('[data-problem]'); await expect(problem).toHaveCount(1);
  const box = problem.locator('[class*="box"]:not([class*="boxLabel"])');
  await expect(box.locator('.katex-display')).toHaveCount(0);
  expect(await box.locator(':scope > span').evaluateAll(nodes => nodes.every(n => getComputedStyle(n).display === 'inline'))).toBe(true);
  const check = async () => {
    const valid = await problem.locator('[class*="choices"] > div').evaluateAll(nodes => {
      const rects = nodes.map(n => n.getBoundingClientRect());
      return rects.every((r, i) => rects.slice(i + 1).every(s => r.right <= s.left + 1 || s.right <= r.left + 1 || r.bottom <= s.top + 1 || s.bottom <= r.top + 1));
    }); expect(valid).toBe(true);
  };
  await check();
  await expect.poll(async () => problem.locator('[class*="choices"] > div').evaluateAll(nodes => {
    const r = nodes.map(n => n.getBoundingClientRect());
    return Math.abs(r[0].left - r[3].left) < 1 && Math.abs(r[1].left - r[4].left) < 1 && r[3].top > r[0].top;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('choices-box-fixed.png'), fullPage: true });
  await page.emulateMedia({ media: 'print' }); await check();
  await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 390, height: 844 }); await check();
});


test('sentence choices use one full-width row each', async ({ page }) => {
  await page.goto('/typing');
  await page.getByRole('button', { name: '예시 시험지 4문항으로 시작' }).click();
  await page.getByRole('textbox', { name: '선택지 · 한 줄에 하나씩, 최대 5개' }).first().fill('㉠과 ㉡의 그래프는 만난다.\n㉡과 ㉢의 그래프는 만나지 않는다.\n㉠, ㉡, ㉢의 그래프는 제3사분면을 지난다.\n한 쌍의 매끄러운 곡선으로 그려지는 그래프는 3개다.\n원점을 지나는 직선으로 그려지는 그래프 중에서 x축에 가장 가까운 그래프는 ㉡의 그래프이다.');
  const choices = page.locator('[data-problem]').first().locator('[data-prose="true"]');
  await expect(choices).toBeVisible();
  await expect.poll(() => choices.locator(':scope > div').evaluateAll(nodes => {
    const rects = nodes.map(n => n.getBoundingClientRect());
    return rects.length === 5 && rects.every((r, i) => Math.abs(r.left - rects[0].left) < 1 && (!i || r.top >= rects[i - 1].bottom));
  })).toBe(true);
});


test('OCR crops a figure locally, supports replacing its region and file, and preserves it on reload', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/typing/extract', route => { calls++; return route.fulfill({ json: { problems: [{ number: '1', question: '그림의 값을 구하시오.', choices: ['1','2','3','4','5'], figureBox: [250,500,750,900] }] } }); });
  await page.goto('/typing');
  const data = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width=600;canvas.height=800;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,600,800);ctx.fillStyle='blue';ctx.fillRect(300,200,240,400);return canvas.toDataURL('image/png').split(',')[1]; });
  const original = { name: 'figure-source.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
  await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles(original);
  await page.getByRole('button', { name: '선택 페이지 인식' }).click();
  const figure = page.locator('[data-problem] img'); await expect(figure).toHaveCount(1);
  await expect.poll(() => figure.evaluate(img => [img.naturalWidth,img.naturalHeight])).toEqual([256,420]);
  await page.getByRole('button', { name: '원본에서 그림 영역 다시 선택' }).click();
  await page.getByRole('spinbutton', { name: '1번 그림 상단 (%)' }).fill('0');
  await page.getByRole('spinbutton', { name: '1번 그림 왼쪽 (%)' }).fill('0');
  await page.getByRole('spinbutton', { name: '1번 그림 하단 (%)' }).fill('50');
  await page.getByRole('spinbutton', { name: '1번 그림 오른쪽 (%)' }).fill('50');
  await page.getByRole('button', { name: '선택 영역 적용' }).click();
  await expect.poll(() => figure.evaluate(img => [img.naturalWidth,img.naturalHeight])).toEqual([300,400]);
  await page.getByLabel('그림 교체').setInputFiles(original);
  await expect.poll(() => figure.evaluate(img => [img.naturalWidth,img.naturalHeight])).toEqual([600,800]);
  const [hangul] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '한글 HWPX', exact: true }).click()]);
  const zip = await JSZip.loadAsync(readFileSync(await hangul.path()));
  expect(Object.keys(zip.files).filter(n => n.startsWith('BinData/image'))).toHaveLength(2);
  await page.waitForTimeout(800); await page.reload(); await expect(figure).toHaveCount(1);
  expect(calls).toBe(1);
  await page.getByRole('button', { name: '문항 편집' }).click();
  await page.getByLabel('1번 그림 자르기용 원본', { exact: true }).setInputFiles({ name: 'source-again.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  const source = page.getByAltText('1번 그림 자르기 원본', { exact: true });
  await expect(source).toBeVisible();
  await source.scrollIntoViewIfNeeded();
  const rect = await source.boundingBox();
  await page.mouse.move(rect.x + rect.width * .2, rect.y + rect.height * .2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .6, rect.y + rect.height * .7, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: '선택 영역 적용', exact: true }).click();
  await expect.poll(() => figure.evaluate(img => img.naturalWidth)).toBe(240);
  await expect.poll(() => figure.evaluate(img => img.naturalHeight)).toBe(400);
  expect(calls).toBe(1);
  await page.getByRole('button', { name: '첨부 그림 삭제' }).click(); await expect(figure).toHaveCount(0);
});


test('picture choices crop independently, keep 2+2+1 alignment, export and persist', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/typing/extract', route => { calls++; return route.fulfill({ json: { problems: [{ number: '14', question: '두 직선이 평행한 것은?', choices: ['', '', '', '', ''], figureBox: [], choiceFigureBoxes: [[0,0,200,200],[200,200,400,400],[400,400,600,600],[600,600,800,800],[800,800,1000,1000]], tables: [{ caption: '', rows: [['x','-2','15/2']] }] }] } }); });
  await page.goto('/typing');
  const data = await page.evaluate(() => { const c = document.createElement('canvas'); c.width=500;c.height=500;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,500,500);return c.toDataURL('image/png').split(',')[1]; });
  await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles({ name: 'choices.png', mimeType: 'image/png', buffer: Buffer.from(data,'base64') });
  await page.getByRole('button', { name: '선택 페이지 인식' }).click();
  const problem = page.locator('[data-problem]').first();
  await page.getByRole('textbox', { name: '선택지 · 한 줄에 하나씩, 최대 5개' }).fill('');
  await expect(problem.locator('img')).toHaveCount(5);
  await expect(problem.locator('table .katex')).toHaveCount(3);
  await expect.poll(() => problem.locator('img').evaluateAll(nodes => {
    const r=nodes.map(n=>n.getBoundingClientRect()); return r.length===5 && Math.abs(r[0].top-r[1].top)<1 && Math.abs(r[2].top-r[3].top)<1 && Math.abs(r[0].left-r[4].left)<1 && r[4].top>r[2].top;
  })).toBe(true);
  for (const [button, entry] of [['Word','word/document.xml'], ['한글 HWPX','Contents/section0.xml']]) {
    const [file] = await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:button,exact:true}).click()]);
    const zip = await JSZip.loadAsync(readFileSync(await file.path())); const xml=await zip.file(entry).async('string');
    expect((xml.match(button==='Word'?/<w:drawing>/g:/<hp:pic /g)||[]).length).toBe(6);
  }
  await page.getByText('객관식 선지별 그림 편집 (①~⑤)',{exact:true}).click();
  const editor = page.locator('details').filter({hasText:'객관식 선지별 그림 편집'});
  await editor.getByLabel('그림 교체').first().setInputFiles({ name:'replacement.png',mimeType:'image/png',buffer:Buffer.from(data,'base64') });
  await expect.poll(() => problem.getByAltText('① 선지 그림',{exact:true}).evaluate(img=>img.naturalWidth)).toBe(500);
  await page.waitForTimeout(800);await page.reload();
  await expect(problem.locator('img')).toHaveCount(5);
  await expect.poll(() => problem.getByAltText('① 선지 그림',{exact:true}).evaluate(img=>img.naturalWidth)).toBe(500);
  expect(calls).toBe(1);
});


test('preview edits text and deletes an image while statement choices keep three plus two alignment', async ({ page }) => {
  await page.goto('/typing');await page.getByRole('button',{name:'예시 시험지 4문항으로 시작'}).click();
  const problem=page.locator('[data-problem]').first();
  await problem.getByRole('button',{name:'문항 1 본문 편집',exact:true}).click();
  await page.getByRole('textbox',{name:'미리보기 편집 내용'}).fill('미리보기에서 수정한 $x^2$ 문제');
  await page.getByRole('button',{name:'적용',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'문제 본문',exact:true}).first()).toHaveValue('미리보기에서 수정한 $x^2$ 문제');
  await page.getByRole('textbox',{name:'선택지 · 한 줄에 하나씩, 최대 5개'}).first().fill(['ㄱ','ㄱ, ㄷ','ㄴ, ㄷ','ㄴ, ㄹ','ㄱ, ㄷ, ㄹ'].join('\n'));
  await expect.poll(()=>problem.locator('[data-prose] > div').evaluateAll(nodes=>{const r=nodes.map(n=>n.getBoundingClientRect());return r.length===5&&Math.abs(r[0].top-r[2].top)<1&&Math.abs(r[3].top-r[4].top)<1&&Math.abs(r[0].left-r[3].left)<1&&Math.abs(r[1].left-r[4].left)<1&&r[3].top>r[0].top;})).toBe(true);
  await problem.getByRole('button',{name:'① 선지 편집',exact:true}).click();await page.getByRole('textbox',{name:'미리보기 편집 내용'}).fill('ㄱ, ㄴ');await page.getByRole('button',{name:'적용',exact:true}).click();
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=50;c.height=50;return c.toDataURL('image/png').split(',')[1];});
  await page.getByLabel('그림 별도 첨부').first().setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await problem.getByRole('button',{name:'문항 1 그림 편집',exact:true}).click();await page.getByRole('button',{name:'이미지 삭제',exact:true}).click();await expect(problem.locator('img')).toHaveCount(0);
  await page.waitForTimeout(800);await page.reload();await expect(problem).toContainText('미리보기에서 수정한');await expect(problem).toContainText('ㄱ, ㄴ');await expect(problem.locator('img')).toHaveCount(0);
});


test('coordinate fractions keep a single math expression per choice and balanced rows', async ({page})=>{
 await page.goto('/typing');await page.getByRole('button',{name:'예시 시험지 4문항으로 시작'}).click();
 await page.getByRole('textbox',{name:'선택지 · 한 줄에 하나씩, 최대 5개'}).first().fill(['(-10, 4/5)','(-4, 2)','(6, -3/4)','(16, -1/2)','(20, -2/5)'].join('\n'));
 const choices=page.locator('[data-problem]').first().locator('[data-prose]');
 await expect(choices.locator('.katex')).toHaveCount(5);await expect(choices.locator('.mfrac')).toHaveCount(4);
 await expect.poll(()=>choices.locator(':scope > div').evaluateAll(nodes=>{const r=nodes.map(n=>n.getBoundingClientRect());return Math.abs(r[0].top-r[2].top)<3&&r[3].top>r[0].top&&Math.abs(r[0].left-r[3].left)<1&&Math.abs(r[1].left-r[4].left)<1&&nodes.every(n=>n.scrollWidth<=n.clientWidth+2);})).toBe(true);
});


test('first OCR ignores generated diagrams and choice layout uses only five, three or one column without scrollbars', async({page})=>{
 let calls=0;
 const diagram={width:100,height:80,elements:[{kind:'polyline',points:[[0,40],[100,40]],x:0,y:0,rx:0,ry:0,text:''}]};
 await page.route('**/api/typing/extract',r=>{calls++;return r.fulfill({json:{problems:[{number:'1',question:'그래프에서 값을 구하시오.',choices:['14/3','16/3','6','20/3','22/3'],figureDiagram:diagram,figureBox:[0,0,1000,1000]}]}});});
 await page.goto('/typing');const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=80;return c.toDataURL('image/png').split(',')[1];});
 await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles({name:'graph.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});await page.getByRole('button',{name:'선택 페이지 인식'}).click();
 const problem=page.locator('[data-problem]').first();await expect(problem.locator('img')).toHaveCount(1);expect(calls).toBe(1);
 const choices=problem.locator('[data-prose]');
 await expect.poll(()=>choices.evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length)).toBe(5);
 expect(await choices.locator(':scope > div > div').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).overflowX==='visible'&&n.scrollWidth<=n.clientWidth+1))).toBe(true);
 await page.getByRole('textbox',{name:'선택지 · 한 줄에 하나씩, 최대 5개'}).fill(Array(5).fill('123456789012345678901234567890/12345').join('\n'));
 await expect.poll(()=>choices.evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length)).toBe(1);
});


test('preview image only offers local erasing and Korean box statements indent wrapped lines',async({page})=>{
 await page.goto('/typing');await page.getByRole('button',{name:'예시 시험지 4문항으로 시작'}).click();
 await page.getByRole('textbox',{name:'보기 / 조건 박스'}).first().fill('ㄱ. 책을 하루에 열 장씩 읽었으며 다음 날에도 같은 분량을 읽었다. '.repeat(2));
 const statement=page.locator('[data-problem]').first().locator('[class*="boxStatement"]').first();
 await expect(statement).toBeVisible();
 expect(await statement.evaluate(n=>{const text=n.querySelector('span')?.firstChild;if(!text||text.nodeType!==3)return false;let first;for(let i=0;i<text.textContent.length;i++){const range=document.createRange();range.setStart(text,i);range.setEnd(text,i+1);const r=range.getBoundingClientRect();if(!first)first=r;else if(r.top>first.top+3)return r.left>first.left+8;}return false;})).toBe(true);
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=80;return c.toDataURL('image/png').split(',')[1];});
 await page.getByLabel('그림 별도 첨부').first().setInputFiles({name:'graph.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
 const problem=page.locator('[data-problem]').first();await problem.getByRole('button',{name:'문항 1 그림 편집',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:/AI/})).toHaveCount(0);await expect(dialog.getByRole('button',{name:'손글씨 지우기',exact:true})).toBeVisible();
});
