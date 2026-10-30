// Compile the TS storage adapter and intercept the cloud boundary in Node tests.
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
beforeEach(() => { global.indexedDB = new IDBFactory(); global.window = { location: { hostname: 'localhost' }, dispatchEvent() {} }; process.env.NODE_ENV = 'development'; cloudImports = 0; });
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

test('progress preserves snapshots, validates outlines, rejects conflicts and cascades deletion', async () => {
  const { a, group } = await fixture();
  const { progressPercent } = require('../src/types/progress.ts');
  const book = { id: crypto.randomUUID(), student_id: a.id, title: '교재', curriculum: '2022 개정', course: '중2', units: [{ id: 'one', group: '식', name: '계산' }, { id: 'two', group: '식', name: '방정식' }], states: {}, version: 0 };
  await assert.rejects(storage.saveProgressBooks([{ ...book, id: crypto.randomUUID() }, { ...book, id: crypto.randomUUID(), student_id: 'missing' }]));
  assert.equal((await storage.loadProgress(a.id)).books.length, 0);
  const first = await storage.saveProgress(book);
  const e = { id: crypto.randomUUID(), book_id: book.id, record_date: '2026-10-13', unit_ids: ['one'], scope: 'p.1~5', homework: 'p.6~8', due_date: '2026-10-15', memo: '', states: {}, created_at: '' };
  const second = await storage.saveProgress({ ...first.book, states: { one: '완료' } }, e);
  await assert.rejects(storage.saveProgressBatch([{book:second.book,entry:{...e,id:crypto.randomUUID()}},{book:first.book,entry:{...e,id:crypto.randomUUID()}}]));
  assert.equal((await storage.loadProgress(a.id)).books[0].version,2);
  assert.equal(progressPercent(second.book), 50);
  assert.equal(progressPercent({ units: [], states: {} }), 0);
  const data = await storage.loadProgress(a.id);
  assert.equal(data.entries.length, 2);
  assert.deepEqual(data.entries.find(r => r.id === first.entry.id).states, {});
  assert.equal(data.entries.find(r => r.id === e.id).homework, 'p.6~8');
  await assert.rejects(storage.saveProgress(first.book, { ...e, id: crypto.randomUUID() }));
  await assert.rejects(storage.saveProgress({ ...second.book, units: [...book.units, { id: 'third', group: '', name: '추가' }] }));
  await assert.rejects(storage.saveProgress(second.book, { ...e, id: crypto.randomUUID(), due_date: '2026-10-12' }));
  await assert.rejects(storage.saveProgress({ ...second.book, states: { unknown: '완료' } }));
  assert.equal((await storage.loadProgress(a.id)).books[0].version, 2);
  await storage.deleteClass(group.id);
  assert.deepEqual(await storage.loadProgress(a.id), { books: [], entries: [] });
});

test('class textbooks assign independently, propagate edits and preserve historical page progress', async () => {
  const {a,b,group}=await fixture();
  const template={id:crypto.randomUUID(),class_id:group.id,title:'교재',curriculum:'2022',course:'중2',units:[{id:'one',group:'식',name:'계산'}],total_pages:100,version:0};
  const saved=await storage.manageClassBook('save',template);
  assert.equal((await storage.loadClassBooks(group.id)).length,1);
  const assigned=await storage.manageClassBook('assign',saved,[a.id,b.id]);
  assert.equal(assigned.length,2);
  const entry={id:crypto.randomUUID(),book_id:assigned[0].id,record_date:'2026-10-13',unit_ids:[],scope:'p.1~50',homework:'p.51',due_date:null,memo:'',states:{},created_at:''};
  const progress=await storage.saveProgress({...assigned[0],completed_page:50},entry);
  const {progressPercent}=require('../src/types/progress.ts');
  assert.equal(progressPercent(progress.book),50);
  assert.equal((await storage.loadProgress(b.id)).books[0].completed_page,0);
  const edited=await storage.manageClassBook('save',{...saved,total_pages:200,title:'수정 교재'});
  const history=await storage.loadProgress(a.id);
  assert.equal(history.books[0].title,'수정 교재');
  assert.equal(history.entries[0].total_pages_snapshot,100);
  assert.equal(history.entries[0].completed_page,50);
  await assert.rejects(storage.saveProgress(progress.book));
  await storage.manageClassBook('delete',edited);
  assert.equal((await storage.loadClassBooks(group.id)).length,0);
  assert.deepEqual(await storage.loadProgress(a.id),{books:[],entries:[]});
});

test('daily records accumulate by date, share homework records, and reject stale batches atomically', async () => {
  const { a } = await fixture();
  const entry = date => ({ daily: { id: crypto.randomUUID(), student_id: a.id, record_date: date, attendance: '지각', reason: '교통', exams: [{ id: crypto.randomUUID(), name: '단원평가', score: 8, max_score: 10, scope: '방정식', memo: '' }], version: 0 }, wrong: { id: crypto.randomUUID(), student_id: a.id, record_date: date, total_wrong: 3, corrected_count: 2, homework_status: '△', completed: false, memo: '복습', version: 0 } });
  const first = entry('2026-10-09'), next = entry('2026-10-10');
  const [saved] = await storage.saveStudentDaily([first]);
  await storage.saveStudentDaily([next]);
  assert.equal((await storage.loadStudentDaily('2026-10')).length, 2);
  assert.equal((await storage.loadWrongAnswers('2026-10'))[0].homework_status, '△');
  const third = entry('2026-10-11');
  await assert.rejects(storage.saveStudentDaily([third, first]));
  assert.equal((await storage.loadStudentDaily('2026-10')).length, 2);
  await storage.saveStudentDaily([{ ...saved, daily: { ...saved.daily, attendance: '출석' } }]);
  assert.equal((await storage.loadStudentDaily('2026-10')).find(r => r.record_date === '2026-10-10').exams[0].score, 8);
  await assert.rejects(storage.saveStudentDaily([{ ...third, daily: { ...third.daily, exams: [{ name: '시험', score: 11, max_score: 10 }] } }]));
  await storage.deleteStudent(a.id);
  assert.deepEqual(await storage.loadStudentDaily('2026-10'), []);
});

test('student editing preserves records and rejects stale versions', async () => {
  const { a } = await fixture();
  const edited = await storage.updateStudent(a.id, '새 이름', '중3', a.version);
  assert.equal(edited.name, '새 이름');
  assert.equal(edited.grade, '중3');
  await assert.rejects(storage.updateStudent(a.id, '이전 이름', '중2', a.version));
  await assert.rejects(storage.updateStudent(a.id, '', '중3', edited.version));
});

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

test('stale field patches preserve a newer book and next-day saves work', async () => {
 const {lesson,report}=await fixture();
 await local.saveReportBatch({lessons:[],reports:[{...report,patch:{book:'NEW'},snapshot:{book:'NEW'}}]});
 await local.saveReportBatch({lessons:[{...lesson,report_date:'2026-09-22',expected_version:1,patch:{notes:'new common'}}],reports:[{...report,expected_version:1,patch:{notes:'new notes'},snapshot:{book:'OLD',notes:'new notes'}}]});
 const day=await local.loadReportDay('2026-09-22');
 assert.equal(day.reports[0].snapshot.book,'NEW');
 assert.equal(day.reports[0].snapshot.notes,'new notes');
});
test('concurrent same-version saves both succeed',async()=>{
 const {report}=await fixture();
 const outcomes=await Promise.allSettled(['A','B'].map(notes=>local.saveReportBatch({lessons:[],reports:[{...report,expected_version:1,patch:{notes}}]})));
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,2);
 assert.equal((await local.loadReportDay('2026-09-14')).reports[0].version,3);
});
test('deleted student cannot be restored by a stale report save',async()=>{
 const {a,lesson,report}=await fixture();
 await local.deleteStudent(a.id);
 await assert.rejects(local.saveReportBatch({lessons:[lesson],reports:[report]}));
 assert.equal((await local.loadStudents())[0].students.some(s=>s.id===a.id),false);
 assert.equal((await local.loadReportDay('2026-09-22')).reports.length,0);
});

test('archive prevents new reports and rolling reports remain visible on later dates', async () => {
  const { a, b, lesson, report } = await fixture();
  await local.saveReportBatch({ lessons: [], reports: [{ ...report, id: crypto.randomUUID(), student_id: b.id, snapshot: { notes: '학생 B' } }] });
  await local.archiveStudent(a.id, 1);
  const nextLesson = { ...lesson, id: crypto.randomUUID(), report_date: '2026-09-15' };
  await assert.rejects(local.saveReportBatch({ lessons: [nextLesson], reports: [{ ...report, id: crypto.randomUUID(), lesson_id: nextLesson.id }] }), /다른 창/);
  const nextDay = await local.loadReportDay('2026-09-15');
  assert.equal(nextDay.lessons.length, 1);
  const day = await local.loadReportDay('2026-09-14');
  assert.equal(day.reports.length, 2);
  assert.equal(day.reports.find(row => row.student_id === a.id).snapshot.notes, '기존 내용');
});

test('duplicate class or student-report key cannot overwrite data', async () => {
  const { lesson, report } = await fixture();
  await assert.rejects(local.addClass('테스트 반'), /다른 창/);
  await local.saveReportBatch({ lessons: [], reports: [{ ...report, id: crypto.randomUUID() }] });
  await local.saveReportBatch({ lessons: [{ ...lesson, id: crypto.randomUUID() }], reports: [] });
  assert.equal((await local.loadStudents()).length, 1);
  assert.equal((await local.loadReportDay('2026-09-14')).reports.length, 1);
});

test('unavailable IndexedDB reports an error without falling back to Supabase', async () => {
  global.indexedDB = undefined;
  await assert.rejects(storage.loadStudents(), /IndexedDB/);
  assert.equal(cloudImports, 0);
});

test('commercial textbook catalog preserves page/problem/type metadata and resolves smart progress ranges', async () => {
  const { a, group } = await fixture();
  const {
    totalBookProblems,
    totalBookTypes,
    completedBookProblems,
    syncUnitStatesFromPage,
    resolveRangeSummary,
  } = require('../src/types/progress.ts');
  const { TEXTBOOK_CATALOG, formatUnitToTextLine, parseTextLineToUnit } = require('../src/constants/textbookCatalog.ts');

  const ssen21 = TEXTBOOK_CATALOG.find(item => item.id === 'ssen-m2-1');
  assert.ok(ssen21);
  assert.equal(ssen21.total_pages, 216);

  const units = ssen21.units.map((u, idx) => ({ id: `u-${idx + 1}`, ...u }));
  const classBook = await storage.manageClassBook('save', {
    id: crypto.randomUUID(),
    class_id: group.id,
    title: ssen21.title,
    curriculum: ssen21.curriculum,
    course: ssen21.course,
    total_pages: ssen21.total_pages,
    units,
    version: 0,
  });

  assert.equal(totalBookProblems(classBook), 1312);
  assert.equal(totalBookTypes(classBook), 172);

  // Round-trip text line formatting and parsing
  const formatted = formatUnitToTextLine(units[0]);
  const parsed = parseTextLineToUnit(formatted, units, new Set());
  assert.equal(parsed.id, units[0].id);
  assert.equal(parsed.start_page, 8);
  assert.equal(parsed.end_page, 25);
  assert.equal(parsed.problem_count, 132);
  assert.equal(parsed.type_count, 18);

  // Page range resolution & unit state sync
  const rangeByPage = resolveRangeSummary(units, 'page', 26, 41);
  assert.ok(rangeByPage);
  assert.equal(rangeByPage.matchedUnits.length, 1);
  assert.equal(rangeByPage.matchedUnits[0].name, '02. 단항식의 계산');
  assert.equal(rangeByPage.estimatedProblems, 118);

  const rangeByProb = resolveRangeSummary(units, 'problem', 133, 250);
  assert.ok(rangeByProb);
  assert.equal(rangeByProb.matchedUnits[0].name, '02. 단항식의 계산');
  assert.equal(rangeByProb.estimatedProblems, 118);
  assert.equal(rangeByProb.endPage, 41);

  const syncedStates = syncUnitStatesFromPage(units, {}, 30);
  assert.equal(syncedStates['u-1'], '완료');
  assert.equal(syncedStates['u-2'], '진행 중');
  assert.equal(syncedStates['u-3'], '미시작');

  const [assigned] = await storage.manageClassBook('assign', classBook, [a.id]);
  const doneCount = completedBookProblems({ ...assigned, states: syncedStates, completed_page: 41 });
  assert.equal(doneCount, 132 + 118);
});
