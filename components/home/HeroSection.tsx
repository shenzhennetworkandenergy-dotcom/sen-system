import Image from "next/image";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";

export function HeroSection() {
  return <Section className="relative isolate overflow-hidden bg-slate-950 py-24 text-white sm:py-32">
    <Image src="/images/home/enterprise-rack-servers.webp" alt="Modern enterprise data center with illuminated rack servers and network equipment" fill priority sizes="100vw" className="absolute inset-0 -z-20 object-cover" />
    <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(2,6,23,.92),rgba(15,23,42,.72),rgba(15,118,110,.28))]" />
    <div className="max-w-4xl"><p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200">Shenzhen Energy & Networks</p><h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">Advanced Infrastructure and Technology, Sourced Globally</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-slate-200">SEN supplies enterprise technology, industrial equipment, medical systems and energy solutions through China-based sourcing, Bangladesh operations and global delivery coordination.</p><div className="mt-9 flex flex-col gap-3 sm:flex-row"><Button href={siteConfig.publicCtas.exploreProducts.href} size="lg">Explore Products</Button><Button href={siteConfig.publicCtas.requestQuote.href} size="lg" variant="outline">Request a Quote</Button><a className="inline-flex items-center justify-center rounded-[var(--radius-md)] px-4 text-sm font-semibold text-cyan-100 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" href={siteConfig.contact.whatsappLink} target="_blank" rel="noopener noreferrer">WhatsApp SEN</a></div></div>
  </Section>;
}
