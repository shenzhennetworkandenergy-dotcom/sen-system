"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function text(form: FormData, name: string, max: number) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

export async function reportWorkAssignmentAction(form: FormData) {
  const { profile } = await requireProfile(["employee"]);
  const id = text(form, "assignment_id", 80);
  const status = text(form, "status", 32);
  if (!id || !["COMPLETED", "UNABLE_TO_COMPLETE"].includes(status)) redirect("/employee/work?error=Invalid%20work%20report");
  const db = createSupabaseAdminClient();
  const { data: assignment } = await db.from("work_scheduler_assignments").select("id,status,effective_profile_id").eq("id", id).eq("effective_profile_id", profile.id).maybeSingle();
  if (!assignment || assignment.status !== "PENDING") redirect("/employee/work?error=This%20assignment%20is%20already%20closed");
  const { error } = await db.from("work_scheduler_assignments").update({ status, report_note: text(form, "report_note", 2000) || null, reported_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("effective_profile_id", profile.id).eq("status", "PENDING");
  if (error) redirect(`/employee/work?error=${encodeURIComponent("Unable to save the work report.")}`);
  revalidatePath("/employee/work");
  redirect("/employee/work?success=Work%20report%20saved");
}
