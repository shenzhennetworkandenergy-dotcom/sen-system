"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/permissions";
import { resolveQuotationViewScope } from "@/lib/quotations/access-policy";
import { isQuotationImmutable } from "@/lib/quotations/workflow";
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

async function quotationForUpdate(
  id: string,
  profile: { id: string; role: string },
  permissions: ReadonlySet<string>,
) {
  const scope = resolveQuotationViewScope(profile.role, permissions);
  if (!scope) fail("/admin/quotations", "Quotation access denied.");
  const db = createSupabaseAdminClient();
  let query = db
    .from("quotation_requests")
    .select("id,reference,profile_id,status,assigned_to,created_by")
    .eq("id", id);
  if (scope === "own") {
    query = query.eq("created_by", profile.id);
  }
  const { data, error } = await query.maybeSingle();
  if (error || !data) fail("/admin/quotations", "Quotation not found.");
  return { db, quotation: data, scope };
}

export async function updateQuotationDetailsAction(
  quotationId: string,
  form: FormData,
) {
  const { profile, permissions } = await requirePermission("quotations.edit");
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
  const { db, quotation } = await quotationForUpdate(
    quotationId,
    profile,
    permissions,
  );
  if (quotation.status !== "draft") {
    fail(path, "Only Draft quotations can have commercial details edited.");
  }
  const { data, error } = await db.rpc("update_quotation_details_and_totals", {
    actor_profile_id: profile.id,
    requested_quotation_id: quotationId,
    requested_expected_status: quotation.status,
    requested_subject: clean(form.get("subject"), 200),
    requested_company_name: clean(form.get("company_name"), 180),
    requested_customer_tax_identification_number: clean(
      form.get("customer_tax_identification_number"),
      100,
    ),
    requested_required_by: clean(form.get("required_by"), 10),
    requested_expiration_date: clean(form.get("expiration_date"), 10),
    requested_terms_and_conditions: clean(form.get("terms_and_conditions")),
    requested_payment_terms: clean(form.get("payment_terms"), 2000),
    requested_delivery_information: clean(form.get("delivery_information"), 2000),
    requested_customer_notes: clean(form.get("customer_notes")),
    requested_internal_notes: clean(form.get("internal_notes")),
    requested_discount_amount: discountAmount,
    requested_tax_amount: taxAmount,
  });
  if (error || !data) {
    fail(path, "Quotation changed before its details could be saved.");
  }
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
  const { profile, permissions } = await requirePermission("quotations.assign");
  const path = quotationPath(quotationId);
  const assignedTo = String(form.get("assigned_to") ?? "").trim() || null;
  const { db, quotation, scope } = await quotationForUpdate(
    quotationId,
    profile,
    permissions,
  );
  if (isQuotationImmutable(quotation.status)) {
    fail(path, "An immutable quotation cannot be assigned.");
  }
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
  let updateQuery = db
    .from("quotation_requests")
    .update({
      assigned_to: assignedTo,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quotationId)
    .eq("status", quotation.status);
  if (scope === "own") {
    updateQuery = updateQuery.eq("created_by", profile.id);
  }
  const { data, error } = await updateQuery.select("id").maybeSingle();
  if (error || !data) {
    fail(path, "Quotation changed before its assignment could be saved.");
  }
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

async function transitionQuotationBusinessStatus(
  quotationId: string,
  permission: string,
  transition: "approve" | "reject" | "issue" | "accept" | "decline",
  form: FormData,
) {
  const { profile, permissions } = await requirePermission(permission);
  const path = quotationPath(quotationId);
  const { db } = await quotationForUpdate(
    quotationId,
    profile,
    permissions,
  );
  const reason = String(
    form.get(transition === "decline" ? "reason" : "note") ?? "",
  ).trim();
  if (transition === "decline" && (reason.length < 1 || reason.length > 2000)) {
    fail(path, "Provide a customer decline reason between 1 and 2000 characters.");
  }
  const { error } = await db.rpc("transition_quotation_business_status", {
    actor_profile_id: profile.id,
    requested_quotation_id: quotationId,
    requested_transition: transition,
    requested_reason: reason,
  });
  if (error) fail(path, "Unable to record the quotation outcome.");
  refreshQuotationPaths(quotationId);
  redirect(
    `${path}?success=${encodeURIComponent(`Quotation ${transition} recorded.`)}`,
  );
}

export async function requestQuotationInformationAction(
  quotationId: string,
  form: FormData,
) {
  const { profile, permissions } = await requirePermission("quotations.edit");
  const path = quotationPath(quotationId);
  const { db, quotation, scope } = await quotationForUpdate(
    quotationId,
    profile,
    permissions,
  );
  if (isQuotationImmutable(quotation.status)) {
    fail(path, "An immutable quotation cannot change status.");
  }
  const note = clean(form.get("note"));
  let updateQuery = db
    .from("quotation_requests")
    .update({
      status: "additional_info_required",
      internal_notes: note,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quotationId)
    .eq("status", quotation.status);
  if (scope === "own") {
    updateQuery = updateQuery.eq("created_by", profile.id);
  }
  const { data, error } = await updateQuery.select("id").maybeSingle();
  if (error || !data) {
    fail(path, "Quotation changed before additional information could be requested.");
  }
  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    targetProfileId: quotation.profile_id,
    action: "quotation.additional_info_required",
    module: "quotations",
    entityType: "quotation_request",
    entityId: quotationId,
    description: "Additional information requested from customer.",
    oldValues: { status: quotation.status },
    newValues: { status: "additional_info_required", note },
  });
  refreshQuotationPaths(quotationId);
  redirect(`${path}?success=Additional%20information%20requested.`);
}

export async function approveQuotationAction(
  quotationId: string,
  form: FormData,
) {
  return transitionQuotationBusinessStatus(
    quotationId,
    "quotations.approve",
    "approve",
    form,
  );
}

export async function rejectQuotationAction(
  quotationId: string,
  form: FormData,
) {
  return transitionQuotationBusinessStatus(
    quotationId,
    "quotations.reject",
    "reject",
    form,
  );
}

export async function issueQuotationAction(
  quotationId: string,
  form: FormData,
) {
  return transitionQuotationBusinessStatus(
    quotationId,
    "quotations.send",
    "issue",
    form,
  );
}

export async function acceptQuotationAction(
  quotationId: string,
  form: FormData,
) {
  return transitionQuotationBusinessStatus(
    quotationId,
    "quotations.record_customer_outcome",
    "accept",
    form,
  );
}

export async function declineQuotationAction(
  quotationId: string,
  form: FormData,
) {
  return transitionQuotationBusinessStatus(
    quotationId,
    "quotations.record_customer_outcome",
    "decline",
    form,
  );
}
