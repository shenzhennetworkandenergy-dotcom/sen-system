import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cash statement starts at the top and flows naturally across pages", async () => {
  const component = await readFile("components/accounting/QuickCashbook.tsx", "utf8");
  assert.match(component, /position: absolute !important;/);
  assert.match(component, /top: 0 !important;/);
  assert.match(component, /overflow: visible !important;/);
  assert.match(component, /break-inside: avoid/);
  assert.doesNotMatch(component, /min-height: 277mm/);
  assert.doesNotMatch(component, /margin-top: auto !important/);
  assert.doesNotMatch(component, /position: fixed !important/);
});
