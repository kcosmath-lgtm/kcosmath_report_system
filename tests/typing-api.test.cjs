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
const apiMocks = {
  "next/server": { NextResponse: { json: (data, init) => new Response(JSON.stringify(data), init) } },
  "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === "valid" ? { id: "teacher" } : null } }) }, rpc: async () => ({ data: access, error: accessError }), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: member ? { academy_id: "academy" } : null }) }) }) }) }) },
  "../../../../lib/typing-model": model,
  "../../../../lib/typing-diagram": compile("../src/lib/typing-diagram.ts"),
};
const { POST } = compile("../src/app/api/typing/extract/route.ts", apiMocks);
const { POST: cleanFigure } = compile("../src/app/api/typing/clean-figure/route.ts", apiMocks);
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
    [new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'server-test-key private content', details: [{ reason: 'API_KEY_INVALID' }] } }), { status: 400 }), 'GEMINI_API_KEY_INVALID', 502],
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


test('Gemini 400 errors distinguish schema, billing and image failures without logging raw messages', async () => {
  const oldFetch = global.fetch, oldLog = console.error;
  const logs = []; console.error = (...args) => logs.push(args.join(' '));
  try {
    for (const [message, code] of [
      ['Response schema has too many states for serving. private-content', 'GEMINI_SCHEMA_INVALID'],
      ['Please enable a paid plan. private-content', 'GEMINI_BILLING_REQUIRED'],
      ['Unable to decode image. private-content', 'GEMINI_IMAGE_INVALID'],
      ['Request contains an invalid argument. private-content', 'GEMINI_REQUEST_INVALID'],
    ]) {
      global.fetch = async (_url, options) => {
        assert.ok(!options.body.includes('maxItems'));
        return new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message } }), { status: 400 });
      };
      const body = await (await POST(request(payload))).json(); assert.equal(body.code, code);
      assert.ok(!body.error.includes('private-content'));
    }
    assert.ok(logs.every(line => !line.includes('private-content')));
  } finally { global.fetch = oldFetch; console.error = oldLog; }
});


test('figure cleanup enforces access and server key before any paid request', async () => {
  const oldFetch=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw new Error('must not call');};
  try {
    assert.equal((await cleanFigure(request(payload,''))).status,401);
    assert.equal((await cleanFigure(request(payload,'invalid'))).status,401);
    member=false;assert.equal((await cleanFigure(request(payload))).status,403);member=true;
    access=false;assert.equal((await cleanFigure(request(payload))).status,403);access=true;
    accessError={message:'unavailable'};assert.equal((await cleanFigure(request(payload))).status,403);accessError=null;
    assert.equal((await cleanFigure(request({...payload,image:'',mimeType:'text/html'}))).status,400);
    delete process.env.GEMINI_API_KEY;assert.equal((await cleanFigure(request(payload))).status,503);
    assert.equal(calls,0);
  } finally { global.fetch=oldFetch;member=true;access=true;accessError=null; }
});
test('figure cleanup sends one authenticated image edit and rejects missing images without retry', async () => {
  const oldFetch=global.fetch,oldLog=console.error;let calls=0;
  global.fetch=async(url,options)=>{
    calls++;assert.match(url,/models\/gemini-3\.1-flash-lite:generateContent$/);
    assert.equal(options.headers['x-goog-api-key'],'server-test-key');
    const body=JSON.parse(options.body);assert.equal(body.generationConfig.responseMimeType,'application/json');assert.equal(body.generationConfig.responseModalities,undefined);
    assert.equal(body.contents[0].parts[1].inlineData.data,payload.image);
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({supported:true,width:100,height:100,elements:[{kind:'polyline',points:[[0,0],[100,100]],x:0,y:0,rx:0,ry:0,text:''}]})}]}}]}));
  };
  console.error=()=>{};
  try {
    const response=await cleanFigure(request(payload));assert.equal(response.status,200);assert.equal((await response.json()).diagram.elements.length,1);assert.equal(calls,1);
    global.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'no image'}]}}]}));
    assert.equal((await (await cleanFigure(request(payload))).json()).code,'FIGURE_INVALID_JSON');
    global.fetch=async()=>new Response('',{status:429});assert.equal((await cleanFigure(request(payload))).status,429);
    global.fetch=async()=>{throw new DOMException('private data','TimeoutError');};assert.equal((await cleanFigure(request(payload))).status,504);
  } finally {global.fetch=oldFetch;console.error=oldLog;}
});


test('diagram SVG escapes labels and rejects invalid coordinates and excessive primitives', () => {
  const {normalizeDiagram,diagramSvg}=compile('../src/lib/typing-diagram.ts');
  const element={kind:'text',points:[],x:5,y:20,rx:0,ry:0,text:'<script>alert(1)</script>'};
  const diagram={width:100,height:100,elements:[element]};
  const svg=diagramSvg(diagram);assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));
  assert.throws(()=>normalizeDiagram({...diagram,elements:[{...element,x:NaN}]}));
  assert.throws(()=>normalizeDiagram({...diagram,elements:Array(301).fill(element)}));
});
