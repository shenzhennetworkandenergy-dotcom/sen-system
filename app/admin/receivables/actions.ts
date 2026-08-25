"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import type { ReceivableActionState } from "@/lib/receivables/action-state";
import {
  normalizeOpeningReceivableInput,
  normalizeRequestedReceivableInput,
  type OpeningReceivableInputDraft,
  type ReceivableInputDraft,
} from "@/lib/receivables/domain";
import {
  normalizeAdjustmentInput,
  normalizeDisbursementInput,
  normalizeInstallmentScheduleInput,
  normalizeLifecycleInput,
  normalizeRepaymentInput,
  normalizeReversalInput,
} from "@/lib/receivables/non-sales";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function value(form: FormData, key: string) {
  return form.get(key) ?? "";
}

function baseDraft(form: FormData): ReceivableInputDraft {
  return {
    operationId: value(form, "operation_id"),
    category: value(form, "category"),
    borrowerType: value(form, "borrower_type"),
    borrowerId: value(form, "borrower_id"),
    externalPartyType: value(form, "external_party_type"),
    externalPartyDisplayName: value(form, "external_party_display_name"),
    externalPartyCompanyName: value(form, "external_party_company_name"),
    externalPartyPhone: value(form, "external_party_phone"),
    externalPartyEmail: value(form, "external_party_email"),
    externalPartyReference: value(form, "external_party_reference"),
    externalPartyNotes: value(form, "external_party_notes"),
    originalAmount: value(form, "original_amount"),
    currency: value(form, "currency"),
    defaultRepaymentMethod: value(form, "default_repayment_method"),
    installmentCount: value(form, "installment_count"),
    installmentAmount: value(form, "installment_amount"),
    firstDueDate: value(form, "first_due_date"),
    finalDueDate: value(form, "final_due_date"),
    notes: value(form, "notes"),
  };
}

function externalPartyPayload(
  input: Pick<ReturnType<typeof normalizeRequestedReceivableInput>, "externalParty">,
) {
  if (!input.externalParty) return {};
  return {
    party_type: input.externalParty.partyType,
    display_name: input.externalParty.displayName,
    company_name: input.externalParty.companyName,
    phone: input.externalParty.phone,
    email: input.externalParty.email,
    external_reference: input.externalParty.externalReference,
    notes: input.externalParty.notes,
  };
}

function refreshReceivableRoutes() {
  revalidatePath("/admin/receivables");
  revalidatePath("/admin/receivables/customers");
  revalidatePath("/admin/receivables/loans");
}

function refreshReceivableDetail(accountId: string) {
  refreshReceivableRoutes();
  revalidatePath("/admin/receivables/loans/" + accountId);
}

function errorState(error: unknown, fallback: string): ReceivableActionState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : fallback,
  };
}

export async function createRequestedReceivableAction(
  _previous: ReceivableActionState,
  form: FormData,
): Promise<ReceivableActionState> {
  const { profile } = await requirePermission("receivables.create");
  let input: ReturnType<typeof normalizeRequestedReceivableInput>;
  try {
    input = normalizeRequestedReceivableInput(baseDraft(form));
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Check the receivable details.",
    };
  }
  const { data, error } = await createSupabaseAdminClient().rpc("create_receivable_account", {
    actor_profile_id: profile.id,
    requested_operation_id: input.operationId,
    requested_category: input.category,
    requested_borrower_type: input.borrowerType,
    requested_borrower_id: input.borrowerId,
    requested_external_party: externalPartyPayload(input),
    requested_original_amount: input.originalAmount,
    requested_currency: input.currency,
    requested_default_repayment_method: input.defaultRepaymentMethod,
    requested_installment_count: input.installmentCount,
    requested_installment_amount: input.installmentAmount,
    requested_first_due_date: input.firstDueDate,
    requested_final_due_date: input.finalDueDate,
    requested_notes: input.notes,
  });
  if (error || !data) {
    console.error("Requested receivable RPC failed", {
      code: error?.code,
      message: error?.message,
    });
    return { status: "error", message: "Unable to create the receivable account." };
  }
  refreshReceivableRoutes();
  return {
    status: "success",
    message: "Receivable request created. No financial posting was made.",
    accountId: String(data),
  };
}

export async function createOpeningReceivableAction(
  _previous: ReceivableActionState,
  form: FormData,
): Promise<ReceivableActionState> {
  const { profile } = await requirePermission("receivables.manage_opening");
  const draft: OpeningReceivableInputDraft = {
    ...baseDraft(form),
    previouslyRepaidAmount: value(form, "previously_repaid_amount"),
    openingOutstandingAmount: value(form, "opening_outstanding_amount"),
    asOfDate: value(form, "as_of_date"),
  };
  let input: ReturnType<typeof normalizeOpeningReceivableInput>;
  try {
    input = normalizeOpeningReceivableInput(draft);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Check the opening balance details.",
    };
  }
  const { data, error } = await createSupabaseAdminClient().rpc("create_opening_receivable", {
    actor_profile_id: profile.id,
    requested_operation_id: input.operationId,
    requested_category: input.category,
    requested_borrower_type: input.borrowerType,
    requested_borrower_id: input.borrowerId,
    requested_external_party: externalPartyPayload(input),
    requested_original_amount: input.originalAmount,
    requested_previously_repaid: input.previouslyRepaidAmount,
    requested_opening_outstanding: input.openingOutstandingAmount,
    requested_as_of_date: input.asOfDate,
    requested_currency: input.currency,
    requested_default_repayment_method: input.defaultRepaymentMethod,
    requested_installment_count: input.installmentCount,
    requested_installment_amount: input.installmentAmount,
    requested_first_due_date: input.firstDueDate,
    requested_final_due_date: input.finalDueDate,
    requested_notes: input.notes,
  });
  if (error || !data) {
    console.error("Opening receivable RPC failed", {
      code: error?.code,
      message: error?.message,
    });
    return { status: "error", message: "Unable to create the opening receivable." };
  }
  refreshReceivableRoutes();
  return {
    status: "success",
    message: "Opening receivable created without a historical cashbook or journal entry.",
    accountId: String(data),
  };
}

export async function updateReceivableScheduleAction(
  _previous: ReceivableActionState,
  form: FormData,
): Promise<ReceivableActionState> {
  const { profile } = await requirePermission("receivables.create");
  let input: ReturnType<typeof normalizeInstallmentScheduleInput>;
  try {
    input = normalizeInstallmentScheduleInput({
      accountId: value(form, "account_id"),
      operationId: value(form, "operation_id"),
      installmentCount: value(form, "installment_count"),
      installmentAmount: value(form, "installment_amount"),
      firstDueDate: value(form, "first_due_date"),
    });
  } catch (error) {
    return errorState(error, "Check the installment schedule.");
  }
  const { data, error } = await createSupabaseAdminClient().rpc(
    "set_receivable_installment_schedule",
    {
      actor_profile_id: profile.id,
      requested_account_id: input.accountId,
      requested_operation_id: input.operationId,
      requested_count: input.installmentCount,
      requested_installment_amount: input.installmentAmount,
      requested_first_due_date: input.firstDueDate,
    },
  );
  if (error || !data) return errorState(null, "Unable to update the installment schedule.");
  refreshReceivableDetail(input.accountId);
  return {
    status: "success",
    message: "Installment schedule updated before approval.",
    accountId: String(data),
  };
}

export async function transitionReceivableAction(
  _previous: ReceivableActionState,
  form: FormData,
): Promise<ReceivableActionState> {
  let input: ReturnType<typeof normalizeLifecycleInput>;
  try {
    input = normalizeLifecycleInput({
      accountId: value(form, "account_id"),
      operationId: value(form, "operation_id"),
      action: value(form, "lifecycle_action"),
      approvedAmount: value(form, "approved_amount"),
      reason: value(form, "reason"),
    });
  } catch (error) {
    return errorState(error, "Check the lifecycle action.");
  }
  const { profile } = input.action === "submit_review"
    ? await requirePermission("receivables.create")
    : await requirePermission("receivables.approve");
  const { data, error } = await createSupabaseAdminClient().rpc(
    "transition_receivable_account",
    {
      actor_profile_id: profile.id,
      requested_account_id: input.accountId,
      requested_operation_id: input.operationId,
      requested_action: input.action,
      requested_approved_amount: input.approvedAmount,
      requested_reason: input.reason,
    },
  );
  if (error || !data) return errorState(null, "Unable to update the receivable lifecycle.");
  refreshReceivableDetail(input.accountId);
  return {
    status: "success",
    message: input.action === "approve"
      ? "Receivable approved. No balance or Accounting movement was created."
      : "Receivable lifecycle updated.",
    accountId: String(data),
  };
}

export async function confirmReceivableDisbursementAction(
  _previous: ReceivableActionState,
  form: FormData,
): Promise<ReceivableActionState> {
  const { profile } = await requirePermission("receivables.disburse");
  let input: ReturnType<typeof normalizeDisbursementInput>;
  try {
    input = normalizeDisbursementInput({
      accountId: value(form, "account_id"),
      operationId: value(form, "operation_id"),
      amount: value(form, "amount"),
      effectiveDate: value(form, "effective_date"),
      paymentMethod: value(form, "payment_method"),
      note: value(form, "note"),
    });
  } catch (error) {
    return errorState(error, "Check the disbursement details.");
  }
  const { data, error } = await createSupabaseAdminClient().rpc(
    "confirm_receivable_disbursement",
    {
      actor_profile_id: profile.id,
      requested_account_id: input.accountId,
      requested_operation_id: input.operationId,
      requested_amount: input.amount,
      requested_effective_date: input.effectiveDate,
      requested_payment_method: input.paymentMethod,
      requested_note: input.note,
    },
  );
  if (error || !data) return errorState(null, "Unable to record the disbursement.");
  refreshReceivableDetail(input.accountId);
  return {
    status: "success",
    message: "Disbursement recorded operationally. Accounting was not posted.",
    accountId: input.accountId,
    transactionId: String(data),
  };
}

export async function recordReceivableRepaymentAction(
  _previous: ReceivableActionState,
  form: FormData,
): Promise<ReceivableActionState> {
  const { profile } = await requirePermission("receivables.record_repayment");
  let input: ReturnType<typeof normalizeRepaymentInput>;
  try {
    input = normalizeRepaymentInput({
      accountId: value(form, "account_id"),
      operationId: value(form, "operation_id"),
      amount: value(form, "amount"),
      effectiveDate: value(form, "effective_date"),
      paymentMethod: value(form, "payment_method"),
      note: value(form, "note"),
    });
  } catch (error) {
    return errorState(error, "Check the repayment details.");
  }
  const { data, error } = await createSupabaseAdminClient().rpc(
    "record_receivable_repayment",
    {
      actor_profile_id: profile.id,
      requested_account_id: input.accountId,
      requested_operation_id: input.operationId,
      requested_amount: input.amount,
      requested_effective_date: input.effectiveDate,
      requested_payment_method: input.paymentMethod,
      requested_note: input.note,
    },
  );
  if (error || !data) return errorState(null, "Unable to record the repayment.");
  refreshReceivableDetail(input.accountId);
  return {
    status: "success",
    message: "Repayment recorded operationally. Accounting was not posted.",
    accountId: input.accountId,
    transactionId: String(data),
  };
}

export async function recordReceivableAdjustmentAction(
  _previous: ReceivableActionState,
  form: FormData,
): Promise<ReceivableActionState> {
  const { profile } = await requirePermission("receivables.adjust");
  let input: ReturnType<typeof normalizeAdjustmentInput>;
  try {
    input = normalizeAdjustmentInput({
      accountId: value(form, "account_id"),
      operationId: value(form, "operation_id"),
      direction: value(form, "direction"),
      amount: value(form, "amount"),
      effectiveDate: value(form, "effective_date"),
      reason: value(form, "reason"),
      hasApprovedSchedule: value(form, "has_approved_schedule") === "true",
    });
  } catch (error) {
    return errorState(error, "Check the adjustment details.");
  }
  const { data, error } = await createSupabaseAdminClient().rpc(
    "record_receivable_adjustment",
    {
      actor_profile_id: profile.id,
      requested_account_id: input.accountId,
      requested_operation_id: input.operationId,
      requested_direction: input.direction,
      requested_amount: input.amount,
      requested_effective_date: input.effectiveDate,
      requested_reason: input.reason,
    },
  );
  if (error || !data) return errorState(null, "Unable to record the adjustment.");
  refreshReceivableDetail(input.accountId);
  return {
    status: "success",
    message: "Adjustment recorded in the immutable operational history.",
    accountId: input.accountId,
    transactionId: String(data),
  };
}

export async function reverseReceivableTransactionAction(
  _previous: ReceivableActionState,
  form: FormData,
): Promise<ReceivableActionState> {
  const { profile } = await requirePermission("receivables.adjust");
  let input: ReturnType<typeof normalizeReversalInput>;
  try {
    input = normalizeReversalInput({
      accountId: value(form, "account_id"),
      transactionId: value(form, "transaction_id"),
      operationId: value(form, "operation_id"),
      effectiveDate: value(form, "effective_date"),
      reason: value(form, "reason"),
    });
  } catch (error) {
    return errorState(error, "Check the reversal details.");
  }
  const { data, error } = await createSupabaseAdminClient().rpc(
    "reverse_receivable_transaction",
    {
      actor_profile_id: profile.id,
      requested_account_id: input.accountId,
      requested_transaction_id: input.transactionId,
      requested_operation_id: input.operationId,
      requested_effective_date: input.effectiveDate,
      requested_reason: input.reason,
    },
  );
  if (error || !data) return errorState(null, "Unable to reverse the transaction.");
  refreshReceivableDetail(input.accountId);
  return {
    status: "success",
    message: "A correcting reversal was recorded. The original transaction was preserved.",
    accountId: input.accountId,
    transactionId: String(data),
  };
}
