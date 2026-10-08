import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('daily SQL saves cumulative dates atomically and blocks another academy', async () => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
   CREATE TABLE auth.users(id uuid PRIMARY KEY);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  for (const file of ['202609140001_normalized_reports.sql','202609160001_wrong_answers.sql','202609160002_handoffs.sql','202609170001_auth_workspaces.sql','202609220002_wrong_answer_completion.sql','202609300001_homework_status.sql','202610090001_student_daily_records.sql']) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url),'utf8'));
  const uid=randomUUID(), classId=randomUUID();
  await db.exec(readFileSync(new URL('../supabase/migrations/202610090002_edit_student.sql',import.meta.url),'utf8'));
  await db.query('INSERT INTO auth.users VALUES ($1)',[uid]);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid]);
  await db.exec("SET ROLE authenticated; SELECT cosmath_create_workspace('Daily');");
  await db.query("INSERT INTO cosmath_classes(id,name) VALUES($1,'Class')",[classId]);
  await db.query("INSERT INTO cosmath_students(id,class_id,name) VALUES('a',$1,'A')",[classId]);
  const edited=(await db.query("SELECT * FROM cosmath_edit_student('a','Updated','중2',1)")).rows[0];
  assert.equal(edited.name,'Updated');
  await assert.rejects(db.query("SELECT cosmath_edit_student('a','Stale','중1',1)"),/Student changed/);
  const entry=date=>({daily:{id:randomUUID(),student_id:'a',record_date:date,attendance:'출석',reason:'',exams:[{id:randomUUID(),name:'Quiz',score:8,max_score:10}],version:0},wrong:{id:randomUUID(),student_id:'a',record_date:date,total_wrong:2,corrected_count:1,memo:'',homework_status:'O',version:0}});
  const save=async items=>(await db.query('SELECT cosmath_save_student_daily($1::jsonb) value',[JSON.stringify(items)])).rows[0].value;
  const first=entry('2026-10-09'); await save([first]); await save([entry('2026-10-10')]);
  assert.equal((await db.query('SELECT * FROM cosmath_student_daily_records')).rows.length,2);
  await assert.rejects(save([entry('2026-10-11'),first]));
  assert.equal((await db.query('SELECT * FROM cosmath_student_daily_records')).rows.length,2);
  assert.equal((await db.query('SELECT homework_status FROM cosmath_wrong_answers')).rows[0].homework_status,'O');
  const other=randomUUID(); await db.exec('RESET ROLE'); await db.query('INSERT INTO auth.users VALUES ($1)',[other]);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[other]);
  await db.exec("SET ROLE authenticated; SELECT cosmath_create_workspace('Other');");
  assert.equal((await db.query('SELECT * FROM cosmath_student_daily_records')).rows.length,0);
  await assert.rejects(save([entry('2026-10-12')]),/Invalid student/);
  await assert.rejects(db.query("SELECT cosmath_edit_student('a','Foreign','중1',2)"),/Student changed/);
 } finally { await db.close(); }
});
