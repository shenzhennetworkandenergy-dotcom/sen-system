import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWhatsappSheetSavePayload,
  resizeColumnWidth,
  shouldWarnBeforeUnload,
} from "../lib/crm/whatsapp-sheet-client.ts";

test("clamps spreadsheet column resizing to usable limits", () => {
  assert.equal(resizeColumnWidth(100, -200), 48);
  assert.equal(resizeColumnWidth(200, 35), 235);
  assert.equal(resizeColumnWidth(590, 100), 600);
});

test("builds a compact save payload containing only dirty cells and presentation changes", () => {
  const payload = buildWhatsappSheetSavePayload({
    categorySlug: "networking",
    sessionId: "session-1",
    revision: "revision-1",
    patches: {
      "customer:urgency": { customerId: "customer", header: "urgency", value: "Urgent" },
    },
    columnWidths: { interested_products: 240 },
    cellFormats: { "customer:interested_products": { color: "#112233" } },
    unlockCells: ["customer:interested_products", "customer:interested_products"],
  });

  assert.deepEqual(payload, {
    categorySlug: "networking",
    sessionId: "session-1",
    revision: "revision-1",
    patches: [{ customerId: "customer", header: "urgency", value: "Urgent" }],
    columnWidths: { interested_products: 240 },
    cellFormats: { "customer:interested_products": { color: "#112233" } },
    unlockCells: ["customer:interested_products"],
  });
});

test("warns only while spreadsheet work is not safely confirmed", () => {
  assert.equal(shouldWarnBeforeUnload("saved"), false);
  assert.equal(shouldWarnBeforeUnload("idle"), false);
  for (const state of ["dirty", "saving", "invalid", "error"] as const) {
    assert.equal(shouldWarnBeforeUnload(state), true);
  }
});
