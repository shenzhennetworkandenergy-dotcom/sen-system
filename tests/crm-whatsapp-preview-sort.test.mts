import assert from "node:assert/strict";
import test from "node:test";

import { sortWhatsappPreviewRows as sortRows } from "../lib/crm/whatsapp-preview-sort.ts";

const rows = [
  { customer_id: "older", last_communication_at: "2026-09-20T10:00:00Z", next_follow_up_at: "2026-10-03T10:00:00Z" },
  { customer_id: "blank", last_communication_at: "", next_follow_up_at: "" },
  { customer_id: "newer", last_communication_at: "2026-09-28T10:00:00Z", next_follow_up_at: "2026-10-01T10:00:00Z" },
];

test("sorts last conversations newest or oldest while keeping missing dates last", () => {
  assert.deepEqual(sortRows(rows, "last_communication_at", "desc").map((row) => row.customer_id), ["newer", "older", "blank"]);
  assert.deepEqual(sortRows(rows, "last_communication_at", "asc").map((row) => row.customer_id), ["older", "newer", "blank"]);
});

test("sorts follow-ups soonest or latest while keeping missing dates last", () => {
  assert.deepEqual(sortRows(rows, "next_follow_up_at", "asc").map((row) => row.customer_id), ["newer", "older", "blank"]);
  assert.deepEqual(sortRows(rows, "next_follow_up_at", "desc").map((row) => row.customer_id), ["older", "newer", "blank"]);
});
