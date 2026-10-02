/* eslint-disable @typescript-eslint/no-require-imports -- Compile the TypeScript statistics module for Node tests. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, filename);
const { summarize, achievement } = require('../src/lib/wrong-answer-report.ts');
const row = (total_wrong, corrected_count, completed = false, homework_status = null) => ({ total_wrong, corrected_count, completed, homework_status });

test('homework-only days do not dilute wrong-answer practice rate', () => {
  const stats = summarize([row(10, 10), row(0, 0, true), row(0, 0, false, 'O'), row(5, 2)]);
  assert.equal(stats.wrongDays, 3);
  assert.equal(stats.completedDays, 2);
  assert.equal(stats.practiceRate, 66.7);
  assert.equal(stats.averageWrong, 5);
  assert.equal(stats.remaining, 3);
  assert.equal(stats.homeworkRate, 100);
});
test('full completion highlights both practice and actual problem quantity', () => {
  const stats = summarize([row(40, 40), row(40, 40), row(40, 40)]);
  assert.equal(stats.practiceRate, 100);
  assert.match(achievement(stats), /3일 모두/);
  assert.match(achievement(stats), /120문제 중 120문제/);
});
test('sparse and missing records do not receive a monthly achievement claim', () => {
  assert.match(achievement(summarize([row(5, 5)])), /기록은 1일/);
  const stats = summarize([row(0, 0, false, 'X')]);
  assert.equal(stats.practiceRate, null);
  assert.equal(stats.averageWrong, null);
  assert.match(achievement(stats), /오답 기록이 없어/);
});
