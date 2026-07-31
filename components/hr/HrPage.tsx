import { DashboardShell } from "@/components/dashboard/Shell";
import { HrAdminNavigation } from "./HrAdminNavigation";

export function HrPage({
  title,
  subtitle,
  success,
  warning,
  error,
  children,
}: {
  title: string;
  subtitle: string;
  success?: string;
  warning?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <DashboardShell admin title={title} subtitle={subtitle}>
      <HrAdminNavigation />
      {success ? <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">{success}</p> : null}
      {warning ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">{warning}</p> : null}
      {error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-900">{error}</p> : null}
      {children}
    </DashboardShell>
  );
}

export const hrField = "mt-1 w-full rounded-lg border bg-[var(--surface)] px-3 py-2.5 font-normal";
export const hrCard = "rounded-2xl border bg-[var(--surface)] p-5 shadow-sm";
export const hrPrimary = "rounded-lg bg-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-foreground)]";
export const hrSecondary = "rounded-lg border px-4 py-2.5 font-semibold hover:bg-[var(--muted-surface)]";

export function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function display(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "—";
}
