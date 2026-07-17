import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { siteConfig } from "@/config/site";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { dashboardPathForRole, routes } from "@/lib/constants/routes";

export async function PublicHeader() {
  await connection();
  const { user, profile } = await getCurrentProfile();
  const dash = user ? dashboardPathForRole(profile?.role) : null;
  const label = profile?.role === "admin" ? "Admin Dashboard" : profile?.role === "employee" ? "Employee Dashboard" : "My Account";
  return <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur"><div className="border-b border-[var(--border)] bg-[var(--surface)]"><Container className="py-2 text-xs font-medium text-[var(--muted-text)] sm:text-sm">Enterprise technology, industrial sourcing and global delivery solutions.</Container></div><Container className="flex min-h-18 items-center justify-between gap-6 py-3"><Link href={routes.home} className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" aria-label={`${siteConfig.company.fullName} home`}><Image src={siteConfig.brandAsset.logo} alt={siteConfig.company.logoAlt} width={154} height={45} className="h-auto w-[154px]" priority /></Link><nav className="hidden lg:block" aria-label="Public navigation"><ul className="flex items-center gap-7 text-sm font-semibold text-[var(--muted-text)]">{siteConfig.navigation.map((item) => <li key={item.href}><Link href={item.href} className="transition hover:text-[var(--foreground)]">{item.label}</Link></li>)}</ul></nav><div className="hidden items-center gap-3 lg:flex">{dash ? <><Link href={dash} className="text-sm font-semibold text-[var(--muted-text)] hover:text-[var(--foreground)]">{label}</Link><Link href={routes.logout} prefetch={false} className="text-sm font-semibold text-[var(--muted-text)] hover:text-[var(--foreground)]">Logout</Link></> : <><Link href={routes.login} className="text-sm font-semibold text-[var(--muted-text)] hover:text-[var(--foreground)]">Login</Link><Button href={routes.register} variant="secondary" size="sm">Create account</Button><Button href={siteConfig.publicCtas.requestQuote.href} size="sm">Request a Quote</Button></>} </div><MobileNavigation isAuthenticated={Boolean(user)} dashboardHref={dash ?? undefined} dashboardLabel={label} /></Container></header>;
}
