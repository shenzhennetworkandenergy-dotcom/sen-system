import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizePurchaseCarrier } from "../lib/purchasing/carriers.ts";

const read = (path: string) => readFile(path, "utf8");

test("carrier input is a required selection-only database identifier", async () => {
  const page = await read("app/admin/purchasing/[id]/page.tsx");
  assert.match(page, /<select[\s\S]*?name="carrier_id"[\s\S]*?required/);
  assert.match(page, /<option value="" disabled>[\s\S]*?Select carrier/);
  assert.doesNotMatch(page, /<input[\s\S]*?name="carrier_name"/);
  assert.doesNotMatch(page, /datalist/);
});

test("carrier management provides complete modal forms and refreshes the server view", async () => {
  const component = await read("components/purchasing/PurchaseCarrierManager.tsx");
  assert.match(component, /<dialog/);
  assert.match(component, /\+ Add Carrier/);
  assert.match(component, /max-h-full/);
  assert.match(component, /overflow-y-auto/);
  for (const field of ["name", "phone_number", "address", "description", "status"]) {
    assert.match(component, new RegExp(`name="${field}"`));
  }
  assert.match(component, /createPurchaseCarrierAction/);
  assert.match(component, /updatePurchaseCarrierAction/);
  assert.match(component, /togglePurchaseCarrierStatusAction/);
  assert.match(component, /deletePurchaseCarrierAction/);
  assert.match(component, /router\.refresh\(\)/);
});

test("carrier actions validate IDs, preserve permissions, and save the relationship", async () => {
  const actions = await read("app/admin/purchasing/actions.ts");
  assert.match(actions, /requireAllPermissions\(\["purchasing\.edit", "shipments\.create"\]\)/);
  assert.match(actions, /uuid\(form\.get\("carrier_id"\), "Carrier"\)/);
  assert.match(actions, /transition_purchase_inbound_shipment_with_carrier/);
  assert.match(actions, /requested_carrier_id:\s*carrierId/);
  assert.doesNotMatch(actions, /requested_carrier_name:\s*optionalString\(form, "carrier_name"/);
  assert.match(actions, /error\?\.code === "23505"/);
});

test("carrier migration is additive and preserves all historical records", async () => {
  const migration = await read("supabase/migrations/202608190001_purchase_carrier_management.sql");
  assert.match(migration, /add column if not exists carrier_id uuid/);
  assert.match(migration, /references public\.purchase_carriers\(id\) on delete restrict/);
  assert.match(migration, /historical carrier_name snapshot/);
  assert.match(migration, /transition_purchase_inbound_shipment_with_carrier/);
  assert.match(migration, /requested_carrier_id uuid/);
  assert.match(migration, /carrier_id=resolved_carrier_id/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\./i);
  assert.doesNotMatch(migration, /truncate/i);
  assert.doesNotMatch(migration, /drop\s+table/i);
});

test("carrier fields are normalized and required", () => {
  const form = new FormData();
  form.set("name", "  SF Express  ");
  form.set("phone_number", " +86 100 200 ");
  form.set("address", " Shenzhen, China ");
  form.set("description", " Priority courier ");
  form.set("status", "active");
  assert.deepEqual(normalizePurchaseCarrier(form), {
    name: "SF Express",
    phone_number: "+86 100 200",
    address: "Shenzhen, China",
    description: "Priority courier",
    status: "active",
  });

  for (const field of ["name", "phone_number", "address"]) {
    const invalid = new FormData();
    invalid.set("name", "Carrier");
    invalid.set("phone_number", "123");
    invalid.set("address", "Address");
    invalid.set(field, "");
    assert.throws(() => normalizePurchaseCarrier(invalid), /required/i);
  }
});

test("carrier status accepts only active or inactive", () => {
  const form = new FormData();
  form.set("name", "Carrier");
  form.set("phone_number", "123");
  form.set("address", "Address");
  form.set("status", "archived");
  assert.throws(() => normalizePurchaseCarrier(form), /status/i);
});
