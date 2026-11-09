import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { QuotationStatusBadge } from "@/components/quotations/QuotationStatusBadge";
import { QuotationCustomerFilter } from "@/components/quotations/QuotationCustomerFilter";
import type { CustomerSearchOption } from "@/lib/customers/search";
import { requireQuotationView } from "@/lib/quotations/access";
import { canOpenQuotationDocument } from "@/lib/quotations/access-policy";
import { quotationCustomerOptions } from "@/lib/quotations/customer-options";
import { literalQuotationPattern, quotationListFilters, quotationStatuses as statuses } from "@/lib/quotations/list-filters";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminQuotationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { profile, permissions, quotationViewScope } =
    await requireQuotationView();
  const canCreate =
    profile.role === "admin" || permissions.has("quotations.create");
  const canEdit =
    profile.role === "admin" || permissions.has("quotations.edit");
  const canOpenDocument = canOpenQuotationDocument(
    profile.role,
    permissions,
  );
  const params = await searchParams;
  const filters = quotationListFilters(params);
  let filterError = filters.error;
  let selectedCustomer: CustomerSearchOption | null = null;
  if (filters.customer && !filterError) {
    try {
      selectedCustomer = (await quotationCustomerOptions({ profile, quotationViewScope }, { id: filters.customer }))[0] ?? null;
      if (!selectedCustomer) filterError = "Selected customer is unavailable. Clear filters and choose again.";
    } catch {
      filterError = "Unable to verify the selected customer. Try again later.";
    }
  }
  const db = createSupabaseAdminClient();
  let query = db
    .from("quotation_requests")
    .select(
      "id,reference,status,subject,message,company_name,required_by,created_at,created_by,profiles!quotation_requests_profile_id_fkey(full_name,email,phone),quotation_request_items(product_name_snapshot,sku_snapshot,quantity,target_price)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (quotationViewScope === "own") {
    query = query.eq("created_by", profile.id);
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.q) query = query.ilike("reference", literalQuotationPattern(filters.q));
  if (filters.customer) query = query.eq("profile_id", filters.customer);
  if (filters.range) query = query.gte("created_at", filters.range.start).lt("created_at", filters.range.end);
  const { data, error } = filterError ? { data: [], error: null } : await query;

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={
        profile.role === "employee" ? permissions : undefined
      }
      title="Quotations"
      subtitle="Review product pricing and sourcing requests from customers."
    >
      {params.success ? (
        <p className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-900">
          {params.success}
        </p>
      ) : null}
      {params.error || filterError || error ? (
        <p className="mb-4 rounded-xl bg-red-50 p-4 text-red-900">
          {params.error ?? filterError ?? "Unable to load quotations."}
        </p>
      ) : null}
      {canCreate ? (
        <div className="mb-5 flex justify-end">
          <Link
            href="/admin/quotations/new"
            className="rounded-xl bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)]"
          >
            Create quotation
          </Link>
        </div>
      ) : null}
      <form key={`${filters.q}:${filters.date}:${filters.customer}:${filters.status}`} method="get" action="/admin/quotations" className="relative z-20 mb-5 grid items-end gap-3 rounded-2xl border bg-[var(--surface)] p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr_1fr_auto]">
        <label className="block text-sm font-semibold">Quotation number
          <input name="q" defaultValue={filters.q} maxLength={80} placeholder="Quotation number"
            className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-normal" />
        </label>
        <label className="block text-sm font-semibold">Date (Bangladesh)
          <input name="date" type="date" defaultValue={filters.date}
            className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-normal" />
        </label>
        <QuotationCustomerFilter key={filters.customer} initialCustomer={selectedCustomer} />
        <label className="block text-sm font-semibold">Status
        <select
          name="status"
          defaultValue={filters.status}
          className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm font-normal"
        >
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className="rounded-xl bg-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-foreground)]">Apply filters</button>
          {/* A full GET also resets unsaved input and typeahead state when already on the unfiltered URL. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/admin/quotations" className="text-sm font-semibold underline">Clear</a>
        </div>
      </form>
      <div className="grid gap-4">
        {(data ?? []).map((quotation) => {
          const customer = quotation.profiles as unknown as {
            full_name: string | null;
            email: string | null;
            phone: string | null;
          } | null;
          return (
            <article
              key={quotation.id}
              className="rounded-2xl border bg-[var(--surface)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <b className="text-[var(--primary)]">
                    {quotation.reference}
                  </b>
                  <h2 className="text-xl font-bold"><a href={`/admin/quotations/${quotation.id}/manage`} className="hover:text-[var(--primary)]">{quotation.subject}</a></h2>
                  <p className="text-sm text-[var(--muted-text)]">
                    {customer?.full_name ?? "Customer"} · {customer?.email} ·{" "}
                    {customer?.phone ?? "No phone"}
                  </p>
                </div>
                <QuotationStatusBadge status={quotation.status} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={`/admin/quotations/${quotation.id}/manage`} className="inline-flex rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--primary-foreground)]">Manage quotation</a>
                {canEdit && quotation.status === "draft" ? <a href={`/admin/quotations/${quotation.id}/edit`} className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold">Edit draft</a> : null}
                {canOpenDocument ? <a href={`/admin/quotations/${quotation.id}`} className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold">Print quotation</a> : null}
              </div>
              <p className="mt-3">{quotation.message || "No additional notes."}</p>
              <div className="mt-4 grid gap-2">
                {quotation.quotation_request_items?.map(
                  (
                    item: {
                      product_name_snapshot: string;
                      sku_snapshot: string | null;
                      quantity: number;
                    },
                    index: number,
                  ) => (
                    <p
                      key={`${quotation.id}-${index}`}
                      className="rounded-lg bg-[var(--muted-surface)] p-3 text-sm"
                    >
                      <b>{item.product_name_snapshot}</b> · SKU{" "}
                      {item.sku_snapshot ?? "—"} · Quantity {item.quantity}
                    </p>
                  ),
                )}
              </div>
            </article>
          );
        })}
        {!data?.length && !error && !filterError ? (
          <p className="rounded-2xl border p-10 text-center">
            No quotation requests found.
          </p>
        ) : null}
      </div>
    </DashboardShell>
  );
}
