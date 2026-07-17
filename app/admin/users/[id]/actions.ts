"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth/session";

export async function updateUserAction(userId: string, formData: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const role = String(formData.get("role"));
  const status = String(formData.get("status"));
  const supabase = createSupabaseAdminClient();
  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("status", "active");
  if (profile.id === userId && (role !== "admin" || status !== "active") && (count ?? 0) <= 1) throw new Error("Cannot remove or suspend the final active admin.");
  await supabase.from("profiles").update({ role, status }).eq("id", userId);
  await supabase.from("audit_logs").insert({ actor_id: profile.id, target_profile_id: userId, action: "profile.updated", metadata: { role, status } });
  revalidatePath(`/admin/users/${userId}`);
}
