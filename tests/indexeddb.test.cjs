/* eslint-disable @typescript-eslint/no-require-imports -- Compile the TS storage adapter and intercept the cloud boundary in Node tests. */
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const { IDBFactory } = require('fake-indexeddb');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
let cloudImports = 0;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === './supabase-report-storage' && parent?.filename.endsWith('report-storage.ts')) {
    cloudImports++;
    return { loadStudents: async () => ['cloud'] };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const local = require('../src/lib/indexeddb-report-storage.ts');
const storage = require('../src/lib/report-storage.ts');
const originalEnv = process.env.NODE_ENV;
beforeEach(() => { global.indexedDB = new IDBFactory(); global.window = { location: { hostname: 'localhost' } }; process.env.NODE_ENV = 'development'; cloudImports = 0; });
after(() => { process.env.NODE_ENV = originalEnv; Module._load = originalLoad; });

async function fixture() {
  const group = await storage.addClass('테스트 반');
  const a = await storage.addStudent(group.id, '학생 A', '중2');
  const b = await storage.addStudent(group.id, '학생 B', '중2');
  const lesson = { id: crypto.randomUUID(), class_id: group.id, report_date: '2026-09-14', common_data: { notes: '공통' }, expected_version: 0 };
  const report = { id: crypto.randomUUID(), lesson_id: lesson.id, student_id: a.id, snapshot: { name: a.name, notes: '기존 내용' }, expected_version: 0 };
  await storage.saveReportBatch({ lessons: [lesson], reports: [report] });
  return { group, a, b, lesson, report };
}

test('development routes every operation to IndexedDB without importing Supabase', async () => {
  assert.deepEqual(await storage.loadStudents(), []);
  const { a } = await fixture();
  assert.equal((await storage.loadStudents())[0].students.length, 2);
  assert.equal((await storage.loadReportDay('2026-09-14')).reports.length, 1);
  await storage.archiveStudent(a.id, 1);
  assert.equal((await storage.loadStudents())[0].students.length, 1);
  assert.equal((await storage.loadReportDay('2026-09-14')).reports.length, 1);
  assert.equal(cloudImports, 0);
});

test('production local addresses remain local; public deployment uses cloud adapter', async () => {
  process.env.NODE_ENV = 'production';
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', '192.168.1.2', '10.0.0.2', '172.16.0.4', 'test.localhost', 'test.local']) {
    window.location.hostname = hostname;
    assert.equal(storage.usesLocalStorage(), true, hostname);
    assert.deepEqual(await storage.loadStudents(), []);
  }
  assert.equal(cloudImports, 0);
  window.location.hostname = 'cosmath.vercel.app';
  assert.equal(storage.usesLocalStorage(), false);
  assert.deepEqual(await storage.loadStudents(), ['cloud']);
  window.location.hostname = 'academy.example.com';
  assert.equal(storage.usesLocalStorage(), false);
  process.env.NODE_ENV = 'development';
  assert.equal(storage.usesLocalStorage(), true);
});

test('conflicting report rolls back all lesson changes in the same transaction', async () => {
  const { lesson, report } = await fixture();
  await local.saveReportBatch({ lessons: [], reports: [{ ...report, expected_version: 1, snapshot: { notes: '다른 창의 최신 내용' } }] });
  await assert.rejects(local.saveReportBatch({
    lessons: [{ ...lesson, expected_version: 1, common_data: { notes: '취소할 수정' } }],
    reports: [{ ...report, expected_version: 1 }],
  }), /다른 창/);
  const day = await local.loadReportDay('2026-09-14');
  assert.equal(day.lessons[0].version, 1);
  assert.equal(day.lessons[0].common_data.notes, '공통');
  assert.equal(day.reports[0].snapshot.notes, '다른 창의 최신 내용');
});

test('concurrent same-version saves have only one winner', async () => {
  const { report } = await fixture();
  const outcomes = await Promise.allSettled(['창 A', '창 B'].map(notes => local.saveReportBatch({ lessons: [], reports: [{ ...report, expected_version: 1, snapshot: { notes } }] })));
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  assert.equal((await local.loadReportDay('2026-09-14')).reports[0].version, 2);
});

test('archive prevents new reports but retains history; dates and students are isolated', async () => {
  const { a, b, lesson, report } = await fixture();
  await local.saveReportBatch({ lessons: [], reports: [{ ...report, id: crypto.randomUUID(), student_id: b.id, snapshot: { notes: '학생 B' } }] });
  await local.archiveStudent(a.id, 1);
  const nextLesson = { ...lesson, id: crypto.randomUUID(), report_date: '2026-09-15' };
  await assert.rejects(local.saveReportBatch({ lessons: [nextLesson], reports: [{ ...report, id: crypto.randomUUID(), lesson_id: nextLesson.id }] }), /다른 창/);
  assert.equal((await local.loadReportDay('2026-09-15')).lessons.length, 0);
  const day = await local.loadReportDay('2026-09-14');
  assert.equal(day.reports.length, 2);
  assert.equal(day.reports.find(row => row.student_id === a.id).snapshot.notes, '기존 내용');
});

test('duplicate class or student-report key cannot overwrite data', async () => {
  const { lesson, report } = await fixture();
  await assert.rejects(local.addClass('테스트 반'), /다른 창/);
  await assert.rejects(local.saveReportBatch({ lessons: [], reports: [{ ...report, id: crypto.randomUUID() }] }), /다른 창/);
  await assert.rejects(local.saveReportBatch({ lessons: [{ ...lesson, id: crypto.randomUUID() }], reports: [] }), /다른 창/);
  assert.equal((await local.loadStudents()).length, 1);
  assert.equal((await local.loadReportDay('2026-09-14')).reports.length, 1);
});

test('unavailable IndexedDB reports an error without falling back to Supabase', async () => {
  global.indexedDB = undefined;
  await assert.rejects(storage.loadStudents(), /IndexedDB/);
  assert.equal(cloudImports, 0);
});
