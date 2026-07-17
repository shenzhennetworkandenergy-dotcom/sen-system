import { DashboardShell } from "@/components/layout/DashboardShell";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function EmployeePage() {
  const profile = await requireActiveProfile(["employee"]);
  return <DashboardShell profile={profile}><section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Employee Workspace</h2><p className="mt-2 text-[var(--muted-text)]">Access assigned SEN operational workflows.</p></section></DashboardShell>;
}
