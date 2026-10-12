const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const { wrongAnswerStatus } = require('../src/types/student-daily.ts');
test('wrong answer status distinguishes full completion, 50% threshold, and missing counts', () => {
 assert.equal(wrongAnswerStatus(10,10),'○');
 assert.equal(wrongAnswerStatus(10,5),'△');
 assert.equal(wrongAnswerStatus(10,9),'△');
 assert.equal(wrongAnswerStatus(10,4),'X');
 assert.equal(wrongAnswerStatus(10,0),'X');
 assert.equal(wrongAnswerStatus(0,0),'—');
 assert.equal(wrongAnswerStatus(3,4),'—');
});
