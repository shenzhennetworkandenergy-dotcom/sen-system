import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { INITIAL_WHATSAPP_CATEGORIES } from "../lib/crm/whatsapp-categories.ts";
import { mergeWhatsappCustomer } from "../lib/crm/whatsapp-records.ts";
import { normalizeWhatsappSheetMetadata } from "../lib/crm/whatsapp-sheet-model.ts";
import { createFilesystemWhatsappWorkspaceStorage } from "../lib/crm/whatsapp-workspace-filesystem.ts";

test("filesystem workspace publishes complete snapshots with stale-write and one-step restore protection", async () => {
  const directoryPath = await mkdtemp(path.join(tmpdir(), "sen-workspace-storage-"));
  try {
    const store = createFilesystemWhatsappWorkspaceStorage({ directoryPath });
    const initial = await store.initialize({ categories: [...INITIAL_WHATSAPP_CATEGORIES], rows: [], views: {} });
    assert.equal((await store.read())?.revision, initial.revision);

    const customer = mergeWhatsappCustomer(null, {
      category_slug: "networking",
      whatsapp_name: "Storage customer",
      whatsapp_number: "8801712345678",
      conversation_history: "2026-09-29T09:00:00.000Z|C|Need a switch",
      interested_products: "Cisco switch",
    });
    const publication = {
      categories: [...INITIAL_WHATSAPP_CATEGORIES],
      rows: [customer],
      views: { networking: normalizeWhatsappSheetMetadata({ columnWidths: { interested_products: 220 } }) },
    };
    const published = await store.publish(initial.revision, publication);
    assert.equal(published.rows[0].interested_products, "Cisco switch");
    assert.equal(published.previousRevision, initial.revision);
    await assert.rejects(() => store.publish(initial.revision, publication), /stale|changed|revision/i);

    const restored = await store.restore(published.revision);
    assert.deepEqual(restored.rows, []);
    assert.equal(restored.previousRevision, null);
    await assert.rejects(() => store.restore(restored.revision), /previous|restore/i);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});
