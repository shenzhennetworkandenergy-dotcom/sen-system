import assert from "node:assert/strict";
import test from "node:test";
import { visibleSalesSummaryCards } from "../app/admin/sales/summary-cards.ts";

const cards = [
  ["Today's sales", "BDT 74,000.00"],
  ["This month", "BDT 74,000.00"],
  ["Pending", 1],
  ["Awaiting payment", 0],
  ["Partially paid", 1],
  ["Ready to ship", 0],
  ["Completed", 0],
  ["Outstanding", "BDT 34,000.00"],
] as const;

test("employees do not see aggregate sales value summary cards", () => {
  assert.deepEqual(
    visibleSalesSummaryCards("employee", cards).map(([name]) => name),
    ["Pending", "Awaiting payment", "Partially paid", "Ready to ship", "Completed"],
  );
});

test("admins continue to see every sales summary card", () => {
  assert.deepEqual(visibleSalesSummaryCards("admin", cards), cards);
});
