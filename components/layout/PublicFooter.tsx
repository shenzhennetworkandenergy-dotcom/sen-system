import { siteConfig } from "@/config/site";
import { Container } from "@/components/ui/Container";

export function PublicFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
      <Container className="grid gap-8 py-10 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <p className="text-base font-semibold text-[var(--foreground)]">
            {siteConfig.company.fullName}
          </p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-text)]">
            {siteConfig.description}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Business categories</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted-text)]">
            {siteConfig.businessCategories.map((category) => (
              <li key={category.slug}>{category.label}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Contact</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted-text)]">
            <li>{siteConfig.contact.general}</li>
            <li>{siteConfig.contact.sales}</li>
            <li>{siteConfig.contact.support}</li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}
