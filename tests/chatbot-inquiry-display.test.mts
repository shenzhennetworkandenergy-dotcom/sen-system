import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeInquirySearchHistory,
  normalizeInquirySelectedProducts,
} from "../lib/chatbot/inquiry-display.ts";

test("selected product snapshots become readable product details", () => {
  const products = normalizeInquirySelectedProducts([
    {
      id: "product-1",
      name: "Dell PowerEdge R640",
      sku: "R640-2680V4-16GB-1",
      slug: "dell-poweredge-r640",
      price: 110000,
      priceMax: 125000,
      currency: "BDT",
      available: false,
      modelNumber: "R630-2680V4-16GB-1",
      attributes: { Capacity: "16GB" },
      confirmedAt: "2026-07-30T07:00:24.132Z",
    },
    null,
    "invalid",
  ]);

  assert.equal(products.length, 1);
  assert.equal(products[0]?.name, "Dell PowerEdge R640");
  assert.equal(products[0]?.sku, "R640-2680V4-16GB-1");
  assert.equal(products[0]?.available, false);
  assert.deepEqual(products[0]?.attributes, [["Capacity", "16GB"]]);
});

test("search history becomes an ordered timeline with named results", () => {
  const history = normalizeInquirySearchHistory([
    {
      sequence: 1,
      query: "r640 server",
      results: [{ id: "product-1", name: "Dell PowerEdge R640" }],
      recordedAt: "2026-07-30T07:00:24.132Z",
    },
    {
      sequence: 0,
      query: "640",
      results: [
        { id: "product-1", name: "Dell PowerEdge R640" },
        { id: "product-2", name: "Dell PowerEdge R640xd" },
      ],
      recordedAt: "2026-07-30T06:59:20.000Z",
    },
  ]);

  assert.deepEqual(history.map((item) => item.query), ["640", "r640 server"]);
  assert.deepEqual(
    history[0]?.results.map((item) => item.name),
    ["Dell PowerEdge R640", "Dell PowerEdge R640xd"],
  );
});

test("inquiry detail page renders product cards and a search timeline, not raw JSON", async () => {
  const page = await readFile("app/admin/crm/chatbot/[id]/page.tsx", "utf8");

  assert.doesNotMatch(page, /formattedJson|JSON\.stringify|<pre/);
  assert.match(page, /normalizeInquirySelectedProducts/);
  assert.match(page, /normalizeInquirySearchHistory/);
  assert.match(page, /Search timeline/);
  assert.match(page, /Out of stock/);
});
