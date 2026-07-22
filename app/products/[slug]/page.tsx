/* eslint-disable @next/next/no-img-element, @next/next/no-html-link-for-pages */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Container } from "@/components/ui/Container";
import { getPublicProduct } from "@/lib/catalog/products";

export const dynamic = "force-dynamic";

function plainText(value: string | null) {
  return value?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const product = await getPublicProduct((await params).slug);
  if (!product) return { title: "Product not found" };
  return {
    title: product.name,
    description: plainText(product.short_description) ?? plainText(product.description)?.slice(0, 155) ?? `Explore ${product.name} from SEN.`,
  };
}

function money(amount: number | null, currency: string) {
  return amount === null ? null : new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export default async function PublicProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const product = await getPublicProduct((await params).slug);
  if (!product) notFound();
  const primaryImage = product.images.find((image) => image.primary) ?? product.images[0] ?? null;
  const price = product.sale_price ?? product.regular_price;
  const specifications = product.specifications && typeof product.specifications === "object" && !Array.isArray(product.specifications)
    ? Object.entries(product.specifications as Record<string, unknown>)
    : [];
  const facts = [
    ["SKU", product.sku],
    ["Model number", product.model_number],
    ["Manufacturer part number", product.manufacturer_part_number],
    ["Brand", product.brand?.name],
    ["Category", product.sen_business_category],
    ["Country of origin", product.country_of_origin],
    ["Serial tracking", product.serial_tracking_required ? "Required" : "Not required"],
  ];

  return <div className="public-experience">
    <PublicHeader />
    <main className="bg-[#f6f8fe]">
      <Container className="py-6"><nav className="text-sm text-slate-500" aria-label="Breadcrumb"><a href="/">Home</a><span className="mx-2">/</span><a href="/products">Products</a><span className="mx-2">/</span><span className="text-slate-800">{product.name}</span></nav></Container>
      <section className="pb-14"><Container><div className="grid gap-8 lg:grid-cols-[1.05fr_.95fr]">
        <div><div className="sen-detail-media">{primaryImage ? <img src={primaryImage.url} alt={primaryImage.alt} className="h-full w-full object-contain p-6 sm:p-10" /> : <div className="text-slate-500">Product image coming soon</div>}<span className="absolute left-4 top-4 rounded-full bg-[#07102f] px-3 py-1 text-xs font-semibold text-cyan-200">{product.sen_business_category}</span></div>
          {product.images.length > 1 ? <div className="mt-4 grid grid-cols-4 gap-3">{product.images.map((image) => <div key={image.id} className="aspect-square overflow-hidden rounded-xl border bg-white"><img src={image.url} alt={image.alt} className="h-full w-full object-contain p-2" /></div>)}</div> : null}
        </div>
        <div className="rounded-3xl border bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">{product.brand?.name ?? "SEN sourced technology"}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#10152f] sm:text-5xl">{product.name}</h1>
          {product.short_description ? <div className="product-rich-content mt-5 text-base leading-7 text-slate-600 sm:text-lg" dangerouslySetInnerHTML={{ __html: product.short_description }} /> : <p className="mt-5 text-slate-600">Enterprise-grade equipment sourced, verified and supported through SEN.</p>}
          <div className="mt-6 flex flex-wrap gap-3"><span className={`rounded-full px-4 py-2 text-sm font-semibold ${product.available > 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{product.available > 0 ? `${product.available} available` : product.incoming > 0 ? `${product.incoming} incoming` : "Contact for availability"}</span><span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">SKU: {product.sku}</span>{product.model_number ? <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800">Model: {product.model_number}</span> : null}</div>
          <div className="mt-7 border-y py-6">{price ? <div className="flex items-end gap-3"><strong className="text-3xl text-[#10152f]">{money(price, product.currency)}</strong>{product.sale_price && product.regular_price ? <span className="pb-1 text-lg text-slate-400 line-through">{money(product.regular_price, product.currency)}</span> : null}</div> : <strong className="text-2xl text-[#10152f]">Price on request</strong>}<p className="mt-2 text-sm text-slate-500">Final pricing may vary by configuration, quantity, delivery and project requirements.</p></div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2"><a href={`/request-quote?product=${encodeURIComponent(product.slug)}`} className="sen-button-glow inline-flex min-h-12 items-center justify-center rounded-xl px-5 font-semibold">Request quotation</a><a href="/contact" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-5 font-semibold text-[#10152f]">Talk to SEN</a></div>
        </div>
      </div></Container></section>
      <section className="border-y bg-white py-14"><Container><div className="grid gap-10 lg:grid-cols-[1.35fr_.65fr]">
        <div><h2 className="text-3xl font-semibold text-[#10152f]">Product overview</h2>{product.description ? <div className="product-rich-content mt-5 text-base leading-8 text-slate-600" dangerouslySetInnerHTML={{ __html: product.description }} /> : <p className="mt-5 text-slate-600">Contact SEN for a complete product consultation and configuration review.</p>}
          {specifications.length ? <div className="mt-10"><h2 className="text-3xl font-semibold text-[#10152f]">Technical specifications</h2><dl className="mt-5 overflow-hidden rounded-2xl border">{specifications.map(([key, value], index) => <div key={key} className={`grid gap-2 px-5 py-4 sm:grid-cols-[14rem_1fr] ${index ? "border-t" : ""}`}><dt className="font-semibold capitalize text-slate-800">{key.replaceAll("_", " ")}</dt><dd className="text-slate-600">{Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></div> : null}
        </div>
        <aside><div className="rounded-2xl border bg-[#f7f9ff] p-6"><h2 className="text-xl font-semibold text-[#10152f]">Product information</h2><dl className="mt-5 space-y-4">{facts.map(([label, value]) => <div key={label} className="border-b pb-3 last:border-0"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 font-medium text-slate-800">{value || "—"}</dd></div>)}</dl></div>{product.warranty_information ? <div className="mt-5 rounded-2xl border bg-white p-6"><h2 className="text-xl font-semibold text-[#10152f]">Warranty</h2><p className="mt-3 leading-7 text-slate-600">{product.warranty_information}</p></div> : null}</aside>
      </div></Container></section>
    </main>
    <PublicFooter />
  </div>;
}
