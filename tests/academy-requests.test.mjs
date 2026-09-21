import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('academy requests require owner approval, isolate tenants and grant staff full business editing', async () => {
  const db = new PGlite();
  const owner = '10000000-0000-4000-8000-000000000001';
  const teacher = '10000000-0000-4000-8000-000000000002';
  const outsider = '10000000-0000-4000-8000-000000000003';
  const secondTeacher = '10000000-0000-4000-8000-000000000004';
  const asUser = async id => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec('SET ROLE authenticated');
  };
  const rpc = async (sql, params = []) => (await db.query(`SELECT ${sql} AS value`, params)).rows[0].value;
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    for (const file of ['202609140001_normalized_reports.sql','202609160001_wrong_answers.sql','202609160002_handoffs.sql','202609170001_auth_workspaces.sql','202609170002_remove_ambiguous_foreign_keys.sql','202609170004_delete_students_classes.sql','202609180001_rolling_reports.sql','202609210001_non_retryable_conflicts.sql','202609210002_academy_join_requests.sql']) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    for (const id of [owner,teacher,outsider,secondTeacher]) await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,$3)', [id, `${id}@example.com`, '{"full_name":"Teacher"}']);
    await asUser(owner);
    const academy = await rpc("cosmath_create_workspace('코스매스')");
    const classId = '20000000-0000-4000-8000-000000000001';
    await db.query('INSERT INTO cosmath_classes(id,name) VALUES ($1,$2)', [classId,'중1']);
    await asUser(outsider);
    const otherAcademy = await rpc("cosmath_create_workspace('다른 학원')");
    await asUser(teacher);
    assert.equal(await rpc('cosmath_get_my_workspace()'), null);
    assert.deepEqual(await rpc("cosmath_search_academies('코')"), []);
    assert.deepEqual(await rpc("cosmath_search_academies('코스')"), [{ id:academy.id, name:academy.name }]);
    assert.equal((await db.query('SELECT * FROM cosmath_classes')).rows.length, 0);
    await assert.rejects(db.query("INSERT INTO cosmath_academy_members(academy_id,user_id,role) VALUES ($1,$2,'owner')", [academy.id,teacher]), /permission denied/);
    const request = await rpc('cosmath_request_academy_access($1)', [academy.id]);
    const repeat = await rpc('cosmath_request_academy_access($1)', [academy.id]);
    assert.equal(request.id, repeat.id);
    assert.equal(request.status, 'pending');
    await assert.rejects(rpc('cosmath_request_academy_access($1)', [otherAcademy.id]), e => e.code === 'PT409');
    await assert.rejects(rpc('cosmath_review_join_request($1,true)', [request.id]), e => e.code === '42501');
    await assert.rejects(rpc('cosmath_pending_join_requests()'), e => e.code === '42501');
    await assert.rejects(rpc("cosmath_save_report_batch('[]','[]')"), /Workspace required/);
    await asUser(outsider);
    assert.deepEqual(await rpc('cosmath_pending_join_requests()'), []);
    await assert.rejects(rpc('cosmath_review_join_request($1,true)', [request.id]), e => e.code === '42501');
    await assert.rejects(rpc('cosmath_cancel_join_request($1)', [request.id]), e => e.code === 'PT409');
    await asUser(owner);
    const pending = await rpc('cosmath_pending_join_requests()');
    assert.equal(pending[0].full_name,'Teacher');
    assert.equal(pending[0].email,`${teacher}@example.com`);
    await rpc('cosmath_review_join_request($1,true)', [request.id]);
    await assert.rejects(rpc('cosmath_review_join_request($1,true)', [request.id]), e => e.code === 'PT409');
    await asUser(teacher);
    assert.deepEqual(await rpc('cosmath_get_my_workspace()'), { id:academy.id,name:academy.name,role:'staff' });
    assert.equal(await rpc('cosmath_my_join_request()'),null);
    assert.equal((await db.query('SELECT * FROM cosmath_classes')).rows.length,1);
    await assert.rejects(rpc('cosmath_pending_join_requests()'), e => e.code === '42501');
    await assert.rejects(rpc('cosmath_request_academy_access($1)', [otherAcademy.id]), e => e.code === 'PT409');
    // Staff can perform the same business mutations as owners.
    await db.query("INSERT INTO cosmath_students(id,class_id,name) VALUES ('student-a',$1,'학생')", [classId]);
    const lessonId='30000000-0000-4000-8000-000000000001', reportId='40000000-0000-4000-8000-000000000001';
    const lesson={ id:lessonId,class_id:classId,report_date:'2026-09-21',common_data:{},expected_version:0 };
    const report={ id:reportId,lesson_id:lessonId,student_id:'student-a',snapshot:{notes:'staff saved'},expected_version:0 };
    await rpc('cosmath_save_report_batch($1,$2)', [JSON.stringify([lesson]),JSON.stringify([report])]);
    const day=await rpc("cosmath_load_report_day('2026-09-21')");
    assert.equal(day.reports[0].snapshot.notes,'staff saved');
    await rpc("cosmath_save_wrong_answer('50000000-0000-4000-8000-000000000001','student-a','2026-09-21',2,0,'',0)");
    await rpc("cosmath_save_wrong_answer('50000000-0000-4000-8000-000000000001','student-a','2026-09-21',2,1,'수정',1)");
    await rpc("cosmath_add_handoff('60000000-0000-4000-8000-000000000001','2026-09-21','강사','제목','내용')");
    assert.equal(await rpc("cosmath_delete_handoff('60000000-0000-4000-8000-000000000001')"),true);
    await db.query("INSERT INTO cosmath_classes(id,name) VALUES ('20000000-0000-4000-8000-000000000002','고1')");
    assert.equal(await rpc("cosmath_delete_class('20000000-0000-4000-8000-000000000002')"),true);
    // Rejection, cancellation, re-request, and creating an academy instead.
    await asUser(secondTeacher);
    const second=await rpc('cosmath_request_academy_access($1)',[academy.id]);
    await asUser(owner);
    await rpc('cosmath_review_join_request($1,false)',[second.id]);
    await asUser(secondTeacher);
    assert.equal((await rpc('cosmath_my_join_request()')).status,'rejected');
    assert.equal(await rpc('cosmath_get_my_workspace()'),null);
    await rpc('cosmath_cancel_join_request($1)',[second.id]);
    assert.equal(await rpc('cosmath_my_join_request()'),null);
    await rpc('cosmath_request_academy_access($1)',[academy.id]);
    await rpc("cosmath_create_workspace('새 학원')");
    assert.equal(await rpc('cosmath_my_join_request()'),null);
    await asUser(owner);
    await assert.rejects(rpc('cosmath_review_join_request($1,true)',[second.id]), e => e.code === 'PT409');
    // An unrelated academy never sees the staff's records.
    await asUser(outsider);
    assert.deepEqual((await rpc("cosmath_load_report_day('2026-09-21')")).reports,[]);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(rpc("cosmath_search_academies('코스')"),/permission denied/);
    await assert.rejects(db.query('SELECT * FROM cosmath_join_requests'),/permission denied/);
  } finally { await db.close(); }
});
