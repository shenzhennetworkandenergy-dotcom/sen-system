import { DashboardShell } from "@/components/layout/DashboardShell";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function AdminPage() {
  const profile = await requireActiveProfile(["admin"]);
  return <DashboardShell profile={profile}><section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Admin Overview</h2><p className="mt-2 text-[var(--muted-text)]">Manage SEN operations, customers, and content.</p></section></DashboardShell>;
}
