import "server-only";

import { cookies } from "next/headers";

import { localDatabaseConfig } from "@/lib/backend/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queryLocal, withLocalTransaction } from "@/lib/postgres/pool";
import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from "@/lib/auth/local-credentials";
import type { Profile } from "@/lib/auth/session";

const cookieName = "sen_session";
const sessionDurationMs = 12 * 60 * 60 * 1000;

export type LocalUser = { id: string; email: string | null };

export async function authenticateLocal(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await queryLocal<Profile & { password_hash: string | null; password_reset_required: boolean; failed_attempts: number; locked_until: string | null }>(
    `select p.*, c.password_hash, c.password_reset_required, c.failed_attempts, c.locked_until
       from public.profiles p
       join public.local_user_credentials c on c.profile_id=p.id
      where lower(p.email)=lower($1) and p.archived_at is null
      limit 1`,
    [normalizedEmail],
  );
  const account = result.rows[0];
  if (!account || account.status !== "active") throw new Error("Invalid email or password.");
  if (account.locked_until && new Date(account.locked_until) > new Date()) throw new Error("Account is temporarily locked. Contact an administrator.");
  if (account.password_reset_required || !account.password_hash) throw new Error("A local password reset is required for this account.");
  if (!(await verifyPassword(password, account.password_hash))) {
    await queryLocal(`update public.local_user_credentials set failed_attempts=failed_attempts+1, locked_until=case when failed_attempts+1>=5 then now()+interval '15 minutes' else null end, updated_at=now() where profile_id=$1`, [account.id]);
    throw new Error("Invalid email or password.");
  }
  await queryLocal(`update public.local_user_credentials set failed_attempts=0,locked_until=null,last_login_at=now(),updated_at=now() where profile_id=$1`, [account.id]);
  return { user: { id: account.id, email: account.email } satisfies LocalUser, profile: account as Profile };
}

export async function createLocalSession(profileId: string) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  await queryLocal(`insert into public.local_user_sessions(profile_id,token_hash,expires_at) values($1,$2,$3)`, [profileId, hashSessionToken(token), expiresAt]);
  const store = await cookies();
  store.set(cookieName, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && localDatabaseConfig().publicOrigin.protocol === "https:", path: "/", expires: expiresAt });
}

export async function getLocalSession() {
  const token = (await cookies()).get(cookieName)?.value;
  const database = createSupabaseAdminClient();
  if (!token) return { user: null, profile: null, supabase: database };
  const result = await queryLocal<Profile>(`select p.* from public.local_user_sessions s join public.profiles p on p.id=s.profile_id where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and p.status='active' and p.archived_at is null limit 1`, [hashSessionToken(token)]);
  const profile = result.rows[0] ?? null;
  if (!profile) return { user: null, profile: null, supabase: database };
  await queryLocal(`update public.local_user_sessions set last_seen_at=now() where token_hash=$1 and last_seen_at<now()-interval '5 minutes'`, [hashSessionToken(token)]);
  return { user: { id: profile.id, email: profile.email } satisfies LocalUser, profile, supabase: database };
}

export async function revokeLocalSession() {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (token) await queryLocal(`update public.local_user_sessions set revoked_at=now() where token_hash=$1 and revoked_at is null`, [hashSessionToken(token)]);
  store.delete(cookieName);
}

export async function registerLocalCustomer(input: { email: string; password: string; fullName: string; phone: string | null; country: string | null; customerType: string; companyName: string | null }) {
  const passwordHash = await hashPassword(input.password);
  return withLocalTransaction(async (client) => {
    const result = await client.query<{ id: string }>(`insert into public.profiles(id,email,full_name,phone,country,customer_type,company_name,role,status) values(gen_random_uuid(),lower($1),$2,$3,$4,$5::public.customer_type,$6,'customer','active') returning id`, [input.email.trim(), input.fullName.trim(), input.phone, input.country, input.customerType, input.companyName]);
    const id = result.rows[0].id;
    await client.query(`insert into public.local_user_credentials(profile_id,password_hash) values($1,$2)`, [id, passwordHash]);
    return id;
  });
}
