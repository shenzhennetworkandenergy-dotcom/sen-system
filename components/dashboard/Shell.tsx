import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import type { Profile } from "@/lib/auth/types";

export function DashboardShell({ title, profile, nav, children }: { title: string; profile: Profile; nav: { href: string; label: string; soon?: boolean }[]; children: React.ReactNode }) {
  return <div className="min-h-screen bg-[var(--muted-surface)]"><aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-[var(--border)] bg-[var(--surface)] p-5 lg:block"><Link href="/"><Image src="/brand/sen-logo.svg" alt="SEN — Shenzhen Energy & Networks" width={190} height={82} className="h-auto w-44"/></Link><nav className="mt-8 space-y-1">{nav.map(item => <Link key={item.href} href={item.href} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold hover:bg-[var(--muted-surface)]"><span>{item.label}</span>{item.soon ? <span className="text-xs text-[var(--muted-text)]">3B</span> : null}</Link>)}</nav></aside><main className="lg:pl-72"><header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4"><div><p className="text-sm text-[var(--muted-text)]">{profile.role} · {profile.status}</p><h1 className="text-2xl font-bold">{title}</h1></div><form action={logoutAction}><button className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold">Logout</button></form></header><div className="p-5 lg:p-8">{children}</div></main></div>;
}
