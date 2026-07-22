import Image from "next/image";
import { routes } from "@/lib/constants/routes";
import { adminNavigation, visibleEmployeeNavigation } from "@/lib/navigation/dashboard";
import { DashboardNavigation } from "@/components/dashboard/DashboardNavigation";

type DashboardShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  admin?: boolean;
  employeePermissions?: Iterable<string>;
};

export function DashboardShell({ title, subtitle, children, admin = false, employeePermissions }: DashboardShellProps) {
  const navigation = admin ? adminNavigation : employeePermissions ? visibleEmployeeNavigation(employeePermissions) : [];

  return <div className="min-h-screen bg-[linear-gradient(135deg,var(--muted-surface),var(--background))]">
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[color:var(--surface)]/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[100rem] items-center justify-between gap-4 px-3 sm:px-5">
        <a href={routes.home} className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <span className="grid h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
            <Image src="/brand/sen-official-logo.png" alt="SEN logo" width={144} height={144} className="h-full w-full object-contain" priority />
          </span>
          <span className="min-w-0"><strong className="block truncate text-sm leading-4">SEN Control Center</strong><span className="hidden text-[11px] text-[var(--muted-text)] sm:block">Operations dashboard</span></span>
        </a>
        <nav aria-label="Account navigation" className="flex shrink-0 items-center gap-1 text-xs font-semibold sm:gap-2 sm:text-sm">
          <a href={routes.home} className="rounded-lg px-2.5 py-2 hover:bg-[var(--muted-surface)] sm:px-3">Public website</a>
          <a href={routes.logout} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 hover:bg-[var(--muted-surface)] sm:px-3">Logout</a>
        </nav>
      </div>
    </header>
    <div className={`mx-auto grid max-w-[100rem] gap-3 px-3 py-3 sm:px-5 sm:py-4 ${navigation.length ? "lg:grid-cols-[15rem_minmax(0,1fr)]" : ""}`}>
      {navigation.length ? <DashboardNavigation items={navigation}/> : null}
      <main className="min-w-0">
        <div className="mb-3 flex flex-col gap-0.5 border-b border-[var(--border)] pb-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight sm:text-[1.7rem]">{title}</h1><p className="mt-0.5 max-w-4xl text-sm text-[var(--muted-text)]">{subtitle}</p></div>
        </div>
        {children}
      </main>
    </div>
  </div>;
}
