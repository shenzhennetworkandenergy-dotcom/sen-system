import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detail = await readFile(
  "app/employee/inventory/stock-out/[requestId]/page.tsx",
  "utf8",
);
const form = await readFile(
  "components/inventory/StockOutReleaseForm.tsx",
  "utf8",
);

test("Stock Out detail presents its request summary and product requirements as graphical, accessible cards", () => {
  assert.match(detail, /aria-label="Stock Out request summary"/);
  assert.match(detail, /label\(detail\.request\.status\)/);
  assert.match(detail, /requestStatusTone/);
  assert.match(detail, /rounded-full[\s\S]{0,160}Remaining/);
  assert.match(detail, /border-l-4/);
  assert.match(detail, /item\.product_name_snapshot/);
  assert.match(detail, /Serial verification required/);
  assert.match(detail, /Release history[\s\S]{0,300}timeline/i);
});

test("Stock Out form makes quantity, serial selection, review, and confirmation visibly distinct", () => {
  assert.match(form, /aria-label="Stock Out workflow"/);
  assert.match(form, /Set release quantity/);
  assert.match(form, /Scan \/ select serials/);
  assert.match(form, /Review release/);
  assert.match(form, /Confirm Stock Out/);

  assert.match(form, /aria-label={`Release quantity for \${item\.productName}`}/);
  assert.match(form, /Maximum releasable:/);
  assert.match(form, /focus-visible:ring-4/);

  assert.match(form, /Scan or enter SEN \/ manufacturer serial/);
  assert.match(form, /Search SEN Serial/);
  assert.match(form, /Selected: \{selected\.length\} \/ Required: \{requiredQuantity\}/);
  assert.match(form, /Eligible and selected/);

  assert.match(form, /This action will physically release the selected products from warehouse inventory\./);
  assert.match(form, /bg-gradient-to-r/);
  assert.match(form, /Confirm Stock Out \/ Release Products/);
});

test("visual redesign preserves the established Stock Out action and payload boundaries", () => {
  assert.match(form, /confirmStockOutAction\.bind\(null, requestId\)/);
  assert.match(form, /name="operation_id"/);
  assert.match(form, /name="release_payload"/);
  assert.match(form, /max=\{item\.remainingQuantity\}/);
  assert.match(form, /\/api\/employee\/inventory\/stock-out\/serials/);
});
