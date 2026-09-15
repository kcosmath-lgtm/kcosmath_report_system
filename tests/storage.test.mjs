import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/202609140001_normalized_reports.sql', import.meta.url), 'utf8');
async function database(legacy) {
  const db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  if (legacy) {
    await db.exec('CREATE TABLE cosmath_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz DEFAULT now());');
    for (const [key, value] of Object.entries(legacy)) await db.query('INSERT INTO cosmath_settings(key, value) VALUES ($1,$2)', [key, JSON.stringify(value)]);
  }
  return db;
}
async function save(db, lessons, reports) {
  return db.query('SELECT cosmath_save_report_batch($1::jsonb, $2::jsonb) result', [JSON.stringify(lessons), JSON.stringify(reports)]);
}
const classId = '10000000-0000-4000-8000-000000000001';
const lessonId = '20000000-0000-4000-8000-000000000001';
const reportId = '30000000-0000-4000-8000-000000000001';
const lesson = { id: lessonId, class_id: classId, report_date: '2026-09-14', common_data: { progress: '기존 진도' }, expected_version: 0 };
const report = { id: reportId, lesson_id: lessonId, student_id: 'student-a', snapshot: { name: '예시 학생', notes: '기존 기록' }, expected_version: 0 };

test('fresh install stays empty, repeated migration never reseeds students', async () => {
  const db = await database();
  try {
    await db.exec(migration); await db.exec(migration);
    assert.equal((await db.query('SELECT count(*)::int n FROM cosmath_students')).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int n FROM cosmath_classes')).rows[0].n, 0);
    assert.deepEqual((await db.query("SELECT cosmath_load_report_day('2026-09-14') value")).rows[0].value, { lessons: [], reports: [] });
  } finally { await db.close(); }
});

test('legacy backup, snapshots, removed-student reports and old-client write block', async () => {
  const legacy = {
    cosmath_student_data: [{ group: '테스트 반', students: [{ id: 'student-a', name: '예시 학생', grade: '중2' }] }],
    cosmath_common_data: { date: '2026년 09월 10일 2주차', progress: '공통 진도' },
    cosmath_overrides_data: { 'student-a': { notes: '개별 기록' }, 'removed-student': { notes: '삭제된 학생의 기록' } },
  };
  const db = await database(legacy);
  try {
    await db.exec(migration);
    assert.equal((await db.query('SELECT count(*)::int n FROM cosmath_legacy_backup')).rows[0].n, 3);
    const students = (await db.query('SELECT id, active FROM cosmath_students ORDER BY id')).rows;
    assert.deepEqual(students, [{ id: 'removed-student', active: false }, { id: 'student-a', active: true }]);
    const snapshot = (await db.query("SELECT snapshot FROM cosmath_reports WHERE student_id='student-a'")).rows[0].snapshot;
    assert.equal(snapshot.notes, '개별 기록'); assert.equal(snapshot.progress, '공통 진도'); assert.equal(snapshot.name, '예시 학생');
    assert.equal((await db.query("SELECT cosmath_load_report_day('2026-09-10') value")).rows[0].value.reports.length, 2);
    await assert.rejects(db.query("UPDATE cosmath_settings SET value='[]' WHERE key='cosmath_student_data'"), /Storage migrated/);
    await db.exec(migration);
    assert.equal((await db.query('SELECT count(*)::int n FROM cosmath_reports')).rows[0].n, 2);
  } finally { await db.close(); }
});

test('ambiguous duplicate IDs abort migration without overwriting the source', async () => {
  const db = await database({ cosmath_student_data: [{ group: '테스트', students: [{ id: 'same', name: '학생1' }, { id: 'same', name: '학생2' }] }] });
  try {
    await assert.rejects(db.exec(migration), /Duplicate legacy student IDs/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT to_regclass('cosmath_students') table_name")).rows[0].table_name, null);
    assert.equal((await db.query("SELECT jsonb_array_length(value->0->'students') n FROM cosmath_settings")).rows[0].n, 2);
  } finally { await db.close(); }
});

test('version conflicts roll back the complete batch; archive preserves history; anon permissions', async () => {
  const db = await database();
  try {
    await db.exec(migration);
    await db.query('INSERT INTO cosmath_classes(id,name) VALUES ($1,$2)', [classId, '테스트 반']);
    await db.query('INSERT INTO cosmath_students(id,class_id,name) VALUES ($1,$2,$3)', ['student-a', classId, '예시 학생']);
    await db.exec('SET ROLE anon');
    await save(db, [lesson], [report]);
    await save(db, [], [{ ...report, expected_version: 1, snapshot: { ...report.snapshot, notes: '다른 창의 최신 기록' } }]);
    await assert.rejects(save(db, [{ ...lesson, expected_version: 1, common_data: { progress: '덮어쓸 진도' } }], [{ ...report, expected_version: 1 }]), /Report changed/);
    const state = (await db.query("SELECT cosmath_load_report_day('2026-09-14') value")).rows[0].value;
    assert.equal(state.lessons[0].version, 1);
    assert.equal(state.lessons[0].common_data.progress, '기존 진도');
    assert.equal(state.reports[0].snapshot.notes, '다른 창의 최신 기록');
    await assert.rejects(db.exec("UPDATE cosmath_reports SET snapshot='{}'"), /permission denied/);
    await assert.rejects(db.exec('SELECT * FROM cosmath_legacy_backup'), /permission denied/);
    const archive = await db.query("UPDATE cosmath_students SET active=false,version=version+1 WHERE id='student-a' AND version=1 RETURNING id");
    assert.equal(archive.rows.length, 1);
    assert.equal((await db.query("UPDATE cosmath_students SET active=false,version=version+1 WHERE id='student-a' AND version=1 RETURNING id")).rows.length, 0);
    assert.equal((await db.query('SELECT count(*)::int n FROM cosmath_reports')).rows[0].n, 1);
    await assert.rejects(save(db, [{ ...lesson, id: '20000000-0000-4000-8000-000000000002', report_date: '2026-09-15' }], [{ ...report, id: '30000000-0000-4000-8000-000000000002', lesson_id: '20000000-0000-4000-8000-000000000002' }]), /Student archived/);
    assert.equal((await db.query('SELECT count(*)::int n FROM cosmath_lessons')).rows[0].n, 1);
  } finally { await db.close(); }
});

test('saving another student does not overwrite an existing report; dates stay separate', async () => {
  const db = await database();
  try {
    await db.exec(migration);
    await db.query('INSERT INTO cosmath_classes(id,name) VALUES ($1,$2)', [classId, '테스트 반']);
    await db.query('INSERT INTO cosmath_students(id,class_id,name) VALUES ($1,$3,$1),($2,$3,$2)', ['student-a', 'student-b', classId]);
    await save(db, [lesson], [report]);
    await save(db, [], [{ ...report, id: '30000000-0000-4000-8000-000000000002', student_id: 'student-b', snapshot: { notes: '다른 학생' } }]);
    const nextLesson = { ...lesson, id: '20000000-0000-4000-8000-000000000002', report_date: '2026-09-15' };
    await save(db, [nextLesson], [{ ...report, id: '30000000-0000-4000-8000-000000000003', lesson_id: nextLesson.id, snapshot: { notes: '다음 수업' } }]);
    const day = (await db.query("SELECT cosmath_load_report_day('2026-09-14') value")).rows[0].value;
    assert.equal(day.reports.length, 2);
    assert.equal(day.reports.find(item => item.student_id === 'student-a').snapshot.notes, '기존 기록');
    assert.equal(day.reports.find(item => item.student_id === 'student-a').version, 1);
    assert.equal((await db.query("SELECT cosmath_load_report_day('2026-09-15') value")).rows[0].value.reports.length, 1);
  } finally { await db.close(); }
});
