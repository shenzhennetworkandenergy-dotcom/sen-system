import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { permissionModuleSelectionSummary } from "../lib/permissions/checklist.ts";

const componentPath = fileURLToPath(new URL("../components/permissions/PermissionChecklist.tsx", import.meta.url));

test("permission-module selection summary counts partial selections", () => {
  const summary = permissionModuleSelectionSummary(
    ["orders.view", "orders.create", "orders.edit"],
    new Set(["orders.view", "orders.edit", "products.view"]),
  );

  assert.deepEqual(summary, {
    selectedCount: 2,
    totalCount: 3,
    label: "2 of 3 selected",
  });
});

test("permission-module selection summary labels empty selections", () => {
  const summary = permissionModuleSelectionSummary(
    ["orders.view", "orders.create"],
    new Set<string>(),
  );

  assert.deepEqual(summary, {
    selectedCount: 0,
    totalCount: 2,
    label: "0 of 2 selected",
  });
});

test("permission modules use collapsed native disclosures while keeping controls", () => {
  const source = readFileSync(componentPath, "utf8");

  assert.match(source, /<details[^>]+data-testid=\{`permission-module-\$\{module\.key\}`\}/);
  assert.match(source, /<summary\s+className=/);
  assert.doesNotMatch(source, /<details[^>]*\sopen(?:\s|=|>)/);
  assert.match(source, /permissionModuleSelectionSummary\(keys, selected\)/);
  assert.match(source, /type="checkbox"/);
  assert.match(source, />Select all</);
  assert.match(source, />Clear module</);
});
