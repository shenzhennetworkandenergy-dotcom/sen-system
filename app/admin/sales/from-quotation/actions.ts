"use server";

import { requireAllPermissions } from "@/lib/auth/permissions";
import { resolveQuotationViewScope } from "@/lib/quotations/access-policy";
import {
  QUOTATION_SALE_CONVERSION_PERMISSIONS,
  type EligibleQuotationOption,
} from "@/lib/quotations/sale-conversion-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type EligibleQuotationSearchResult = {
  options: EligibleQuotationOption[];
  error: string | null;
};

type EligibleQuotationRpcRow = {
  quotation_id: string;
  reference: string;
  customer_id: string;
  customer_name: string | null;
  customer_company: string | null;
  customer_email: string | null;
  total_amount: number | string | null;
  currency: string | null;
  expiration_date: string | null;
};

const asNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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
    options: ((data ?? []) as EligibleQuotationRpcRow[]).map((row) => ({
      quotationId: row.quotation_id,
      reference: row.reference,
      customerId: row.customer_id,
      customerName: row.customer_name || row.customer_email || "Customer",
      customerCompany: row.customer_company,
      customerEmail: row.customer_email || "",
      totalAmount: asNumber(row.total_amount),
      currency: row.currency || "BDT",
      expirationDate: row.expiration_date,
    })),
    error: null,
  };
}
