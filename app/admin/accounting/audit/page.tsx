import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { getCashbookAuditDays } from "@/lib/accounting/audit";
import { requirePermission } from "@/lib/auth/permissions";
import type { CashbookAuditStatus } from "@/lib/accounting/audit";

export const dynamic = "force-dynamic";

const labels: Record<CashbookAuditStatus, string> = {
  OPEN: "Open",
  PENDING_AUDIT: "Pending Audit",
  CORRECTION_REQUIRED: "Correction Required",
  APPROVED: "Approved",
};
const statusClasses: Record<CashbookAuditStatus, string> = {
  OPEN: "border-slate-300 bg-slate-100 text-slate-800",
  PENDING_AUDIT: "border-blue-300 bg-blue-50 text-blue-900",
  CORRECTION_REQUIRED: "border-amber-300 bg-amber-50 text-amber-950",
  APPROVED: "border-emerald-300 bg-emerald-50 text-emerald-950",
};
const money = (value: number) => `৳ ${Number(value || 0).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export default async function CashbookAuditPage() {
  await connection();
  const { profile, permissions } = await requirePermission("accounting.audit_cashbook");
  const days = await getCashbookAuditDays();
  const pendingCount = days.filter((day) => day.auditStatus === "PENDING_AUDIT").length;

  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Cashbook Audit" subtitle="Review finalized daily cash statements and record an auditable decision.">
    <section className="rounded-2xl border bg-[var(--surface)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Closed Cashbook Days</h2>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-900">{pendingCount} Pending Audit</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead><tr className="border-b"><th className="p-3">Business Date</th><th>Opening Balance</th><th>Total Income</th><th>Total Expense</th><th>Closing Balance</th><th>Closed By</th><th>Closed At</th><th>Audit Status</th><th>Action</th></tr></thead>
          <tbody>
            {days.map((day) => <tr className={`border-b last:border-0 ${day.auditStatus === "PENDING_AUDIT" ? "bg-blue-50/60" : ""}`} key={day.businessDate}>
              <td className="p-3 font-bold">{day.businessDate}</td>
              <td>{money(day.openingBalance)}</td>
              <td>{money(day.income)}</td>
              <td>{money(day.expense)}</td>
              <td className="font-semibold">{money(day.closingBalance)}</td>
              <td>{day.closedBy.name}</td>
              <td>{dateTime(day.closedAt)}</td>
              <td><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses[day.auditStatus]}`}>{labels[day.auditStatus]}</span>{day.correctionReason ? <span className="mt-1 block max-w-[14rem] truncate text-xs text-amber-900" title={day.correctionReason}>Reason: {day.correctionReason}</span> : null}</td>
              <td><a href={`/admin/accounting/audit/${encodeURIComponent(day.businessDate)}`} className="inline-flex rounded-lg border px-3 py-2 font-semibold hover:bg-slate-50">Review</a></td>
            </tr>)}
          </tbody>
        </table>
        {!days.length ? <p className="p-8 text-center text-[var(--muted-text)]">No closed cashbook days yet.</p> : null}
      </div>
    </section>
  </DashboardShell>;
}
