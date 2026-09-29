import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readWhatsappCategory,
  upsertCategorizedWhatsappCustomer,
} from "../lib/crm/whatsapp-category-store.ts";
import { cellKey } from "../lib/crm/whatsapp-sheet-model.ts";
import {
  finishWhatsappSheetEdit,
  restorePreviousWhatsappSheet,
  saveWhatsappSheet,
  startWhatsappSheetEdit,
} from "../lib/crm/whatsapp-sheet-store.ts";
import { createFilesystemWhatsappWorkspaceStorage } from "../lib/crm/whatsapp-workspace-filesystem.ts";

test("selected workspace storage powers category and full edit-session restore flows", async () => {
  const directoryPath = await mkdtemp(path.join(tmpdir(), "sen-whatsapp-production-runtime-"));
  try {
    const storage = createFilesystemWhatsappWorkspaceStorage({ directoryPath });
    const options = { storage };
    await upsertCategorizedWhatsappCustomer({
      whatsapp_name: "Production customer",
      whatsapp_number: "8801712345678",
      conversation_history: "2026-09-29T09:00:00.000Z|C|Need a switch and ECG",
    }, [
      { categorySlug: "networking", interestedProducts: "Cisco switch", quantityRequirements: "2" },
      { categorySlug: "medical-equipment", interestedProducts: "ECG", quantityRequirements: "1" },
    ], options);

    const [record] = await readWhatsappCategory("networking", options);
    const started = await startWhatsappSheetEdit("networking", options);
    const saved = await saveWhatsappSheet({
      categorySlug: "networking",
      sessionId: started.metadata.activeSessionId!,
      revision: started.revision,
      unlockCells: [cellKey(record.customer_id, "whatsapp_name"), cellKey(record.customer_id, "interested_products")],
      patches: [
        { customerId: record.customer_id, header: "whatsapp_name", value: "Edited customer" },
        { customerId: record.customer_id, header: "interested_products", value: "Cisco C9300" },
      ],
    }, options);
    await assert.rejects(() => saveWhatsappSheet({
      categorySlug: "networking",
      sessionId: saved.metadata.activeSessionId!,
      revision: started.revision,
      patches: [],
    }, options), /changed|revision/i);
    const finished = await finishWhatsappSheetEdit("networking", saved.metadata.activeSessionId!, options);

    assert.equal((await readWhatsappCategory("medical-equipment", options))[0].whatsapp_name, "Edited customer");
    assert.equal((await readWhatsappCategory("medical-equipment", options))[0].interested_products, "ECG");

    const restored = await restorePreviousWhatsappSheet("networking", options);
    assert.equal(restored.rows[0].whatsapp_name, "Production customer");
    assert.equal(restored.rows[0].interested_products, "Cisco switch");
    assert.equal((await readWhatsappCategory("medical-equipment", options))[0].whatsapp_name, "Production customer");
    assert.equal(finished.hasSnapshot, true);
    assert.equal(restored.hasSnapshot, false);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});
