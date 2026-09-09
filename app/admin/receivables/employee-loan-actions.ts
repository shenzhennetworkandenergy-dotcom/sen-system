"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/permissions";
import {
  EMPLOYEE_LOAN_DOCUMENT_BUCKET,
  normalizeApprovedEmployeeLoanTerms,
  assertUuid,
  validatePrivateLoanDocument,
} from "@/lib/receivables/employee-loans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const finish = (accountId: string, kind: "success" | "error", message: string): never => {
  revalidatePath(`/admin/receivables/loans/${accountId}`);
  revalidatePath(`/employee/loans/${accountId}`);
  redirect(`/admin/receivables/loans/${accountId}?${kind}=${encodeURIComponent(message)}`);
};

export async function finalizeEmployeeLoanTermsAction(form: FormData) {
  const { profile } = await requirePermission("receivables.approve");
  const accountId = value(form, "account_id");
  try {
    const input = normalizeApprovedEmployeeLoanTerms({
      approvedAmount: value(form, "approved_amount"), approvedPeriod: value(form, "approved_period"),
      approvedInstallments: value(form, "approved_installments"),
      approvedMonthlyInstallment: value(form, "approved_monthly_installment"),
      repaymentStartDate: value(form, "repayment_start_date"), purpose: value(form, "approved_purpose"),
      specialTerms: value(form, "special_terms"), adminNote: value(form, "admin_note"),
      agreementDate: value(form, "agreement_date"), agreementReference: value(form, "agreement_reference"),
      representativeProfileId: value(form, "representative_profile_id"),
    });
    const representativeProfileId = assertUuid(value(form, "representative_profile_id"), "SEN representative");
    const result = await createSupabaseAdminClient().rpc("finalize_employee_loan_terms", {
      actor_profile_id: profile.id, requested_account_id: accountId,
      requested_approved_amount: input.approvedAmount, requested_period: input.approvedPeriod,
      requested_installment_count: input.approvedInstallments,
      requested_installment_amount: input.approvedMonthlyInstallment,
      requested_start_date: input.repaymentStartDate, requested_purpose: input.purpose,
      requested_special_terms: input.specialTerms, requested_admin_note: input.adminNote,
      requested_agreement_date: input.agreementDate, requested_agreement_reference: input.agreementReference,
      requested_representative_profile_id: representativeProfileId,
    });
    if (result.error) throw new Error(result.error.message);
    finish(accountId, "success", "Preliminary approval completed and agreement generated from Admin-approved terms.");
  } catch (error) {
    finish(accountId, "error", error instanceof Error ? error.message : "Unable to finalize agreement terms.");
  }
}

export async function sendEmployeeLoanAgreementAction(form: FormData) {
  const { profile } = await requirePermission("receivables.approve");
  const accountId = value(form, "account_id");
  const result = await createSupabaseAdminClient().rpc("send_employee_loan_agreement", {
    actor_profile_id: profile.id, requested_account_id: accountId,
  });
  if (result.error) finish(accountId, "error", result.error.message);
  finish(accountId, "success", "Agreement sent to the employee for printing and signature.");
}

export async function finalApproveEmployeeLoanAction(form: FormData) {
  const { profile } = await requirePermission("receivables.approve");
  const accountId = value(form, "account_id");
  const result = await createSupabaseAdminClient().rpc("final_approve_employee_loan", {
    actor_profile_id: profile.id, requested_account_id: accountId,
  });
  if (result.error) finish(accountId, "error", result.error.message);
  finish(accountId, "success", "Signed agreement verified and loan final-approved for disbursement.");
}

export async function rejectEmployeeLoanApplicationAction(form: FormData) {
  const { profile } = await requirePermission("receivables.approve");
  const accountId = value(form, "account_id");
  const reason = value(form, "reason");
  if (reason.length < 2 || reason.length > 2000) finish(accountId, "error", "A rejection reason is required.");
  const result = await createSupabaseAdminClient().rpc("transition_receivable_account", {
    actor_profile_id: profile.id,
    requested_account_id: accountId,
    requested_operation_id: randomUUID(),
    requested_action: "reject",
    requested_approved_amount: null,
    requested_reason: reason,
  });
  if (result.error) finish(accountId, "error", result.error.message);
  finish(accountId, "success", "Employee loan application rejected.");
}

export async function disburseEmployeeLoanAction(form: FormData) {
  const { profile } = await requirePermission("receivables.disburse");
  const accountId = value(form, "account_id");
  const amount = Number(value(form, "disbursed_amount"));
  const effectiveDate = value(form, "disbursement_date");
  const paymentMethod = value(form, "payment_method");
  const paymentReference = value(form, "payment_reference");
  const accountReference = value(form, "payment_account_reference");
  const adminNote = value(form, "admin_note");
  const proof = form.get("disbursement_proof");
  const db = createSupabaseAdminClient();
  let proofPath: string | null = null;
  try {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Disbursed amount must be greater than zero.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error("Disbursement date is required.");
    if (!["cash", "bank", "mfs", "other"].includes(paymentMethod)) throw new Error("Choose a valid payment method.");
    if (paymentReference.length < 2 || paymentReference.length > 200) throw new Error("Payment reference is required.");
    let proofMetadata: ReturnType<typeof validatePrivateLoanDocument> | null = null;
    if (proof instanceof File && proof.size) {
      proofMetadata = validatePrivateLoanDocument(proof);
      proofPath = `admin/${accountId}/disbursement-proof/${randomUUID()}.${proofMetadata.extension}`;
      const upload = await db.storage.from(EMPLOYEE_LOAN_DOCUMENT_BUCKET)
        .upload(proofPath, await proof.arrayBuffer(), { contentType: proofMetadata.mimeType, upsert: false });
      if (upload.error) throw new Error("Unable to upload disbursement proof.");
    }
    const result = await db.rpc("confirm_employee_loan_disbursement", {
      actor_profile_id: profile.id, requested_account_id: accountId, requested_operation_id: randomUUID(),
      requested_amount: amount, requested_effective_date: effectiveDate, requested_payment_method: paymentMethod,
      requested_payment_reference: paymentReference, requested_account_reference: accountReference || null,
      requested_admin_note: adminNote || null, requested_proof_path: proofPath,
      requested_proof_name: proofMetadata?.originalName ?? null,
      requested_proof_mime: proofMetadata?.mimeType ?? null,
      requested_proof_size: proofMetadata?.size ?? null,
    });
    if (result.error) throw new Error(result.error.message);
    finish(accountId, "success", "Loan disbursement recorded with loan-owned payment details. Accounting and Cash Book were not posted.");
  } catch (error) {
    if (proofPath) await db.storage.from(EMPLOYEE_LOAN_DOCUMENT_BUCKET).remove([proofPath]);
    finish(accountId, "error", error instanceof Error ? error.message : "Unable to record disbursement.");
  }
}

export async function recordEmployeeLoanRepaymentAction(form: FormData) {
  const { profile } = await requirePermission("receivables.record_repayment");
  const accountId = value(form, "account_id");
  const amount = Number(value(form, "amount"));
  const effectiveDate = value(form, "effective_date");
  const paymentMethod = value(form, "payment_method");
  const note = value(form, "note");
  try {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Repayment amount must be greater than zero.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error("Repayment date is required.");
    if (!paymentMethod || paymentMethod.length > 80) throw new Error("Payment method is required.");
    const result = await createSupabaseAdminClient().rpc("record_receivable_repayment", {
      actor_profile_id: profile.id,
      requested_account_id: accountId,
      requested_operation_id: randomUUID(),
      requested_amount: amount,
      requested_effective_date: effectiveDate,
      requested_payment_method: paymentMethod,
      requested_note: note || null,
    });
    if (result.error) throw new Error(result.error.message);
    finish(accountId, "success", "Repayment recorded operationally. Accounting was not posted.");
  } catch (error) {
    finish(accountId, "error", error instanceof Error ? error.message : "Unable to record repayment.");
  }
}
