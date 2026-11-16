"use client";
export function PrintButton({ label = "Open print dialog" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="print:hidden rounded bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">{label}</button>;
}
