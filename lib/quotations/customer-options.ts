import "server-only";

import type { CustomerSearchOption } from "@/lib/customers/search";
import { literalQuotationPattern } from "@/lib/quotations/list-filters";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ViewContext = { quotationViewScope: "own" | "all"; profile: { id: string } };

export async function quotationCustomerOptions(context: ViewContext, search: { q?: string; id?: string }) {
  const q = search.q?.trim() ?? "";
  if (!search.id && (!q || q.length > 80)) return [];
  const db = createSupabaseAdminClient();
  const lookup = (field?: "full_name" | "company_name") => {
    // The inner relationship restricts suggestions to customers of visible quotations.
    // Filtering the parent profiles avoids duplicate customers from many quotations.
    let query = db.from("profiles").select(
      "id,full_name,email,company_name,quotation_requests!quotation_requests_profile_id_fkey!inner(id)",
    );
    if (context.quotationViewScope === "own") query = query.eq("quotation_requests.created_by", context.profile.id);
    if (search.id) query = query.eq("id", search.id);
    else if (field) query = query.ilike(field, literalQuotationPattern(q));
    return query.order("full_name").order("id")
      .limit(1, { referencedTable: "quotation_requests" })
      .limit(search.id ? 1 : 20).abortSignal(AbortSignal.timeout(5000));
  };
  const responses = search.id ? [await lookup()] : await Promise.all([lookup("full_name"), lookup("company_name")]);
  if (responses.some(result => result.error)) throw new Error("QUOTATION_CUSTOMER_LOOKUP_UNAVAILABLE");
  const unique = new Map<string, CustomerSearchOption>();
  for (const result of responses) for (const row of result.data ?? []) {
    unique.set(row.id, { id: row.id, full_name: row.full_name, email: row.email, company_name: row.company_name });
  }
  return [...unique.values()].sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "") || a.id.localeCompare(b.id)).slice(0, 20);
}
