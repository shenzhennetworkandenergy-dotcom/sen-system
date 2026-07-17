"use client";
import Link from "next/link";
import { routes } from "@/lib/constants/routes";

export function MobileNavigation({ isAuthenticated = false, dashboardHref, dashboardLabel = "My Account" }: { isAuthenticated?: boolean; dashboardHref?: string; dashboardLabel?: string }) {
  return <details className="lg:hidden"><summary className="cursor-pointer rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold">Menu</summary><div className="absolute right-4 mt-3 grid w-56 gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg">{isAuthenticated ? <><Link href={dashboardHref ?? routes.account}>{dashboardLabel}</Link><Link href={routes.logout} prefetch={false}>Logout</Link></> : <><Link href={routes.login}>Login</Link><Link href={routes.register}>Create account</Link><Link href="/#contact">Request a Quote</Link></>}<Link href="/">Home</Link></div></details>;
}
