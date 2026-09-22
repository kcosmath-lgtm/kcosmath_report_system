import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('last report save wins for stale updates and competing new IDs; tenant checks and rollback remain', async () => {
  const db = new PGlite();
  const uid = '10000000-0000-4000-8000-000000000001';
  const classId = '20000000-0000-4000-8000-000000000001';
  const lessonId = '30000000-0000-4000-8000-000000000001';
  const reportId = '40000000-0000-4000-8000-000000000001';
  const rpc = async (lessons, reports) => (await db.query('SELECT cosmath_save_report_batch($1,$2) AS value', [JSON.stringify(lessons), JSON.stringify(reports)])).rows[0].value;
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    for (const file of ['202609140001_normalized_reports.sql','202609160001_wrong_answers.sql','202609160002_handoffs.sql','202609170001_auth_workspaces.sql','202609220001_report_last_save_wins.sql']) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    await db.query('INSERT INTO auth.users VALUES ($1)', [uid]);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await db.exec("SET ROLE authenticated; SELECT cosmath_create_workspace('Test');");
    await db.query("INSERT INTO cosmath_classes(id,name) VALUES ($1,'Class')", [classId]);
    await db.query("INSERT INTO cosmath_students(id,class_id,name,grade) VALUES ('a',$1,'A','1'),('b',$1,'B','1')", [classId]);
    const lesson = { id: lessonId, class_id: classId, report_date: '2026-09-22', common_data: { progress: 'first' }, expected_version: 0 };
    const report = { id: reportId, lesson_id: lessonId, student_id: 'a', snapshot: { notes: 'first' }, expected_version: 0 };
    await rpc([lesson], [report]);
    const secondLesson = { ...lesson, id: '30000000-0000-4000-8000-000000000002', common_data: { progress: 'second' } };
    const result = await rpc([secondLesson], [{ ...report, id: '40000000-0000-4000-8000-000000000002', lesson_id: secondLesson.id, snapshot: { notes: 'second' } }]);
    assert.equal(result.lessons[0].id, lessonId);
    assert.equal(result.reports[0].id, reportId);
    assert.equal(result.reports[0].snapshot.notes, 'second');
    assert.equal(result.reports[0].version, 2);
    await rpc([], [{ ...report, id: '40000000-0000-4000-8000-000000000003', student_id: 'b' }]);
    const stale = await rpc([], [{ ...report, expected_version: 1, snapshot: { notes: 'last' } }]);
    assert.equal(stale.reports[0].snapshot.notes, 'last');
    assert.equal(stale.reports[0].version, 3);
    assert.equal((await db.query("SELECT snapshot->>'notes' AS notes FROM cosmath_reports WHERE student_id='b'")).rows[0].notes, 'first');
    await assert.rejects(rpc([{ ...lesson, common_data: { progress: 'rollback' } }], [{ ...report, student_id: 'missing' }]));
    assert.equal((await db.query('SELECT common_data FROM cosmath_lessons')).rows[0].common_data.progress, 'second');
    await db.exec('RESET ROLE');
    const outsider = '10000000-0000-4000-8000-000000000002';
    await db.query('INSERT INTO auth.users VALUES ($1)', [outsider]);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [outsider]);
    await db.exec("SET ROLE authenticated; SELECT cosmath_create_workspace('Other');");
    await assert.rejects(rpc([lesson], [report]), /Class not found/);
    await assert.rejects(rpc([], [report]), /Student archived or class changed/);
  } finally { await db.close(); }
});
