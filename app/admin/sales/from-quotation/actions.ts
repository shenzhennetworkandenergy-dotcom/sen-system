"use server";

import { requireAllPermissions } from "@/lib/auth/permissions";
import { resolveQuotationViewScope } from "@/lib/quotations/access-policy";
import { getEligibleQuotationOptions } from "@/lib/quotations/sale-candidates";
import {
  QUOTATION_SALE_CONVERSION_PERMISSIONS,
  type EligibleQuotationOption,
} from "@/lib/quotations/sale-conversion-types";

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

  try {
    const { options } = await getEligibleQuotationOptions(profile, { query });
    return { options, error: null };
  } catch {
    console.error("Unable to search eligible quotations.");
    return { options: [], error: "Unable to search quotations right now." };
  }
}
