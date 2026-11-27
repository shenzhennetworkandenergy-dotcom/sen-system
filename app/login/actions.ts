"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPathForRole } from "@/lib/constants/routes";
import { writeAuditLog } from "@/lib/audit/log";
import { safeEpsProductResume } from "@/lib/orders/eps-product-checkout";

export async function loginAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeEpsProductResume(formData.get("next"));
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const query = new URLSearchParams({ error: error.message });
    if (next) query.set("next", next);
    redirect(`/login?${query}`);
  }
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
  revalidatePath("/employee", "layout");
  revalidatePath("/account", "layout");
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("id,role,status,archived_at").eq("id", user?.id).maybeSingle();
  if (profile) await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "auth.login", module: "auth", entityType: "profile", entityId: profile.id, targetProfileId: profile.id, description: "User signed in." });
  if (next && profile?.status === "active" && !profile.archived_at && ["customer", "admin"].includes(profile.role)) redirect(next);
  redirect(dashboardPathForRole(profile?.role));
}
