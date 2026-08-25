"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/permissions";
import { normalizeBasicCustomerInput } from "@/lib/customers/basic";
import {
  createBasicCustomerRecord,
  type CreatedBasicCustomer,
} from "@/lib/customers/create-basic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { resolveQuotationViewScope } from "@/lib/quotations/access-policy";
import { parseQuotationItems } from "@/lib/quotations/create";
import { defaultQuotationExpiration } from "@/lib/quotations/validity";
import { isQuotationImmutable } from "@/lib/quotations/workflow";
import { parseMoney } from "@/lib/validation/numbers";

export type QuotationCustomerActionState = {
  status: "idle" | "success" | "error";
  message: string;
  customer: CreatedBasicCustomer | null;
};

export async function createQuotationCustomerAction(
  _previousState: QuotationCustomerActionState,
  form: FormData,
): Promise<QuotationCustomerActionState> {
  const { profile } = await requirePermission("quotations.create");
  try {
    const input = normalizeBasicCustomerInput({
      fullName: form.get("full_name"),
      companyName: form.get("company_name"),
      email: form.get("email"),
      phone: form.get("phone"),
      addressLine1: form.get("address_line_1"),
    });
    const customer = await createBasicCustomerRecord(input);
    await writeAuditLog({
      actorId: profile.id,
      actorRole: profile.role,
      action: "quotation.customer_created",
      module: "quotations",
      entityType: "profile",
      entityId: customer.id,
      targetProfileId: customer.id,
      description: "Basic customer created from Quotations.",
    });
    return {
      status: "success",
      message: `Customer ${customer.full_name} added and selected.`,
      customer,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    return {
      status: "error",
      message: /already|registered|exists/i.test(detail)
        ? "A customer with this email already exists. Search for the existing customer below."
        : detail || "Unable to add customer.",
      customer: null,
    };
  }
}

export async function createQuotationAction(form: FormData) {
  const { profile, permissions } = await requirePermission("quotations.create");
  const customerId = String(form.get("customer_id") ?? "").trim();
  let requestedItems;
  try {
    requestedItems = parseQuotationItems(
      JSON.parse(String(form.get("items") ?? "[]")) as unknown,
    );
  } catch (error) {
    redirect(
      `/admin/quotations/new?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Quotation products are invalid.",
      )}`,
    );
  }
  const uniqueProductIds = [
    ...new Set(requestedItems.map((item) => item.productId)),
  ];
  const variationIds = [
    ...new Set(
      requestedItems
        .map((item) => item.variationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const db = createSupabaseAdminClient();
  if (!customerId) {
    redirect("/admin/quotations/new?error=Choose%20a%20customer.");
  }
  const { data: customer } = await db
    .from("profiles")
    .select("id,full_name,email,company_name")
    .eq("id", customerId)
    .eq("role", "customer")
    .eq("status", "active")
    .maybeSingle();
  const { data: products } = await db
    .from("products")
    .select("id,name,sku")
    .in("id", uniqueProductIds)
    .eq("status", "active");
  if (!customer || !products || products.length !== uniqueProductIds.length) redirect("/admin/quotations/new?error=Choose%20valid%20active%20products%20and%20customer.");
  const { data: variations, error: variationError } = variationIds.length
    ? await db
        .from("product_variations")
        .select("id,product_id,sku,combination_key")
        .in("id", variationIds)
        .eq("status", "active")
    : { data: [], error: null };
  if (variationError || (variations?.length ?? 0) !== variationIds.length) {
    redirect("/admin/quotations/new?error=Choose%20valid%20active%20product%20variations.");
  }
  const productMap = new Map(products.map((product) => [product.id, product]));
  const variationMap = new Map(
    (variations ?? []).map((variation) => [variation.id, variation]),
  );
  if (
    requestedItems.some(
      (item) =>
        item.variationId &&
        variationMap.get(item.variationId)?.product_id !== item.productId,
    )
  ) {
    redirect("/admin/quotations/new?error=A%20selected%20variation%20does%20not%20belong%20to%20its%20product.");
  }
  const { data: address } = await db
    .from("customer_addresses")
    .select("*")
    .eq("profile_id", customer.id)
    .order("is_default_shipping", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const addressSnapshot = address ? {
    recipient_name: address.recipient_name,
    phone: address.phone,
    address_line_1: address.address_line_1,
    address_line_2: address.address_line_2,
    area: address.area,
    city: address.city,
    region: address.region,
    postal_code: address.postal_code,
    country_code: address.country_code,
  } : null;
  const reference = `QT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: quotation, error } = await db.from("quotation_requests").insert({
    reference,
    profile_id: customer.id,
    status: "draft",
    subject: String(
      form.get("subject") ||
        `Quotation for ${productMap.get(requestedItems[0].productId)?.name ?? "products"}`,
    ).slice(0, 200),
    message: String(form.get("message") ?? "").slice(0, 5000),
    company_name: customer.company_name,
    assigned_to: profile.id,
    required_by: String(form.get("required_by") || "") || null,
    expiration_date: String(form.get("expiration_date") || defaultQuotationExpiration()),
    terms_and_conditions: String(form.get("terms_and_conditions") ?? "").slice(0, 5000) || null,
    payment_terms: String(form.get("payment_terms") ?? "").slice(0, 2000) || null,
    delivery_information: String(form.get("delivery_information") ?? "").slice(0, 2000) || null,
    customer_notes: String(form.get("message") ?? "").slice(0, 5000) || null,
    internal_notes: String(form.get("internal_notes") ?? "").slice(0, 5000) || null,
    billing_address_id: address?.id ?? null,
    shipping_address_id: address?.id ?? null,
    billing_address_snapshot: addressSnapshot,
    shipping_address_snapshot: addressSnapshot,
    currency: "BDT",
    created_by: profile.id,
    updated_by: profile.id,
  }).select("id").single();
  if (error || !quotation) redirect("/admin/quotations/new?error=Unable%20to%20create%20quotation.");
  const quotationItems = requestedItems.map((requested) => {
    const product = productMap.get(requested.productId)!;
    const variation = requested.variationId
      ? variationMap.get(requested.variationId)
      : null;
    return {
      quotation_id: quotation.id,
      product_id: product.id,
      variation_id: variation?.id ?? null,
      product_name_snapshot: variation
        ? `${product.name} — ${variation.combination_key}`
        : product.name,
      sku_snapshot: variation?.sku ?? product.sku,
      quantity: requested.quantity,
      target_price: requested.unitPrice,
      unit_price: requested.unitPrice,
      discount_amount: requested.discountAmount,
      tax_amount: requested.taxAmount,
      line_subtotal: requested.lineSubtotal,
      line_total: requested.lineTotal,
      currency: "BDT",
    };
  });
  const item = await db
    .from("quotation_request_items")
    .insert(quotationItems);
  if (item.error) {
    await db.from("quotation_requests").delete().eq("id", quotation.id);
    redirect("/admin/quotations/new?error=Unable%20to%20save%20quotation%20items.");
  }
  const totals = await db.rpc("refresh_quotation_totals", {
    requested_quotation_id: quotation.id,
  });
  if (totals.error) {
    await db.from("quotation_requests").delete().eq("id", quotation.id);
    redirect("/admin/quotations/new?error=Unable%20to%20calculate%20quotation%20totals.");
  }
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "quotation.created", module: "quotations", entityType: "quotation_request", entityId: quotation.id, targetProfileId: customer.id, description: "Quotation created by staff.", newValues: { reference, product_ids: uniqueProductIds, item_count: quotationItems.length } });
  revalidatePath("/admin/quotations");
  const destination =
    profile.role === "admin" ||
    permissions.has("quotations.view") ||
    permissions.has("quotations.view_all") ||
    permissions.has("quotations.view_own")
      ? "/admin/quotations"
      : "/admin/quotations/new";
  redirect(`${destination}?success=${encodeURIComponent(`Quotation ${reference} created.`)}`);
}

const draftEditPath = (id: string) => `/admin/quotations/${id}/edit`;

function failDraftEdit(id: string, message: string): never {
  redirect(`${draftEditPath(id)}?error=${encodeURIComponent(message)}`);
}

function cleanDraftEditText(
  value: FormDataEntryValue | null,
  maximum = 5000,
) {
  return String(value ?? "").trim().slice(0, maximum) || null;
}

function cleanDraftEditDate(value: FormDataEntryValue | null, label: string) {
  const date = String(value ?? "").trim();
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${label} must be a valid date.`);
  }
  const normalized = new Date(`${date}T00:00:00.000Z`)
    .toISOString()
    .slice(0, 10);
  if (normalized !== date) throw new Error(`${label} must be a valid date.`);
  return date;
}

export async function updateDraftQuotationAction(
  quotationId: string,
  form: FormData,
) {
  const { profile, permissions } = await requirePermission("quotations.edit");
  const scope = resolveQuotationViewScope(profile.role, permissions);
  if (!scope) {
    failDraftEdit(quotationId, "Quotation access denied.");
  }

  const expectedUpdatedAt = String(form.get("updated_at") ?? "").trim();
  if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) {
    failDraftEdit(quotationId, "Quotation changed before it could be saved.");
  }

  let requestedItems;
  let discountAmount: number;
  let taxAmount: number;
  let requiredBy: string | null;
  let expirationDate: string | null;
  try {
    requestedItems = parseQuotationItems(
      JSON.parse(String(form.get("items") ?? "[]")) as unknown,
    );
    discountAmount =
      parseMoney(form.get("discount_amount"), "Quotation discount", {
        minimum: 0,
      }) ?? 0;
    taxAmount =
      parseMoney(form.get("tax_amount"), "Quotation tax", { minimum: 0 }) ??
      0;
    requiredBy = cleanDraftEditDate(form.get("required_by"), "Required by");
    expirationDate = cleanDraftEditDate(
      form.get("expiration_date"),
      "Expiration date",
    );
  } catch (error) {
    failDraftEdit(
      quotationId,
      error instanceof Error ? error.message : "Quotation values are invalid.",
    );
  }

  const db = createSupabaseAdminClient();
  let quotationQuery = db
    .from("quotation_requests")
    .select(
      "id,reference,profile_id,status,created_by,quotation_request_items(product_id,variation_id)",
    )
    .eq("id", quotationId);
  if (scope === "own") {
    quotationQuery = quotationQuery.eq("created_by", profile.id);
  }
  const { data: quotation, error: quotationError } =
    await quotationQuery.maybeSingle();
  if (quotationError || !quotation) {
    failDraftEdit(quotationId, "Quotation not found.");
  }
  if (quotation.status !== "draft") {
    failDraftEdit(quotationId, "Only Draft quotations can be edited.");
  }

  const existingLineKeys = new Set(
    (quotation.quotation_request_items ?? []).map(
      (item: { product_id: string; variation_id: string | null }) =>
        `${item.product_id}:${item.variation_id ?? ""}`,
    ),
  );
  const requestedLineKeys = new Set(
    requestedItems.map(
      (item) => `${item.productId}:${item.variationId ?? ""}`,
    ),
  );
  const addedItems = requestedItems.filter(
    (item) => !existingLineKeys.has(`${item.productId}:${item.variationId ?? ""}`),
  );
  const addedProductIds = [...new Set(addedItems.map((item) => item.productId))];
  if (addedProductIds.length) {
    const { data: activeProducts, error: productError } = await db
      .from("products")
      .select("id")
      .in("id", addedProductIds)
      .eq("status", "active");
    if (productError || (activeProducts?.length ?? 0) !== addedProductIds.length) {
      failDraftEdit(quotationId, "Choose valid active products.");
    }
  }

  const variationIds = [
    ...new Set(
      requestedItems
        .map((item) => item.variationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (variationIds.length) {
    const { data: variations, error: variationError } = await db
      .from("product_variations")
      .select("id,product_id,status")
      .in("id", variationIds);
    const variationMap = new Map(
      (variations ?? []).map((variation) => [variation.id, variation]),
    );
    if (
      variationError ||
      variationMap.size !== variationIds.length ||
      requestedItems.some(
        (item) =>
          item.variationId &&
          variationMap.get(item.variationId)?.product_id !== item.productId,
      ) ||
      addedItems.some(
        (item) =>
          item.variationId && variationMap.get(item.variationId)?.status !== "active",
      )
    ) {
      failDraftEdit(
        quotationId,
        "Choose valid active product variations for newly added products.",
      );
    }
  }
  if (requestedLineKeys.size !== requestedItems.length) {
    failDraftEdit(quotationId, "Each product or variation can only be added once.");
  }

  const { data, error } = await db.rpc("update_draft_quotation", {
    actor_profile_id: profile.id,
    requested_quotation_id: quotationId,
    requested_expected_updated_at: expectedUpdatedAt,
    requested_subject: cleanDraftEditText(form.get("subject"), 200),
    requested_company_name: cleanDraftEditText(form.get("company_name"), 180),
    requested_customer_tax_identification_number: cleanDraftEditText(
      form.get("customer_tax_identification_number"),
      100,
    ),
    requested_required_by: requiredBy,
    requested_expiration_date: expirationDate,
    requested_terms_and_conditions: cleanDraftEditText(
      form.get("terms_and_conditions"),
    ),
    requested_payment_terms: cleanDraftEditText(form.get("payment_terms"), 2000),
    requested_delivery_information: cleanDraftEditText(
      form.get("delivery_information"),
      2000,
    ),
    requested_customer_notes: cleanDraftEditText(form.get("message")),
    requested_internal_notes: cleanDraftEditText(form.get("internal_notes")),
    requested_discount_amount: discountAmount,
    requested_tax_amount: taxAmount,
    requested_items: requestedItems.map((item) => ({
      product_id: item.productId,
      variation_id: item.variationId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount_amount: item.discountAmount,
      tax_amount: item.taxAmount,
    })),
  });
  if (error || !data) {
    failDraftEdit(
      quotationId,
      "Quotation changed before it could be saved. Reload the Draft and try again.",
    );
  }
  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    targetProfileId: quotation.profile_id,
    action: "quotation.draft_updated",
    module: "quotations",
    entityType: "quotation_request",
    entityId: quotationId,
    description: "Draft quotation content updated.",
    newValues: { item_count: requestedItems.length },
  });
  revalidatePath("/admin/quotations");
  revalidatePath(`/admin/quotations/${quotationId}/manage`);
  revalidatePath(`/admin/quotations/${quotationId}/edit`);
  revalidatePath(`/admin/quotations/${quotationId}`);
  revalidatePath("/account/quotations");
  redirect(`${draftEditPath(quotationId)}?success=Draft%20quotation%20saved.`);
}

export async function updateQuotationAction(
  quotationId: string,
  _form: FormData,
) {
  void _form;
  const { profile, permissions } = await requirePermission("quotations.edit");
  const scope = resolveQuotationViewScope(profile.role, permissions);
  if (!scope) {
    redirect("/admin/quotations?error=Quotation%20access%20denied.");
  }
  const db = createSupabaseAdminClient();
  let quotationQuery = db
    .from("quotation_requests")
    .select("id,status")
    .eq("id", quotationId);
  if (scope === "own") {
    quotationQuery = quotationQuery.eq("created_by", profile.id);
  }
  const { data: quotation } = await quotationQuery.maybeSingle();
  if (!quotation) {
    redirect("/admin/quotations?error=Quotation%20not%20found.");
  }
  if (isQuotationImmutable(quotation.status)) {
    redirect("/admin/quotations?error=An%20immutable%20quotation%20cannot%20be%20updated.");
  }
  redirect("/admin/quotations?error=Use%20a%20dedicated%20quotation%20workflow%20action.");
}
