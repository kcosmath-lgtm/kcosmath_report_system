const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,filename);
const { parseGradeRows } = require('../src/lib/grade-import.ts');
const header = ['학생명','반','학년','문제지명','생성일','채점완료일','점수','문항수','정/오','문제지ID'];
const sample = ['학생 A','중3 A반','중3','Daily Test','26.10.07','26.10.08','93점','15문항','14/1','12345'];
test('problem bank grades preserve exam date, score, counts and stable source ID; ungraded is excluded', () => {
 const result = parseGradeRows([header,sample,[...sample.slice(0,6),'미채점','15문항','','12346']]);
 assert.equal(result.rows.length,1); assert.equal(result.skipped,1);
 assert.equal(result.rows[0].date,'2026-10-07'); assert.equal(result.rows[0].score,93);
 assert.equal(result.rows[0].total,15); assert.equal(result.rows[0].wrong,1);
 assert.equal(result.rows[0].key,parseGradeRows([header,sample]).rows[0].key);
});
test('invalid headers, missing IDs, impossible scores and dates are rejected', () => {
 assert.throws(() => parseGradeRows([['이름','결과'],sample]));
 for (const [column,value] of [[6,'101점'],[9,''],[4,'26.02.30'],[6,'잘못된 점수']]) {
  const row=[...sample]; row[column]=value;
  assert.throws(() => parseGradeRows([header,row]));
 }
});
