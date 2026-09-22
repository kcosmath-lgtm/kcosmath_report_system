/* eslint-disable @typescript-eslint/no-require-imports -- This test installs a CommonJS loader for the TS hook and its mocked network boundary. */
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
global.window = { addEventListener() {}, removeEventListener() {}, confirm: () => true };
global.alert = () => {};
// Compile application TS without creating build artifacts; replace only the network boundary.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
let load, save;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === './report-storage' && parent?.filename.endsWith('use-report-editor.ts')) {
    return { loadReportDay: (...args) => load(...args), saveReportBatch: (...args) => save(...args) };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { useReportEditor } = require('../src/lib/use-report-editor.ts');
const { defaultReport } = require('../src/lib/report-model.ts');
const { getFormattedDate } = require('../src/utils/date.ts');
let editor, root;
function Harness() { editor = useReportEditor(); return null; }
async function mount(day = { lessons: [], reports: [] }) {
  load = async () => day;
  await act(async () => { root = create(React.createElement(Harness)); });
}
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; global.window.confirm = () => true; });
const a = { id: 'a', name: '학생 A', grade: '중2', group: '테스트 반', classId: 'class-a' };
const b = { id: 'b', name: '학생 B', grade: '중2', group: '테스트 반', classId: 'class-a' };
test('AI edits only current student in batch mode, persists individually and supports undo', async () => {
  const batches = [];
  save = async batch => { batches.push(batch); return echo(batch); };
  await mount();
  await act(async () => editor.handleBatchSelect([a, b]));
  await act(async () => editor.saveToSupabase());
  const before = { ...editor.reportData };
  await act(async () => assert.equal(editor.applyAiPatch(a.id, before, { notes: 'AI 수정' }), true));
  assert.equal(editor.reportData.notes, 'AI 수정');
  const after = { ...editor.reportData };
  await act(async () => editor.saveToSupabase());
  assert.equal(batches[1].reports.length, 1);
  assert.equal(batches[1].reports[0].student_id, a.id);
  assert.equal(batches[1].lessons.length, 0);
  await act(async () => assert.equal(editor.applyAiPatch(a.id, after, { notes: before.notes }), true));
  assert.equal(editor.reportData.notes, before.notes);
  await act(async () => editor.nextReport());
  assert.equal(editor.reportData.notes, before.notes);
});

test('AI rejects stale replies, another student and protected fields', async () => {
  await mount();
  await act(async () => editor.handleBatchSelect([a, b]));
  const before = { ...editor.reportData };
  await act(async () => editor.updateField('notes', '수동 수정'));
  assert.equal(editor.applyAiPatch(a.id, before, { notes: '늦은 응답' }), false);
  assert.equal(editor.applyAiPatch(b.id, editor.reportData, { notes: '다른 학생' }), false);
  assert.throws(() => editor.applyAiPatch(a.id, editor.reportData, { name: '이름 변경' }));
  assert.equal(editor.reportData.notes, '수동 수정');
});
function echo(batch) {
  return { lessons: batch.lessons.map(item => ({ ...item, version: item.expected_version + 1 })),
    reports: batch.reports.map(item => ({ ...item, version: item.expected_version + 1 })) };
}

test('read failure blocks saving and never writes defaults', async () => {
  let writes = 0;
  load = async () => { throw new Error('조회 실패'); };
  save = async batch => { writes++; return echo(batch); };
  await act(async () => { root = create(React.createElement(Harness)); });
  assert.equal(editor.loadFailed, true);
  assert.match(editor.error, /조회 실패/);
  await act(async () => { editor.handleBatchSelect([a]); await editor.saveToSupabase(); });
  assert.equal(writes, 0);
  assert.equal(editor.selectedStudents.length, 0);
});

test('loading and selection do not save; explicit save uses per-student snapshots', async () => {
  const batches = [];
  save = async batch => { batches.push(batch); return echo(batch); };
  await mount();
  await act(async () => editor.handleBatchSelect([a, b]));
  assert.equal(batches.length, 0); assert.equal(editor.hasUnsavedChanges, false);
  await act(async () => editor.updateField('notes', '함께 적용한 기록'));
  await act(async () => editor.saveToSupabase());
  assert.equal(batches.length, 1);
  assert.equal(batches[0].reports.length, 2);
  assert.equal(batches[0].lessons.length, 1);
  assert.equal(batches[0].reports[0].snapshot.name, '학생 A');
  assert.equal(batches[0].reports[1].snapshot.notes, '함께 적용한 기록');
  assert.equal(editor.hasUnsavedChanges, false);
  await act(async () => editor.saveToSupabase());
  assert.equal(batches.length, 1, 'unchanged reports must not be rewritten');
});

test('an individual edit does not rewrite another student or common lesson', async () => {
  const batches = [];
  save = async batch => { batches.push(batch); return echo(batch); };
  await mount();
  await act(async () => editor.handleBatchSelect([a, b]));
  await act(async () => editor.saveToSupabase());
  await act(async () => editor.setIsIndividualMode(true));
  await act(async () => editor.updateField('notes', '학생 A만 수정'));
  await act(async () => editor.saveToSupabase());
  assert.equal(batches[1].reports.length, 1);
  assert.equal(batches[1].reports[0].student_id, 'a');
  assert.equal(batches[1].reports[0].expected_version, 1);
  assert.equal(batches[1].lessons.length, 0);
});

test('conflict keeps unsaved draft; deselected dirty reports are included when saving', async () => {
  let batch;
  let attempts = 0;
  save = async value => { attempts++; batch = value; throw new Error('다른 창에서 변경됨'); };
  await mount();
  await act(async () => editor.handleBatchSelect([a]));
  await act(async () => editor.updateField('notes', '보존할 내용'));
  await act(async () => editor.handleBatchSelect([b]));
  await act(async () => editor.saveToSupabase());
  assert.equal(editor.hasUnsavedChanges, true);
  assert.equal(editor.isSaving, false);
  assert.equal(attempts, 1);
  assert.match(editor.error, /다른 창/);
  assert.equal(batch.reports.find(item => item.student_id === 'a').snapshot.notes, '보존할 내용');
  await act(async () => editor.handleBatchSelect([a]));
  assert.equal(editor.reportData.notes, '보존할 내용');
});

test('editing one class excludes loaded or selected unchanged reports in other classes', async () => {
  const other = { ...b, classId: 'class-b', group: '고1' };
  const batches = [];
  save = async batch => { batches.push(batch); return echo(batch); };
  // Missing display fields must not turn an untouched historical report into a write.
  await mount({ lessons: [a, other].map(s => ({ id: `lesson-${s.id}`, class_id: s.classId, report_date: '2026-09-18', version: 1, common_data: {} })),
    reports: [a, other].map(s => ({ id: `report-${s.id}`, student_id: s.id, lesson_id: `lesson-${s.id}`, version: 1, snapshot: { name: s.name, grade: s.grade, group: s.group, classId: s.classId, notes: 'old' } })) });
  await act(async () => editor.handleBatchSelect([a]));
  await act(async () => editor.updateField('progress', 'changed class A'));
  await act(async () => editor.handleBatchSelect([other]));
  await act(async () => editor.saveToSupabase());
  assert.deepEqual(batches[0].reports.map(r => r.student_id), [a.id]);
  assert.deepEqual(batches[0].lessons.map(l => l.class_id), [a.classId]);
});

test('saved snapshots keep historical names and contents; selecting does not mark dirty', async () => {
  const snapshot = { ...defaultReport('과거 날짜'), name: '과거 이름', grade: '중1', group: a.group, classId: a.classId, notes: '과거 기록' };
  await mount({ lessons: [{ id: 'lesson', class_id: a.classId, common_data: { notes: '현재 공통' }, version: 3 }],
    reports: [{ id: 'report', student_id: a.id, lesson_id: 'lesson', snapshot, version: 2 }] });
  await act(async () => editor.handleBatchSelect([a]));
  assert.equal(editor.reportData.name, '과거 이름');
  assert.equal(editor.reportData.grade, '중1');
  assert.equal(editor.reportData.notes, '과거 기록');
  assert.equal(editor.reportData.date, getFormattedDate(editor.reportDate));
  assert.equal(editor.hasUnsavedChanges, false);
  await act(async () => editor.openSavedReport(a.id));
  assert.equal(editor.reportData.notes, '과거 기록');
});

test('selected date overrides stale common dates across month and week boundaries', async () => {
  const batches = [];
  save = async batch => { batches.push(batch); return echo(batch); };
  await mount({ lessons: [{ id: 'lesson', class_id: a.classId, version: 1,
    common_data: { date: '2025년 01월 01일 1주차' } }], reports: [] });
  await act(async () => editor.changeDate('2026-09-30'));
  await act(async () => editor.handleBatchSelect([a]));
  assert.equal(editor.reportData.date, '2026년 09월 30일 5주차');
  await act(async () => editor.changeDate('2026-10-01'));
  await act(async () => editor.handleBatchSelect([a]));
  assert.equal(editor.reportData.date, '2026년 10월 01일 1주차');
  await act(async () => editor.saveToSupabase());
  assert.equal(batches[0].reports[0].snapshot.date, '2026년 10월 01일 1주차');
});

test('save in progress blocks duplicate saves and edits; date change can be cancelled', async () => {
  let resolveSave, calls = 0, batch;
  save = value => { calls++; batch = value; return new Promise(resolve => { resolveSave = resolve; }); };
  await mount();
  await act(async () => editor.handleBatchSelect([a]));
  await act(async () => editor.updateField('notes', '처음 내용'));
  let pending;
  await act(async () => { pending = editor.saveToSupabase(); });
  await act(async () => { editor.updateField('notes', '저장 중 입력'); await editor.saveToSupabase(); });
  assert.equal(calls, 1); assert.equal(editor.reportData.notes, '처음 내용');
  await act(async () => { resolveSave(echo(batch)); await pending; });
  await act(async () => editor.updateField('notes', '날짜 변경 전 내용'));
  global.window.confirm = () => false;
  const previous = editor.reportDate;
  await act(async () => editor.changeDate('2020-01-01'));
  assert.equal(editor.reportDate, previous); assert.equal(editor.reportData.notes, '날짜 변경 전 내용');
  await act(async () => editor.changeDate(previous));
  assert.equal(editor.isLoading, false, 'selecting the same date must not lock the editor');
});
