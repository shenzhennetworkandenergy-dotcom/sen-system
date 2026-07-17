import type { ReactNode } from "react";

import { dashboardTitleForRole } from "@/lib/auth/destinations";
import type { CurrentProfile } from "@/lib/auth/types";
import { routes } from "@/lib/constants/routes";
import { LogoutButton } from "@/components/layout/LogoutButton";

export function DashboardShell({ profile, children }: { profile: CurrentProfile; children: ReactNode }) {
  return <div className="min-h-screen bg-[var(--muted-surface)]"><header className="border-b border-[var(--border)] bg-[var(--surface)]"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">{profile.role}</p><h1 className="text-2xl font-semibold">{dashboardTitleForRole(profile.role)}</h1><p className="text-sm text-[var(--muted-text)]">Status: {profile.status}</p></div><nav className="flex items-center gap-4" aria-label="Dashboard navigation"><a href={routes.home} className="text-sm font-semibold text-[var(--primary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">View Public Website</a><LogoutButton /></nav></div></header><main className="mx-auto max-w-6xl px-6 py-10">{children}</main></div>;
}
