/* eslint-disable @typescript-eslint/no-require-imports -- Compile TS for isolated server tests. */
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { POST } = require('../src/app/api/report-chat/route.ts');
const { aiFields, parseAiReply } = require('../src/lib/report-ai.ts');
const originalFetch = global.fetch;
const originalKey = process.env.GEMINI_API_KEY;
const originalPassword = process.env.AI_CHAT_PASSWORD;
afterEach(() => {
  global.fetch = originalFetch;
  for (const [key, value] of [['GEMINI_API_KEY', originalKey], ['AI_CHAT_PASSWORD', originalPassword]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
function request(allowEdit = false, password = 'test-password') {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.AI_CHAT_PASSWORD = 'test-password';
  return new Request('http://localhost/api/report-chat', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ai-password': password, origin: 'http://localhost' },
    body: JSON.stringify({ allowEdit, messages: [{ role: 'user', text: '전달사항 작성' }], report: {
      ...Object.fromEntries(aiFields.map(key => [key, '학습 내용'])), grade: '중2', name: 'PRIVATE_NAME', teacher: 'PRIVATE_TEACHER',
    } }),
  });
}
function mock(reply = { reply: '제안입니다.', patch: { notes: '복습해 주세요.' } }) {
  global.fetch = async (_url, options) => {
    assert.equal(options.headers['x-goog-api-key'], 'test-key');
    assert.ok(!options.body.includes('PRIVATE_NAME'));
    assert.ok(!options.body.includes('PRIVATE_TEACHER'));
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(reply) }] } }] });
  };
}
test('password is required before any Gemini call', async () => {
  global.fetch = () => { throw new Error('must not call'); };
  assert.equal((await POST(request(false, 'wrong'))).status, 401);
});
test('read-only requests discard model edits and minimize report context', async () => {
  mock();
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).patch, {});
});
test('editing permission returns validated changes', async () => {
  mock();
  const response = await POST(request(true));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).patch, { notes: '복습해 주세요.' });
});
test('protected model fields are rejected', async () => {
  mock({ reply: '수정', patch: { name: '금지' } });
  assert.equal((await POST(request(true))).status, 502);
  assert.throws(() => parseAiReply({ reply: '수정', patch: { notes: 123 } }));
});
test('missing configuration and upstream errors are actionable without leaking secrets', async () => {
  const req = request();
  delete process.env.GEMINI_API_KEY;
  assert.equal((await POST(req)).status, 503);
  global.fetch = async () => new Response('private upstream detail', { status: 429 });
  const response = await POST(request());
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes('private upstream detail'));
});
