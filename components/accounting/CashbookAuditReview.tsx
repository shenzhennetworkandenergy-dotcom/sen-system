import { approveCashbookAuditAction, requestCashbookCorrectionAction } from "@/app/admin/accounting/audit/actions";
import { QuickCashbook } from "@/components/accounting/QuickCashbook";
import { getBusinessDateTimeLocal } from "@/lib/accounting/cashbook";
import type { CashbookAuditDay, CashbookAuditStatement, CashbookAuditStatus } from "@/lib/accounting/audit";
import Link from "next/link";

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

export function CashbookAuditReview({ day, statement }: { day: CashbookAuditDay; statement: CashbookAuditStatement }) {
  const canReview = day.auditStatus === "PENDING_AUDIT";
  const statementDay = {
    ...statement.day,
    businessDate: day.businessDate,
    openingBalance: day.openingBalance,
    closingBalance: day.closingBalance,
    isClosed: true,
    closedAt: day.closedAt,
    auditStatus: day.auditStatus,
    correctionReason: day.correctionReason,
    reviewedAt: day.reviewedAt,
    reviewedBy: day.reviewedBy.id,
    reviewedByName: day.reviewedBy.name,
  };

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Link href="/admin/accounting/audit" className="font-semibold text-[var(--primary)]">← Cashbook Audit</Link>
      <div className="text-right">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--muted-text)]">Current Audit Status</p>
        <span className={`rounded-full border px-3 py-1 text-sm font-bold ${statusClasses[day.auditStatus]}`}>
          {labels[day.auditStatus]}
        </span>
      </div>
    </div>

    <section className="rounded-2xl border bg-[var(--surface)] p-5">
      <h2 className="text-xl font-bold">Daily Cash Statement · {day.businessDate}</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs text-[var(--muted-text)]">Opening Balance</dt><dd className="font-bold">{money(day.openingBalance)}</dd></div>
        <div><dt className="text-xs text-[var(--muted-text)]">Total Income</dt><dd className="font-bold">{money(day.income)}</dd></div>
        <div><dt className="text-xs text-[var(--muted-text)]">Total Expense</dt><dd className="font-bold">{money(day.expense)}</dd></div>
        <div><dt className="text-xs text-[var(--muted-text)]">Closing Balance</dt><dd className="font-bold">{money(day.closingBalance)}</dd></div>
      </dl>
      <dl className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-[var(--muted-text)]">Closed By</dt><dd>{day.closedBy.name}</dd></div>
        <div><dt className="text-xs text-[var(--muted-text)]">Closed At</dt><dd>{dateTime(day.closedAt)}</dd></div>
        {day.reviewedAt ? <div><dt className="text-xs text-[var(--muted-text)]">Reviewed By</dt><dd>{day.reviewedBy.name}</dd></div> : null}
        {day.reviewedAt ? <div><dt className="text-xs text-[var(--muted-text)]">Reviewed At</dt><dd>{dateTime(day.reviewedAt)}</dd></div> : null}
      </dl>
      {day.correctionReason ? <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950"><strong>Correction reason:</strong> {day.correctionReason}</p> : null}
      {day.reviewComment && day.reviewComment !== day.correctionReason ? <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><strong>Review comment:</strong> {day.reviewComment}</p> : null}
    </section>

    <div className="mt-4">
      <QuickCashbook
        selectedDate={statement.selectedDate}
        defaultOccurredAt={`${statement.selectedDate}T12:00`}
        statementGeneratedAt={getBusinessDateTimeLocal()}
        descriptions={statement.descriptions}
        entries={statement.entries}
        summary={statement.summary}
        day={statementDay}
        canCreate={false}
        canCreateDescription={false}
        showReference
        readOnly
      />
    </div>

    {canReview ? <section className="mt-4 rounded-2xl border bg-[var(--surface)] p-5">
      <h2 className="text-lg font-bold">Record audit decision</h2>
      <div className="mt-3 flex flex-wrap items-start gap-3">
        <form action={approveCashbookAuditAction}>
          <input type="hidden" name="business_date" value={day.businessDate} />
          <button className="rounded-lg bg-emerald-700 px-4 py-3 font-bold text-white hover:bg-emerald-800">Approve</button>
        </form>
        <form action={requestCashbookCorrectionAction} className="flex min-w-[min(100%,32rem)] flex-1 flex-wrap gap-2">
          <input type="hidden" name="business_date" value={day.businessDate} />
          <label className="sr-only" htmlFor="cashbook-correction-reason">Correction reason</label>
          <textarea id="cashbook-correction-reason" name="reason" required minLength={1} maxLength={1000} rows={2} placeholder="Required correction reason" className="min-w-0 flex-1 rounded-lg border px-3 py-2" />
          <button className="self-end rounded-lg border border-amber-600 px-4 py-2.5 font-bold text-amber-800 hover:bg-amber-50">Request Correction</button>
        </form>
      </div>
    </section> : null}
  </>;
}
