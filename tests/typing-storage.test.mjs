import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("exam storage isolates academies and rejects stale concurrent writes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE public.cosmath_academies(id uuid PRIMARY KEY);
      CREATE FUNCTION public.cosmath_current_academy_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.academy',true),'')::uuid $$;
      INSERT INTO cosmath_academies VALUES ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');`);
    await db.exec(readFileSync(new URL("../supabase/migrations/202610080001_typing_documents.sql", import.meta.url), "utf8"));
    await db.exec("SET ROLE authenticated; SET test.academy='10000000-0000-4000-8000-000000000001'");
    const first = (await db.query("INSERT INTO cosmath_typing_documents(title,document) VALUES ('시험지','{\"problems\":[]}') RETURNING id,version")).rows[0];
    assert.equal(first.version, 1);
    assert.equal((await db.query("UPDATE cosmath_typing_documents SET version=2 WHERE id=$1 AND version=1 RETURNING id", [first.id])).rows.length, 1);
    assert.equal((await db.query("UPDATE cosmath_typing_documents SET version=2 WHERE id=$1 AND version=1 RETURNING id", [first.id])).rows.length, 0);
    await db.exec("SET test.academy='10000000-0000-4000-8000-000000000002'");
    assert.equal((await db.query("SELECT * FROM cosmath_typing_documents")).rows.length, 0);
    assert.equal((await db.query("UPDATE cosmath_typing_documents SET title='탈취' WHERE id=$1 RETURNING id", [first.id])).rows.length, 0);
    await assert.rejects(db.query("INSERT INTO cosmath_typing_documents(academy_id,title,document) VALUES ('10000000-0000-4000-8000-000000000001','다른 학원','{}')"), /row-level security/);
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(db.query("SELECT * FROM cosmath_typing_documents"), /permission denied/);
  } finally { await db.close(); }
});
