import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const files = [
  "202609140001_normalized_reports.sql",
  "202609160001_wrong_answers.sql",
  "202609160002_handoffs.sql",
  "202609170001_auth_workspaces.sql",
  "202609170002_remove_ambiguous_foreign_keys.sql",
];
const migrations = files.map(file => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
const ownerId = "10000000-0000-4000-8000-000000000001";

test("workspace migration preserves legacy data and blocks anonymous access", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    `);
    for (const migration of migrations.slice(0, 3)) await db.exec(migration);
    await db.exec(`
      INSERT INTO cosmath_classes(id,name) VALUES ('20000000-0000-4000-8000-000000000001','기존 반');
      INSERT INTO cosmath_students(id,class_id,name) VALUES ('student-a','20000000-0000-4000-8000-000000000001','기존 학생');
      INSERT INTO cosmath_handoffs(handoff_date,author,title,content) VALUES ('2026-09-17','선생님','기존 기록','보존할 내용');
      INSERT INTO auth.users(id) VALUES ('${ownerId}');
    `);
    await db.exec(migrations[3]);
    await db.exec(migrations[4]);
    assert.equal((await db.query("SELECT count(*)::int n FROM cosmath_handoffs WHERE academy_id IS NOT NULL")).rows[0].n, 1);

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ownerId]);
    await db.exec("SET ROLE authenticated");
    const workspace = (await db.query("SELECT cosmath_create_workspace('코스매스') value")).rows[0].value;
    assert.equal(workspace.name, "코스매스");
    assert.equal(workspace.role, "owner");
    assert.equal((await db.query("SELECT count(*)::int n FROM cosmath_handoffs")).rows[0].n, 1);

    await db.exec('RESET ROLE');
    await db.exec(readFileSync(new URL('../supabase/migrations/202609180001_rolling_reports.sql', import.meta.url), 'utf8'));
    const conflictMigration = readFileSync(new URL('../supabase/migrations/202609210001_non_retryable_conflicts.sql', import.meta.url), 'utf8');
    await db.exec(conflictMigration);
    await db.exec(conflictMigration); // Safe to reapply without altering records or grants.
    await db.exec('SET ROLE authenticated');
    const classA = '20000000-0000-4000-8000-000000000001';
    const classB = '20000000-0000-4000-8000-000000000002';
    await db.query('INSERT INTO cosmath_classes(id,name) VALUES ($1,$2)', [classB, '고1']);
    await db.query('INSERT INTO cosmath_students(id,class_id,name) VALUES ($1,$2,$3)', ['student-b', classB, '학생 B']);
    const lessons = [classA, classB].map((id, i) => ({ id: `30000000-0000-4000-8000-00000000000${i+1}`, class_id: id, report_date: '2026-09-18', common_data: { progress: 'old' }, expected_version: 0 }));
    const reports = lessons.map((l, i) => ({ id: `40000000-0000-4000-8000-00000000000${i+1}`, lesson_id: l.id, student_id: i ? 'student-b' : 'student-a', snapshot: { notes: 'old' }, expected_version: 0 }));
    const save = (ls, rs) => db.query('SELECT cosmath_save_report_batch($1::jsonb,$2::jsonb)', [JSON.stringify(ls), JSON.stringify(rs)]);
    await save(lessons, reports);
    // Two clients loaded version 1; B saves first, then A saves its own class.
    for (const i of [1, 0]) await save([{ ...lessons[i], expected_version: 1, common_data: { progress: `class-${i}` } }], [{ ...reports[i], expected_version: 1, snapshot: { notes: `client-${i}` } }]);
    let rows = (await db.query("SELECT cosmath_load_report_day('2026-09-21') value")).rows[0].value;
    assert.deepEqual(rows.reports.map(r => r.snapshot.notes).sort(), ['client-0', 'client-1']);
    // An actual stale lesson is rejected with a non-retryable business error.
    await assert.rejects(save([{ ...lessons[0], expected_version: 1 }], []), e => e.code === 'PT409' && /Lesson changed/.test(e.message));
    // A stale report also rolls back the earlier lesson update in the same batch.
    await assert.rejects(save([{ ...lessons[0], expected_version: 2 }], [{ ...reports[0], expected_version: 1 }]), e => e.code === 'PT409' && /Report changed/.test(e.message));
    rows = (await db.query("SELECT cosmath_load_report_day('2026-09-21') value")).rows[0].value;
    assert.equal(rows.lessons.find(l => l.id === lessons[0].id).version, 2);
    assert.equal(rows.lessons.find(l => l.id === lessons[0].id).common_data.progress, 'class-0');
    assert.deepEqual(rows.reports.map(r => r.snapshot.notes).sort(), ['client-0', 'client-1']);
    await db.query("UPDATE cosmath_students SET active=false WHERE id='student-b'");
    await assert.rejects(save([], [{ ...reports[1], id: '40000000-0000-4000-8000-000000000003' }]), e => e.code === 'PT409');
    await assert.rejects(db.query("SELECT cosmath_save_wrong_answer('50000000-0000-4000-8000-000000000001','student-a','2026-09-21',2,0,'',1)"), e => e.code === 'PT409');

    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(db.query("SELECT * FROM cosmath_handoffs"), /permission denied/);
    await assert.rejects(db.query("SELECT cosmath_get_my_workspace()"), /permission denied/);
  } finally {
    await db.close();
  }
});
