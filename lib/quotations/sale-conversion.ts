import "server-only";

import { requireAllPermissions } from "@/lib/auth/permissions";
import { resolveQuotationViewScope } from "@/lib/quotations/access-policy";
import {
  QUOTATION_SALE_CONVERSION_PERMISSIONS,
  accessibleConvertedSaleDestination,
  isEligibleQuotationSalePrefill,
  normalizeQuotationSaleInitial,
  type QuotationSaleInitial,
  validateQuotationSaleAddresses,
} from "@/lib/quotations/sale-conversion-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const todayDate = () => new Date().toISOString().slice(0, 10);

export async function loadAccessibleConvertedSaleDestination(
  quotationId: string,
): Promise<string | null> {
  const { profile, permissions } = await requireAllPermissions([
    ...QUOTATION_SALE_CONVERSION_PERMISSIONS,
  ]);
  const scope = resolveQuotationViewScope(profile.role, permissions);
  if (!scope) return null;

  const db = createSupabaseAdminClient();
  let quotationQuery = db
    .from("quotation_requests")
    .select("converted_order_id")
    .eq("id", quotationId)
    .eq("status", "converted_to_sale")
    .not("converted_order_id", "is", null);
  if (scope === "own") {
    quotationQuery = quotationQuery.eq("created_by", profile.id);
  }
  const { data: quotation, error: quotationError } =
    await quotationQuery.maybeSingle();
  if (quotationError || !quotation) {
    if (quotationError) console.error("Unable to load converted quotation Sale link.");
    return null;
  }

  const { data: saleAccess, error: saleAccessError } = await db
    .from("sales_orders")
    .select("id,created_by")
    .eq("id", quotation.converted_order_id)
    .maybeSingle();
  if (saleAccessError || !saleAccess) {
    if (saleAccessError) console.error("Unable to verify converted quotation Sale access.");
    return null;
  }
  return accessibleConvertedSaleDestination(
    quotation.converted_order_id,
    saleAccess,
    { role: profile.role, profileId: profile.id, permissions },
  );
}

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
      "id,reference,profile_id,status,expiration_date,converted_order_id,billing_address_id,shipping_address_id,required_by,discount_amount,tax_amount,customer_notes,internal_notes,payment_terms,delivery_information,terms_and_conditions,profiles!quotation_requests_profile_id_fkey!inner(id,role,status)",
    )
    .eq("id", quotationId)
    .eq("status", "accepted")
    .is("converted_order_id", null)
    .or(`expiration_date.is.null,expiration_date.gte.${today}`)
    .eq("profiles.role", "customer")
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
    .select(
      "id,product_id,variation_id,quantity,unit_price,target_price,discount_amount,tax_amount",
    )
    .eq("quotation_id", quotation.id)
    .order("created_at");
  if (itemsError || !items?.length) {
    if (itemsError) console.error("Unable to load quotation sale items.");
    return null;
  }

  const customer = Array.isArray(quotation.profiles)
    ? quotation.profiles[0]
    : quotation.profiles;
  if (
    !isEligibleQuotationSalePrefill(
      {
        status: quotation.status,
        expirationDate: quotation.expiration_date,
        convertedOrderId: quotation.converted_order_id,
        customerRole: customer?.role,
        customerStatus: customer?.status,
      },
      today,
    )
  ) {
    return null;
  }
  const initial = normalizeQuotationSaleInitial(quotation, items);
  if (!initial) return null;

  const requestedAddressIds = [
    initial.shippingAddressId,
    initial.billingAddressId,
  ].filter((addressId): addressId is string => addressId !== null);
  if (!requestedAddressIds.length) {
    return validateQuotationSaleAddresses(initial, []);
  }
  const { data: addresses, error: addressesError } = await db
    .from("customer_addresses")
    .select("id")
    .eq("profile_id", initial.customerId)
    .in("id", requestedAddressIds)
    .limit(2);
  if (addressesError) {
    console.error("Unable to validate quotation sale addresses.");
    return null;
  }
  return validateQuotationSaleAddresses(
    initial,
    (addresses ?? []).map((address) => address.id),
  );
}
