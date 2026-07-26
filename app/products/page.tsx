import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { ProductCard } from "@/components/catalog/ProductCard";
import { ProductSearch } from "@/components/catalog/ProductSearch";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Container } from "@/components/ui/Container";
import { getPublicProducts } from "@/lib/catalog/products";
import {
  catalogueTheme,
  categoryThemes,
  type BusinessCategory,
} from "@/lib/catalog/themes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Products",
  description:
    "Explore SEN enterprise technology, networking, energy, medical and specialist equipment.",
};

const categories = Object.keys(categoryThemes) as BusinessCategory[];

export default async function PublicProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const selectedCategory = categories.includes(
    params.category as BusinessCategory,
  )
    ? (params.category as BusinessCategory)
    : null;
  const theme = catalogueTheme(selectedCategory);
  const products = await getPublicProducts(params);

  return (
    <div
      className={`public-experience catalogue-theme catalogue-theme-${theme.key}`}
    >
      <PublicHeader />
      <main className="catalogue-theme-surface min-h-screen">
        <section className="catalogue-category-hero relative overflow-hidden">
          <div className="sen-grid" aria-hidden="true" />
          <Container className="relative z-10 py-16 sm:py-24">
            <p className="sen-kicker">
              {selectedCategory ?? "SEN product catalogue"}
            </p>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">
              {selectedCategory
                ? categoryThemes[selectedCategory].tagline
                : "Four industries. Four distinct product experiences."}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 opacity-80">
              {selectedCategory
                ? `Explore SEN ${selectedCategory.toLowerCase()} products, sourcing and professional support.`
                : "Choose a category to enter its dedicated visual catalogue, or browse everything together."}
            </p>
            <nav
              aria-label="Product categories"
              className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              {categories.map((category) => {
                const categoryTheme = categoryThemes[category];
                const active = selectedCategory === category;
                return (
                  <Link
                    key={category}
                    href={`/products?category=${encodeURIComponent(category)}`}
                    className={`catalogue-category-switch catalogue-category-switch-${categoryTheme.key} ${
                      active ? "is-active" : ""
                    }`}
                  >
                    <span>{category}</span>
                    <small>{categoryTheme.tagline}</small>
                  </Link>
                );
              })}
            </nav>
          </Container>
        </section>
        <section className="py-10 sm:py-14">
          <Container>
            <ProductSearch defaultValue={params.q ?? ""} className="catalogue-theme-panel mb-3 rounded-2xl border p-4 shadow-sm" />
            <form className="catalogue-theme-panel grid gap-3 rounded-2xl border p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[15rem_13rem_auto]">
              <input type="hidden" name="q" value={params.q ?? ""} />
              <label className="text-sm font-semibold">
                Category
                <select
                  name="category"
                  defaultValue={selectedCategory ?? ""}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-950"
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Sort
                <select
                  name="sort"
                  defaultValue={params.sort}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-950"
                >
                  <option value="featured">Featured first</option>
                  <option value="name">Name A–Z</option>
                  <option value="price_low">Lowest price</option>
                </select>
              </label>
              <button className="sen-button-glow self-end rounded-xl px-5 py-3 font-semibold">
                Apply
              </button>
            </form>
            <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="catalogue-theme-tagline text-sm font-semibold uppercase tracking-[0.14em]">
                  {selectedCategory ?? "Live catalogue"}
                </p>
                <h2 className="mt-1 text-3xl font-semibold">
                  {products.length} products
                </h2>
              </div>
              {params.q || params.category ? (
                <Link
                  href="/products"
                  className="catalogue-theme-panel rounded-lg border px-4 py-2 text-sm font-semibold"
                >
                  Clear filters
                </Link>
              ) : null}
            </div>
            {products.length ? (
              <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="catalogue-theme-panel mt-8 rounded-2xl border border-dashed p-12 text-center">
                <h2 className="text-xl font-semibold">No matching products</h2>
                <p className="mt-2 opacity-75">
                  Try another keyword or choose a different category.
                </p>
              </div>
            )}
          </Container>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
