"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  normalizeCashbookDate,
  normalizeCashbookDescriptionInput,
  normalizeCashbookEntryInput,
  normalizeOpeningBalance,
  toCashbookTimestamp,
} from "@/lib/accounting/cashbook";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { requireProfile } from "@/lib/auth/session";
import { normalizeCurrencyCode } from "@/lib/currency/currencies";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const path = "/admin/accounting";
const cashbookEditPermissions = ["accounting.create_entry", "accounting.manage_cashbook"];
const destination = (kind: "success" | "error", message: string, selectedDate?: string) => {
  const params = new URLSearchParams({ [kind]: message });
  if (selectedDate) params.set("cashbook_date", normalizeCashbookDate(selectedDate));
  return `${path}?${params.toString()}`;
};

const actionErrorMessage = (error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const normalized = message.trim();
  if (!normalized) return null;
  if (/permission denied/i.test(normalized)) return "You do not have permission to add entries to this cashbook.";
  if (/inactive actor/i.test(normalized)) return "Your account is inactive. Ask an administrator to reactivate it.";
  if (/schema cache|could not find the function/i.test(normalized)) return "The cashbook service is not ready. Ask an administrator to check the local database setup.";
  return normalized;
};

export async function setCashbookOpeningBalanceAction(form: FormData) {
  const { profile } = await requireAnyPermission(cashbookEditPermissions);
  const selectedDate = normalizeCashbookDate(form.get("cashbook_date"));
  let failure: string | null = null;
  try {
    const openingBalance = normalizeOpeningBalance(form.get("opening_balance"));
    const { error } = await createSupabaseAdminClient().rpc("set_cashbook_opening_balance", {
      actor_profile_id: profile.id,
      requested_business_date: selectedDate,
      requested_opening_balance: openingBalance,
    });
    if (error) throw error;
  } catch (error) {
    const message = actionErrorMessage(error);
    console.error("Cashbook opening balance update failed", { message: message ?? "No error details returned" });
    failure = message ?? "The opening balance was not saved because the server returned no error details. Please contact an administrator.";
  }
  if (failure) redirect(destination("error", failure, selectedDate));
  revalidatePath(path);
  redirect(destination("success", "Opening cash balance saved.", selectedDate));
}

export async function closeCashbookDayAction(form: FormData) {
  const { profile } = await requireAnyPermission(cashbookEditPermissions);
  const selectedDate = normalizeCashbookDate(form.get("cashbook_date"));
  let failure: string | null = null;
  try {
    const { error } = await createSupabaseAdminClient().rpc("close_cashbook_day", {
      actor_profile_id: profile.id,
      requested_business_date: selectedDate,
    });
    if (error) throw error;
  } catch (error) {
    const message = actionErrorMessage(error);
    console.error("Cashbook day close failed", { message: message ?? "No error details returned" });
    failure = message ?? "The cashbook day was not closed because the server returned no error details. Please contact an administrator.";
  }
  if (failure) redirect(destination("error", failure, selectedDate));
  revalidatePath(path);
  redirect(destination("success", "Cashbook day closed successfully.", selectedDate));
}

export async function createCashbookDescriptionAction(form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const selectedDate = normalizeCashbookDate(form.get("cashbook_date"));
  let failure: string | null = null;
  try {
    const input = normalizeCashbookDescriptionInput({
      name: form.get("name"),
      transactionType: form.get("transaction_type"),
    });
    const { error } = await createSupabaseAdminClient().rpc("create_cashbook_description", {
      actor_profile_id: profile.id,
      requested_name: input.name,
      requested_transaction_type: input.transactionType,
    });
    if (error) throw error;
  } catch (error) {
    const message = actionErrorMessage(error);
    console.error("Cashbook description creation failed", { message: message ?? "No error details returned" });
    failure = message ?? "The cashbook description was not created because the server returned no error details. Please contact an administrator.";
  }
  if (failure) redirect(destination("error", failure, selectedDate));
  revalidatePath(path);
  redirect(destination("success", "খাত/বিবরণ created successfully.", selectedDate));
}

export async function createCashbookEntryAction(form: FormData) {
  const { profile } = await requireAnyPermission(cashbookEditPermissions);
  const selectedDate = normalizeCashbookDate(form.get("cashbook_date"));
  let failure: string | null = null;
  try {
    const input = normalizeCashbookEntryInput({
      descriptionId: form.get("description_id"),
      remark: form.get("remark"),
      amount: form.get("amount"),
      paymentMethod: form.get("payment_method"),
      occurredAt: form.get("occurred_at"),
    });
    const { error } = await createSupabaseAdminClient().rpc("create_cashbook_entry", {
      actor_profile_id: profile.id,
      requested_description_id: input.descriptionId,
      requested_remark: input.remark,
      requested_amount: input.amount,
      requested_payment_method: input.paymentMethod,
      requested_occurred_at: input.occurredAt ? toCashbookTimestamp(input.occurredAt, selectedDate) : null,
      requested_business_date: selectedDate,
    });
    if (error) throw error;
  } catch (error) {
    const message = actionErrorMessage(error);
    console.error("Cashbook entry creation failed", { message: message ?? "No error details returned" });
    failure = message ?? "The cashbook entry was not saved because the server returned no error details. Please contact an administrator.";
  }
  if (failure) redirect(destination("error", failure, selectedDate));
  revalidatePath(path);
  redirect(destination("success", "Cashbook entry saved and posted to the ledger.", selectedDate));
}

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
      requested_currency: normalizeCurrencyCode(form.get("currency") ?? "BDT"),
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
