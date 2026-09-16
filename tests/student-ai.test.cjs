/* eslint-disable @typescript-eslint/no-require-imports */
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { POST } = require('../src/app/api/student-chat/route.ts');
const { parseStudentAiReply } = require('../src/lib/student-ai.ts');
const originalFetch = global.fetch;
const originalKey = process.env.GEMINI_API_KEY;
const originalPassword = process.env.AI_CHAT_PASSWORD;
afterEach(() => {
  global.fetch = originalFetch;
  for (const [key, value] of [['GEMINI_API_KEY', originalKey], ['AI_CHAT_PASSWORD', originalPassword]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
function request(allowEdit) {
  process.env.GEMINI_API_KEY = 'test-key'; process.env.AI_CHAT_PASSWORD = 'test-password';
  return new Request('http://localhost/api/student-chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ai-password': 'test-password', origin: 'http://localhost' }, body: JSON.stringify({ allowEdit, messages: [{ role: 'user', text: '학생 추가' }], groups: [{ id: 'class-1', group: '중등 A', students: [{ id: 'student-1', name: '김학생', grade: '중2', version: 1 }] }] }) });
}
function mock(result) {
  global.fetch = async (_url, options) => {
    assert.equal(options.headers['x-goog-api-key'], 'test-key');
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(result) }] } }] });
  };
}
test('student AI discards edits in read-only mode', async () => {
  mock({ reply: '추가 제안입니다.', actions: [{ type: 'add_student', classId: 'class-1', name: '이학생', grade: '중1' }] });
  const response = await POST(request(false));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).actions, []);
});
test('student AI returns validated edit actions when permitted', async () => {
  const action = { type: 'archive_student', studentId: 'student-1', expectedVersion: 1 };
  mock({ reply: '퇴원 처리할 수 있습니다.', actions: [action] });
  const response = await POST(request(true));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).actions, [action]);
  assert.throws(() => parseStudentAiReply({ reply: '잘못된 작업', actions: [{ type: 'delete_student', studentId: 'student-1' }] }));
});
