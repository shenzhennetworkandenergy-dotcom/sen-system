import Image from "next/image";

import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { siteConfig } from "@/config/site";

const products = [
  { name: "Dell PowerEdge R760", slug: "dell-poweredge-r760", label: "Next-generation compute", image: "/products/servers/dell-r760.png" },
  { name: "Dell PowerEdge R750", slug: "dell-poweredge-r750", label: "Enterprise infrastructure", image: "/products/servers/dell-r750.png" },
  { name: "Dell PowerEdge R740xd", slug: "dell-poweredge-r740xd", label: "Storage & virtualization", image: "/products/servers/dell-r740xd.png" },
  { name: "Supermicro SYS-2029GP-TR", slug: "supermicro-sys-2029gp-tr", label: "GPU-ready performance", image: "/products/servers/supermicro-sys-2029gp-tr.png" },
] as const;

export function FeaturedProducts() {
  return <Section className="sen-section sen-products-section"><SectionHeading eyebrow="Featured infrastructure" heading="Enterprise hardware, visualized for the future." description="Explore selected compute platforms available through SEN’s sourcing and quotation workflow." />
    <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{products.map((product,index)=><article className="sen-product-card group" key={product.name}><a href={`/products/${product.slug}`} className="block"><div className="sen-product-image"><span className="sen-product-index">0{index+1}</span><Image src={product.image} alt={product.name} width={1024} height={1024} className="h-full w-full object-contain transition duration-700 group-hover:scale-110" /></div><p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-600">{product.label}</p><h3 className="mt-2 text-lg font-semibold text-[var(--foreground)]">{product.name}</h3></a><div className="mt-5 flex flex-wrap gap-3"><Button href={`${siteConfig.publicCtas.requestQuote.href}?product=${product.slug}`} size="sm" className="sen-button-glow">Request quote</Button><Button href={`/products/${product.slug}`} variant="outline" size="sm">View details</Button></div></article>)}</div>
  </Section>;
}
