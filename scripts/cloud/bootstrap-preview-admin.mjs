import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

import pg from "pg";

const { Pool } = pg;
const scrypt = promisify(scryptCallback);

const email = String(process.env.SEN_PREVIEW_ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = String(process.env.SEN_PREVIEW_ADMIN_PASSWORD ?? "");
const databaseUrl = process.env.DATABASE_URL;

if (!email || !password) {
  console.log("Preview admin bootstrap skipped because its secret credentials are not configured.");
  process.exit(0);
}
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (password.length < 12) throw new Error("SEN_PREVIEW_ADMIN_PASSWORD must contain at least 12 characters.");

const salt = randomBytes(16);
const derived = await scrypt(password, salt, 64);
const passwordHash = `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();

try {
  await client.query("begin");
  const profile = await client.query(
    `insert into public.profiles(id,email,full_name,role,status)
     values(gen_random_uuid(),$1,'Preview Administrator','admin','active')
     on conflict(email) do update set role='admin',status='active',archived_at=null
     returning id`,
    [email],
  );
  await client.query(
    `insert into public.local_user_credentials(profile_id,password_hash,password_reset_required)
     values($1,$2,false)
     on conflict(profile_id) do update set
       password_hash=coalesce(public.local_user_credentials.password_hash,excluded.password_hash),
       password_reset_required=false`,
    [profile.rows[0].id, passwordHash],
  );
  await client.query("commit");
  console.log(`Preview administrator is ready for ${email}.`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
