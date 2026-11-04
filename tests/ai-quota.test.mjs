import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("all academy members get AI access and percentage quotas are enforced per academy", async () => {
  const db = new PGlite();
  const admin = "10000000-0000-4000-8000-000000000001";
  const staff = "10000000-0000-4000-8000-000000000002";
  const otherOwner = "10000000-0000-4000-8000-000000000003";
  const academy = "20000000-0000-4000-8000-000000000001";
  const otherAcademy = "20000000-0000-4000-8000-000000000002";

  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE public.cosmath_academies(id uuid PRIMARY KEY,name text);
      CREATE TABLE public.cosmath_academy_members(user_id uuid PRIMARY KEY,academy_id uuid,role text);
      CREATE FUNCTION public.cosmath_current_academy_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT academy_id FROM cosmath_academy_members WHERE user_id=auth.uid() $$;
      INSERT INTO auth.users(id,email) VALUES ('${admin}','kcosmath@gmail.com'),('${staff}','staff@example.test'),('${otherOwner}','other@example.test');
      INSERT INTO cosmath_academies VALUES ('${academy}','우리 학원'),('${otherAcademy}','다른 학원');
      INSERT INTO cosmath_academy_members VALUES ('${admin}','${academy}','owner'),('${staff}','${academy}','staff'),('${otherOwner}','${otherAcademy}','owner');`);

    for (const name of [
      "202610080001_typing_documents.sql",
      "202610080002_typing_access.sql",
      "202611040001_academy_ai_quotas.sql",
    ]) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
    }

    const login = async uid => {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid]);
      await db.exec("SET ROLE authenticated");
    };

    // 1. Both staff and otherAcademy owner now have default access without manual approval
    await login(otherOwner);
    const hasAccess = (await db.query("SELECT cosmath_has_typing_access() ok")).rows[0].ok;
    assert.equal(hasAccess, true);

    // 2. Consume 40% and 60% of daily quota in otherAcademy -> reaches 100%, next call blocked
    const c1 = (await db.query("SELECT cosmath_consume_ai_quota('problem_studio', 40) res")).rows[0].res;
    assert.equal(c1.allowed, true);
    assert.equal(c1.daily_pct, 40);

    const c2 = (await db.query("SELECT cosmath_consume_ai_quota('typing_ocr', 60) res")).rows[0].res;
    assert.equal(c2.allowed, true);
    assert.equal(c2.daily_pct, 100);

    const c3 = (await db.query("SELECT cosmath_consume_ai_quota('general', 1) res")).rows[0].res;
    assert.equal(c3.allowed, false);
    assert.equal(c3.code, "DAILY_LIMIT_REACHED");

    // 3. First academy is unaffected (0% used) and shared between admin & staff
    await login(staff);
    const s1 = (await db.query("SELECT cosmath_get_ai_quota_status() res")).rows[0].res;
    assert.equal(s1.daily_pct, 0);

    await db.query("SELECT cosmath_consume_ai_quota('general', 15)");
    await login(admin);
    const s2 = (await db.query("SELECT cosmath_get_ai_quota_status() res")).rows[0].res;
    assert.equal(s2.daily_pct, 15);

    // 4. Manager can reset otherAcademy's usage back to 0%
    await db.query("SELECT cosmath_reset_academy_ai_usage($1, 'daily')", [otherAcademy]);
    await login(otherOwner);
    const afterReset = (await db.query("SELECT cosmath_get_ai_quota_status() res")).rows[0].res;
    assert.equal(afterReset.daily_pct, 0);

    // 5. Generated problems are isolated per academy
    await db.query("INSERT INTO cosmath_generated_problems(title, question) VALUES ('다른학원 문제', '$x^2=1$')");
    await login(staff);
    assert.equal((await db.query("SELECT * FROM cosmath_generated_problems")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("AlgeoMath / GeoGebra math geometry engine renders functions, shaded integral regions and axes into valid SVG", async () => {
  const ts = await import("typescript");
  const { Module } = await import("node:module");
  const filename = new URL("../src/lib/math-geometry-engine.ts", import.meta.url);
  const code = readFileSync(filename, "utf8");
  const m = new Module(filename.pathname);
  m._compile(
    ts.default.transpileModule(code, {
      compilerOptions: { module: ts.default.ModuleKind.CommonJS, target: ts.default.ScriptTarget.ES2022 },
    }).outputText,
    filename.pathname
  );
  const { evalMathExpr, renderMathGeoSvg, MATH_GEO_PRESETS } = m.exports;

  assert.equal(evalMathExpr("x^3 - 3*x^2 + 2*x + 1", 0), 1);
  assert.equal(evalMathExpr("x^3 - 3*x^2 + 2*x + 1", 3), 7);
  assert.equal(evalMathExpr("2x + 1", 2), 5);

  for (const preset of MATH_GEO_PRESETS) {
    const svg = renderMathGeoSvg(preset.spec);
    assert.ok(svg.startsWith("<svg"));
    assert.ok(svg.includes("polyline") || svg.includes("ellipse"));
    assert.ok(!svg.includes("NaN"));
  }
});

