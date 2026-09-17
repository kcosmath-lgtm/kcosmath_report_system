import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const files = [
  "202609140001_normalized_reports.sql",
  "202609160001_wrong_answers.sql",
  "202609160002_handoffs.sql",
  "202609170001_auth_workspaces.sql",
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
    assert.equal((await db.query("SELECT count(*)::int n FROM cosmath_handoffs WHERE academy_id IS NOT NULL")).rows[0].n, 1);

    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ownerId]);
    await db.exec("SET ROLE authenticated");
    const workspace = (await db.query("SELECT cosmath_create_workspace('코스매스') value")).rows[0].value;
    assert.equal(workspace.name, "코스매스");
    assert.equal(workspace.role, "owner");
    assert.equal((await db.query("SELECT count(*)::int n FROM cosmath_handoffs")).rows[0].n, 1);

    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(db.query("SELECT * FROM cosmath_handoffs"), /permission denied/);
    await assert.rejects(db.query("SELECT cosmath_get_my_workspace()"), /permission denied/);
  } finally {
    await db.close();
  }
});
