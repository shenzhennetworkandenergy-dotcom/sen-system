"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";

const statuses = new Set([
  "submitted",
  "reviewing",
  "quoted",
  "accepted",
  "declined",
  "closed",
]);

export async function createQuotationAction(form: FormData) {
  const { profile } = await requirePermission("quotations.create");
  let customerId = String(form.get("customer_id") ?? "").trim();
  const productIds = form.getAll("product_id").map(String).filter(Boolean);
  const quantities = form.getAll("quantity").map((value) => Math.max(1, Math.trunc(Number(value) || 1)));
  const uniqueProductIds = [...new Set(productIds)];
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
  const { data: products } = await db.from("products").select("id,name,sku,sale_price,regular_price").in("id", uniqueProductIds).eq("status", "active");
  if (!customer || !products || products.length !== uniqueProductIds.length) redirect("/admin/quotations/new?error=Choose%20valid%20active%20products%20and%20customer.");
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
  }).select("id").single();
  if (error || !quotation) redirect("/admin/quotations/new?error=Unable%20to%20create%20quotation.");
  const item = await db.from("quotation_request_items").insert(products.map((product) => ({
    quotation_id: quotation.id,
    product_id: product.id,
    product_name_snapshot: product.name,
    sku_snapshot: product.sku,
    quantity: quantities[productIds.indexOf(product.id)] ?? 1,
    target_price: Number(product.sale_price ?? product.regular_price ?? 0),
  })));
  if (item.error) {
    await db.from("quotation_requests").delete().eq("id", quotation.id);
    redirect("/admin/quotations/new?error=Unable%20to%20save%20quotation%20items.");
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
