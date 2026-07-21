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
  return <header className="sen-header sticky top-0 z-40"><div className="sen-announcement"><Container className="flex items-center justify-between gap-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] sm:text-xs"><span>Enterprise technology · Energy · Medical · Global sourcing</span><span className="hidden text-cyan-300 md:inline">China → Bangladesh → Worldwide</span></Container></div><Container className="flex min-h-20 items-center justify-between gap-5 py-2"><Link href={routes.home} className="sen-brand-link shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" aria-label={`${siteConfig.company.fullName} home`}><span className="sen-brand-mark"><Image src={siteConfig.brandAsset.logo} alt={siteConfig.company.logoAlt} width={160} height={160} className="h-full w-full object-contain" priority /></span><span className="hidden sm:block"><strong>SEN</strong><small>Shenzhen Energy &amp; Networks</small></span></Link><nav className="hidden lg:block" aria-label="Public navigation"><ul className="flex items-center gap-7 text-sm font-semibold">{siteConfig.navigation.map((item) => <li key={item.href}><Link href={item.href} className="sen-nav-link">{item.label}</Link></li>)}</ul></nav><div className="hidden items-center gap-3 lg:flex">{dash ? <><Link href={dash} className="sen-nav-link">{label}</Link><a href={routes.logout} className="sen-nav-link">Logout</a></> : <><Link href={routes.login} className="sen-nav-link">Login</Link><Button href={routes.register} variant="secondary" size="sm" className="sen-button-secondary">Create account</Button><Button href={siteConfig.publicCtas.requestQuote.href} size="sm" className="sen-button-glow">Request a Quote</Button></>} </div><MobileNavigation isAuthenticated={Boolean(user)} dashboardHref={dash ?? undefined} dashboardLabel={label} /></Container></header>;
}
