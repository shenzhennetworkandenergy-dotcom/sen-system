import Image from "next/image";
import Link from "next/link";
import { routes } from "@/lib/constants/routes";

const adminItems = ["Overview", "Users", "Employees", "Employee Activity", "CRM", "Sales", "Inventory", "Purchasing", "Accounting", "HR", "Manufacturing", "Projects", "Support", "Reports", "AI Assistant", "Settings"];

export function DashboardShell({ title, subtitle, children, admin = false }: { title: string; subtitle: string; children: React.ReactNode; admin?: boolean }) {
  return <div className="min-h-screen bg-[var(--muted-surface)]">
    <header className="border-b border-[var(--border)] bg-[var(--surface)]"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4"><a href={routes.home} className="flex items-center gap-3"><Image src="/brand/sen-logo.svg" alt="SEN logo" width={137} height={40} className="h-10 w-auto" priority /><span className="font-semibold">Dashboard</span></a><nav className="flex gap-4 text-sm font-semibold"><a href={routes.home}>View Public Website</a><a href={routes.logout}>Logout</a></nav></div></header>
    <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[16rem_1fr]">
      {admin ? <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><nav className="space-y-1 text-sm">{adminItems.map((item) => <Link key={item} href={item === "Users" ? routes.adminUsers : routes.admin} className="block rounded-lg px-3 py-2 font-medium hover:bg-[var(--muted-surface)]">{item}</Link>)}</nav></aside> : null}
      <main className={admin ? "" : "lg:col-span-2"}><div className="mb-6"><h1 className="text-3xl font-bold">{title}</h1><p className="mt-2 text-[var(--muted-text)]">{subtitle}</p></div>{children}</main>
    </div>
  </div>;
}
