import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { replaceFileSafely } from "../lib/crm/atomic-file.ts";
import { WHATSAPP_CSV_HEADERS } from "../lib/crm/whatsapp-records.ts";
import {
  createWhatsappCategoryCsv,
  findWhatsappCategoryRow,
  readAllWhatsappCategoryRows,
  readWhatsappCategories,
  readWhatsappCategory,
  updateWhatsappCategoryRow,
  upsertCategorizedWhatsappCustomer,
} from "../lib/crm/whatsapp-category-store.ts";

async function fixture() {
  const directoryPath = await mkdtemp(path.join(tmpdir(), "sen-whatsapp-categories-"));
  return { directoryPath, options: { directoryPath } };
}

test("creates the eight category files plus Uncategorized with one standard header", async () => {
  const { directoryPath, options } = await fixture();
  try {
    const categories = await readWhatsappCategories(options);
    assert.equal(categories.length, 9);
    const files = await readdir(directoryPath);
    for (const category of categories) {
      assert.ok(files.includes(category.fileName));
      assert.equal((await readFile(path.join(directoryPath, category.fileName), "utf8")).trim(), WHATSAPP_CSV_HEADERS.join(","));
      assert.deepEqual(await readWhatsappCategory(category.slug, options), []);
    }
    assert.ok(files.includes("all-customers.csv"));
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test("reclassifies interests and keeps row-scoped updates isolated", async () => {
  const { directoryPath, options } = await fixture();
  try {
    const input = {
      whatsapp_name: "Multi Category",
      whatsapp_number: "8801712345678",
      assigned_to: "employee-1",
      conversation_history: "2026-09-29T08:00:00.000Z|C|Need products",
    };
    await upsertCategorizedWhatsappCustomer(input, [
      { categorySlug: "networking", interestedProducts: "Cisco switch", quantityRequirements: "2" },
      { categorySlug: "medical-equipment", interestedProducts: "Patient monitor", quantityRequirements: "1" },
    ], options);
    await upsertCategorizedWhatsappCustomer(input, [
      { categorySlug: "medical-equipment", interestedProducts: "Patient monitor", quantityRequirements: "1" },
      { categorySlug: "energy", interestedProducts: "Solar inverter", quantityRequirements: "3" },
    ], options);

    assert.deepEqual(await readWhatsappCategory("networking", options), []);
    const [medical] = await readWhatsappCategory("medical-equipment", options);
    const [energy] = await readWhatsappCategory("energy", options);
    assert.equal(medical.assigned_to, "employee-1");
    assert.equal(energy.assigned_to, "employee-1");
    assert.equal((await findWhatsappCategoryRow(medical.customer_id, options))?.category_slug, "medical-equipment");

    await updateWhatsappCategoryRow(medical.customer_id, { status: "quotation", whatsapp_name: "Corrected Shared Name" }, options);
    assert.equal((await readWhatsappCategory("medical-equipment", options))[0].status, "quotation");
    assert.equal((await readWhatsappCategory("energy", options))[0].status, "new");
    assert.equal((await readWhatsappCategory("energy", options))[0].whatsapp_name, "Corrected Shared Name");
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test("projects one customer into two categories with isolated products and Messenger pages", async () => {
  const { directoryPath, options } = await fixture();
  try {
    await upsertCategorizedWhatsappCustomer({
      whatsapp_name: "Dual Market Customer",
      whatsapp_number: "+880 1712-345678",
      conversation_history: "2026-09-29T08:00:00.000Z|C|Need C9300 and CMS8000",
      categoryMessengerLinks: {
        networking: "https://business.facebook.com/latest/inbox/all?selected_item_id=network",
        "medical-equipment": "https://business.facebook.com/latest/inbox/all?selected_item_id=medical",
      },
    }, [
      { categorySlug: "networking", interestedProducts: "Cisco C9300", quantityRequirements: "2 switches" },
      { categorySlug: "medical-equipment", interestedProducts: "CONTEC CMS8000", quantityRequirements: "1 monitor" },
    ], options);

    const [networking] = await readWhatsappCategory("networking", options);
    const [medical] = await readWhatsappCategory("medical-equipment", options);
    assert.equal(networking.interested_products, "Cisco C9300");
    assert.equal(networking.quantity_requirements, "2 switches");
    assert.match(networking.messenger_profile_link, /network$/);
    assert.equal(medical.interested_products, "CONTEC CMS8000");
    assert.equal(medical.quantity_requirements, "1 monitor");
    assert.match(medical.messenger_profile_link, /medical$/);
    assert.equal(networking.whatsapp_number, medical.whatsapp_number);
    assert.equal(networking.whatsapp_link, "https://wa.me/8801712345678");
    assert.notEqual(networking.customer_id, medical.customer_id);
    assert.equal((await readAllWhatsappCategoryRows(options)).length, 2);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test("propagates shared WhatsApp facts without leaking category-specific values", async () => {
  const { directoryPath, options } = await fixture();
  try {
    const base = {
      whatsapp_name: "Old Name",
      whatsapp_number: "8801712345678",
      conversation_history: "2026-09-29T08:00:00.000Z|C|Need products",
    };
    const assignments = [
      { categorySlug: "networking", interestedProducts: "Cisco C9300", quantityRequirements: "2 switches" },
      { categorySlug: "medical-equipment", interestedProducts: "CMS8000", quantityRequirements: "1 monitor" },
    ];
    await upsertCategorizedWhatsappCustomer(base, assignments, options);
    await upsertCategorizedWhatsappCustomer({ ...base, whatsapp_name: "Corrected Name" }, assignments, options);

    const [networking] = await readWhatsappCategory("networking", options);
    const [medical] = await readWhatsappCategory("medical-equipment", options);
    assert.equal(networking.whatsapp_name, "Corrected Name");
    assert.equal(medical.whatsapp_name, "Corrected Name");
    assert.equal(networking.interested_products, "Cisco C9300");
    assert.equal(medical.interested_products, "CMS8000");
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test("creates an empty CRM-only category CSV and rejects slug collisions", async () => {
  const { directoryPath, options } = await fixture();
  try {
    const category = await createWhatsappCategoryCsv("Data Centre Parts", options);
    assert.equal(category.fileName, "data-centre-parts-customers.csv");
    assert.equal(category.source, "crm");
    assert.deepEqual(await readWhatsappCategory(category.slug, options), []);
    assert.equal((await readFile(path.join(directoryPath, category.fileName), "utf8")).trim(), WHATSAPP_CSV_HEADERS.join(","));
    await assert.rejects(() => createWhatsappCategoryCsv("DATA CENTRE PARTS", options), /already exists/i);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test("falls back to backup replacement when direct replacement returns EPERM", async () => {
  const { directoryPath } = await fixture();
  const targetPath = path.join(directoryPath, "replace.csv");
  try {
    await writeFile(targetPath, "old", "utf8");
    let firstTargetReplace = true;
    await replaceFileSafely(targetPath, "new", {
      renameFile: async (source, target) => {
        if (target === targetPath && source.endsWith(".tmp") && firstTargetReplace) {
          firstTargetReplace = false;
          throw Object.assign(new Error("blocked"), { code: "EPERM" });
        }
        await rename(source, target);
      },
    });
    assert.equal(await readFile(targetPath, "utf8"), "new");
    assert.deepEqual((await readdir(directoryPath)).filter((name) => /\.(?:tmp|backup)$/.test(name)), []);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});

test("restores the original target when replacement fails after backup", async () => {
  const { directoryPath } = await fixture();
  const targetPath = path.join(directoryPath, "replace.csv");
  try {
    await writeFile(targetPath, "old", "utf8");
    let targetAttempts = 0;
    await assert.rejects(() => replaceFileSafely(targetPath, "new", {
      renameFile: async (source, target) => {
        if (target === targetPath && source.endsWith(".tmp")) {
          targetAttempts += 1;
          throw Object.assign(new Error(targetAttempts === 1 ? "direct blocked" : "replacement failed"), { code: targetAttempts === 1 ? "EPERM" : "EIO" });
        }
        await rename(source, target);
      },
    }), /replacement failed/);
    assert.equal(await readFile(targetPath, "utf8"), "old");
    assert.deepEqual((await readdir(directoryPath)).filter((name) => /\.(?:tmp|backup)$/.test(name)), []);
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});
