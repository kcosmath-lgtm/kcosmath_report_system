const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module'), ts = require('typescript');
const React = require('react'), { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
for (const ext of ['.ts','.tsx']) require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
test('Excel confirmation submits exams on an existing attendance record and reports server failure', async () => {
 const original=Module._load; let root, submitted, fail=false, savedDate;
 const daily={id:'daily',student_id:'a',record_date:'2026-10-07',attendance:'출석',reason:'',exams:[],version:1};
 const wrong={id:'wrong',student_id:'a',record_date:'2026-10-07',total_wrong:11,corrected_count:4,memo:'keep',version:1};
 const storage={loadStudentDaily:async()=>[daily],loadWrongAnswers:async()=>[wrong],saveStudentDaily:async items=>{submitted=items;if(fail)throw Error('Save rejected');return items;}};
 Module._load=function(r,p,i){if(r.endsWith('.css'))return new Proxy({},{get:(_,k)=>String(k)});if(r==='../lib/report-storage')return storage;return original.call(this,r,p,i);};
 const previousParser=global.DOMParser;
 global.DOMParser=class{parseFromString(){return{querySelectorAll:()=>[
  ['학생명','학년','점수','생성일','문제지명','문제지ID','문항수','정/오'],['A','중3','93점','26.10.07','Test','123','15문항','14/1']
 ].map(row=>({querySelectorAll:()=>row.map(textContent=>({textContent}))}))};}};
 try {
  const Grades=require('../src/components/StudentGrades.tsx').default;
  const props={groups:[{id:'g',group:'Different',students:[{id:'a',name:'A',grade:'중3'}]}],history:[],onSaved:d=>{savedDate=d;},blocked:false,show:false,setShow(){},onBusyChange(){}};
  await act(async()=>{root=create(React.createElement(Grades,props));});
  const upload=async()=>act(async()=>{root.root.findByProps({type:'file'}).props.onChange({target:{files:[{size:100,arrayBuffer:async()=>new TextEncoder().encode('<table/>').buffer}],value:'file'}});});
  await upload();
  assert.equal(root.root.findByProps({'aria-label':'A 시험명'}).props.value,'daily test');
  const bulkInput=root.root.findByProps({'aria-label':'일괄 시험명'});
  assert.equal(bulkInput.props.value,'daily test');
  await act(async()=>{bulkInput.props.onChange({target:{value:'10월 월말평가'}});});
  const applyBtn=root.root.findAllByType('button').find(b=>b.children.join('')==='시험명 일괄 적용');
  await act(async()=>{applyBtn.props.onClick();});
  assert.equal(root.root.findByProps({'aria-label':'A 시험명'}).props.value,'10월 월말평가');
  const save=()=>root.root.findAllByType('button').find(b=>b.children.join('')==='확인한 성적 저장');
  await act(async()=>{await save().props.onClick();});
  assert.ok(submitted,JSON.stringify(root.toJSON()));assert.equal(submitted[0].daily.id,'daily');assert.equal(submitted[0].daily.version,1);
  assert.equal(submitted[0].daily.exams[0].name,'10월 월말평가');
  assert.equal(submitted[0].daily.exams[0].score,93);assert.equal(submitted[0].wrong.corrected_count,4);
  assert.equal(savedDate,'2026-10-07');
  fail=true;await upload();await act(async()=>{await save().props.onClick();});
  assert.ok(root.root.findByProps({role:'alert'}).children.join('').includes('Save rejected'));
 } finally {if(root)await act(async()=>root.unmount());Module._load=original;global.DOMParser=previousParser;}
});

test('Multiple Excel files can be selected at once and merged with duplicate exclusion', async () => {
 const original=Module._load; let root, submitted;
 const storage={loadStudentDaily:async()=>[],loadWrongAnswers:async()=>[],saveStudentDaily:async items=>{submitted=items;return items;}};
 Module._load=function(r,p,i){if(r.endsWith('.css'))return new Proxy({},{get:(_,k)=>String(k)});if(r==='../lib/report-storage')return storage;return original.call(this,r,p,i);};
 const previousParser=global.DOMParser;
 global.DOMParser=class{parseFromString(html){
  const rows=html.includes('SECOND')
   ? [['학생명','학년','점수','생성일','문제지명','문제지ID','문항수','정/오'],['B','중2','88점','26.10.08','Test 2','456','20문항','18/2'],['A','중3','93점','26.10.07','Test 1','123','15문항','14/1']]
   : [['학생명','학년','점수','생성일','문제지명','문제지ID','문항수','정/오'],['A','중3','93점','26.10.07','Test 1','123','15문항','14/1']];
  return{querySelectorAll:()=>rows.map(row=>({querySelectorAll:()=>row.map(textContent=>({textContent}))}))};
 }};
 try {
  delete require.cache[require.resolve('../src/components/StudentGrades.tsx')];
  const Grades=require('../src/components/StudentGrades.tsx').default;
  const props={groups:[{id:'g',group:'반1',students:[{id:'a',name:'A',grade:'중3'},{id:'b',name:'B',grade:'중2'}]}],history:[],onSaved(){},blocked:false,show:false,setShow(){},onBusyChange(){}};
  await act(async()=>{root=create(React.createElement(Grades,props));});
  const fileInput=root.root.findByProps({type:'file'});
  assert.equal(fileInput.props.multiple,true);
  await act(async()=>{fileInput.props.onChange({target:{files:[
   {name:'first.xls',size:100,arrayBuffer:async()=>new TextEncoder().encode('FIRST').buffer},
   {name:'second.xls',size:100,arrayBuffer:async()=>new TextEncoder().encode('SECOND').buffer}
  ],value:'files'}});});
  const statusMsg=root.root.findByProps({role:'status'}).children.join('');
  assert.ok(statusMsg.includes('2개 파일에서 2건 확인'),statusMsg);
  assert.ok(statusMsg.includes('중복 1건 제외'),statusMsg);
  const save=root.root.findAllByType('button').find(b=>b.children.join('')==='확인한 성적 저장');
  await act(async()=>{await save.props.onClick();});
  assert.equal(submitted.length,2);
 } finally {if(root)await act(async()=>root.unmount());Module._load=original;global.DOMParser=previousParser;}
});


