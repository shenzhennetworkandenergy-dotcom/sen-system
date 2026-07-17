import { redirect } from "next/navigation";

import { destinationForRole } from "@/lib/auth/destinations";
import { getCurrentProfile } from "@/lib/auth/profile";
import type { CurrentProfile, ProfileRole } from "@/lib/auth/types";
import { routes } from "@/lib/constants/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function redirectAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile(supabase);
  if (profile?.status === "active") redirect(destinationForRole(profile.role));
  if (profile) await supabase.auth.signOut();
}

export async function requireActiveProfile(allowed: ProfileRole[]): Promise<CurrentProfile> {
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile(supabase);
  if (!profile) redirect(routes.login);
  if (profile.status !== "active") redirect(`${routes.login}?status=${profile.status}`);
  if (!allowed.includes(profile.role)) redirect(destinationForRole(profile.role));
  return profile;
}
