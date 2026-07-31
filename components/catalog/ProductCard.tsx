/* eslint-disable @next/next/no-img-element */
import type { AwaitedReturn } from "@/types/catalog";
import { categoryStyle } from "@/lib/catalog/themes";

function plainText(value: string | null) {
  return value
    ?.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function ProductCard({ product }: { product: AwaitedReturn }) {
  const price = product.sale_price ?? product.regular_price;

  return (
    <article
      className="sen-catalogue-card catalogue-card-dynamic group"
      style={categoryStyle(product.businessCategory)}
    >
      <a href={`/products/${product.slug}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_35%,white,#eaf1ff)]">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.imageAlt}
              width={900}
              height={675}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain p-4 transition duration-700 group-hover:scale-110"
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-slate-500">
              Product image coming soon
            </div>
          )}
          <span className="catalogue-card-badge absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold">
            {product.businessCategory.name}
          </span>
        </div>
        <div className="p-1 pt-5">
          <p className="catalogue-card-brand text-xs font-semibold uppercase tracking-[0.14em]">
            {product.brand ?? "SEN sourced"}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-[#10152f] transition group-hover:text-[#245fc8]">
            {product.name}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
            {plainText(product.short_description) ??
              "Enterprise-grade equipment sourced and supported by SEN."}
          </p>
          <div className="mt-5 flex items-end justify-between gap-3">
            <div>
              {price ? (
                <>
                  <span className="text-xs text-slate-500">Starting from</span>
                  <strong className="block text-xl text-[#10152f]">
                    {new Intl.NumberFormat("en-BD", {
                      style: "currency",
                      currency: product.currency,
                      maximumFractionDigits: 0,
                    }).format(price)}
                  </strong>
                </>
              ) : (
                <strong className="text-base text-[#10152f]">
                  Request quotation
                </strong>
              )}
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                product.available > 0
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {product.available > 0
                ? "Available"
                : "Contact for availability"}
            </span>
          </div>
          <span className="catalogue-card-link mt-5 inline-flex font-semibold">
            View full details{" "}
            <span className="ml-2 transition-transform group-hover:translate-x-1">
              →
            </span>
          </span>
        </div>
      </a>
    </article>
  );
}
