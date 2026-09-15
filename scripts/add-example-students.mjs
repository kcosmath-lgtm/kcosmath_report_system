import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, '');
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Supabase configuration is missing.');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
function check(error) {
  if (!error) return;
  const networkCode = error.details?.match(/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EACCES/)?.[0];
  throw new Error(`Example data request failed: ${error.code || networkCode || 'network error'}.`);
}
const className = '[예시] 보고서 확인반';
const existing = await db.from('cosmath_classes').select('id').eq('name', className).maybeSingle();
check(existing.error);
let classId = existing.data?.id;
if (!classId) {
  const created = await db.from('cosmath_classes').insert({ name: className }).select('id').single();
  check(created.error);
  classId = created.data.id;
}
const examples = [
  { id: 'cosmath-example-preview-elementary', name: '김예시', grade: '초6' },
  { id: 'cosmath-example-preview-middle', name: '이예시', grade: '중2' },
  { id: 'cosmath-example-preview-high', name: '박예시', grade: '고1' },
];
const result = await db.from('cosmath_students').upsert(examples.map(student => ({ ...student, class_id: classId })), { onConflict: 'id', ignoreDuplicates: true });
check(result.error);
const verified = await db.from('cosmath_students').select('id,active').in('id', examples.map(student => student.id)).eq('class_id', classId);
check(verified.error);
console.log(`Example class ready: ${verified.data.filter(student => student.active).length} active example students. Existing students and reports were not changed.`);
