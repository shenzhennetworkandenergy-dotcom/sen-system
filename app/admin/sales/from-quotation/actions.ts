"use server";

import { requireAllPermissions } from "@/lib/auth/permissions";
import { resolveQuotationViewScope } from "@/lib/quotations/access-policy";
import {
  QUOTATION_SALE_CONVERSION_PERMISSIONS,
  normalizeEligibleQuotationOptions,
  type EligibleQuotationOption,
} from "@/lib/quotations/sale-conversion-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type EligibleQuotationSearchResult = {
  options: EligibleQuotationOption[];
  error: string | null;
};

export async function searchEligibleQuotationsAction(
  requestedQuery: string,
): Promise<EligibleQuotationSearchResult> {
  const { profile, permissions } = await requireAllPermissions([
    ...QUOTATION_SALE_CONVERSION_PERMISSIONS,
  ]);
  const scope = resolveQuotationViewScope(profile.role, permissions);
  if (!scope) {
    return { options: [], error: "Quotation access is not available." };
  }

  const query = String(requestedQuery ?? "").trim().slice(0, 80);
  if (query.length < 2) return { options: [], error: null };

  const db = createSupabaseAdminClient();
  const { data, error } = await db.rpc(
    "search_eligible_quotations_for_sale",
    {
      actor_profile_id: profile.id,
      requested_query: query,
      requested_limit: 20,
    },
  );
  if (error) {
    console.error("Unable to search eligible quotations.");
    return { options: [], error: "Unable to search quotations right now." };
  }

  return {
    options: normalizeEligibleQuotationOptions(data),
    error: null,
  };
}
