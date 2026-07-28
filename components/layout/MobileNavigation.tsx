"use client";

import Link from "next/link";

import { routes } from "@/lib/constants/routes";

export function MobileNavigation({
  isAuthenticated = false,
  dashboardHref,
  dashboardLabel = "My Account",
  cartCount = 0,
}: {
  isAuthenticated?: boolean;
  dashboardHref?: string;
  dashboardLabel?: string;
  cartCount?: number;
}) {
  return (
    <details className="sen-mobile-nav relative z-[120] lg:hidden">
      <summary className="cursor-pointer rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
        Menu
      </summary>
      <div className="fixed right-4 top-20 z-[130] grid w-64 gap-1 rounded-2xl border border-white/15 bg-[#090d2b]/98 p-4 text-sm font-semibold text-white shadow-2xl backdrop-blur-xl">
        {isAuthenticated ? (
          <>
            <Link href={routes.cart} className={cartCount > 0 ? "text-red-300" : ""}>
              Cart {cartCount > 0 ? `(${cartCount})` : ""}
            </Link>
            <Link href={dashboardHref ?? routes.account}>
              {dashboardLabel}
            </Link>
            <a href={routes.logout}>Logout</a>
          </>
        ) : (
          <>
            <Link href={routes.login}>Login</Link>
            <Link href={routes.register}>Create account</Link>
            <Link href="/#contact">Request a Quote</Link>
          </>
        )}
        <Link href="/">Home</Link>
      </div>
    </details>
  );
}
