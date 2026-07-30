"use client";

import Link from "next/link";

import { routes } from "@/lib/constants/routes";

export function MobileNavigation({
  isAuthenticated = false,
  dashboardHref,
  dashboardLabel = "My Account",
  profileHref = routes.profile,
  cartCount = 0,
}: {
  isAuthenticated?: boolean;
  dashboardHref?: string;
  dashboardLabel?: string;
  profileHref?: string;
  cartCount?: number;
}) {
  return (
    <details className="sen-mobile-nav relative z-[120] lg:hidden">
      <summary className="sen-mobile-menu-trigger">
        <span className="sen-mobile-menu-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>Menu</span>
      </summary>
      <div className="sen-mobile-menu-panel">
        <nav className="grid gap-2" aria-label="Mobile navigation">
          <Link href={routes.home} className="sen-mobile-menu-link">
            Home
          </Link>
          <Link href={routes.products} className="sen-mobile-menu-link">
            Products
          </Link>
          <Link href={routes.about} className="sen-mobile-menu-link">
            About
          </Link>
          <Link href={routes.contact} className="sen-mobile-menu-link">
            Contact
          </Link>
        {isAuthenticated ? (
          <>
            <Link
              href={routes.cart}
              className={`sen-mobile-menu-link ${cartCount > 0 ? "has-items" : ""}`}
            >
              Cart {cartCount > 0 ? `(${cartCount})` : ""}
            </Link>
            <Link
              href={dashboardHref ?? routes.account}
              className="sen-mobile-menu-link"
            >
              {dashboardLabel}
            </Link>
            <Link href={profileHref} className="sen-mobile-menu-link">
              My Profile
            </Link>
            <a href={routes.logout} className="sen-mobile-menu-link">
              Logout
            </a>
          </>
        ) : (
          <>
            <Link href={routes.login} className="sen-mobile-menu-link">
              Login
            </Link>
            <Link href={routes.register} className="sen-mobile-menu-link">
              Create account
            </Link>
            <Link href="/#contact" className="sen-mobile-menu-link is-primary">
              Request a Quote
            </Link>
          </>
        )}
        </nav>
      </div>
    </details>
  );
}
