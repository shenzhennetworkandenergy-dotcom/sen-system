/* eslint-disable @next/next/no-html-link-for-pages */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { ProductImageGallery } from "@/components/catalog/ProductImageGallery";
import { ProductPurchasePanel } from "@/components/catalog/ProductPurchasePanel";
import { Container } from "@/components/ui/Container";
import { JsonLd } from "@/components/seo/JsonLd";
import { getPublicProduct } from "@/lib/catalog/products";
import { catalogueTheme } from "@/lib/catalog/themes";
import { addToCartAction, orderNowAction } from "@/app/cart/actions";
import { startConversationAction } from "@/app/account/messages/actions";

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
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title: product.name,
      description: plainText(product.short_description) ?? `Explore ${product.name} from SEN.`,
      type: "website",
      url: `/products/${product.slug}`,
      images: product.images[0]
        ? [{ url: product.images[0].url, alt: product.images[0].alt }]
        : undefined,
    },
  };
}

function money(amount: number | null, currency: string) {
  return amount === null ? null : new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export default async function PublicProductDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams:Promise<{success?:string;error?:string}> }) {
  await connection();
  const notice=await searchParams;
  const product = await getPublicProduct((await params).slug);
  if (!product) notFound();
  const price = product.sale_price ?? product.regular_price;
  const theme = catalogueTheme(product.sen_business_category);
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

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    mpn: product.manufacturer_part_number || undefined,
    brand: product.brand?.name
      ? { "@type": "Brand", name: product.brand.name }
      : undefined,
    description:
      plainText(product.short_description) ?? plainText(product.description),
    image: product.images.map((image) => image.url),
    category: product.sen_business_category,
    url: `https://sen.com.bd/products/${product.slug}`,
    offers:
      price !== null
        ? {
            "@type": "Offer",
            price,
            priceCurrency: product.currency,
            availability:
              product.available > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/PreOrder",
            url: `https://sen.com.bd/products/${product.slug}`,
          }
        : undefined,
  };

  return <div className={`public-experience catalogue-theme catalogue-theme-${theme.key}`}>
    <JsonLd data={productSchema} />
    <PublicHeader />
    <main className="catalogue-theme-surface">
      <Container className="py-6"><nav className="text-sm text-slate-500" aria-label="Breadcrumb"><a href="/">Home</a><span className="mx-2">/</span><a href="/products">Products</a><span className="mx-2">/</span><span className="text-slate-800">{product.name}</span></nav></Container>
      <section className="pb-14"><Container><div className="grid gap-8 lg:grid-cols-[1.05fr_.95fr]">
        <ProductImageGallery
          images={product.images}
          category={product.sen_business_category}
        />
        <div className="catalogue-theme-panel rounded-3xl border p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">{product.brand?.name ?? "SEN sourced technology"}</p>
          <h1 className="mt-3 break-words text-2xl font-semibold leading-tight tracking-tight text-[#10152f] sm:text-4xl">{product.name}</h1>
          {product.short_description ? <div className="product-rich-content mt-5 text-base leading-7 text-slate-600 sm:text-lg" dangerouslySetInnerHTML={{ __html: product.short_description }} /> : <p className="mt-5 text-slate-600">Enterprise-grade equipment sourced, verified and supported through SEN.</p>}
          <div className="mt-6 flex flex-wrap gap-3"><span className={`rounded-full px-4 py-2 text-sm font-semibold ${product.available > 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{product.available > 0 ? `${product.available} available` : product.incoming > 0 ? `${product.incoming} incoming` : "Contact for availability"}</span><span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">SKU: {product.sku}</span>{product.model_number ? <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800">Model: {product.model_number}</span> : null}</div>
          <div className="mt-7 border-y py-6">{price ? <div className="flex items-end gap-3"><strong className="text-3xl text-[#10152f]">{money(price, product.currency)}</strong>{product.sale_price && product.regular_price ? <span className="pb-1 text-lg text-slate-400 line-through">{money(product.regular_price, product.currency)}</span> : null}</div> : <strong className="text-2xl text-[#10152f]">Price on request</strong>}<p className="mt-2 text-sm text-slate-500">Final pricing may vary by configuration, quantity, delivery and project requirements.</p></div>
          <p className="catalogue-theme-tagline mt-5 text-sm font-semibold">{theme.tagline}</p>
          {notice.success?<p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice.success}</p>:null}
          {notice.error?<p className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{notice.error}</p>:null}
          <ProductPurchasePanel
            productName={product.name}
            productSlug={product.slug}
            productType={product.product_type}
            currency={product.currency}
            available={product.available}
            incoming={product.incoming}
            allowBackorders={product.allow_backorders}
            variations={product.variations}
            addAction={addToCartAction.bind(null, product.id, product.slug)}
            orderAction={orderNowAction.bind(null, product.id)}
            conversationAction={startConversationAction.bind(null, product.id)}
          />
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
