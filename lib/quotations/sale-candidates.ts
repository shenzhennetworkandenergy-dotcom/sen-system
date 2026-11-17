import "server-only";

import { getVisibleCustomerIds, type CustomerVisibilityActor } from "@/lib/customers/visibility";
import { normalizeEligibleQuotationOptions } from "@/lib/quotations/sale-conversion-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const QUOTATION_CUSTOMER_PAGE_SIZE = 20;

export async function getEligibleQuotationOptions(
  actor: CustomerVisibilityActor,
  { query = "", customerId = null, page = 1 }: { query?: string; customerId?: string | null; page?: number },
) {
  const visibleIds = await getVisibleCustomerIds(actor);
  if (visibleIds !== null && (!visibleIds.length || (customerId && !visibleIds.includes(customerId)))) {
    return { options: [], hasMore: false };
  }
  const { data, error } = await createSupabaseAdminClient().rpc("search_eligible_quotations_for_sale", {
    actor_profile_id: actor.id,
    requested_query: query,
    requested_limit: customerId ? QUOTATION_CUSTOMER_PAGE_SIZE + 1 : QUOTATION_CUSTOMER_PAGE_SIZE,
    requested_customer_id: customerId,
    requested_offset: (page - 1) * QUOTATION_CUSTOMER_PAGE_SIZE,
    requested_visible_customer_ids: customerId ? [customerId] : visibleIds,
  });
  if (error) throw new Error("Unable to search eligible quotations.");
  return {
    options: normalizeEligibleQuotationOptions(data),
    hasMore: Array.isArray(data) && data.length > QUOTATION_CUSTOMER_PAGE_SIZE,
  };
}
