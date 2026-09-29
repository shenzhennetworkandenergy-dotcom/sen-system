import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readWhatsappCategory, upsertCategorizedWhatsappCustomer } from "../lib/crm/whatsapp-category-store.ts";
import { cellKey } from "../lib/crm/whatsapp-sheet-model.ts";
import {
  finishWhatsappSheetEdit,
  readWhatsappSheet,
  restorePreviousWhatsappSheet,
  saveWhatsappSheet,
  startWhatsappSheetEdit,
} from "../lib/crm/whatsapp-sheet-store.ts";

async function fixture() {
  const directoryPath = await mkdtemp(path.join(tmpdir(), "sen-whatsapp-sheet-"));
  await upsertCategorizedWhatsappCustomer({
    whatsapp_name: "Collected customer",
    whatsapp_number: "8801712345678",
    conversation_history: "2026-09-28T09:00:00.000Z|C|Need a switch and ECG",
  }, [
    { categorySlug: "networking", interestedProducts: "Cisco switch", quantityRequirements: "2 units" },
    { categorySlug: "medical-equipment", interestedProducts: "ECG", quantityRequirements: "1 unit" },
  ], { directoryPath });
  const [record] = await readWhatsappCategory("networking", { directoryPath });
  return { directoryPath, record };
}

test("reads only the selected category with independent presentation metadata", async () => {
  const { directoryPath } = await fixture();
  try {
    const networking = await readWhatsappSheet("networking", { directoryPath });
    const medical = await readWhatsappSheet("medical-equipment", { directoryPath });
    assert.deepEqual(networking.rows.map((row) => row.interested_products), ["Cisco switch"]);
    assert.deepEqual(medical.rows.map((row) => row.interested_products), ["ECG"]);
    assert.equal(networking.categorySlug, "networking");
    assert.equal(networking.hasSnapshot, false);
    await assert.rejects(() => access(path.join(directoryPath, "networking.view.json")), /ENOENT/);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test("propagates shared edits while keeping category-specific edits private", async () => {
  const { directoryPath, record } = await fixture();
  try {
    const started = await startWhatsappSheetEdit("networking", { directoryPath });
    const saved = await saveWhatsappSheet({
      categorySlug: "networking",
      sessionId: started.metadata.activeSessionId!,
      revision: started.revision,
      unlockCells: [cellKey(record.customer_id, "whatsapp_name"), cellKey(record.customer_id, "interested_products")],
      patches: [
        { customerId: record.customer_id, header: "whatsapp_name", value: "Shared name" },
        { customerId: record.customer_id, header: "interested_products", value: "Cisco C9300" },
      ],
    }, { directoryPath });
    assert.equal(saved.rows[0].whatsapp_name, "Shared name");
    assert.equal(saved.rows[0].interested_products, "Cisco C9300");
    const [medical] = await readWhatsappCategory("medical-equipment", { directoryPath });
    assert.equal(medical.whatsapp_name, "Shared name");
    assert.equal(medical.interested_products, "ECG");
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test("creates manual rows inside the selected category", async () => {
  const { directoryPath } = await fixture();
  try {
    const started = await startWhatsappSheetEdit("networking", { directoryPath });
    const saved = await saveWhatsappSheet({
      categorySlug: "networking",
      sessionId: started.metadata.activeSessionId!,
      revision: started.revision,
      patches: [
        { customerId: "new:1", header: "whatsapp_name", value: "Manual lead" },
        { customerId: "new:1", header: "whatsapp_number", value: "8801812345678" },
        { customerId: "new:1", header: "interested_products", value: "Router" },
      ],
    }, { directoryPath });
    const manual = saved.rows.find((row) => row.whatsapp_name === "Manual lead")!;
    assert.equal(manual.category_slug, "networking");
    assert.equal(manual.whatsapp_link, "https://wa.me/8801812345678");
    assert.ok(saved.metadata.manualRows.includes(manual.customer_id));
    assert.equal((await readWhatsappCategory("medical-equipment", { directoryPath })).length, 1);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test("rejects a payload for a different category or stale revision", async () => {
  const { directoryPath, record } = await fixture();
  try {
    const started = await startWhatsappSheetEdit("networking", { directoryPath });
    await assert.rejects(() => saveWhatsappSheet({ categorySlug: "medical-equipment", sessionId: started.metadata.activeSessionId!, revision: started.revision, patches: [] }, { directoryPath }), /category/i);
    await assert.rejects(() => saveWhatsappSheet({
      categorySlug: "networking",
      sessionId: started.metadata.activeSessionId!,
      revision: "stale",
      patches: [{ customerId: record.customer_id, header: "urgency", value: "High" }],
    }, { directoryPath }), /changed|stale|revision/i);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test("serializes simultaneous saves so only one matching revision can win", async () => {
  const { directoryPath, record } = await fixture();
  try {
    const started = await startWhatsappSheetEdit("networking", { directoryPath });
    const payload = (value: string) => ({
      categorySlug: "networking",
      sessionId: started.metadata.activeSessionId!,
      revision: started.revision,
      patches: [{ customerId: record.customer_id, header: "urgency" as const, value }],
    });
    const results = await Promise.allSettled([
      saveWhatsappSheet(payload("High"), { directoryPath }),
      saveWhatsappSheet(payload("Urgent"), { directoryPath }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test("validates every category before publishing a shared number change", async () => {
  const { directoryPath, record } = await fixture();
  try {
    await upsertCategorizedWhatsappCustomer({
      whatsapp_name: "Existing medical customer",
      whatsapp_number: "8801812345678",
      conversation_history: "2026-09-28T10:00:00.000Z|C|Need ECG",
    }, [{ categorySlug: "medical-equipment", interestedProducts: "ECG", quantityRequirements: "1" }], { directoryPath });
    const started = await startWhatsappSheetEdit("networking", { directoryPath });
    await assert.rejects(() => saveWhatsappSheet({
      categorySlug: "networking",
      sessionId: started.metadata.activeSessionId!,
      revision: started.revision,
      unlockCells: [cellKey(record.customer_id, "whatsapp_number")],
      patches: [{ customerId: record.customer_id, header: "whatsapp_number", value: "8801812345678" }],
    }, { directoryPath }), /duplicate/i);
    assert.equal((await readWhatsappCategory("networking", { directoryPath }))[0].whatsapp_number, "8801712345678");
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test("rejects restore slugs before reading a snapshot outside the CRM directory", async () => {
  const { directoryPath } = await fixture();
  const escapedSnapshot = path.join(directoryPath, "..", "escape.previous.json");
  try {
    await writeFile(escapedSnapshot, JSON.stringify({ rows: [], metadata: { version: 1 } }));
    await assert.rejects(() => restorePreviousWhatsappSheet("../escape", { directoryPath }), /category/i);
    assert.equal((await readWhatsappCategory("networking", { directoryPath })).length, 1);
  } finally {
    await rm(escapedSnapshot, { force: true });
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test("restores the complete pre-edit category state once", async () => {
  const { directoryPath, record } = await fixture();
  try {
    const started = await startWhatsappSheetEdit("networking", { directoryPath });
    const saved = await saveWhatsappSheet({
      categorySlug: "networking",
      sessionId: started.metadata.activeSessionId!,
      revision: started.revision,
      unlockCells: [cellKey(record.customer_id, "whatsapp_name")],
      patches: [{ customerId: record.customer_id, header: "whatsapp_name", value: "Edited everywhere" }],
      columnWidths: { interested_products: 333 },
    }, { directoryPath });
    await finishWhatsappSheetEdit("networking", saved.metadata.activeSessionId!, { directoryPath });
    const restored = await restorePreviousWhatsappSheet("networking", { directoryPath });
    assert.equal(restored.rows[0].whatsapp_name, "Collected customer");
    assert.deepEqual(restored.metadata.columnWidths, {});
    assert.equal((await readWhatsappCategory("medical-equipment", { directoryPath }))[0].whatsapp_name, "Collected customer");
    assert.equal(restored.hasSnapshot, false);
    await assert.rejects(() => restorePreviousWhatsappSheet("networking", { directoryPath }), /previous version|snapshot/i);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});
