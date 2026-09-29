import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWhatsappCellPatches,
  canEditWhatsappCell,
  cellKey,
  isSystemWhatsappColumn,
  normalizeWhatsappSheetMetadata,
} from "../lib/crm/whatsapp-sheet-model.ts";
import { mergeWhatsappCustomer, WHATSAPP_CSV_HEADERS } from "../lib/crm/whatsapp-records.ts";

const now = new Date("2026-09-28T10:00:00.000Z");
const collected = () => mergeWhatsappCustomer(null, {
  whatsapp_name: "Collected customer",
  whatsapp_number: "8801712345678",
  category_slug: "networking",
  interested_products: "Collected switch",
  status: "interested",
  conversation_history: "2026-09-28T09:00:00.000Z|C|Need a switch",
}, new Date("2026-09-28T09:05:00.000Z"));

test("normalizes unsafe spreadsheet metadata to compact bounded presentation settings", () => {
  assert.deepEqual(normalizeWhatsappSheetMetadata(undefined), {
    version: 1,
    columnWidths: {},
    cellFormats: {},
    editableCells: [],
    manualRows: [],
    activeSessionId: null,
  });

  const metadata = normalizeWhatsappSheetMetadata({
    version: 99,
    columnWidths: { interested_products: 20, conversation_history: 1000, wrong: 120 },
    cellFormats: {
      "customer:interested_products": { fontSize: 7, color: "#112233", backgroundColor: "red" },
      "customer:urgency": { fontSize: 30, backgroundColor: "#aabbcc" },
    },
    editableCells: ["customer:interested_products", 4, "customer:interested_products"],
    manualRows: ["customer", null, "customer"],
    activeSessionId: 42,
  });

  assert.deepEqual(metadata, {
    version: 1,
    columnWidths: { interested_products: 48, conversation_history: 600 },
    cellFormats: {
      "customer:interested_products": { fontSize: 8, color: "#112233" },
      "customer:urgency": { fontSize: 24, backgroundColor: "#aabbcc" },
    },
    editableCells: ["customer:interested_products"],
    manualRows: ["customer"],
    activeSessionId: null,
  });
});

test("keeps supported spreadsheet font alignment and wrapping formats while rejecting unsafe values", () => {
  const metadata = normalizeWhatsappSheetMetadata({
    cellFormats: {
      "customer:whatsapp_name": {
        fontWeight: "bold",
        fontStyle: "italic",
        textDecoration: "underline",
        textAlign: "center",
        wrapText: true,
      },
      "customer:status": {
        fontWeight: "heavy",
        fontStyle: "slanted",
        textDecoration: "blink",
        textAlign: "justify",
        wrapText: "yes",
      },
    },
  });

  assert.deepEqual(metadata.cellFormats["customer:whatsapp_name"], {
    fontWeight: "bold",
    fontStyle: "italic",
    textDecoration: "underline",
    textAlign: "center",
    wrapText: true,
  });
  assert.equal(metadata.cellFormats["customer:status"], undefined);
});

test("locks collected values and system columns while allowing blank manual and unlocked cells", () => {
  const record = collected();
  const metadata = normalizeWhatsappSheetMetadata(undefined);

  assert.equal(canEditWhatsappCell(record, "interested_products", metadata), false);
  assert.equal(canEditWhatsappCell(record, "urgency", metadata), true);
  assert.equal(canEditWhatsappCell(record, "whatsapp_link", metadata), false);
  assert.equal(isSystemWhatsappColumn("created_at"), true);
  assert.equal(isSystemWhatsappColumn("whatsapp_name"), false);

  metadata.editableCells.push(cellKey(record.customer_id, "interested_products"));
  assert.equal(canEditWhatsappCell(record, "interested_products", metadata), true);

  metadata.manualRows.push(record.customer_id);
  assert.equal(canEditWhatsappCell(record, "conversation_history", metadata), true);
  assert.equal(canEditWhatsappCell(record, "updated_at", metadata), false);
});

test("applies only permitted cell patches and records manual provenance", () => {
  const record = collected();
  const metadata = normalizeWhatsappSheetMetadata({
    editableCells: [cellKey(record.customer_id, "interested_products")],
  });

  const result = applyWhatsappCellPatches([record], metadata, [
    { customerId: record.customer_id, header: "interested_products", value: "Corrected switch" },
    { customerId: record.customer_id, header: "urgency", value: "Urgent" },
  ], now);

  assert.equal(result.rows[0].interested_products, "Corrected switch");
  assert.equal(result.rows[0].urgency, "Urgent");
  assert.equal(result.rows[0].updated_at, now.toISOString());
  assert.ok(WHATSAPP_CSV_HEADERS.every((header) => Object.hasOwn(result.rows[0], header)));
  assert.ok(result.metadata.editableCells.includes(cellKey(record.customer_id, "urgency")));
});

test("creates a valid manual row with generated locked system fields", () => {
  const result = applyWhatsappCellPatches([], normalizeWhatsappSheetMetadata(undefined), [
    { customerId: "new:1", header: "whatsapp_name", value: "Manual customer" },
    { customerId: "new:1", header: "whatsapp_number", value: "+880 1812-345678" },
    { customerId: "new:1", header: "status", value: "new" },
  ], now, "networking");

  assert.equal(result.rows.length, 1);
  assert.match(result.rows[0].customer_id, /^[0-9a-f-]{36}$/);
  assert.equal(result.rows[0].whatsapp_number, "8801812345678");
  assert.equal(result.rows[0].whatsapp_link, "https://wa.me/8801812345678");
  assert.equal(result.rows[0].category_slug, "networking");
  assert.equal(result.rows[0].created_at, now.toISOString());
  assert.equal(result.rows[0].updated_at, now.toISOString());
  assert.ok(result.metadata.manualRows.includes(result.rows[0].customer_id));
  assert.equal(canEditWhatsappCell(result.rows[0], "whatsapp_name", result.metadata), true);
  assert.equal(canEditWhatsappCell(result.rows[0], "whatsapp_link", result.metadata), false);
});

test("rejects locked and invalid spreadsheet value changes before producing rows", () => {
  const record = collected();
  const metadata = normalizeWhatsappSheetMetadata(undefined);
  const editable = (header: string) => normalizeWhatsappSheetMetadata({
    editableCells: [cellKey(record.customer_id, header as never)],
  });
  const patch = (header: string, value: string) => [{ customerId: record.customer_id, header, value }] as never;

  assert.throws(() => applyWhatsappCellPatches([record], metadata, patch("interested_products", "Overwrite"), now), /locked/i);
  assert.throws(() => applyWhatsappCellPatches([record], metadata, patch("budget", "BDT 1"), now), /column/i);
  assert.throws(() => applyWhatsappCellPatches([record], editable("status"), patch("status", "wrong"), now), /status/i);
  assert.throws(() => applyWhatsappCellPatches([record], editable("last_communication_at"), patch("last_communication_at", "yesterday"), now), /date/i);
  assert.throws(() => applyWhatsappCellPatches([record], editable("whatsapp_number"), patch("whatsapp_number", "123"), now), /WhatsApp number/i);
  assert.throws(() => applyWhatsappCellPatches([record], editable("conversation_history"), patch("conversation_history", "bad history"), now), /conversation/i);

  const other = mergeWhatsappCustomer(null, {
    whatsapp_name: "Other",
    whatsapp_number: "8801812345678",
    conversation_history: "",
  }, now);
  const duplicateMetadata = normalizeWhatsappSheetMetadata({
    editableCells: [cellKey(other.customer_id, "whatsapp_number")],
  });
  assert.throws(
    () => applyWhatsappCellPatches([record, other], duplicateMetadata, [
      { customerId: other.customer_id, header: "whatsapp_number", value: record.whatsapp_number },
    ], now),
    /duplicate/i,
  );
});
