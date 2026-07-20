import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPathForRole, routes, type AccountRole, type AccountStatus } from "@/lib/constants/routes";

export type Profile = {
  id: string; email: string | null; full_name: string | null; role: AccountRole; status: AccountStatus;
  phone: string | null; country_code: string | null; country_name: string | null; customer_type: "individual" | "company" | null; company_name: string | null;
};

function logSafeAuthDiagnostic(message: string, details?: Record<string, string | null | undefined>) {
  console.error(`[auth] ${message}`, details ?? {});
}

export async function getCurrentProfile() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError && userError.name !== "AuthSessionMissingError") {
    logSafeAuthDiagnostic("Unable to read authenticated user from Supabase.", { code: userError.code, name: userError.name });
  }

  if (!user) return { user: null, profile: null, supabase };

  const { data, error: profileError } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

  if (profileError) {
    logSafeAuthDiagnostic("Unable to read authenticated user profile.", { code: profileError.code, userId: user.id });
    return { user, profile: null, supabase };
  }

  return { user, profile: (data as Profile | null) ?? null, supabase };
}

export async function requireProfile(roles?: AccountRole[]) {
  const ctx = await getCurrentProfile();
  if (!ctx.user) redirect(`${routes.login}?next=${encodeURIComponent(routes.account)}`);
  if (!ctx.profile || ctx.profile.status !== "active") redirect(routes.logout);
  if (roles && !roles.includes(ctx.profile.role)) redirect(dashboardPathForRole(ctx.profile.role));
  return ctx as typeof ctx & { user: NonNullable<typeof ctx.user>; profile: Profile };
}

export async function redirectAuthenticatedUser() {
  const { user, profile } = await getCurrentProfile();
  if (user) redirect(dashboardPathForRole(profile?.role));
}
