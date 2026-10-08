/* eslint-disable @typescript-eslint/no-require-imports */
const { test, beforeEach, afterEach } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), ts = require("typescript"), Module = require("node:module");
let previousKey;
beforeEach(() => { previousKey = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = "server-test-key"; });
afterEach(() => { if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey; });
let member = true, access = true, accessError = null;
function compile(relative, mocks = {}) {
  const filename = path.resolve(__dirname, relative), compiled = new Module(filename, module);
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = name => mocks[name] ?? require(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename); return compiled.exports;
}
const model = compile("../src/lib/typing-model.ts");
const { POST } = compile("../src/app/api/typing/extract/route.ts", {
  "next/server": { NextResponse: { json: (data, init) => new Response(JSON.stringify(data), init) } },
  "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === "valid" ? { id: "teacher" } : null } }) }, rpc: async () => ({ data: access, error: accessError }), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: member ? { academy_id: "academy" } : null }) }) }) }) }) },
  "../../../../lib/typing-model": model,
});
function request(body, token = "valid") { return new Request("http://localhost/api/typing/extract", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); }
const payload = { image: "aGVsbG8=", mimeType: "image/jpeg", apiKey: "test-key", model: "another-model" };
test("OCR rejects anonymous users, invalid sessions and users outside an academy before inference", async () => {
  assert.equal((await POST(request(payload, ""))).status, 401);
  assert.equal((await POST(request(payload, "invalid"))).status, 401);
  member = false;
  try { assert.equal((await POST(request(payload))).status, 403); } finally { member = true; }
});
test("OCR always calls gemini-3.1-flash-lite once and sends keys only in the API header", async () => {
  const oldFetch = global.fetch, calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ problems: [{ number: "1", question: "$x^2$의 값은?", choices: [] }] }) }] } }] })); };
  try {
    const response = await POST(request(payload)); assert.equal(response.status, 200);
    assert.equal(calls.length, 1); assert.match(calls[0].url, /models\/gemini-3\.1-flash-lite:generateContent$/);
    assert.ok(!calls[0].url.includes("test-key")); assert.equal(calls[0].options.headers["x-goog-api-key"], "server-test-key");
    assert.equal((await response.json()).problems.length, 1);
  } finally { global.fetch = oldFetch; }
});
test("missing server key returns 503 without using a client-supplied key", async () => {
  delete process.env.GEMINI_API_KEY;
  const oldFetch = global.fetch; let calls = 0;
  global.fetch = async () => { calls++; throw new Error("Inference must not run"); };
  try { assert.equal((await POST(request(payload))).status, 503); assert.equal(calls, 0); } finally { global.fetch = oldFetch; }
});
test("unapproved accounts and permission lookup failures never call Gemini even with their own key", async () => {
  const oldFetch = global.fetch; let calls = 0;
  global.fetch = async () => { calls++; throw new Error("Inference must not run"); };
  try {
    access = false; assert.equal((await POST(request(payload))).status, 403);
    access = true; accessError = { message: "permission table unavailable" }; assert.equal((await POST(request(payload))).status, 403);
    assert.equal(calls, 0);
  } finally { global.fetch = oldFetch; access = true; accessError = null; }
});
test("invalid images and model failures do not trigger fallback models", async () => {
  assert.equal((await POST(request({ ...payload, mimeType: "text/html" }))).status, 400);
  const oldFetch = global.fetch; let calls = 0;
  global.fetch = async () => { calls++; return new Response("quota", { status: 429 }); };
  try { assert.equal((await POST(request(payload))).status, 429); assert.equal(calls, 1); } finally { global.fetch = oldFetch; }
});


test('OCR errors identify upstream failure, truncation, JSON and table validation without leaking secrets', async () => {
  const oldFetch = global.fetch, oldLog = console.error, logs = [];
  console.error = (...args) => logs.push(args.join(' '));
  const cases = [
    [new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'server-test-key private content', details: [{ reason: 'API_KEY_INVALID' }] } }), { status: 400 }), 'GEMINI_HTTP_400', 502],
    [new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS' }] })), 'OCR_INCOMPLETE', 502],
    [new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json private content' }] } }] })), 'OCR_INVALID_JSON', 502],
    [new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ problems: [{ question: '표 문제', tables: [{ rows: [['x','y'], ['z']] }] }] }) }] } }] })), 'OCR_INVALID_DOCUMENT', 502],
  ];
  try {
    for (const [providerResponse, code, status] of cases) {
      global.fetch = async () => providerResponse;
      const response = await POST(request(payload)), body = await response.json();
      assert.equal(response.status, status); assert.equal(body.code, code); assert.ok(body.requestId);
      assert.ok(!JSON.stringify(body).includes('server-test-key'));
    }
    global.fetch = async () => { throw new DOMException('private content', 'TimeoutError'); };
    const timeout = await POST(request(payload)); assert.equal(timeout.status, 504); assert.equal((await timeout.json()).code, 'OCR_TIMEOUT');
    assert.ok(logs.some(line => line.includes('API_KEY_INVALID')));
    assert.ok(logs.every(line => !line.includes('server-test-key') && !line.includes('private content')));
  } finally { global.fetch = oldFetch; console.error = oldLog; }
});
