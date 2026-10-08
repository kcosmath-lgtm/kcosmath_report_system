/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),React=require('react');
const {create,act}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
test('student records ignore file-dialog focus and visibility changes but refresh on roster changes',async()=>{
 const previous={window:global.window,document:global.document,BroadcastChannel:global.BroadcastChannel};
 global.window=new EventTarget();global.document=new EventTarget();global.document.visibilityState='visible';global.BroadcastChannel=undefined;
 const {useRosterRefresh}=require('../src/lib/use-roster-refresh.ts');let calls=0,root;
 const refresh=async()=>{calls++;};
 function Probe(){useRosterRefresh(refresh,false,false);return null;}
 try{
  await act(async()=>{root=create(React.createElement(Probe));});
  await act(async()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(calls,0);
  await act(async()=>{window.dispatchEvent(new Event('cosmath-roster-changed'));});
  assert.equal(calls,1);
 }finally{if(root)await act(async()=>root.unmount());Object.assign(global,previous);}
});
