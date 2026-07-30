import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const builder = await readFile("components/sales/SaleBuilder.tsx", "utf8");
const picker = await readFile("components/sales/SaleProductPicker.tsx", "utf8");

assert.match(builder, /<SaleProductPicker/);
assert.doesNotMatch(builder, /placeholder="Search products"/);
assert.doesNotMatch(builder, /<select value=\{row\.product_id\}/);

assert.match(picker, /role="combobox"/);
assert.match(picker, /aria-controls=/);
assert.match(picker, /Search by product name, SKU, or model/);
assert.match(picker, /No matching products found\./);
assert.match(picker, /filterSaleProducts/);
assert.match(picker, /type="button"/);

console.log("Create Sale product search verification passed.");
