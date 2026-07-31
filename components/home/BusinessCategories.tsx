/* eslint-disable @next/next/no-img-element */
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getBusinessCategories } from "@/lib/catalog/business-categories";
import { publicBusinessCategoryCards } from "@/lib/catalog/business-category-view";
import { categoryStyle } from "@/lib/catalog/themes";

export async function BusinessCategories() {
  const categories = publicBusinessCategoryCards(
    await getBusinessCategories({ withProductCounts: true }),
  );

  return (
    <Section className="sen-section" id="categories">
      <SectionHeading
        eyebrow="Business categories"
        heading={`${categories.length} connected domains. One powerful ecosystem.`}
        description="Every category, product count and visual theme below is managed live by the SEN administration team."
      />
      <div className="sen-business-category-grid mt-10">
        {categories.map((category, index) => (
          <a
            key={category.id}
            href={category.href}
            className="sen-feature-card sen-dynamic-category-card group"
            style={{
              ...categoryStyle(category),
              animationDelay: `${Math.min(index, 8) * 80}ms`,
            }}
          >
            <span className="sen-card-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            {category.imageUrl ? (
              <img
                src={category.imageUrl}
                alt=""
                width={96}
                height={96}
                loading="lazy"
                className="h-14 w-14 rounded-2xl object-cover"
              />
            ) : (
              <span
                className="grid h-14 w-14 place-items-center rounded-2xl text-2xl font-bold shadow-sm"
                style={{
                  background: "var(--category-color)",
                  color: "var(--category-foreground)",
                }}
                aria-hidden="true"
              >
                {category.icon ?? "◆"}
              </span>
            )}
            <h3 className="mt-7 text-xl font-semibold text-[var(--foreground)]">
              {category.name}
            </h3>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-text)]">
              {category.description ??
                "Professional sourcing, delivery and product support from SEN."}
            </p>
            <div className="mt-5 flex items-center justify-between gap-3">
              <span
                className="rounded-full px-3 py-1 text-xs font-bold"
                style={{
                  background: "var(--category-color)",
                  color: "var(--category-foreground)",
                }}
              >
                {category.productCount}{" "}
                {category.productCount === 1 ? "product" : "products"}
              </span>
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--category-color)" }}
              >
                View products{" "}
                <span className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </span>
            </div>
          </a>
        ))}
      </div>
    </Section>
  );
}

