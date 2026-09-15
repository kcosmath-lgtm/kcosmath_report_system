import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, '');
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Supabase URL/key are required. No backup created.');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await db.from('cosmath_settings').select('key,value,updated_at')
  .in('key', ['cosmath_student_data', 'cosmath_common_data', 'cosmath_overrides_data']);
if (error) throw new Error(`Backup failed (${error.code ?? 'network'}). No backup created.`);
await mkdir('.local-backups', { recursive: true });
const path = `.local-backups/legacy-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
await writeFile(path, JSON.stringify({ backed_up_at: new Date().toISOString(), rows: data }, null, 2), { flag: 'wx' });
console.log(`Backed up ${data.length} legacy keys to ${path}. No database changes made.`);
