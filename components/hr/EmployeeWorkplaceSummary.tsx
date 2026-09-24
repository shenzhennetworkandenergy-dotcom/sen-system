import type { EmployeeWorkplaceSummary as EmployeeWorkplaceSummaryData } from "@/lib/hr/profile-workplace-domain";

export function EmployeeWorkplaceSummary({ summary }: { summary: EmployeeWorkplaceSummaryData }) {
  return (
    <section className="rounded-2xl border bg-[var(--surface)] p-6">
      <p className="text-sm text-[var(--muted-text)]">Employee assignments</p>
      <h2 className="text-xl font-semibold">Workplace and warehouse</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border bg-[var(--muted-surface)] p-4">
          <p className="text-sm font-semibold text-[var(--muted-text)]">Primary work location</p>
          <p className="mt-2 font-bold">{summary.workplace ? `${summary.workplace.name} (${summary.workplace.code})` : "No work location assigned"}</p>
          {summary.workplace ? <p className="mt-1 text-sm text-[var(--muted-text)]">{summary.workplace.location}</p> : null}
        </article>
        <article className="rounded-xl border bg-[var(--muted-surface)] p-4">
          <p className="text-sm font-semibold text-[var(--muted-text)]">Primary warehouse</p>
          <p className="mt-2 font-bold">{summary.warehouse ? `${summary.warehouse.name} (${summary.warehouse.code})` : "No warehouse assigned"}</p>
          {summary.warehouse ? <p className="mt-1 text-sm text-[var(--muted-text)]">{summary.warehouse.location}</p> : null}
        </article>
      </div>
    </section>
  );
}
