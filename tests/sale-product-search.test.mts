import assert from "node:assert/strict";
import test from "node:test";

import { filterSaleProducts } from "../lib/sales/product-search.ts";

const products = [
  {
    id: "cisco-3064",
    name: "Cisco N3K-C3064PQ-10GX",
    sku: "CIS-N3K-3064",
    model_number: "N3K-C3064PQ-10GX",
  },
  {
    id: "dell-r740",
    name: "Dell PowerEdge R740 Server",
    sku: "SEN-DELL-R740",
    model_number: "R740",
  },
  {
    id: "dell-r740xd",
    name: "Dell PowerEdge R740XD Server",
    sku: "SEN-DELL-R740XD",
    model_number: "R740XD",
  },
];

test("matches product names with partial, case-insensitive text", () => {
  assert.deepEqual(
    filterSaleProducts(products, "cIsCo").map((product) => product.id),
    ["cisco-3064"],
  );
});

test("matches partial SKU and model numbers", () => {
  assert.deepEqual(
    filterSaleProducts(products, "3064").map((product) => product.id),
    ["cisco-3064"],
  );
  assert.deepEqual(
    filterSaleProducts(products, "r740").map((product) => product.id),
    ["dell-r740", "dell-r740xd"],
  );
});

test("returns no results for a blank search", () => {
  assert.deepEqual(filterSaleProducts(products, "   "), []);
});

test("limits the related-product dropdown to ten results", () => {
  const manyProducts = Array.from({ length: 15 }, (_, index) => ({
    id: `switch-${index}`,
    name: `Cisco Switch ${index}`,
    sku: `CIS-SW-${index}`,
    model_number: `SW-${index}`,
  }));

  assert.equal(filterSaleProducts(manyProducts, "switch").length, 10);
});
