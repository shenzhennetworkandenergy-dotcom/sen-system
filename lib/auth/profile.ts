import type { SupabaseClient } from "@supabase/supabase-js";

import type { CurrentProfile, ProfileRole, ProfileStatus } from "@/lib/auth/types";

function isProfileRole(value: unknown): value is ProfileRole {
  return value === "admin" || value === "employee" || value === "customer";
}

function isProfileStatus(value: unknown): value is ProfileStatus {
  return value === "active" || value === "pending" || value === "suspended" || value === "disabled";
}

export async function getCurrentProfile(supabase: SupabaseClient): Promise<CurrentProfile | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, status, full_name")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (error || !data || !isProfileRole(data.role) || !isProfileStatus(data.status)) return null;

  return {
    id: data.id,
    role: data.role,
    status: data.status,
    full_name: data.full_name,
  };
}
