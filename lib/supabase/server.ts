import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { backendMode } from "@/lib/backend/config";
import { getLocalSession } from "@/lib/auth/local-session";

export async function createSupabaseServerClient() {
  if (backendMode() === "native") {
    const local = await getLocalSession();
    return {
      ...local.supabase,
      auth: {
        ...local.supabase.auth,
        async getUser() {
          return { data: { user: local.user }, error: null };
        },
      },
    } as unknown as ReturnType<typeof createServerClient>;
  }
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    },
  );
}
