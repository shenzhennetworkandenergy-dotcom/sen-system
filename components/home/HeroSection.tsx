import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/Button";
import { SafeImage } from "@/components/ui/SafeImage";
import { Section } from "@/components/ui/Section";
import { heroImages } from "@/components/home/homeData";

export function HeroSection() {
  return (
    <Section className="overflow-hidden bg-[linear-gradient(135deg,var(--background),var(--muted-surface))] py-20 sm:py-28">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Shenzhen Energy & Networks</p>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-6xl">Integrated Technology Solutions for Modern Business</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted-text)]">SEN supplies and sources enterprise technology, energy, medical and industrial products while supporting customers through China-based procurement, Bangladesh operations and global delivery coordination.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button href={siteConfig.publicCtas.exploreProducts.href} size="lg">Explore Products</Button><Button href={siteConfig.publicCtas.requestQuote.href} size="lg" variant="outline">Request a Quote</Button><a className="inline-flex items-center justify-center px-2 text-sm font-semibold text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" href={siteConfig.publicCtas.learnAbout.href}>Learn About SEN</a></div>
        </div>
        <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
          <SafeImage src={heroImages[0].src} alt={heroImages[0].alt} width={1920} height={1080} priority className="aspect-video w-full rounded-[calc(var(--radius-lg)-0.45rem)] object-cover" sizes="(min-width: 1024px) 46vw, 100vw" />
          <div className="pointer-events-none absolute inset-x-6 bottom-6 rounded-2xl border border-white/60 bg-white/85 px-5 py-4 shadow-sm backdrop-blur">
            <p className="text-sm font-semibold text-[var(--foreground)]">Global sourcing network</p>
            <p className="mt-1 text-xs text-[var(--muted-text)]">Enterprise compute, networks, industrial automation and healthcare technology.</p>
          </div>
        </div>
      </div>
    </Section>
  );
}
