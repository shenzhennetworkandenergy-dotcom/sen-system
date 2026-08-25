"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAllPermissions, requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { normalizeBasicCustomerInput } from "@/lib/customers/basic";
import { createBasicCustomerRecord } from "@/lib/customers/create-basic";
import { optionalString, uuid } from "@/lib/orders/validation";
import { resolveQuotationViewScope } from "@/lib/quotations/access-policy";
import { QUOTATION_SALE_CONVERSION_PERMISSIONS } from "@/lib/quotations/sale-conversion-types";
import {
  buildManualSaleRpcArguments,
  buildQuotationSaleRpcArguments,
  normalizeConversionSaleResult,
  parseDraftSaleInput,
} from "@/lib/sales/create-draft-input";
import { moneyFromForm, parseWholeNumber } from "@/lib/validation/numbers";
import { normalizeSaleLineEdit } from "@/lib/sales/line-editing";
import { buildSalePaymentRpcArguments } from "@/lib/sales/payment-accounting";
import {
  normalizeCommercialTermsDraft,
  normalizeDueDateCorrectionDraft,
  type PaymentTermsType,
} from "@/lib/sales/commercial-terms";
import {
  canAccessSaleUnderScope,
  resolveSalesVisibilityScope,
} from "@/lib/sales/visibility";

const target = (id: string, kind: "success" | "error", message: string) => `/admin/sales/${id}?${kind}=${encodeURIComponent(message)}`;
const safe = (message: string | undefined, fallback: string) => message && /sale|invoice|revision|release|payment|amount|method|stock|draft|serial|document|permission|eligible|accounting|cashbook|closed|received|channel|retry|operation|terms|credit|due date|correction/i.test(message) ? message : fallback;

export async function updateSaleLinesAction(saleId: string, form: FormData) {
  const { profile } = await requirePermission("sales.edit");
  const db = createSupabaseAdminClient();
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  let items;
  try {
    if (!reason) throw new Error("An edit reason is required.");
    const raw = JSON.parse(String(form.get("items") ?? "[]")) as unknown;
    if (!Array.isArray(raw) || !raw.length) throw new Error("Sale items are required.");
    items = raw.map((item) => {
      const normalized = normalizeSaleLineEdit(item as Record<string, unknown>);
      return {
        id: normalized.id,
        quantity: normalized.quantity,
        unit_price: normalized.unitPrice,
        discount_type: normalized.discountType,
        discount_value: normalized.discountValue,
      };
    });
  } catch (error) {
    redirect(target(saleId, "error", error instanceof Error ? error.message : "Sale edits are invalid."));
  }

  const result = await db.rpc("update_sale_lines", {
    actor_profile_id: profile.id,
    requested_order_id: saleId,
    requested_reason: reason,
    requested_items: items,
  });
  if (result.error) {
    redirect(target(saleId, "error", safe(result.error.message, "Unable to update sale products and pricing.")));
  }
  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    action: "sale.lines_updated",
    module: "sales",
    entityType: "sales_order",
    entityId: saleId,
    description: "Sale quantities and pricing were updated.",
    newValues: { reason, item_count: items.length },
  });
  revalidatePath("/admin/sales");
  revalidatePath(`/admin/sales/${saleId}`);
  revalidatePath(`/account/sales`);
  redirect(target(saleId, "success", "Sale products and pricing updated. Existing documents were marked superseded."));
}

export async function updateSaleCommercialTermsAction(saleId: string, form: FormData) {
  const { profile, permissions } = await requirePermission("sales.edit");
  const db = createSupabaseAdminClient();
  const [{ data: sale, error: saleError }, { data: invoice, error: invoiceError }] =
    await Promise.all([
      db
        .from("sales_orders")
        .select("id,created_by,payment_terms_type,credit_period_days,payment_due_date")
        .eq("id", saleId)
        .maybeSingle(),
      db
        .from("sale_documents")
        .select("id")
        .eq("order_id", saleId)
        .eq("document_type", "invoice")
        .neq("status", "voided")
        .limit(1)
        .maybeSingle(),
    ]);
  if (saleError || invoiceError || !sale) {
    redirect(target(saleId, "error", "Unable to verify Sale commercial terms."));
  }
  const salesScope = resolveSalesVisibilityScope({
    role: profile.role,
    status: profile.status,
    profileId: profile.id,
    permissions,
  });
  if (!canAccessSaleUnderScope(salesScope, sale.created_by)) {
    redirect(target(saleId, "error", "Sales access denied."));
  }

  let requested: {
    paymentTermsType: PaymentTermsType | null;
    creditPeriodDays: number | null;
    paymentDueDate: string | null;
    reason: string | null;
  };
  let operationId: string;
  try {
    operationId = uuid(form.get("operation_id"), "Commercial terms operation");
    if (invoice) {
      const correction = normalizeDueDateCorrectionDraft({
        paymentDueDate: form.get("payment_due_date"),
        reason: form.get("reason"),
      });
      requested = {
        paymentTermsType: sale.payment_terms_type as PaymentTermsType | null,
        creditPeriodDays: sale.credit_period_days,
        ...correction,
      };
    } else {
      requested = normalizeCommercialTermsDraft({
        paymentTermsType: form.get("payment_terms_type"),
        creditPeriodPreset: form.get("credit_period_preset"),
        customCreditPeriodDays: form.get("custom_credit_period_days"),
        paymentDueDate: form.get("payment_due_date"),
        reason: form.get("reason"),
      });
    }
  } catch (error) {
    redirect(
      target(
        saleId,
        "error",
        error instanceof Error ? error.message : "Commercial terms are invalid.",
      ),
    );
  }

  const result = await db.rpc("update_sale_commercial_terms", {
    actor_profile_id: profile.id,
    requested_order_id: saleId,
    requested_operation_id: operationId,
    requested_payment_terms_type: requested.paymentTermsType,
    requested_credit_period_days: requested.creditPeriodDays,
    requested_payment_due_date: requested.paymentDueDate,
    requested_reason: requested.reason,
  });
  if (result.error) {
    redirect(
      target(
        saleId,
        "error",
        safe(result.error.message, "Unable to update Sale commercial terms."),
      ),
    );
  }
  revalidatePath(`/admin/sales/${saleId}`);
  revalidatePath("/admin/receivables");
  revalidatePath("/admin/receivables/customers");
  redirect(target(saleId, "success", invoice
    ? "Payment due date correction saved with audit history."
    : "Commercial payment terms updated."));
}

export async function createSaleAction(form: FormData) {
  const { profile, permissions } = await requirePermission("sales.create");
  let input;
  try {
    input = parseDraftSaleInput(form, { mode: "manual" });
  } catch (error) {
    redirect(`/admin/sales/new?error=${encodeURIComponent(error instanceof Error ? error.message : "Sale items are invalid.")}`);
  }
  if (profile.role !== "admin" && input.hasPriceOverride && !permissions.has("sales.change_price")) redirect("/admin/sales/new?error=Price%20override%20permission%20is%20required.");
  if (profile.role !== "admin" && input.hasDiscount && !permissions.has("sales.apply_discount")) redirect("/admin/sales/new?error=Discount%20permission%20is%20required.");
  const db = createSupabaseAdminClient();
  const result = await db.rpc(
    "create_minimal_sale",
    buildManualSaleRpcArguments(profile.id, input),
  );
  if (result.error || !result.data) redirect(`/admin/sales/new?error=${encodeURIComponent(safe(result.error?.message, "Unable to create sale."))}`);
  const saleId = String(result.data);
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "sale.created", module: "sales", entityType: "sales_order", entityId: saleId, targetProfileId: input.customerId, description: "Sale created.", newValues: { source: input.source, item_count: input.items.length } });
  revalidatePath("/admin/sales"); redirect(target(saleId, "success", "Draft sale created."));
}

export async function createSaleFromQuotationAction(form: FormData) {
  const { profile, permissions } = await requireAllPermissions([
    ...QUOTATION_SALE_CONVERSION_PERMISSIONS,
  ]);
  const scope = resolveQuotationViewScope(profile.role, permissions);
  if (!scope) {
    redirect("/admin/sales/new?error=Quotation%20access%20is%20not%20available.");
  }

  let quotationId: string;
  try {
    quotationId = uuid(form.get("quotation_id"), "Quotation");
  } catch (error) {
    redirect(`/admin/sales/new?error=${encodeURIComponent(error instanceof Error ? error.message : "Quotation is invalid.")}`);
  }
  const formTarget = `/admin/sales/new?quotation=${quotationId}`;
  let input;
  try {
    input = parseDraftSaleInput(form, { mode: "quotation" });
  } catch (error) {
    redirect(`${formTarget}&error=${encodeURIComponent(error instanceof Error ? error.message : "Sale details are invalid.")}`);
  }

  const db = createSupabaseAdminClient();
  let quotationQuery = db
    .from("quotation_requests")
    .select("id,status,expiration_date,converted_order_id")
    .eq("id", quotationId);
  if (scope === "own") {
    quotationQuery = quotationQuery.eq("created_by", profile.id);
  }
  const { data: quotation, error: quotationError } = await quotationQuery.maybeSingle();
  if (quotationError) {
    console.error("Unable to verify quotation Sale conversion access.");
    redirect(`${formTarget}&error=${encodeURIComponent("Unable to verify the quotation right now.")}`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const eligible = quotation?.status === "accepted" &&
    quotation.converted_order_id === null &&
    (quotation.expiration_date === null || quotation.expiration_date >= today);
  const retry = quotation?.status === "converted_to_sale" &&
    typeof quotation.converted_order_id === "string";
  if (!eligible && !retry) {
    redirect(`${formTarget}&error=${encodeURIComponent("Quotation is not eligible for Sale conversion.")}`);
  }

  const result = await db.rpc(
    "create_sale_from_quotation",
    buildQuotationSaleRpcArguments(profile.id, quotationId, input),
  );
  const sale = normalizeConversionSaleResult(result.data);
  if (result.error || !sale) {
    console.error("Unable to create a draft Sale from the quotation.");
    redirect(`${formTarget}&error=${encodeURIComponent("Unable to convert the quotation to a Sale.")}`);
  }
  revalidatePath("/admin/sales");
  revalidatePath(`/admin/quotations/${quotationId}/manage`);
  redirect(target(sale.saleId, "success", "Draft sale created from quotation."));
}

export async function confirmSaleAction(saleId: string) {
  const { profile } = await requirePermission("sales.reserve_stock"), db = createSupabaseAdminClient();
  const result = await db.rpc("confirm_sales_order", { actor_profile_id: profile.id, requested_order_id: saleId });
  if (result.error) redirect(target(saleId, "error", safe(result.error.message, "Unable to confirm sale.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "sale.confirmed", module: "sales", entityType: "sales_order", entityId: saleId, description: "Sale confirmed and inventory reserved." });
  revalidatePath("/admin/sales"); revalidatePath(`/admin/sales/${saleId}`); redirect(target(saleId, "success", "Sale confirmed and stock reserved."));
}

export async function cancelSaleAction(saleId: string, form: FormData) {
  const { profile } = await requirePermission("sales.cancel"), db = createSupabaseAdminClient(), reason = optionalString(form, "reason", 1000) ?? "Cancelled by staff";
  const result = await db.rpc("cancel_sales_order", { actor_profile_id: profile.id, requested_order_id: saleId, requested_reason: reason });
  if (result.error) redirect(target(saleId, "error", safe(result.error.message, "Unable to cancel sale.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "sale.cancelled", module: "sales", entityType: "sales_order", entityId: saleId, description: "Sale cancelled and stock reservations released.", newValues: { reason } });
  revalidatePath("/admin/sales"); revalidatePath(`/admin/sales/${saleId}`); redirect(target(saleId, "success", "Sale cancelled and reservations released."));
}

export async function recordPaymentAction(saleId: string, form: FormData) {
  const { profile } = await requirePermission("sales.record_payment"), db = createSupabaseAdminClient();
  let rpcArguments: ReturnType<typeof buildSalePaymentRpcArguments>;
  try {
    const amount = moneyFromForm(form, "amount", "Payment amount", { required: true, minimum: 0.01 })!;
    rpcArguments = buildSalePaymentRpcArguments({
      actorProfileId: profile.id,
      saleId,
      amount,
      paymentDate: String(form.get("payment_date") || new Date().toISOString().slice(0, 10)),
      method: form.get("method"),
      receiptChannel: form.get("receipt_channel"),
      reference: optionalString(form, "reference_number", 200),
      note: optionalString(form, "internal_note", 1000),
      operationId: uuid(form.get("operation_id"), "Payment operation"),
    });
  }
  catch (error) { redirect(target(saleId, "error", error instanceof Error ? error.message : "Payment amount is invalid.")); }
  const result = await db.rpc("record_sale_payment", rpcArguments);
  if (result.error) redirect(target(saleId, "error", safe(result.error.message, "Unable to record payment.")));
  revalidatePath("/admin/sales");
  revalidatePath(`/admin/sales/${saleId}`);
  revalidatePath("/account/sales");
  revalidatePath("/admin/accounting");
  redirect(target(saleId, "success", "Payment recorded and posted to Accounting."));
}

export async function generateSaleDocumentAction(saleId: string, type: "invoice" | "delivery_challan", form: FormData) {
  const permission = type === "invoice" ? "sales.create_invoice" : "sales.create_delivery_challan";
  const { profile } = await requirePermission(permission), db = createSupabaseAdminClient();
  let result;
  if (type === "invoice") {
    let operationId: string;
    let requestVersion: number;
    try {
      operationId = uuid(form.get("operation_id"), "Invoice finalization operation");
      requestVersion = parseWholeNumber(
        form.get("request_version"),
        "Stock Out request version",
        { required: true, minimum: 0 },
      )!;
    } catch (error) {
      redirect(target(saleId, "error", error instanceof Error ? error.message : "Invoice operation is invalid."));
    }
    result = await db.rpc("finalize_sale_invoice", {
      actor_profile_id: profile.id,
      requested_order_id: saleId,
      requested_operation_id: operationId,
      requested_request_version: requestVersion,
    });
  } else {
    result = await db.rpc("generate_sale_document", {
      actor_profile_id: profile.id,
      requested_order_id: saleId,
      requested_type: type,
    });
  }
  if (result.error || !result.data) redirect(target(saleId, "error", safe(result.error?.message, "Unable to generate document.")));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: `sale.${type}_generated`, module: "sales", entityType: "sales_order", entityId: saleId, description: `${type === "invoice" ? "Invoice" : "Delivery challan"} generated.` });
  revalidatePath("/admin/sales");
  revalidatePath(`/admin/sales/${saleId}`);
  if (type === "invoice") {
    revalidatePath("/employee/inventory/stock-out");
    revalidatePath("/api/employee/inventory/work-counts");
  }
  redirect(`/admin/sales/${saleId}/documents/${result.data}`);
}

export async function createBasicCustomerAction(form: FormData) {
  const { profile } = await requirePermission("sales.create");
  let input;
  let customer;
  try {
    input = normalizeBasicCustomerInput({
      fullName: form.get("full_name"),
      companyName: form.get("company_name"),
      email: form.get("email"),
      phone: form.get("phone"),
      addressLine1: form.get("address_line_1"),
    });
    customer = await createBasicCustomerRecord(input);
  } catch (error) {
    redirect(
      `/admin/sales/new?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Unable to add customer.",
      )}`,
    );
  }
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "sale.customer_created", module: "sales", entityType: "profile", entityId: customer.id, targetProfileId: customer.id, description: "Basic customer created from Sales." });
  revalidatePath("/admin/sales/new"); redirect(`/admin/sales/new?success=${encodeURIComponent(`Customer ${input.fullName} added. They can use password recovery to set a password.`)}`);
}
