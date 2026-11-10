import assert from "node:assert/strict";
import test from "node:test";

import { loadFooterProductLinks } from "../lib/catalog/footer-product-links.ts";

test("uses dynamic business categories when they are available", async () => {
  const links = await loadFooterProductLinks(async () => [
    { name: "Network & Energy", slug: "network & energy" },
  ]);

  assert.deepEqual(links, [
    {
      label: "Network & Energy",
      href: "/products?category=network%20%26%20energy",
    },
  ]);
});

test("uses a stable products link when the category query fails", async () => {
  const links = await loadFooterProductLinks(async () => {
    throw new Error("database unavailable");
  });

  assert.deepEqual(links, [
    { label: "All products", href: "/products" },
  ]);
});

test("uses a stable products link when no categories exist", async () => {
  const links = await loadFooterProductLinks(async () => []);

  assert.deepEqual(links, [
    { label: "All products", href: "/products" },
  ]);
});
