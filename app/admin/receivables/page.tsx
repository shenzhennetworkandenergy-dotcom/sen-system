import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { ReceivablesNavigation } from "@/components/receivables/ReceivablesNavigation";
import { requirePermission } from "@/lib/auth/permissions";
import { getReceivablesDashboard } from "@/lib/receivables/data";
import { resolveReceivablesReportScope } from "@/lib/receivables/reporting-access";

export const dynamic = "force-dynamic";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function metricCard(label: string, value: string, tone = "border-blue-200") {
  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-text)]">{label}</p>
      <strong className="mt-2 block text-2xl text-[var(--primary)]">{value}</strong>
    </article>
  );
}

export default async function ReceivablesPage() {
  await connection();
  const { profile, permissions } = await requirePermission("receivables.view");
  const reportScope = resolveReceivablesReportScope({ profile, permissions });
  const isAdmin = reportScope.isAdmin;
  const canViewCustomer = reportScope.canViewCustomerReceivables;
  const canViewLoans = reportScope.canViewLoans;
  const data = await getReceivablesDashboard(reportScope);

  return (
    <DashboardShell
      admin={isAdmin}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Receivables"
      subtitle="Operational control centre for money owed to SEN. Accounting remains the authoritative financial ledger."
    >
      <ReceivablesNavigation canViewCustomer={canViewCustomer} canViewLoans={canViewLoans} />
      {!canViewCustomer && !canViewLoans ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          You can open Receivables, but no financial category has been assigned to you.
        </p>
      ) : null}
      <div className="space-y-5">
        {data.byCurrency.map((summary) => (
          <section key={summary.currency} className="rounded-2xl border bg-[var(--surface)] p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--primary)]">{summary.currency} exposure</h2>
                <p className="text-sm text-[var(--muted-text)]">{summary.recordCount} open receivable(s)</p>
              </div>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">Operational view</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {metricCard("Total receivables", money(summary.totalOutstanding, summary.currency))}
              {canViewCustomer
                ? metricCard("Customer receivables", money(summary.customerOutstanding, summary.currency), "border-cyan-200")
                : null}
              {canViewLoans
                ? metricCard("Loans & advances", money(summary.nonSalesOutstanding, summary.currency), "border-violet-200")
                : null}
              {metricCard("Due today", money(summary.dueToday, summary.currency), "border-amber-200")}
              {metricCard("Due next 7 days", money(summary.dueThisWeek, summary.currency), "border-amber-200")}
              {metricCard("Past due", money(summary.overdue, summary.currency), "border-red-200")}
            </div>
            {canViewCustomer ? (() => {
              const customer = data.customerMetrics.find(
                (metric) => metric.currency === summary.currency,
              );
              return customer ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {metricCard("Customer current", money(customer.currentOutstanding, summary.currency), "border-blue-200")}
                  {metricCard("Customer no due date", money(customer.noDueDate, summary.currency), "border-slate-200")}
                  {metricCard("Collected this month", money(customer.collectedThisMonth, summary.currency), "border-green-200")}
                  {metricCard("Customer records", String(customer.recordCount), "border-cyan-200")}
                </div>
              ) : null;
            })() : null}
            {canViewLoans ? (() => {
              const loanMetrics = data.loanMetrics.filter(
                (metric) => metric.currency === summary.currency,
              );
              if (!loanMetrics.length) return null;
              const recoveredThisMonth = loanMetrics.reduce(
                (total, metric) => total + metric.recoveredThisMonth,
                0,
              );
              return (
                <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-violet-950">Non-Sales category breakdown</h3>
                    <span className="text-sm font-semibold text-green-800">
                      Recovered / adjusted this month: {money(recoveredThisMonth, summary.currency)}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {loanMetrics.map((metric) => (
                      <article key={`${metric.currency}-${metric.category}`} className="rounded-lg border bg-white p-3 text-sm">
                        <div className="flex justify-between gap-3"><strong>{metric.category.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</strong><span>{metric.accountCount} account(s)</span></div>
                        <p className="mt-1 font-bold text-[var(--primary)]">{money(metric.outstandingAmount, metric.currency)}</p>
                      </article>
                    ))}
                  </div>
                </div>
              );
            })() : null}
          </section>
        ))}

        {!data.byCurrency.length && (canViewCustomer || canViewLoans) ? (
          <section className="rounded-2xl border bg-[var(--surface)] p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--primary)]">No outstanding receivables</h2>
            <p className="mt-1 text-sm text-[var(--muted-text)]">Authorized Sales and non-Sales sources currently have no operational exposure.</p>
          </section>
        ) : null}

        {data.recent.length ? (
          <section className="rounded-2xl border bg-[var(--surface)] p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--primary)]">Recent open receivables</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {data.recent.map((row) => {
                const full = data.rows.find(
                  (candidate) => candidate.sourceType === row.sourceType && candidate.sourceId === row.sourceId,
                );
                return (
                  <article key={`${row.sourceType}-${row.sourceId}`} className="rounded-xl border bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{full?.partyName ?? full?.referenceNumber ?? "Receivable"}</p>
                        <p className="text-xs text-[var(--muted-text)]">{full?.referenceNumber} · {row.sourceType === "customer_sale" ? "Customer Sale" : "Loan / Advance"}</p>
                      </div>
                      <strong className="shrink-0 text-[var(--primary)]">{money(row.outstandingAmount, row.currency)}</strong>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </DashboardShell>
  );
}
