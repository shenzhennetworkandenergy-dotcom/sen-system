import Image from "next/image";
import { routes } from "@/lib/constants/routes";
import { adminNavigation, visibleEmployeeNavigation } from "@/lib/navigation/dashboard";
import { DashboardNavigation } from "@/components/dashboard/DashboardNavigation";

export function DashboardShell({ title, subtitle, children, admin = false, employeePermissions }: { title: string; subtitle: string; children: React.ReactNode; admin?: boolean; employeePermissions?: Iterable<string> }) {
  const navigation = admin ? adminNavigation : employeePermissions ? visibleEmployeeNavigation(employeePermissions) : [];
  return <div className="min-h-screen bg-[var(--muted-surface)]">
    <header className="border-b border-[var(--border)] bg-[var(--surface)]"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4"><a href={routes.home} className="flex items-center gap-3"><Image src="/brand/sen-logo.svg" alt="SEN logo" width={137} height={40} className="h-10 w-auto" priority /><span className="font-semibold">Dashboard</span></a><nav className="flex gap-4 text-sm font-semibold"><a href={routes.home}>View Public Website</a><a href={routes.logout}>Logout</a></nav></div></header>
    <div className={`mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:py-8 ${navigation.length ? "lg:grid-cols-[18rem_minmax(0,1fr)]" : ""}`}>
      {navigation.length ? <DashboardNavigation items={navigation}/> : null}
      <main className="min-w-0"><div className="mb-6"><h1 className="text-3xl font-bold">{title}</h1><p className="mt-2 text-[var(--muted-text)]">{subtitle}</p></div>{children}</main>
    </div>
  </div>;
}
