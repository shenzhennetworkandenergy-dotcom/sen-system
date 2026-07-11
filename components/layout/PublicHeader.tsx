import Image from "next/image";

import { siteConfig } from "@/config/site";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { MobileNavigation } from "@/components/layout/MobileNavigation";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07111f]/92 text-white backdrop-blur-xl">
      <Container className="flex min-h-20 items-center justify-between gap-6 py-3">
        <a href={siteConfig.routes.home} className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" aria-label={`${siteConfig.company.fullName} home`}>
          <Image src={siteConfig.brandAsset.logo} alt={siteConfig.company.logoAlt} width={154} height={120} priority className="h-12 w-auto object-contain" />
        </a>
        <nav className="hidden lg:block" aria-label="Public navigation">
          <ul className="flex items-center gap-7 text-sm font-semibold text-slate-300">
            {siteConfig.navigation.map((item) => (
              <li key={item.href}><a href={item.href} className="transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{item.label}</a></li>
            ))}
          </ul>
        </nav>
        <div className="hidden items-center gap-3 lg:flex"><Button href={siteConfig.publicCtas.requestQuote.href} size="sm">Request Quote</Button></div>
        <MobileNavigation />
      </Container>
    </header>
  );
}
