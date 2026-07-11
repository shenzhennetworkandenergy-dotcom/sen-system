import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";

export function HeroSection() {
  return <Section className="overflow-hidden bg-[linear-gradient(135deg,var(--background),var(--muted-surface))] py-20 sm:py-28">
    <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr]">
      <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Shenzhen Energy & Networks</p>
      <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-6xl">Integrated Technology Solutions for Modern Business</h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted-text)]">SEN supplies and sources enterprise technology, energy, medical and industrial products while supporting customers through China-based procurement, Bangladesh operations and global delivery coordination.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button href={siteConfig.publicCtas.exploreProducts.href} size="lg">Explore Products</Button><Button href={siteConfig.publicCtas.requestQuote.href} size="lg" variant="outline">Request a Quote</Button><a className="inline-flex items-center justify-center px-2 text-sm font-semibold text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" href={siteConfig.publicCtas.learnAbout.href}>Learn About SEN</a></div></div>
      <div className="relative min-h-[22rem] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm"><div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24px,var(--border)_25px,transparent_26px),linear-gradient(0deg,transparent_24px,var(--border)_25px,transparent_26px)] bg-[length:52px_52px] opacity-35" aria-hidden="true"/><div className="relative grid h-full place-items-center"><div className="h-52 w-52 rounded-full border border-[var(--primary)]/30 bg-[radial-gradient(circle,var(--primary)_0_2px,transparent_3px)] bg-[length:28px_28px]" aria-hidden="true"/><div className="absolute rounded-full border border-[var(--accent)]/40 px-5 py-3 text-sm font-semibold text-[var(--foreground)] shadow-sm">Global sourcing network</div></div></div>
    </div>
  </Section>;
}
