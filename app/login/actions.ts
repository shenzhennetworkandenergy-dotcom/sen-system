"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPathForRole } from "@/lib/constants/routes";
import { writeAuditLog } from "@/lib/audit/log";
import { backendMode } from "@/lib/backend/config";
import { authenticateLocal, createLocalSession } from "@/lib/auth/local-session";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (backendMode() === "native") {
    let local;
    try {
      local = await authenticateLocal(email, password);
      await createLocalSession(local.profile.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in.";
      redirect(`/login?error=${encodeURIComponent(message)}`);
    }
    revalidatePath("/", "layout");
    await writeAuditLog({ actorId: local.profile.id, actorRole: local.profile.role, action: "auth.login", module: "auth", entityType: "profile", entityId: local.profile.id, targetProfileId: local.profile.id, description: "User signed in locally." });
    redirect(dashboardPathForRole(local.profile.role));
  }
  const supabase = await createSupabaseServerClient();
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
