import "server-only";
import { createClient } from "@supabase/supabase-js";
import { PostgrestClient } from "@supabase/postgrest-js";
import { backendMode } from "@/lib/backend/config";
import { localDatabaseConfig } from "@/lib/backend/config";
import { createNativeStorageClient } from "@/lib/storage/native-adapter";
import { hashPassword } from "@/lib/auth/local-credentials";
import { queryLocal, withLocalTransaction } from "@/lib/postgres/pool";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const adminKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

function nativeAuthAdmin() {
  return {
    async createUser(values: {
      email: string;
      user_metadata?: Record<string, unknown>;
    }) {
      try {
        const metadata = values.user_metadata ?? {};
        const email = values.email.trim().toLowerCase();
        const user = await withLocalTransaction(async (client) => {
          const result = await client.query<{ id: string; created_at: string }>(
            `insert into public.profiles(
               id,email,full_name,company_name,phone,country,role,status
             ) values(
               gen_random_uuid(),lower($1),$2,$3,$4,$5,
               coalesce(nullif($6, ''), 'customer')::public.account_role,
               coalesce(nullif($7, ''), 'active')::public.account_status
             ) returning id, created_at::text`,
            [
              email,
              String(metadata.full_name ?? email),
              metadata.company_name ? String(metadata.company_name) : null,
              metadata.phone ? String(metadata.phone) : null,
              metadata.country ? String(metadata.country) : null,
              String(metadata.role ?? "customer"),
              String(metadata.status ?? "active"),
            ],
          );
          const created = result.rows[0];
          await client.query(
            `insert into public.local_user_credentials(profile_id,password_hash,password_reset_required)
             values($1,null,true)`,
            [created.id],
          );
          return {
            id: created.id,
            email,
            created_at: created.created_at,
            user_metadata: metadata,
            app_metadata: { provider: "local", providers: ["local"] },
          };
        });
        return { data: { user }, error: null };
      } catch (error) {
        return {
          data: { user: null },
          error: {
            message: error instanceof Error && /unique|duplicate/i.test(error.message)
              ? "A customer with this email already exists."
              : error instanceof Error
                ? error.message
                : "Local account creation failed.",
          },
        };
      }
    },
    async getUserById(id: string) {
      try {
        const result = await queryLocal<{ id: string; email: string; created_at: string; updated_at: string; last_sign_in_at: string | null }>(
          `select p.id, p.email, c.created_at, c.updated_at,
             (select max(created_at)::text from public.local_user_sessions where profile_id=p.id) as last_sign_in_at
           from public.profiles p left join public.local_user_credentials c on c.profile_id=p.id where p.id=$1`, [id],
        );
        const row = result.rows[0];
        return { data: { user: row ? { ...row, email_confirmed_at: row.created_at, phone: null, phone_confirmed_at: null, app_metadata: { provider: "local", providers: ["local"] }, user_metadata: {} } : null }, error: null };
      } catch (error) { return { data: { user: null }, error: { message: error instanceof Error ? error.message : "Local account lookup failed." } }; }
    },
    async updateUserById(id: string, values: { password?: string }) {
      try {
        if (!values.password) throw new Error("A password is required.");
        const passwordHash = await hashPassword(values.password);
        const result = await queryLocal("update public.local_user_credentials set password_hash=$2, failed_attempts=0, locked_until=null, updated_at=now() where profile_id=$1", [id, passwordHash]);
        if (!result.rowCount) throw new Error("Local credential record not found.");
        await queryLocal("delete from public.local_user_sessions where profile_id=$1", [id]);
        return { data: { user: { id } }, error: null };
      } catch (error) { return { data: { user: null }, error: { message: error instanceof Error ? error.message : "Local password update failed." } }; }
    },
    async deleteUser(id: string) {
      try {
        await withLocalTransaction(async (client) => {
          await client.query("delete from public.local_user_sessions where profile_id=$1", [id]);
          await client.query("delete from public.local_user_credentials where profile_id=$1", [id]);
          const result = await client.query("delete from public.profiles where id=$1", [id]);
          if (!result.rowCount) throw new Error("Local account not found.");
        });
        return { data: { user: null }, error: null };
      } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "Local account deletion failed." } }; }
    },
  };
}

export function createSupabaseAdminClient() {
  if (backendMode() === "native") {
    const postgrestUrl = localDatabaseConfig().postgrestUrl.toString().replace(/\/$/, "");
    const createNativePostgrestClient = (schema: string) => {
      const postgrest = new PostgrestClient(postgrestUrl, { schema });
      return {
        from: postgrest.from.bind(postgrest),
        rpc: postgrest.rpc.bind(postgrest),
        schema: (nextSchema: string) => createNativePostgrestClient(nextSchema),
      };
    };
    return {
      ...createNativePostgrestClient("public"),
      storage: createNativeStorageClient(),
      auth: { admin: nativeAuthAdmin() },
    } as unknown as ReturnType<typeof createClient>;
  }
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for the Supabase admin client.");
  if (!adminKey) throw new Error("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required for the Supabase admin client.");
  return createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
