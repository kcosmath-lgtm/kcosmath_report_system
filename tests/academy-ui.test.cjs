/* eslint-disable @typescript-eslint/no-require-imports -- Load TSX with a mocked RPC boundary. */
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
let rpc, calls, root;
const session = { user:{ id:'test-user', email:'teacher@example.com', user_metadata:{} } };
global.window = { setTimeout, location:{ origin:'http://localhost' } };
const original = Module._load;
Module._load = function(request, parent, isMain) {
  if (request.endsWith('/lib/supabase')) return { supabase: {
    rpc: (...args) => { calls.push(args); return rpc(...args); },
    auth: { getSession: async () => ({ data:{session} }), onAuthStateChange: () => ({ data:{ subscription:{unsubscribe() {}} } }) },
  } };
  if (request === 'next/navigation') return { usePathname: () => '/' };
  if (request.endsWith('.css')) return new Proxy({}, { get: (_, key) => String(key) });
  if (request.endsWith('.png')) return 'logo.png';
  if (request === 'next/image') return function Image() { return null; };
  return original.call(this, request, parent, isMain);
};
const Onboarding = require('../src/components/WorkspaceOnboarding.tsx').default;
const Requests = require('../src/components/AcademyRequests.tsx').default;
const AuthProvider = require('../src/components/AuthProvider.tsx').default;
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');
const button = label => root.root.findAllByType('button').find(node => text(node).includes(label));
async function click(label) { await act(async () => button(label).props.onClick()); }
async function mount(component, props = {}) { calls = []; await act(async () => { root = create(React.createElement(component, props)); }); }
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

test('home routes new users to onboarding and existing staff directly to the app', async () => {
  rpc = async name => { assert.ok(['cosmath_get_my_workspace','cosmath_my_join_request'].includes(name)); return {data:null}; };
  await mount(AuthProvider, { children:React.createElement('p',null,'APP') });
  assert.match(text(root.root),/어떤 계정으로 시작/);
  assert.ok(!text(root.root).includes('APP'));
  await act(async () => root.unmount()); root=null;
  rpc = async name => { assert.equal(name,'cosmath_get_my_workspace'); return {data:{id:'academy',name:'학원',role:'staff'}}; };
  await mount(AuthProvider, { children:React.createElement('p',null,'APP') });
  assert.equal(text(root.root),'APP');
  assert.equal(calls.length,1);
});

test('workspace read failure offers retry, not accidental creation of another academy', async () => {
  rpc = async () => ({ error:{message:'조회 실패'} });
  await mount(AuthProvider, {children:React.createElement('p',null,'APP')});
  assert.match(text(root.root),/조회 실패/);
  assert.equal(button('학원 계정'),undefined);
  rpc = async () => ({data:{id:'academy',name:'학원',role:'owner'}});
  await click('다시 확인');
  assert.equal(text(root.root),'APP');
});

test('teacher onboarding searches, requests access and explicitly checks approval without polling', async () => {
  let pending = null, refreshes = 0;
  rpc = async (name, args) => {
    if (name === 'cosmath_my_join_request') return { data:pending };
    if (name === 'cosmath_search_academies') { assert.equal(args.p_query,'코스'); return { data:[{ id:'academy-1234',name:'코스매스' }] }; }
    if (name === 'cosmath_request_academy_access') { assert.equal(args.p_academy_id,'academy-1234'); pending = { id:'request',academy_name:'코스매스',status:'pending' }; return { data:pending }; }
    throw new Error(name);
  };
  await mount(Onboarding, { refresh:async () => { refreshes++; }, signOut:async () => {} });
  assert.ok(button('학원 계정')); assert.ok(button('강사 계정'));
  await click('강사 계정');
  await act(async () => root.root.findByType('input').props.onChange({ target:{ value:'코스' } }));
  await act(async () => root.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  await click('가입 요청');
  assert.match(text(root.root),/학원 승인 대기 중/);
  assert.equal(calls.length,3);
  await click('승인 상태 확인');
  assert.equal(refreshes,1);
  assert.equal(calls.length,4);
});

test('existing pending request is restored; rejection can be dismissed; owner creation refreshes workspace', async () => {
  let request = { id:'request',academy_name:'코스매스',status:'rejected' }, refreshes = 0;
  rpc = async (name, args) => {
    if (name === 'cosmath_my_join_request') return { data:request };
    if (name === 'cosmath_cancel_join_request') { assert.equal(args.p_id,'request'); request=null; return {}; }
    if (name === 'cosmath_create_workspace') { assert.equal(args.p_name,'새 학원'); return { data:{id:'new'} }; }
    throw new Error(name);
  };
  await mount(Onboarding, { refresh:async () => { refreshes++; },signOut:async () => {} });
  assert.match(text(root.root),/가입 요청이 거절/);
  await click('다시 선택하기'); await click('계정 유형 다시 선택'); await click('학원 계정');
  await act(async () => root.root.findByType('input').props.onChange({ target:{ value:'새 학원' } }));
  await click('학원 만들기'); assert.equal(refreshes,1);
});

test('owner approves or rejects requests once and failed review leaves request available', async () => {
  let failure = true;
  rpc = async (name, args) => {
    if (name === 'cosmath_pending_join_requests') return { data:[{ id:'request',full_name:'선생님',email:'teacher@example.com',created_at:'2026-09-21T00:00:00Z' }] };
    if (name === 'cosmath_review_join_request') {
      assert.equal(args.p_id,'request'); assert.equal(args.p_approve,true);
      return failure ? { error:{ message:'처리 실패' } } : {};
    }
    throw new Error(name);
  };
  await mount(Requests); await click('승인');
  assert.match(text(root.root),/처리 실패/);
  assert.equal(button('승인').props.disabled,false);
  assert.equal(calls.length,2);
  failure=false; await click('승인');
  assert.match(text(root.root),/승인했습니다/);
  assert.equal(button('승인'),undefined);
  assert.equal(calls.length,3);
});
