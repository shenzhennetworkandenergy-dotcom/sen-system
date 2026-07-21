import { siteConfig } from "@/config/site";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function BusinessCategories() {
  return <Section className="sen-section" id="categories"><SectionHeading eyebrow="Business categories" heading="Four connected domains. One powerful ecosystem." description="SEN organizes sourcing and delivery support across core technology, power, healthcare and specialized procurement categories." />
    <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{siteConfig.businessCategories.map((category,index)=><a key={category.slug} href={category.href} className="sen-feature-card group" style={{ animationDelay: `${index * 100}ms` }}><span className="sen-card-number">0{index+1}</span><span className={`sen-category-icon sen-category-${category.accent}`} aria-hidden="true"/><h3 className="mt-7 text-xl font-semibold text-[var(--foreground)]">{category.label}</h3><p className="mt-3 text-sm leading-6 text-[var(--muted-text)]">{category.description}</p><ul className="mt-5 space-y-2 text-sm text-[var(--muted-text)]">{category.examples.slice(0,3).map((example)=><li key={example}>◆ {example}</li>)}</ul><span className="mt-6 inline-flex text-sm font-semibold text-[var(--primary)]">Explore domain <span className="ml-2 transition-transform group-hover:translate-x-1">→</span></span></a>)}</div>
  </Section>;
}
