/* eslint-disable @next/next/no-html-link-for-pages */
import type { Metadata } from "next";
import { connection } from "next/server";

import { ProductCard } from "@/components/catalog/ProductCard";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Container } from "@/components/ui/Container";
import { getPublicProducts } from "@/lib/catalog/products";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Products", description: "Explore SEN enterprise technology, server, networking, energy and specialist equipment." };
const categories = ["Networking", "Energy", "Medical Equipment", "Others"];

export default async function PublicProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; sort?: string }> }) {
  await connection();
  const params = await searchParams;
  const products = await getPublicProducts(params);
  return <div className="public-experience"><PublicHeader/><main><section className="sen-catalogue-hero"><div className="sen-grid" aria-hidden="true"/><Container className="relative z-10 py-20 sm:py-24"><p className="sen-kicker">SEN product catalogue</p><h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">Infrastructure selected for demanding environments.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">Browse enterprise servers, networking, energy, medical and specialized equipment supported through SEN’s sourcing and quotation workflow.</p></Container></section><section className="py-12 sm:py-16"><Container><form className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[1fr_15rem_13rem_auto]"><label className="text-sm font-semibold text-slate-800">Search products<input name="q" defaultValue={params.q} placeholder="Product name, SKU or specification" className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal"/></label><label className="text-sm font-semibold text-slate-800">Category<select name="category" defaultValue={params.category} className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal"><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="text-sm font-semibold text-slate-800">Sort<select name="sort" defaultValue={params.sort} className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal"><option value="featured">Featured first</option><option value="name">Name A–Z</option><option value="price_low">Lowest price</option></select></label><button className="sen-button-glow self-end rounded-xl px-5 py-3 font-semibold">Apply</button></form><div className="mt-8 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-700">Live catalogue</p><h2 className="mt-1 text-3xl font-semibold text-[#10152f]">{products.length} products</h2></div>{params.q || params.category ? <a href="/products" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">Clear filters</a> : null}</div>{products.length ? <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <div className="mt-8 rounded-2xl border border-dashed bg-white p-12 text-center"><h2 className="text-xl font-semibold text-[#10152f]">No matching products</h2><p className="mt-2 text-slate-600">Try a different keyword or clear the filters.</p></div>}</Container></section></main><PublicFooter/></div>;
}
