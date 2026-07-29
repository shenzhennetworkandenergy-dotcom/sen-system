"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { parseWholeNumber, roundMoney } from "@/lib/validation/numbers";

const statuses = new Set([
  "submitted",
  "reviewing",
  "additional_info_required",
  "quoted",
  "approved",
  "rejected",
  "accepted",
  "declined",
  "closed",
  "expired",
  "converted_to_invoice",
]);

export async function createQuotationAction(form: FormData) {
  const { profile } = await requirePermission("quotations.create");
  let customerId = String(form.get("customer_id") ?? "").trim();
  const rawProductIds = form.getAll("product_id").map((value) => String(value).trim());
  const rawQuantities = form.getAll("quantity");
  let requestedItems: { productId: string; quantity: number }[];
  try {
    requestedItems = rawProductIds
      .map((productId, index) => ({
        productId,
        quantity: productId
          ? parseWholeNumber(rawQuantities[index], `Item ${index + 1} quantity`, {
              required: true,
              minimum: 1,
            })!
          : 0,
      }))
      .filter((item) => item.productId);
  } catch (error) {
    redirect(`/admin/quotations/new?error=${encodeURIComponent(error instanceof Error ? error.message : "Quotation quantities are invalid.")}`);
  }
  const uniqueProductIds = [...new Set(requestedItems.map((item) => item.productId))];
  if (uniqueProductIds.length !== requestedItems.length) {
    redirect("/admin/quotations/new?error=Each%20product%20can%20only%20be%20added%20once.");
  }
  if (!uniqueProductIds.length) redirect("/admin/quotations/new?error=Choose%20at%20least%20one%20product.");
  const db = createSupabaseAdminClient();
  let customer: { id: string; full_name: string | null; email: string | null; company_name: string | null } | null = null;
  if (customerId) {
    const result = await db.from("profiles").select("id,full_name,email,company_name").eq("id", customerId).eq("role", "customer").maybeSingle();
    customer = result.data;
  } else {
    const email = String(form.get("new_customer_email") ?? "").trim().toLowerCase();
    const fullName = String(form.get("new_customer_name") ?? "").trim();
    const phone = String(form.get("new_customer_phone") ?? "").trim();
    const addressLine = String(form.get("new_customer_address") ?? "").trim();
    if (!email || !fullName || !phone || !addressLine) redirect("/admin/quotations/new?error=Select%20a%20customer%20or%20complete%20the%20new%20customer%20details.");
    const created = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: fullName, phone, role: "customer", status: "active" } });
    if (created.error || !created.data.user) redirect("/admin/quotations/new?error=Unable%20to%20create%20customer.");
    customerId = created.data.user.id;
    await db.from("profiles").update({ full_name: fullName, phone, role: "customer", status: "active" }).eq("id", customerId);
    const address = await db.from("customer_addresses").insert({ profile_id: customerId, recipient_name: fullName, phone, address_line_1: addressLine, city: String(form.get("new_customer_city") ?? "Not specified"), country_code: "BD", is_default_shipping: true });
    if (address.error) { await db.auth.admin.deleteUser(customerId); redirect("/admin/quotations/new?error=Unable%20to%20save%20the%20customer%20address."); }
    customer = { id: customerId, full_name: fullName, email, company_name: null };
  }
  const { data: products } = await db.from("products").select("id,name,sku,short_description,sale_price,regular_price").in("id", uniqueProductIds).eq("status", "active");
  if (!customer || !products || products.length !== uniqueProductIds.length) redirect("/admin/quotations/new?error=Choose%20valid%20active%20products%20and%20customer.");
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
    status: "quoted",
    subject: String(form.get("subject") || `Quotation for ${products[0].name}`).slice(0, 200),
    message: String(form.get("message") ?? "").slice(0, 5000),
    company_name: customer.company_name,
    assigned_to: profile.id,
    required_by: String(form.get("required_by") || "") || null,
    expiration_date: String(form.get("expiration_date") || "") || null,
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
    updated_by: profile.id,
  }).select("id").single();
  if (error || !quotation) redirect("/admin/quotations/new?error=Unable%20to%20create%20quotation.");
  const item = await db.from("quotation_request_items").insert(products.map((product) => ({
    ...(() => {
      const quantity =
        requestedItems.find((requested) => requested.productId === product.id)
          ?.quantity ?? 1;
      const unitPrice = Number(product.sale_price ?? product.regular_price ?? 0);
      return {
        quantity,
        line_subtotal: roundMoney(quantity * unitPrice),
        line_total: roundMoney(quantity * unitPrice),
      };
    })(),
    quotation_id: quotation.id,
    product_id: product.id,
    product_name_snapshot: product.name,
    sku_snapshot: product.sku,
    description_snapshot: product.short_description,
    target_price: roundMoney(Number(product.sale_price ?? product.regular_price ?? 0)),
    unit_price: roundMoney(Number(product.sale_price ?? product.regular_price ?? 0)),
    currency: "BDT",
  })));
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
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "quotation.created", module: "quotations", entityType: "quotation_request", entityId: quotation.id, targetProfileId: customer.id, description: "Quotation created by staff.", newValues: { reference, product_ids: uniqueProductIds, item_count: products.length } });
  revalidatePath("/admin/quotations");
  redirect(`/admin/quotations?success=${encodeURIComponent(`Quotation ${reference} created.`)}`);
}

export async function updateQuotationAction(
  quotationId: string,
  form: FormData,
) {
  const { profile } = await requirePermission("quotations.edit");
  const status = String(form.get("status") ?? "");
  if (!statuses.has(status)) {
    redirect("/admin/quotations?error=Invalid%20quotation%20status.");
  }

  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("quotation_requests")
    .update({
      status,
      assigned_to: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quotationId);
  if (error) {
    redirect("/admin/quotations?error=Unable%20to%20update%20quotation.");
  }

  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    action: "quotation.status_updated",
    module: "quotations",
    entityType: "quotation_request",
    entityId: quotationId,
    description: `Quotation status changed to ${status}.`,
    newValues: { status },
  });
  revalidatePath("/admin/quotations");
  redirect("/admin/quotations?success=Quotation%20updated.");
}
