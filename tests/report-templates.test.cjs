const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,filename);
const {periodStart,presets,isTemplate,buildStructuredTemplate}=require('../src/app/report/new/templates.ts');
test('relative periods cover Monday weeks and calendar boundaries',()=>{
 assert.equal(periodStart('week','2026-11-01',''),'2026-10-26');
 assert.equal(periodStart('week','2026-11-02',''),'2026-11-02');
 assert.equal(periodStart('month','2026-11-02',''),'2026-11-01');
 assert.equal(periodStart('1month','2026-03-31',''),'2026-03-01');
 assert.equal(periodStart('3months','2026-01-10',''),'2025-10-11');
 assert.equal(periodStart('custom','2026-01-10','2025-12-02'),'2025-12-02');
});
test('template storage rejects corrupt blocks and excessive or duplicate elements',()=>{
 assert.equal(presets.length,6);
 for(const template of presets)assert.equal(isTemplate(template),true);
 for(const blocks of [[null],[{}],[],Array(13).fill(presets[0].blocks[0]),[presets[0].blocks[0],presets[0].blocks[0]]])assert.equal(isTemplate({...presets[0],blocks}),false);
 assert.equal(isTemplate({...presets[0],period:'invalid'}),false);
 assert.equal(new Set(presets.map(t=>t.theme)).size,6);
 for(const template of presets)assert.equal(isTemplate(JSON.parse(JSON.stringify(template))),true);
 assert.equal(isTemplate({...presets[0],theme:'invalid'}),false);
 assert.equal(isTemplate({...presets[0],theme:undefined,illustrations:undefined}),true);
});
test('buildStructuredTemplate includes custom title, badge, subtitle, and titlePosition',()=>{
 const tpl=buildStructuredTemplate({
  cycle:'day',
  focus:'balanced',
  theme:'saebom',
  orientation:'portrait',
  enabledKinds:['attendance','homework','feedback'],
  customTitle:'중등부 일일 수학 리포트',
  customBadge:'MATH REPORT',
  customSubTitle:'코스매스 일일 브리핑',
  titlePosition:'center',
 });
 assert.equal(isTemplate(tpl),true);
 assert.equal(tpl.customTitle,'중등부 일일 수학 리포트');
 assert.equal(tpl.customBadge,'MATH REPORT');
 assert.equal(tpl.customSubTitle,'코스매스 일일 브리핑');
 assert.equal(tpl.titlePosition,'center');
});
