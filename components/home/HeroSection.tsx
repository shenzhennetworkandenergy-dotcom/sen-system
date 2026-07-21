import Image from "next/image";

import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { siteConfig } from "@/config/site";

const signals = ["Enterprise infrastructure", "Global sourcing", "Smart energy", "Mission-ready systems"];

export function HeroSection() {
  return (
    <section className="sen-hero relative overflow-hidden">
      <div className="sen-grid" aria-hidden="true" />
      <div className="sen-aurora sen-aurora-one" aria-hidden="true" />
      <div className="sen-aurora sen-aurora-two" aria-hidden="true" />
      <div className="sen-particles" aria-hidden="true" />
      <Container className="relative z-10 grid min-h-[calc(100vh-7.5rem)] items-center gap-14 py-20 lg:grid-cols-[1.08fr_.92fr] lg:py-24">
        <div className="sen-reveal">
          <div className="sen-kicker"><span className="sen-live-dot" />Future-ready infrastructure partner</div>
          <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl xl:text-7xl">
            Engineering the systems that <span className="sen-gradient-text">power what&apos;s next.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
            SEN connects enterprise networking, high-performance compute, energy, medical technology and global procurement into one intelligent delivery ecosystem.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button href={siteConfig.publicCtas.exploreProducts.href} size="lg" className="sen-button-glow">Explore our ecosystem <span aria-hidden="true">→</span></Button>
            <Button href={siteConfig.publicCtas.requestQuote.href} size="lg" variant="outline" className="sen-button-ghost">Start a project</Button>
          </div>
          <div className="mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            {signals.map((signal, index) => <div className="sen-signal" style={{ animationDelay: `${index * 120}ms` }} key={signal}><span>0{index + 1}</span>{signal}</div>)}
          </div>
        </div>

        <div className="sen-hero-visual sen-reveal-delay">
          <div className="sen-orbit sen-orbit-outer" aria-hidden="true"><i /><i /><i /></div>
          <div className="sen-orbit sen-orbit-inner" aria-hidden="true"><i /><i /></div>
          <div className="sen-logo-stage">
            <div className="sen-logo-halo" aria-hidden="true" />
            <Image src={siteConfig.brandAsset.logo} alt={siteConfig.company.logoAlt} width={1600} height={1600} className="relative z-10 h-auto w-full" priority />
          </div>
          <div className="sen-data-card sen-data-card-left"><span>Supply network</span><strong>China · BD · Global</strong></div>
          <div className="sen-data-card sen-data-card-right"><span>Core sectors</span><strong>4 integrated domains</strong></div>
        </div>
      </Container>
      <div className="sen-scroll-cue" aria-hidden="true"><span>Discover</span><i /></div>
    </section>
  );
}
