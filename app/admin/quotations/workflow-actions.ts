"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseMoney } from "@/lib/validation/numbers";

const quotationPath = (id: string) => `/admin/quotations/${id}/manage`;
const clean = (value: FormDataEntryValue | null, maximum = 5000) =>
  String(value ?? "").trim().slice(0, maximum) || null;

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function refreshQuotationPaths(id: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/quotations");
  revalidatePath(quotationPath(id));
  revalidatePath("/account");
  revalidatePath("/account/quotations");
}

async function quotationForUpdate(id: string) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("quotation_requests")
    .select("id,reference,profile_id,status,assigned_to")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) fail("/admin/quotations", "Quotation not found.");
  return { db, quotation: data };
}

export async function updateQuotationDetailsAction(
  quotationId: string,
  form: FormData,
) {
  const { profile } = await requirePermission("quotations.edit");
  const path = quotationPath(quotationId);
  let discountAmount: number;
  let taxAmount: number;
  try {
    discountAmount =
      parseMoney(form.get("discount_amount"), "Discount", { minimum: 0 }) ?? 0;
    taxAmount = parseMoney(form.get("tax_amount"), "Tax", { minimum: 0 }) ?? 0;
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "Amounts are invalid.");
  }
  const { db, quotation } = await quotationForUpdate(quotationId);
  if (quotation.status === "converted_to_invoice") {
    fail(path, "A converted quotation cannot be edited.");
  }
  const { error } = await db
    .from("quotation_requests")
    .update({
      subject: clean(form.get("subject"), 200),
      company_name: clean(form.get("company_name"), 180),
      customer_tax_identification_number: clean(
        form.get("customer_tax_identification_number"),
        100,
      ),
      required_by: clean(form.get("required_by"), 10),
      expiration_date: clean(form.get("expiration_date"), 10),
      terms_and_conditions: clean(form.get("terms_and_conditions")),
      payment_terms: clean(form.get("payment_terms"), 2000),
      delivery_information: clean(form.get("delivery_information"), 2000),
      customer_notes: clean(form.get("customer_notes")),
      message: clean(form.get("customer_notes")),
      internal_notes: clean(form.get("internal_notes")),
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quotationId);
  if (error) fail(path, "Unable to save quotation details.");
  const { error: totalError } = await db.rpc("refresh_quotation_totals", {
    requested_quotation_id: quotationId,
  });
  if (totalError) fail(path, "Details saved, but totals could not be refreshed.");
  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    targetProfileId: quotation.profile_id,
    action: "quotation.updated",
    module: "quotations",
    entityType: "quotation_request",
    entityId: quotationId,
    description: "Quotation commercial details updated.",
    newValues: { discount_amount: discountAmount, tax_amount: taxAmount },
  });
  refreshQuotationPaths(quotationId);
  redirect(`${path}?success=Quotation%20details%20saved.`);
}

export async function assignQuotationAction(
  quotationId: string,
  form: FormData,
) {
  const { profile } = await requirePermission("quotations.assign");
  const path = quotationPath(quotationId);
  const assignedTo = String(form.get("assigned_to") ?? "").trim() || null;
  const { db, quotation } = await quotationForUpdate(quotationId);
  if (assignedTo) {
    const { data: assignee } = await db
      .from("profiles")
      .select("id")
      .eq("id", assignedTo)
      .in("role", ["admin", "employee"])
      .eq("status", "active")
      .maybeSingle();
    if (!assignee) fail(path, "Choose an active administrator or employee.");
  }
  const { error } = await db
    .from("quotation_requests")
    .update({
      assigned_to: assignedTo,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quotationId);
  if (error) fail(path, "Unable to assign quotation.");
  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    targetProfileId: quotation.profile_id,
    action: "quotation.assigned",
    module: "quotations",
    entityType: "quotation_request",
    entityId: quotationId,
    description: "Quotation assignment changed.",
    newValues: { assigned_to: assignedTo },
  });
  refreshQuotationPaths(quotationId);
  redirect(`${path}?success=Quotation%20assignment%20saved.`);
}

async function setQuotationStatus(
  quotationId: string,
  permission: string,
  status: "additional_info_required" | "approved" | "rejected",
  form: FormData,
) {
  const { profile } = await requirePermission(permission);
  const path = quotationPath(quotationId);
  const { db, quotation } = await quotationForUpdate(quotationId);
  if (quotation.status === "converted_to_invoice") {
    fail(path, "A converted quotation cannot change status.");
  }
  const note = clean(form.get("note"));
  const timestamps =
    status === "approved"
      ? { approved_at: new Date().toISOString(), approved_by: profile.id }
      : status === "rejected"
        ? { rejected_at: new Date().toISOString(), rejected_by: profile.id }
        : {};
  const { error } = await db
    .from("quotation_requests")
    .update({
      status,
      internal_notes: note,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
      ...timestamps,
    })
    .eq("id", quotationId);
  if (error) fail(path, `Unable to mark quotation as ${status}.`);
  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    targetProfileId: quotation.profile_id,
    action: `quotation.${status}`,
    module: "quotations",
    entityType: "quotation_request",
    entityId: quotationId,
    description: `Quotation marked ${status.replaceAll("_", " ")}.`,
    oldValues: { status: quotation.status },
    newValues: { status, note },
  });
  refreshQuotationPaths(quotationId);
  redirect(
    `${path}?success=${encodeURIComponent(`Quotation marked ${status.replaceAll("_", " ")}.`)}`,
  );
}

export async function requestQuotationInformationAction(
  quotationId: string,
  form: FormData,
) {
  return setQuotationStatus(
    quotationId,
    "quotations.edit",
    "additional_info_required",
    form,
  );
}

export async function approveQuotationAction(
  quotationId: string,
  form: FormData,
) {
  return setQuotationStatus(
    quotationId,
    "quotations.approve",
    "approved",
    form,
  );
}

export async function rejectQuotationAction(
  quotationId: string,
  form: FormData,
) {
  return setQuotationStatus(
    quotationId,
    "quotations.reject",
    "rejected",
    form,
  );
}

export async function convertQuotationToInvoiceAction(
  quotationId: string,
  form: FormData,
) {
  const { profile } = await requirePermission("quotations.convert_to_invoice");
  const path = quotationPath(quotationId);
  const warehouseId = String(form.get("warehouse_id") ?? "").trim();
  const createCustomer = String(form.get("create_customer") ?? "") === "true";
  if (!warehouseId) fail(path, "Choose a fulfilment warehouse.");
  const { data, error } = await createSupabaseAdminClient().rpc(
    "convert_quotation_to_invoice",
    {
      actor_profile_id: profile.id,
      requested_quotation_id: quotationId,
      requested_warehouse_id: warehouseId,
      requested_create_customer: createCustomer,
    },
  );
  if (error) {
    if (error.message.includes("CUSTOMER_CREATION_REQUIRED")) {
      redirect(`${path}?customerCreation=required`);
    }
    fail(path, error.message || "Unable to convert quotation.");
  }
  const result = data as {
    order_id?: string;
    invoice_id?: string;
    invoice_number?: string;
  } | null;
  if (!result?.order_id || !result.invoice_id) {
    fail(path, "Invoice conversion did not return a valid document.");
  }
  refreshQuotationPaths(quotationId);
  revalidatePath("/admin/sales");
  revalidatePath(`/admin/sales/${result.order_id}`);
  redirect(
    `/admin/sales/${result.order_id}/documents/${result.invoice_id}?success=${encodeURIComponent(`Quotation converted to ${result.invoice_number ?? "a sales invoice"}.`)}`,
  );
}
