"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPathForRole } from "@/lib/constants/routes";
import { writeAuditLog } from "@/lib/audit/log";

export async function loginAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
  revalidatePath("/employee", "layout");
  revalidatePath("/account", "layout");
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("id,role,status").eq("id", user?.id).maybeSingle();
  if (profile) await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "auth.login", module: "auth", entityType: "profile", entityId: profile.id, targetProfileId: profile.id, description: "User signed in." });
  redirect(dashboardPathForRole(profile?.role));
}
