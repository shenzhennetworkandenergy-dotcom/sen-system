import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const [email] = process.argv.slice(2);
const password = process.env.SEN_NEW_PASSWORD;
const databaseUrl = process.env.DATABASE_URL;
if (!email || !password || !databaseUrl) throw new Error("Email, SEN_NEW_PASSWORD and DATABASE_URL are required.");
if (password.length < 12) throw new Error("Password must contain at least 12 characters.");
const salt = randomBytes(16);
const derived = await promisify(scryptCallback)(password, salt, 64);
const passwordHash = `scrypt$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const result = await client.query(
    `insert into public.local_user_credentials(profile_id,password_hash,password_reset_required)
     select id,$2,false from public.profiles where lower(email)=lower($1)
     on conflict(profile_id) do update set password_hash=excluded.password_hash,password_reset_required=false,failed_attempts=0,locked_until=null,updated_at=now()
     returning profile_id`, [email, passwordHash],
  );
  if (!result.rowCount) throw new Error("Profile email was not found.");
  await client.query("delete from public.local_user_sessions where profile_id=$1", [result.rows[0].profile_id]);
  console.log("Local password updated securely.");
} finally { await client.end(); }
