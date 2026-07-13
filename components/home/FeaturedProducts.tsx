import { featuredProducts } from "@/components/home/homeData";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/Button";
import { SafeImage } from "@/components/ui/SafeImage";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function FeaturedProducts() {
  return <Section className="bg-[var(--muted-surface)]"><SectionHeading eyebrow="Sample featured products" heading="Representative equipment preview" description="These static sample items are placeholders for the future Supabase-powered product catalogue. They do not represent live inventory or pricing."/><div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{featuredProducts.map(({ category, title, description, imageSrc, imageAlt })=><article className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5" key={title}><div className="mb-5 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[linear-gradient(135deg,var(--surface),var(--muted-surface))]"><SafeImage src={imageSrc} alt={imageAlt} width={960} height={540} className="aspect-video w-full object-cover transition duration-300 hover:scale-105" sizes="(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 100vw" /></div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">{category}</p><h3 className="mt-2 text-lg font-semibold text-[var(--foreground)]">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted-text)]">{description}</p><div className="mt-5 flex flex-wrap gap-3"><Button href="/products/sample" variant="outline" size="sm">View Product</Button><Button href={siteConfig.publicCtas.requestQuote.href} size="sm">Request Quote</Button></div></article>)}</div></Section>;
}
