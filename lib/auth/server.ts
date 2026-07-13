import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AccountRole, Profile } from "@/lib/auth/types";

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile | null) ?? null;
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function checkAccountStatus(profile: Profile) {
  return profile.status === "active";
}

export function destinationForRole(role: AccountRole) {
  if (role === "admin") return "/admin";
  if (role === "employee") return "/employee";
  return "/account";
}

export async function redirectByRole() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!checkAccountStatus(profile)) redirect("/login?status=blocked");
  redirect(destinationForRole(profile.role));
}

export async function requireRole(allowed: AccountRole[]) {
  await requireAuthenticatedUser();
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!checkAccountStatus(profile)) redirect("/login?status=blocked");
  if (!allowed.includes(profile.role)) redirect(destinationForRole(profile.role));
  return profile;
}

export async function requireAdmin() { return requireRole(["admin"]); }
export async function requireEmployee() { return requireRole(["admin", "employee"]); }
export async function requireCustomerArea() { return requireRole(["admin", "customer"]); }
