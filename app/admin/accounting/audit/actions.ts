"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseCashbookAuditDate, parseCashbookDayId } from "@/lib/accounting/audit";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const listPath = "/admin/accounting/audit";
const accountingPath = "/admin/accounting";

function detailRoute(date: string) {
  return `${listPath}/${encodeURIComponent(date)}`;
}

function detailPath(dayId: string, date: string) {
  return `${detailRoute(date)}?day=${encodeURIComponent(dayId)}`;
}

function redirectError(dayId: string | null, date: string | null, message: string): never {
  const target = dayId && date
    ? `${detailPath(dayId, date)}&error=${encodeURIComponent(message)}`
    : `${listPath}?error=${encodeURIComponent(message)}`;
  redirect(target);
}

function safeRpcMessage(message: string | undefined, fallback: string) {
  return message && /cashbook|closed|pending|audit|correction|reason|date|permission|comment/i.test(message) ? message : fallback;
}

export async function approveCashbookAuditAction(form: FormData) {
  const { profile } = await requirePermission("accounting.audit_cashbook");
  const cashbookDayId = parseCashbookDayId(form.get("cashbook_day_id"));
  const date = parseCashbookAuditDate(form.get("business_date"));
  const version = String(form.get("statement_version") ?? "");
  if (!cashbookDayId || !date) redirectError(null, null, "A valid cashbook day and business date are required.");
  const comment = String(form.get("review_comment") ?? "").trim();
  if (comment.length > 1000) redirectError(cashbookDayId, date, "Review comment cannot exceed 1000 characters.");

  const { error } = await createSupabaseAdminClient().rpc("review_cashbook_submission", {
    actor_profile_id: profile.id,
    requested_cashbook_day_id: cashbookDayId,
    expected_updated_at: version || null,
    requested_decision: "APPROVE",
    requested_note: comment || null,
  });
  if (error) redirectError(cashbookDayId, date, safeRpcMessage(error.message, "Unable to approve this cashbook audit."));

  revalidatePath(listPath);
  revalidatePath(detailRoute(date));
  revalidatePath(accountingPath);
  redirect(`${detailPath(cashbookDayId, date)}&success=${encodeURIComponent("Cashbook audit approved.")}`);
}

export async function requestCashbookCorrectionAction(form: FormData) {
  const { profile } = await requirePermission("accounting.audit_cashbook");
  const cashbookDayId = parseCashbookDayId(form.get("cashbook_day_id"));
  const date = parseCashbookAuditDate(form.get("business_date"));
  const version = String(form.get("statement_version") ?? "");
  if (!cashbookDayId || !date) redirectError(null, null, "A valid cashbook day and business date are required.");
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) redirectError(cashbookDayId, date, "Correction reason is required.");
  if (reason.length > 1000) redirectError(cashbookDayId, date, "Correction reason cannot exceed 1000 characters.");

  const { error } = await createSupabaseAdminClient().rpc("review_cashbook_submission", {
    actor_profile_id: profile.id,
    requested_cashbook_day_id: cashbookDayId,
    expected_updated_at: version || null,
    requested_decision: "RETURN",
    requested_note: reason,
  });
  if (error) redirectError(cashbookDayId, date, safeRpcMessage(error.message, "Unable to request correction."));

  revalidatePath(listPath);
  revalidatePath(detailRoute(date));
  revalidatePath(accountingPath);
  redirect(`${detailPath(cashbookDayId, date)}&success=${encodeURIComponent("Cashbook day returned to its owner for correction.")}`);
}
