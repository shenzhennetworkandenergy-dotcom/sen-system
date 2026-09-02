"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseCashbookAuditDate } from "@/lib/accounting/audit";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const listPath = "/admin/accounting/audit";
const accountingPath = "/admin/accounting";

function detailPath(date: string) {
  return `${listPath}/${encodeURIComponent(date)}`;
}

function redirectError(date: string | null, message: string): never {
  const target = date ? detailPath(date) : listPath;
  redirect(`${target}?error=${encodeURIComponent(message)}`);
}

function safeRpcMessage(message: string | undefined, fallback: string) {
  return message && /cashbook|closed|pending|audit|correction|reason|date|permission|comment/i.test(message) ? message : fallback;
}

export async function approveCashbookAuditAction(form: FormData) {
  const { profile } = await requirePermission("accounting.audit_cashbook");
  const date = parseCashbookAuditDate(form.get("business_date"));
  if (!date) redirectError(null, "A valid business date is required.");
  const comment = String(form.get("review_comment") ?? "").trim();
  if (comment.length > 1000) redirectError(date, "Review comment cannot exceed 1000 characters.");

  const { error } = await createSupabaseAdminClient().rpc("approve_cashbook_audit", {
    actor_profile_id: profile.id,
    requested_business_date: date,
    requested_comment: comment || null,
  });
  if (error) redirectError(date, safeRpcMessage(error.message, "Unable to approve this cashbook audit."));

  revalidatePath(listPath);
  revalidatePath(detailPath(date));
  revalidatePath(accountingPath);
  redirect(`${detailPath(date)}?success=${encodeURIComponent("Cashbook audit approved.")}`);
}

export async function requestCashbookCorrectionAction(form: FormData) {
  const { profile } = await requirePermission("accounting.audit_cashbook");
  const date = parseCashbookAuditDate(form.get("business_date"));
  if (!date) redirectError(null, "A valid business date is required.");
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) redirectError(date, "Correction reason is required.");
  if (reason.length > 1000) redirectError(date, "Correction reason cannot exceed 1000 characters.");

  const { error } = await createSupabaseAdminClient().rpc("request_cashbook_correction", {
    actor_profile_id: profile.id,
    requested_business_date: date,
    requested_reason: reason,
  });
  if (error) redirectError(date, safeRpcMessage(error.message, "Unable to request correction."));

  revalidatePath(listPath);
  revalidatePath(detailPath(date));
  revalidatePath(accountingPath);
  redirect(`${detailPath(date)}?success=${encodeURIComponent("Correction requested.")}`);
}
