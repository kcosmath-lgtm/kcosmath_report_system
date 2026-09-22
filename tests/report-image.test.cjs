/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const filename = require.resolve('../src/lib/report-image-fonts.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { optionalImageResource } = compiled.exports;

test('font network failure allows system-font fallback', async () => {
  assert.equal(await optionalImageResource(Promise.reject(new Error('NetworkError'))), undefined);
});
test('stalled font request is bounded and late rejection is handled', async () => {
  let reject;
  const pending = new Promise((_, fail) => { reject = fail; });
  assert.equal(await optionalImageResource(pending, 5), undefined);
  reject(new Error('late network error'));
  await new Promise(resolve => setTimeout(resolve, 10));
});
test('loaded font data remains available for embedding', async () => {
  assert.equal(await optionalImageResource(Promise.resolve('font-data')), 'font-data');
});
