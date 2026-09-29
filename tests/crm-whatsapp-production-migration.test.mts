import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/202609290003_crm_whatsapp_private_storage.sql";

test("CRM WhatsApp migration creates only private service-role storage and atomic manifest publication", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /insert into storage\.buckets[\s\S]*'crm-whatsapp-csv'[\s\S]*false/i);
  assert.match(sql, /crm_whatsapp_csv_manifest:/);
  assert.match(sql, /function public\.publish_crm_whatsapp_csv_manifest\(\s*storage_namespace text,\s*expected_revision text,\s*next_manifest jsonb\s*\)/i);
  assert.match(sql, /storage_namespace\s*!~\s*'\^\[a-z0-9\]/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /current_revision is distinct from expected_revision/i);
  assert.match(sql, /security definer[\s\S]*set search_path = public, pg_temp/i);
  assert.match(sql, /revoke all on function public\.publish_crm_whatsapp_csv_manifest\(text,text,jsonb\) from public,anon,authenticated/i);
  assert.match(sql, /grant execute on function public\.publish_crm_whatsapp_csv_manifest\(text,text,jsonb\) to service_role/i);
  assert.doesNotMatch(sql, /create table public\.crm_whatsapp/i);
});
