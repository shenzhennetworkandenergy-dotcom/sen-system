import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeLabelSizeInput,
  parseSerialPrintSelection,
  serialPrintQuery,
} from "../lib/inventory/label-sizes.ts";

const firstId = "4ec9e2ef-17c8-4df5-a4fd-817027ca4c4d";
const secondId = "8d96f211-38b0-4aa8-b3b9-4744c3606d8a";

test("normalizes reusable label names and decimal millimetre dimensions", () => {
  assert.deepEqual(
    normalizeLabelSizeInput({ name: "  Shipping 60 × 40  ", widthMm: "60.5", heightMm: 40 }),
    { name: "Shipping 60 × 40", widthMm: 60.5, heightMm: 40 },
  );
});

test("rejects unsafe label names and dimensions outside 10-300 mm", () => {
  assert.throws(() => normalizeLabelSizeInput({ name: " ", widthMm: 60, heightMm: 40 }), /name/i);
  assert.throws(() => normalizeLabelSizeInput({ name: "Tiny", widthMm: 9.99, heightMm: 40 }), /10 and 300/i);
  assert.throws(() => normalizeLabelSizeInput({ name: "Huge", widthMm: 60, heightMm: 301 }), /10 and 300/i);
  assert.throws(() => normalizeLabelSizeInput({ name: "Broken", widthMm: "nope", heightMm: 40 }), /valid number/i);
});

test("preserves only validated serial print selectors and an optional saved size", () => {
  const ids = parseSerialPrintSelection({ ids: `${firstId},invalid,${secondId},${firstId}` });
  assert.deepEqual(ids, { kind: "ids", ids: [firstId, secondId] });
  assert.equal(serialPrintQuery(ids!, secondId), `ids=${firstId}%2C${secondId}&size=${secondId}`);

  const batch = parseSerialPrintSelection({ batch: firstId, product: secondId });
  assert.deepEqual(batch, { kind: "batch", id: firstId });
  assert.equal(serialPrintQuery(batch!), `batch=${firstId}`);

  const product = parseSerialPrintSelection({ product: secondId });
  assert.deepEqual(product, { kind: "product", id: secondId });
  assert.equal(parseSerialPrintSelection({ ids: "invalid", batch: "bad" }), null);
});

test("migration stores constrained sizes, seeds defaults, and grants permission-aware reads", async () => {
  const migration = await readFile("supabase/migrations/202608010003_serial_label_sizes.sql", "utf8");
  assert.match(migration, /create table public\.serial_label_sizes/i);
  assert.match(migration, /width_mm[\s\S]+between 10 and 300/i);
  assert.match(migration, /height_mm[\s\S]+between 10 and 300/i);
  assert.match(migration, /50 x 30 mm/i);
  assert.match(migration, /60 x 40 mm/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /current_user_has_permission\('serials\.print'\)/i);
});

test("label-size mutations are active-admin only", async () => {
  const actions = await readFile("app/admin/serials/print/actions.ts", "utf8");
  const createSection = actions.slice(actions.indexOf("createSerialLabelSizeAction"), actions.indexOf("deleteSerialLabelSizeAction"));
  const deleteSection = actions.slice(actions.indexOf("deleteSerialLabelSizeAction"));
  assert.match(createSection, /requireProfile\(\["admin"\]\)/);
  assert.match(deleteSection, /requireProfile\(\["admin"\]\)/);
  assert.match(actions, /normalizeLabelSizeInput/);
});

test("print page requires a saved size before rendering dimensioned labels", async () => {
  const page = await readFile("app/admin/serials/print/page.tsx", "utf8");
  assert.match(page, /Choose label size/);
  assert.match(page, /Add label size/);
  assert.match(page, /profile\.role === "admin"/);
  assert.match(page, /params\.size/);
  assert.match(page, /@page \{ size: \$\{selectedSize\.width_mm\}mm \$\{selectedSize\.height_mm\}mm/);
  assert.match(page, /width: `\$\{selectedSize\.width_mm\}mm`/);
  assert.match(page, /height: `\$\{selectedSize\.height_mm\}mm`/);
  assert.doesNotMatch(page, /preset-50x30|preset-60x40|preset-a4/);
});

test("staff-facing SEN serial records use the shared permission-aware print action", async () => {
  const component = await readFile("components/inventory/SerialPrintLink.tsx", "utf8");
  assert.match(component, /\/admin\/serials\/print\?ids=/);

  for (const file of [
    "app/admin/serials/page.tsx",
    "app/admin/serials/[id]/page.tsx",
    "app/admin/orders/[id]/page.tsx",
    "app/admin/orders/[id]/pack/page.tsx",
    "app/admin/sales/[saleId]/page.tsx",
    "app/admin/shipments/[id]/page.tsx",
  ]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /SerialPrintLink/, `${file} should show the shared serial print action`);
  }
});
