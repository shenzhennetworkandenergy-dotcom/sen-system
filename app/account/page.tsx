import { DashboardShell } from "@/components/layout/DashboardShell";
import { requireActiveProfile } from "@/lib/auth/guards";

export default async function AccountPage() {
  const profile = await requireActiveProfile(["customer"]);
  return <DashboardShell profile={profile}><section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Customer Account</h2><p className="mt-2 text-[var(--muted-text)]">Review account activity and customer services.</p></section></DashboardShell>;
}
