"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const path = "/admin/accounting";
const destination = (kind: "success" | "error", message: string) => `${path}?${kind}=${encodeURIComponent(message)}`;

export async function createJournalAction(form: FormData) {
  const { profile } = await requirePermission("accounting.create_entry");
  let failure: string | null = null;
  try {
    const lines = JSON.parse(String(form.get("lines") ?? "[]")) as unknown;
    const { error } = await createSupabaseAdminClient().rpc("create_journal_entry", {
      actor_profile_id: profile.id,
      requested_date: String(form.get("entry_date") ?? ""),
      requested_description: String(form.get("description") ?? "").trim(),
      requested_reference_type: "manual",
      requested_reference_id: null,
      requested_currency: String(form.get("currency") ?? "BDT").toUpperCase(),
      requested_lines: lines,
    });
    if (error) throw error;
  } catch (error) {
    console.error("Journal creation failed", { message: error instanceof Error ? error.message : "Unknown error" });
    failure = error instanceof Error && /journal|debit|credit|account|description/i.test(error.message) ? error.message : "Unable to create journal entry.";
  }
  if (failure) redirect(destination("error", failure));
  revalidatePath(path);
  redirect(destination("success", "Draft journal entry created."));
}

export async function postJournalAction(entryId: string) {
  const { profile } = await requirePermission("accounting.approve_entry");
  const { error } = await createSupabaseAdminClient().rpc("post_journal_entry", { actor_profile_id: profile.id, requested_entry_id: entryId });
  if (error) {
    console.error("Journal posting failed", { code: error.code, message: error.message });
    redirect(destination("error", "Unable to post this journal entry."));
  }
  revalidatePath(path);
  redirect(destination("success", "Journal entry posted."));
}
