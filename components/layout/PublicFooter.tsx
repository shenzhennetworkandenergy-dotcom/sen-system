import Image from "next/image";

import { siteConfig } from "@/config/site";
import { Container } from "@/components/ui/Container";

export function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Footer</h2>
      <Container className="grid gap-10 py-12 lg:grid-cols-[1.4fr_2fr]">
        <div>
          <Image src={siteConfig.brandAsset.logo} alt={siteConfig.company.logoAlt} width={150} height={44} style={{ width: "150px", height: "auto" }} />
          <p className="mt-4 text-base font-semibold text-[var(--foreground)]">{siteConfig.company.fullName}</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-text)]">{siteConfig.description}</p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {siteConfig.footerGroups.map((group) => (
            <nav key={group.title} aria-labelledby={`footer-${group.title.toLowerCase().replaceAll(" ", "-")}`}>
              <h3 id={`footer-${group.title.toLowerCase().replaceAll(" ", "-")}`} className="text-sm font-semibold text-[var(--foreground)]">{group.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-[var(--muted-text)]">
                {group.links.map((link) => <li key={link.href}><a className="hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" href={link.href}>{link.label}</a></li>)}
              </ul>
            </nav>
          ))}
        </div>
      </Container>
      <Container className="border-t border-[var(--border)] py-5 text-sm text-[var(--muted-text)]">© {year} {siteConfig.company.fullName}. All rights reserved.</Container>
    </footer>
  );
}
