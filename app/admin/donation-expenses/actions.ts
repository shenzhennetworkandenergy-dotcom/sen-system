"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BENEFICIARY_TYPES, DONATION_BUCKET, RELATIONSHIP_GROUPS } from "@/lib/donation-expenses/data";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const nullable = (value: string) => value || null;
const message = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
function finish(path: string, kind: "success" | "error", value: string): never {
  revalidatePath("/admin/donation-expenses");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(value)}`);
}

async function runMasterInsert(table: "donation_relationship_types" | "donation_expense_categories" | "donation_payment_methods", form: FormData, returnTo: string) {
  await requireProfile(["admin"]);
  const name = text(form, "name");
  if (!name) finish(returnTo, "error", "Name is required.");
  const db = createSupabaseAdminClient();
  const { error } = await db.from(table).insert({ name });
  if (error) finish(returnTo, "error", error.code === "23505" ? "That name already exists." : error.message);
  finish(returnTo, "success", "Saved.");
}

export async function addDonationRelationshipTypeAction(form: FormData) {
  return runMasterInsert("donation_relationship_types", form, "/admin/donation-expenses/beneficiaries");
}
export async function addDonationCategoryAction(form: FormData) {
  return runMasterInsert("donation_expense_categories", form, "/admin/donation-expenses");
}
export async function addDonationPaymentMethodAction(form: FormData) {
  return runMasterInsert("donation_payment_methods", form, "/admin/donation-expenses");
}

function beneficiaryFormValues(form: FormData) {
  return {
    beneficiary_type: text(form, "beneficiary_type"),
    name: text(form, "name"),
    phone: text(form, "phone"),
    alternate_phone: text(form, "alternate_phone"),
    whatsapp: text(form, "whatsapp"),
    city_district: text(form, "city_district"),
    country: text(form, "country"),
    address: text(form, "address"),
    relationship_group: text(form, "relationship_group"),
    relationship_type_id: text(form, "relationship_type_id"),
    relationship_note: text(form, "relationship_note"),
    referred_by_name: text(form, "referred_by_name"),
    referred_by_phone: text(form, "referred_by_phone"),
    referred_by_note: text(form, "referred_by_note"),
    notes: text(form, "notes"),
    monthly_support_enabled: text(form, "monthly_support_enabled") === "on",
    default_monthly_amount: text(form, "default_monthly_amount"),
    reminder_day_of_month: text(form, "reminder_day_of_month"),
    support_start_date: text(form, "support_start_date"),
    support_end_date: text(form, "support_end_date"),
    default_category_id: text(form, "default_category_id"),
    default_payment_method_id: text(form, "default_payment_method_id"),
    default_purpose: text(form, "default_purpose"),
  };
}

export async function createDonationBeneficiaryAction(
  previousState: { revision: number },
  form: FormData,
) {
  const { profile } = await requireProfile(["admin"]);
  const values = beneficiaryFormValues(form);
  const failure = (error: string, field: string) => ({
    error,
    field,
    values,
    revision: previousState.revision + 1,
  });
  const beneficiaryType = values.beneficiary_type;
  const name = values.name;
  const relationshipGroup = values.relationship_group;
  if (!(BENEFICIARY_TYPES as readonly string[]).includes(beneficiaryType)) return failure("Valid beneficiary type is required.", "beneficiary_type");
  if (!name) return failure("Beneficiary name is required.", "name");
  if (relationshipGroup && !(RELATIONSHIP_GROUPS as readonly string[]).includes(relationshipGroup)) return failure("Valid relationship group is required.", "relationship_group");

  const enabled = values.monthly_support_enabled;
  const amountText = values.default_monthly_amount;
  const amount = amountText ? Number(amountText) : null;
  const dayText = values.reminder_day_of_month;
  const day = dayText ? Number(dayText) : null;
  const startDate = values.support_start_date;
  if (enabled && (!amount || amount <= 0)) {
    return failure("Default Monthly Amount is required and must be greater than zero when Monthly Support is enabled.", "default_monthly_amount");
  }
  if (enabled && (!day || day < 1 || day > 28)) {
    return failure("Reminder Day is required and must be between 1 and 28 when Monthly Support is enabled.", "reminder_day_of_month");
  }
  if (enabled && !startDate) {
    return failure("Start Date is required when Monthly Support is enabled.", "support_start_date");
  }

  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("donation_beneficiaries").insert({
    beneficiary_type: beneficiaryType, name,
    phone: nullable(values.phone), alternate_phone: nullable(values.alternate_phone),
    address: nullable(values.address), city_district: nullable(values.city_district),
    country: nullable(values.country), whatsapp: nullable(values.whatsapp), notes: nullable(values.notes),
    relationship_group: nullable(relationshipGroup), relationship_type_id: nullable(values.relationship_type_id),
    relationship_note: nullable(values.relationship_note), referred_by_name: nullable(values.referred_by_name),
    referred_by_phone: nullable(values.referred_by_phone), referred_by_note: nullable(values.referred_by_note),
    monthly_support_enabled: enabled, default_monthly_amount: enabled ? amount : null,
    reminder_day_of_month: enabled ? day : null, support_start_date: enabled ? startDate : null,
    support_end_date: enabled ? nullable(values.support_end_date) : null,
    default_purpose: enabled ? nullable(values.default_purpose) : null,
    default_category_id: enabled ? nullable(values.default_category_id) : null,
    default_payment_method_id: enabled ? nullable(values.default_payment_method_id) : null,
    created_by: profile.id, updated_by: profile.id,
  }).select("id").single();
  if (error) return failure(error.message, "");
  finish(`/admin/donation-expenses/beneficiaries/${data.id}`, "success", "Beneficiary created.");
}

export async function saveDonationMonthlySupportAction(beneficiaryId: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const enabled = text(form, "monthly_support_enabled") === "on";
  const amount = text(form, "default_monthly_amount") ? Number(text(form, "default_monthly_amount")) : null;
  const day = text(form, "reminder_day_of_month") ? Number(text(form, "reminder_day_of_month")) : null;
  const startDate = text(form, "support_start_date");
  if (enabled && (!amount || amount <= 0 || !day || day < 1 || day > 28 || !startDate)) {
    finish(`/admin/donation-expenses/beneficiaries/${beneficiaryId}`, "error", "Monthly amount, reminder day (1-28), and start date are required.");
  }
  const db = createSupabaseAdminClient();
  const { error } = await db.from("donation_beneficiaries").update({
    monthly_support_enabled: enabled, default_monthly_amount: enabled ? amount : null,
    reminder_day_of_month: enabled ? day : null, support_start_date: enabled ? startDate : null,
    support_end_date: enabled ? nullable(text(form, "support_end_date")) : null,
    default_purpose: enabled ? nullable(text(form, "default_purpose")) : null,
    default_category_id: enabled ? nullable(text(form, "default_category_id")) : null,
    default_payment_method_id: enabled ? nullable(text(form, "default_payment_method_id")) : null,
    updated_by: profile.id,
  }).eq("id", beneficiaryId);
  if (error) finish(`/admin/donation-expenses/beneficiaries/${beneficiaryId}`, "error", error.message);
  if (enabled) {
    const { error: reminderError } = await db.rpc("ensure_donation_monthly_support_reminders", { requested_date: new Date().toISOString().slice(0, 10) });
    if (reminderError) finish(`/admin/donation-expenses/beneficiaries/${beneficiaryId}`, "error", reminderError.message);
  }
  finish(`/admin/donation-expenses/beneficiaries/${beneficiaryId}`, "success", "Monthly support settings saved.");
}

export async function createDonationExpenseAction(form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const amount = Number(text(form, "amount"));
  if (!Number.isFinite(amount) || amount <= 0) finish("/admin/donation-expenses", "error", "Amount must be greater than zero.");
  const db = createSupabaseAdminClient();
  const { data, error } = await db.rpc("create_donation_expense", {
    requested_beneficiary_id: text(form, "beneficiary_id"), requested_category_id: text(form, "category_id"),
    requested_amount: amount, requested_donation_date: text(form, "donation_date"),
    requested_payment_method_id: text(form, "payment_method_id"),
    requested_payment_reference: nullable(text(form, "payment_reference")), requested_purpose: text(form, "purpose"),
    requested_note: nullable(text(form, "note")), requested_monthly_support_id: nullable(text(form, "monthly_support_id")),
    requested_actor_id: profile.id,
  });
  if (error) finish("/admin/donation-expenses", "error", error.message);
  finish(`/admin/donation-expenses/${data}`, "success", "Donation expense created.");
}

export async function advanceDonationExpenseStatusAction(expenseId: string, nextStatus: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const db = createSupabaseAdminClient();
  const { error } = await db.rpc("advance_donation_expense_status", {
    requested_expense_id: expenseId, requested_status: nextStatus, requested_actor_id: profile.id,
    requested_note: nullable(text(form, "note")),
  });
  if (error) finish(`/admin/donation-expenses/${expenseId}`, "error", error.message);
  finish(`/admin/donation-expenses/${expenseId}`, "success", `Donation marked ${nextStatus.toLowerCase()}.`);
}

export async function skipDonationReminderAction(reminderId: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const db = createSupabaseAdminClient();
  const { error } = await db.rpc("skip_donation_monthly_support_reminder", {
    requested_reminder_id: reminderId,
    requested_actor_id: profile.id,
    requested_note: nullable(text(form, "note")),
  });
  if (error) finish("/admin/donation-expenses", "error", error.message);
  finish("/admin/donation-expenses", "success", `Monthly support skipped${text(form, "note") ? `: ${text(form, "note")}` : "."}`);
}

export async function uploadDonationProofAction(expenseId: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const file = form.get("proof");
  if (!(file instanceof File) || file.size === 0) finish(`/admin/donation-expenses/${expenseId}`, "error", "Select a proof image or PDF.");
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  if (!allowed.has(file.type)) finish(`/admin/donation-expenses/${expenseId}`, "error", "Proof must be a JPG, PNG, WebP, or PDF.");
  if (file.size > 10 * 1024 * 1024) finish(`/admin/donation-expenses/${expenseId}`, "error", "Proof must be 10 MB or smaller.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100) || "proof";
  const path = `${expenseId}/voucher/${crypto.randomUUID()}-${safeName}`;
  const db = createSupabaseAdminClient();
  const { error: uploadError } = await db.storage.from(DONATION_BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (uploadError) finish(`/admin/donation-expenses/${expenseId}`, "error", uploadError.message);
  const { error } = await db.from("donation_expenses").update({
    proof_path: path, proof_file_name: file.name, proof_mime_type: file.type, updated_by: profile.id,
  }).eq("id", expenseId);
  if (error) finish(`/admin/donation-expenses/${expenseId}`, "error", message(error));
  revalidatePath(`/admin/donation-expenses/${expenseId}`);
  finish(`/admin/donation-expenses/${expenseId}`, "success", "Proof uploaded privately.");
}
