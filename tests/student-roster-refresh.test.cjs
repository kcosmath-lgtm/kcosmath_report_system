/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
for (const ext of ['.ts','.tsx']) require.extensions[ext] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,f);
test('background roster refresh preserves the mounted grade importer', async () => {
 const original = Module._load;
 let refresh, resolveRefresh, mounts = 0, deferred = false, root;
 const roster = [{ id:'class',group:'Class',students:[{id:'a',name:'A',grade:'중3',version:1}] }];
 Module._load = function(request,parent,isMain) {
  if (request.endsWith('.css')) return new Proxy({}, {get:(_,k)=>String(k)});
  if (request === '../lib/use-roster-refresh') return { useRosterRefresh: fn => { refresh=fn; } };
  if (request === '../lib/report-storage') return { loadStudents: () => deferred ? new Promise(resolve => { resolveRefresh=resolve; }) : Promise.resolve(roster) };
  if (request === './StudentDailyRecords') return { __esModule:true, default: function Records() { React.useEffect(()=>{mounts++;},[]); return React.createElement('div',{'data-importer':true},'pending grades'); } };
  return original.call(this,request,parent,isMain);
 };
 try {
  const Manager=require('../src/components/StudentManagerModal.tsx').default;
  await act(async()=>{root=create(React.createElement(Manager,{open:true,mode:'page',onClose(){},onChanged(){}}));});
  assert.equal(mounts,1);
  deferred=true;
  let pending;
  await act(async()=>{pending=refresh();});
  assert.equal(root.root.findAllByProps({'data-importer':true}).length,1);
  await act(async()=>{resolveRefresh(roster);await pending;});
  assert.equal(mounts,1);
 } finally { if(root) await act(async()=>root.unmount());Module._load=original; }
});
