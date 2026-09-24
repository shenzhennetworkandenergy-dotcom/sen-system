/* eslint-disable @next/next/no-img-element */

import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getPublicProducts } from "@/lib/catalog/products";

export async function FeaturedProducts() {
  const products = await getPublicProducts({ featuredOnly: true });
  if (!products.length) return null;

  return <Section className="sen-section sen-products-section"><SectionHeading eyebrow="Featured products" heading="Enterprise technology selected for what comes next." description="Explore every featured product currently published by SEN across networking, energy, medical and industrial categories." />
    <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{products.map((product,index)=><article className="sen-product-card group" key={product.id}><a href={`/products/${product.slug}`} className="block"><div className="sen-product-image"><span className="sen-product-index">{String(index+1).padStart(2,"0")}</span>{product.imageUrl?<img src={product.imageUrl} alt={product.imageAlt} width={1024} height={1024} loading="lazy" decoding="async" className="h-full w-full object-contain transition duration-700 group-hover:scale-110" />:<div className="grid h-full place-items-center px-8 text-center text-sm text-slate-500">Product image coming soon</div>}</div><p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-600">{product.brand??product.businessCategory.name}</p><h3 className="mt-2 text-lg font-semibold text-[var(--foreground)]">{product.name}</h3></a><div className="mt-5 flex flex-wrap gap-3"><Button href={`/request-quote?product=${product.slug}`} size="sm" className="sen-button-glow">Request quote</Button><Button href={`/products/${product.slug}`} variant="outline" size="sm">View details</Button></div></article>)}</div>
  </Section>;
}
