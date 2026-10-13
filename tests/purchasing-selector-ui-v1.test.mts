import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { matchingPurchaseProducts } from "../lib/purchasing/product-selector.ts";

const fixture = [
  { id: "router", name: "Network Router", sku: "NET-100" },
  { id: "monitor", name: "Medical Monitor", sku: "MED-200" },
  { id: "sensor", name: "Industrial Sensor", sku: "IND-300" },
];
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const builder = source("components/purchasing/PurchaseOrderBuilder.tsx");
const selector = source("components/purchasing/PurchaseProductSelector.tsx");

test("name search is case-insensitive and returns the correct product ID", () => {
  assert.deepEqual(matchingPurchaseProducts(fixture, "  router  ").map((item) => item.id), ["router"]);
});
test("SKU search is case-insensitive and returns the correct product ID", () => {
  assert.deepEqual(matchingPurchaseProducts(fixture, "med-200").map((item) => item.id), ["monitor"]);
});
test("suggestions are limited to 12 and no-results is empty", () => {
  const many = Array.from({ length: 30 }, (_, index) => ({ id: String(index), name: `Part ${index}`, sku: `P-${index}` }));
  assert.equal(matchingPurchaseProducts(many, "part").length, 12);
  assert.deepEqual(matchingPurchaseProducts(fixture, "missing"), []);
  assert.match(selector, /No matching products\./);
});
test("selector passes the exact ID to existing productId state", () => {
  assert.match(selector, /onSelect\(product\.id\)/);
  assert.match(builder, /setProductId\(id\)/);
  assert.match(builder, /const product = products\.find\(\(item\) => item\.id === productId\)/);
});
test("mouse and keyboard selection are available", () => {
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) assert.ok(selector.includes(`event.key === "${key}"`));
  assert.match(selector, /onClick=\{\(\) => choose\(product\)\}/);
});
test("existing Add line function is byte-for-byte unchanged", () => {
  const base = readFileSync("C:/Users/szwaq/.codex/visualizations/2026/09/25/01a0d61b-4bdf-7413-a3aa-4dd3218c553f/authoritative-base-dpl_2wAs1WPxTXFWukiB9KQLXzbQdPZv/src/components/purchasing/PurchaseOrderBuilder.tsx", "utf8");
  const functionBody = (text: string) => text.slice(text.indexOf("  function addItem()"), text.indexOf("  function updateItem("));
  assert.equal(functionBody(builder), functionBody(base));
});
test("a successful Add line remounts selector for the next product", () => {
  assert.match(builder, /<PurchaseProductSelector\s+key=\{items\.length\}/);
  assert.match(builder, /onClick=\{addItem\}/);
  assert.match(builder, /setItems\(\(current\) => \[\.\.\.current,/);
});
test("only new purchase page enables selector; data and save paths remain original", () => {
  assert.match(source("app/admin/purchasing/new/page.tsx"), /searchableProductSelector/);
  assert.doesNotMatch(source("app/admin/purchasing/[id]/edit/page.tsx"), /searchableProductSelector/);
  assert.doesNotMatch(builder, /fetch\(/);
});
