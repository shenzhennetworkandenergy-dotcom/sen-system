import Image from "next/image";

import { dashboardLabelForRole, destinationForRole } from "@/lib/auth/destinations";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { siteConfig } from "@/config/site";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { LogoutButton } from "@/components/layout/LogoutButton";
import { MobileNavigation } from "@/components/layout/MobileNavigation";

export async function PublicHeader() {
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile(supabase);
  const activeProfile = profile?.status === "active" ? profile : null;
  if (profile && !activeProfile) await supabase.auth.signOut();
  const dashboardLink = activeProfile ? { href: destinationForRole(activeProfile.role), label: dashboardLabelForRole(activeProfile.role) } : null;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur">
      <div className="border-b border-[var(--border)] bg-[var(--surface)]">
        <Container className="py-2 text-xs font-medium text-[var(--muted-text)] sm:text-sm">
          Enterprise technology, industrial sourcing and global delivery solutions.
        </Container>
      </div>
      <Container className="flex min-h-18 items-center justify-between gap-6 py-3">
        <a href={siteConfig.routes.home} className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" aria-label={`${siteConfig.company.fullName} home`}>
          <Image src={siteConfig.brandAsset.logo} alt={siteConfig.company.logoAlt} width={154} height={45} priority style={{ width: "154px", height: "auto" }} />
        </a>
        <nav className="hidden lg:block" aria-label="Public navigation">
          <ul className="flex items-center gap-7 text-sm font-semibold text-[var(--muted-text)]">
            {siteConfig.navigation.map((item) => <li key={item.href}><a href={item.href} className="transition hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{item.label}</a></li>)}
          </ul>
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          <a href={siteConfig.routes.search} className="text-sm font-semibold text-[var(--muted-text)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Search</a>
          {dashboardLink ? <><a href={dashboardLink.href} className="text-sm font-semibold text-[var(--primary)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{dashboardLink.label}</a><LogoutButton /></> : <><a href={siteConfig.routes.login} className="text-sm font-semibold text-[var(--muted-text)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Login</a><a href={siteConfig.routes.register} className="text-sm font-semibold text-[var(--muted-text)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Create account</a></>}
          <Button href={siteConfig.publicCtas.requestQuote.href} size="sm">{siteConfig.publicCtas.requestQuote.label}</Button>
        </div>
        <MobileNavigation dashboardLink={dashboardLink} />
      </Container>
    </header>
  );
}
