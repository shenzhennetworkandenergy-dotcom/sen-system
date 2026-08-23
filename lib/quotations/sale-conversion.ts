import "server-only";

import { requireAllPermissions } from "@/lib/auth/permissions";
import { resolveQuotationViewScope } from "@/lib/quotations/access-policy";
import {
  QUOTATION_SALE_CONVERSION_PERMISSIONS,
  type QuotationSaleInitial,
} from "@/lib/quotations/sale-conversion-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const asNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const todayDate = () => new Date().toISOString().slice(0, 10);

export async function loadQuotationSaleInitial(
  quotationId: string,
): Promise<QuotationSaleInitial | null> {
  const { profile, permissions } = await requireAllPermissions([
    ...QUOTATION_SALE_CONVERSION_PERMISSIONS,
  ]);
  const scope = resolveQuotationViewScope(profile.role, permissions);
  if (!scope) return null;

  const db = createSupabaseAdminClient();
  const today = todayDate();
  let quotationQuery = db
    .from("quotation_requests")
    .select(
      "id,reference,profile_id,billing_address_id,shipping_address_id,required_by,discount_amount,tax_amount,customer_notes,internal_notes,payment_terms,delivery_information,terms_and_conditions,profiles!inner(id,status)",
    )
    .eq("id", quotationId)
    .eq("status", "accepted")
    .is("converted_order_id", null)
    .or(`expiration_date.is.null,expiration_date.gte.${today}`)
    .eq("profiles.status", "active");
  if (scope === "own") {
    quotationQuery = quotationQuery.eq("created_by", profile.id);
  }
  const { data: quotation, error: quotationError } =
    await quotationQuery.maybeSingle();
  if (quotationError || !quotation) {
    if (quotationError) console.error("Unable to load quotation sale prefill.");
    return null;
  }

  const { data: items, error: itemsError } = await db
    .from("quotation_request_items")
    .select("id,product_id,variation_id,quantity,unit_price,discount_amount,tax_amount")
    .eq("quotation_id", quotation.id)
    .order("created_at");
  if (itemsError || !items?.length) {
    if (itemsError) console.error("Unable to load quotation sale items.");
    return null;
  }

  const lines = items.map((item) => ({
    quotationItemId: item.id,
    productId: item.product_id,
    variationId: item.variation_id,
    quantity: asNumber(item.quantity),
    unitPrice: asNumber(item.unit_price),
    lineDiscount: asNumber(item.discount_amount),
    lineTax: asNumber(item.tax_amount),
  }));
  if (lines.some((line) => !line.productId || line.quantity <= 0)) return null;

  return {
    quotationId: quotation.id,
    reference: quotation.reference,
    customerId: quotation.profile_id,
    billingAddressId: quotation.billing_address_id,
    shippingAddressId: quotation.shipping_address_id,
    expectedDeliveryDate: quotation.required_by,
    discountAmount: asNumber(quotation.discount_amount),
    taxAmount: asNumber(quotation.tax_amount),
    customerNotes: quotation.customer_notes,
    internalNotes: quotation.internal_notes,
    paymentTerms: quotation.payment_terms,
    deliveryInformation: quotation.delivery_information,
    termsAndConditions: quotation.terms_and_conditions,
    lines,
  };
}
