import { siteConfig } from "@/config/site";
import { Container } from "@/components/ui/Container";

export function PublicHeader() {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--background)]">
      <Container className="flex min-h-16 items-center justify-between gap-8 py-4">
        <a
          href={siteConfig.routes.home}
          className="font-semibold tracking-tight text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          aria-label={`${siteConfig.company.fullName} home`}
        >
          {siteConfig.company.shortName}
        </a>
        <nav aria-label="Public navigation">
          <ul className="flex flex-wrap items-center gap-6 text-sm font-medium text-[var(--muted-text)]">
            {siteConfig.navigation.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="transition hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </header>
  );
}
