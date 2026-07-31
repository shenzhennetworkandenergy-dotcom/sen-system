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
import { requirePermission } from "@/lib/auth/permissions";
import { normalizeCurrencyCode } from "@/lib/currency/currencies";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const path = "/admin/accounting";
const destination = (kind: "success" | "error", message: string, selectedDate?: string) => {
  const params = new URLSearchParams({ [kind]: message });
  if (selectedDate) params.set("cashbook_date", normalizeCashbookDate(selectedDate));
  return `${path}?${params.toString()}`;
};

export async function setCashbookOpeningBalanceAction(form: FormData) {
  const { profile } = await requirePermission("accounting.create_entry");
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
    console.error("Cashbook opening balance update failed", { message: error instanceof Error ? error.message : "Unknown error" });
    failure = error instanceof Error && /opening|cash|balance|closed|zero/i.test(error.message)
      ? error.message
      : "Unable to save the opening cash balance.";
  }
  if (failure) redirect(destination("error", failure, selectedDate));
  revalidatePath(path);
  redirect(destination("success", "Opening cash balance saved.", selectedDate));
}

export async function closeCashbookDayAction(form: FormData) {
  const { profile } = await requirePermission("accounting.create_entry");
  const selectedDate = normalizeCashbookDate(form.get("cashbook_date"));
  let failure: string | null = null;
  try {
    const { error } = await createSupabaseAdminClient().rpc("close_cashbook_day", {
      actor_profile_id: profile.id,
      requested_business_date: selectedDate,
    });
    if (error) throw error;
  } catch (error) {
    console.error("Cashbook day close failed", { message: error instanceof Error ? error.message : "Unknown error" });
    failure = error instanceof Error && /cashbook|closed|date|balance/i.test(error.message)
      ? error.message
      : "Unable to close this cashbook day.";
  }
  if (failure) redirect(destination("error", failure, selectedDate));
  revalidatePath(path);
  redirect(destination("success", "Cashbook day closed successfully.", selectedDate));
}

export async function createCashbookDescriptionAction(form: FormData) {
  const { profile } = await requirePermission("accounting.create_entry");
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
    console.error("Cashbook description creation failed", { message: error instanceof Error ? error.message : "Unknown error" });
    failure = error instanceof Error && /description|খাত|income|expense|already exists|character/i.test(error.message)
      ? error.message
      : "Unable to create the cashbook description.";
  }
  if (failure) redirect(destination("error", failure, selectedDate));
  revalidatePath(path);
  redirect(destination("success", "খাত/বিবরণ created successfully.", selectedDate));
}

export async function createCashbookEntryAction(form: FormData) {
  const { profile } = await requirePermission("accounting.create_entry");
  const selectedDate = normalizeCashbookDate(form.get("cashbook_date"));
  let failure: string | null = null;
  try {
    const input = normalizeCashbookEntryInput({
      descriptionId: form.get("description_id"),
      amount: form.get("amount"),
      paymentMethod: form.get("payment_method"),
      occurredAt: form.get("occurred_at"),
    });
    const { error } = await createSupabaseAdminClient().rpc("create_cashbook_entry", {
      actor_profile_id: profile.id,
      requested_description_id: input.descriptionId,
      requested_amount: input.amount,
      requested_payment_method: input.paymentMethod,
      requested_occurred_at: input.occurredAt ? toCashbookTimestamp(input.occurredAt, selectedDate) : null,
      requested_business_date: selectedDate,
    });
    if (error) throw error;
  } catch (error) {
    console.error("Cashbook entry creation failed", { message: error instanceof Error ? error.message : "Unknown error" });
    failure = error instanceof Error && /description|খাত|amount|payment|cash|bank|mfs|account|date|time/i.test(error.message)
      ? error.message
      : "Unable to save the cashbook entry.";
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
