"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import {
  normalizeOpeningReceivableInput,
  normalizeRequestedReceivableInput,
  type OpeningReceivableInputDraft,
  type ReceivableInputDraft,
} from "@/lib/receivables/domain";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ReceivableActionState = {
  status: "idle" | "success" | "error";
  message: string;
  accountId?: string;
};

export const initialReceivableActionState: ReceivableActionState = {
  status: "idle",
  message: "",
};

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
