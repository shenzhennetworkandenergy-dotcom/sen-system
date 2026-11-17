import { connection } from "next/server";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/Shell";
import { QuotationTypeahead } from "@/components/sales/QuotationTypeahead";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { customerPrimaryName } from "@/lib/customers/search";
import { resolveQuotationViewScope } from "@/lib/quotations/access-policy";
import { quotationCustomerOptions } from "@/lib/quotations/customer-options";
import { quotationListFilters } from "@/lib/quotations/list-filters";
import { getEligibleQuotationOptions, QUOTATION_CUSTOMER_PAGE_SIZE } from "@/lib/quotations/sale-candidates";
import { QUOTATION_SALE_CONVERSION_PERMISSIONS, quotationSaleDestination } from "@/lib/quotations/sale-conversion-types";
import { isQuotationExpired } from "@/lib/quotations/workflow";

export const dynamic = "force-dynamic";

const todayInDhaka = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" });

export default async function SalesFromQuotationPage({ searchParams }: {
  searchParams: Promise<{ customer?: string | string[]; page?: string | string[] }>;
}) {
  await connection();
  const { profile, permissions } = await requireAllPermissions([
    ...QUOTATION_SALE_CONVERSION_PERMISSIONS,
  ]);
  const scope = resolveQuotationViewScope(profile.role, permissions);
  if (!scope) {
    redirect("/admin/sales?error=Quotation%20access%20denied.");
  }
  const params = await searchParams;
  const filter = quotationListFilters({ customer: params.customer });
  const pageNumber = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 &&
    (pageNumber - 1) * QUOTATION_CUSTOMER_PAGE_SIZE <= 2_147_483_647 ? pageNumber : 1;
  const today = todayInDhaka.format(new Date());
  const pageHref = (customerId: string, nextPage: number) =>
    `/admin/sales/from-quotation?${new URLSearchParams({ customer: customerId, page: String(nextPage) })}`;

  let customer = null;
  let results = null;
  let error = filter.error;
  if (filter.customer && !error) {
    try {
      const [selected] = await quotationCustomerOptions({ quotationViewScope: scope, profile }, { id: filter.customer });
      if (selected) {
        customer = selected;
        results = await getEligibleQuotationOptions(profile, { customerId: selected.id, page });
      } else {
        error = "The selected customer is unavailable.";
      }
    } catch {
      error = "Unable to load accepted quotations right now.";
    }
  }

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Create Sale from Quotation"
      subtitle="Search by customer or quotation reference. Accepted quotations remain available after their validity date."
    >
      <section className="rounded-xl border bg-[var(--surface)] p-5">
        <QuotationTypeahead customer={customer} today={today} />
      </section>
      {error ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p> : null}
      {customer && results ? (
        <section className="mt-4 rounded-xl border bg-[var(--surface)]">
          <h2 className="p-4 text-lg font-bold">Accepted quotations for {customerPrimaryName(customer)}</h2>
          {results.options.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead><tr><th scope="col">Quotation</th><th scope="col">Validity</th><th scope="col">Total</th><th scope="col">Action</th></tr></thead>
                <tbody>
                  {results.options.map((quote) => (
                    <tr key={quote.quotationId} className="border-t">
                      <td className="font-semibold">{quote.reference}</td>
                      <td>
                        {quote.expirationDate ? <time dateTime={quote.expirationDate}>{quote.expirationDate}</time> : "—"}
                        {isQuotationExpired(quote.expirationDate, today) ? (
                          <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Validity expired</span>
                        ) : null}
                      </td>
                      <td>{quote.currency} {quote.totalAmount.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td><a className="inline-block rounded-lg border px-3 py-1.5 font-semibold"
                        href={quotationSaleDestination(quote.quotationId) ?? undefined}
                        aria-label={`Create sale from ${quote.reference}`}>Create sale</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="px-4 pb-4 text-sm text-[var(--muted-text)]">No accepted quotations on this page.</p>}
          {page > 1 || results.hasMore ? (
            <nav aria-label="Accepted quotation pages" className="flex items-center gap-3 border-t p-4 text-sm">
              {page > 1 ? <a className="rounded-lg border px-3 py-1.5" href={pageHref(customer.id, page - 1)}>Previous</a> : null}
              <span>Page {page}</span>
              {results.hasMore ? <a className="rounded-lg border px-3 py-1.5" href={pageHref(customer.id, page + 1)}>Next</a> : null}
            </nav>
          ) : null}
        </section>
      ) : null}
    </DashboardShell>
  );
}
