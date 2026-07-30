"use client";

export function PrintReportButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-lg bg-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-foreground)] print:hidden">Print or save as PDF</button>;
}
