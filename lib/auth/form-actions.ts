"use server";

import { redirect } from "next/navigation";

import { destinationForRole } from "@/lib/auth/destinations";
import { getCurrentProfile } from "@/lib/auth/profile";
import { routes } from "@/lib/constants/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signInWithPassword({ email, password });
  const profile = await getCurrentProfile(supabase);
  if (!profile) { await supabase.auth.signOut(); redirect(`${routes.login}?status=missing-profile`); }
  if (profile.status !== "active") redirect(`${routes.login}?status=${profile.status}`);
  redirect(destinationForRole(profile.role));
}

export async function registerAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signUp({ email, password });
  redirect(routes.account);
}
