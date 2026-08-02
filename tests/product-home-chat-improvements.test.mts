import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";

import {
  collectAllProductBatches,
  collectRowsByProductIds,
  publicProductEqualityFilters,
  publicProductOrder,
} from "../lib/catalog/product-query.ts";
import {
  featuredFilterOptions,
  normalizeFeaturedFilter,
  pickProductListImage,
  productListPageHref,
} from "../lib/inventory/product-list-view.ts";

type ImageFixture = {
  product_id: string;
  storage_path: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
};

test("product-list thumbnails prefer the primary image", () => {
  const images: ImageFixture[] = [
    {
      product_id: "product-a",
      storage_path: "gallery-first.jpg",
      alt_text: null,
      is_primary: false,
      sort_order: 0,
    },
    {
      product_id: "product-a",
      storage_path: "primary.jpg",
      alt_text: "Primary",
      is_primary: true,
      sort_order: 5,
    },
  ];

  assert.equal(pickProductListImage(images, "product-a")?.storage_path, "primary.jpg");
});

test("product-list thumbnails fall back to the first saved image", () => {
  const images: ImageFixture[] = [
    {
      product_id: "product-a",
      storage_path: "later.jpg",
      alt_text: null,
      is_primary: false,
      sort_order: 8,
    },
    {
      product_id: "product-a",
      storage_path: "first.jpg",
      alt_text: "First",
      is_primary: false,
      sort_order: 1,
    },
  ];

  assert.equal(pickProductListImage(images, "product-a")?.storage_path, "first.jpg");
});

test("product-list thumbnail selection never borrows another product image", () => {
  const images: ImageFixture[] = [
    {
      product_id: "product-b",
      storage_path: "other-primary.jpg",
      alt_text: null,
      is_primary: true,
      sort_order: 0,
    },
    {
      product_id: "product-a",
      storage_path: "own-gallery.jpg",
      alt_text: null,
      is_primary: false,
      sort_order: 2,
    },
  ];

  assert.equal(pickProductListImage(images, "product-a")?.storage_path, "own-gallery.jpg");
  assert.equal(pickProductListImage(images, "missing"), null);
});

test("featured filter accepts only the two supported states", () => {
  assert.equal(normalizeFeaturedFilter("featured"), true);
  assert.equal(normalizeFeaturedFilter("not_featured"), false);
  assert.equal(normalizeFeaturedFilter("anything"), null);
  assert.equal(normalizeFeaturedFilter(undefined), null);
});

test("product pagination preserves the selected featured state", () => {
  assert.equal(
    productListPageHref(
      { q: "rack server", status: "active", featured: "featured", page: "9" },
      2,
    ),
    "?q=rack+server&status=active&featured=featured&page=2",
  );
});

test("admin featured filtering exposes unfiltered, featured, and non-featured choices", () => {
  assert.deepEqual(featuredFilterOptions, [
    { value: "", label: "All featured states" },
    { value: "featured", label: "Featured only" },
    { value: "not_featured", label: "Not featured" },
  ]);
});

test("homepage featured queries require active, public, featured products", () => {
  assert.deepEqual(publicProductEqualityFilters(true), [
    { column: "status", value: "active" },
    { column: "public_catalogue_visible", value: true },
    { column: "featured", value: true },
  ]);
});

test("normal catalogue queries keep the existing publication rules", () => {
  assert.deepEqual(publicProductEqualityFilters(false), [
    { column: "status", value: "active" },
    { column: "public_catalogue_visible", value: true },
  ]);
});

test("featured product retrieval continues until every database batch is loaded", async () => {
  const source = Array.from({ length: 1_205 }, (_, index) => `product-${index + 1}`);
  const requestedRanges: Array<[number, number]> = [];
  const products = await collectAllProductBatches(async (from, to) => {
    requestedRanges.push([from, to]);
    return source.slice(from, to + 1);
  }, 500);

  assert.equal(products.length, source.length);
  assert.deepEqual(requestedRanges, [
    [0, 499],
    [500, 999],
    [1_000, 1_499],
  ]);
});

test("featured product enrichment batches both product IDs and result rows", async () => {
  const ids = ["a", "b", "c", "d", "e"];
  const source = ids.flatMap((productId) =>
    Array.from({ length: 3 }, (_, index) => `${productId}-${index + 1}`),
  );
  const requests: Array<{ ids: string[]; from: number; to: number }> = [];
  const rows = await collectRowsByProductIds(
    ids,
    async (batchIds, from, to) => {
      requests.push({ ids: [...batchIds], from, to });
      const matching = source.filter((row) => batchIds.includes(row.split("-")[0]));
      return matching.slice(from, to + 1);
    },
    { idBatchSize: 2, rowBatchSize: 4 },
  );

  assert.deepEqual(rows, source);
  assert.deepEqual(requests, [
    { ids: ["a", "b"], from: 0, to: 3 },
    { ids: ["a", "b"], from: 4, to: 7 },
    { ids: ["c", "d"], from: 0, to: 3 },
    { ids: ["c", "d"], from: 4, to: 7 },
    { ids: ["e"], from: 0, to: 3 },
  ]);
});

test("every public product sort has a stable unique tie-breaker", () => {
  for (const sort of [undefined, "name", "price_low"]) {
    const order = publicProductOrder(sort);
    assert.deepEqual(order.at(-1), { column: "id", ascending: true });
  }
});

test("homepage requests and renders the complete dynamic featured collection", async () => {
  const component = await readFile(
    new URL("../components/home/FeaturedProducts.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /getPublicProducts\(\{ featuredOnly: true \}\)/);
  assert.match(component, /products\.map\(/);
  assert.match(component, /if \(!products\.length\) return null/);
  assert.doesNotMatch(component, /const products = \[/);
});

const stylesheet = postcss.parse(
  await readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
);

function cssDeclarations(selector: string) {
  const declarations = new Map<string, string>();
  stylesheet.walkRules((rule) => {
    if (rule.selector === selector && rule.parent?.type === "root") {
      rule.walkDecls((declaration) => {
        declarations.set(declaration.prop, declaration.value);
      });
    }
  });
  return declarations;
}

test("floating chat keeps its width while gaining a tall responsive viewport", () => {
  const window = cssDeclarations(".sen-messenger-window");
  assert.equal(window.get("width"), "min(24rem, calc(100vw - 1.5rem))");
  assert.equal(window.get("height"), "min(46rem, calc(100vh - 6.5rem))");
});

test("floating chat typography and spacing are compact", () => {
  const messages = cssDeclarations(".sen-messenger-messages");
  const bubble = cssDeclarations(".sen-messenger-bubble");
  const composer = cssDeclarations(".sen-messenger-composer textarea");
  assert.equal(messages.get("padding"), ".75rem");
  assert.equal(bubble.get("font-size"), ".8rem");
  assert.equal(bubble.get("line-height"), "1.28");
  assert.equal(composer.get("font-size"), ".78rem");
});
