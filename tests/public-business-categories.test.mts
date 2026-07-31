import assert from "node:assert/strict";
import test from "node:test";

import {
  publicBusinessCategoryCards,
  publicCategoryHref,
  resolvePublicCategory,
} from "../lib/catalog/business-category-view.ts";
import { fallbackBusinessCategory } from "../lib/catalog/themes.ts";

const categories = [
  {
    ...fallbackBusinessCategory,
    id: "energy",
    name: "Energy",
    slug: "energy",
    active: true,
    sortOrder: 30,
    productCount: 8,
  },
  {
    ...fallbackBusinessCategory,
    id: "networking",
    name: "Networking",
    slug: "networking",
    active: true,
    sortOrder: 10,
    productCount: 42,
  },
  {
    ...fallbackBusinessCategory,
    id: "inactive",
    name: "Inactive",
    slug: "inactive",
    active: false,
    sortOrder: 1,
    productCount: 99,
  },
];

test("builds active homepage cards in administrator display order", () => {
  assert.deepEqual(
    publicBusinessCategoryCards(categories).map((category) => ({
      name: category.name,
      count: category.productCount,
      href: category.href,
    })),
    [
      { name: "Networking", count: 42, href: "/products?category=networking" },
      { name: "Energy", count: 8, href: "/products?category=energy" },
    ],
  );
});

test("generates stable encoded slug links", () => {
  assert.equal(
    publicCategoryHref({ ...categories[0], slug: "medical-equipment" }),
    "/products?category=medical-equipment",
  );
});

test("resolves current slugs and legacy display-name filters", () => {
  assert.equal(resolvePublicCategory(categories, "networking")?.id, "networking");
  assert.equal(resolvePublicCategory(categories, "Networking")?.id, "networking");
  assert.equal(resolvePublicCategory(categories, "unknown"), null);
});

