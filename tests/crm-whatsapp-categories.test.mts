import assert from "node:assert/strict";
import test from "node:test";

import {
  createWhatsappCategory,
  INITIAL_WHATSAPP_CATEGORIES,
  normalizeWhatsappCategorySlug,
  whatsappCategoryFileName,
} from "../lib/crm/whatsapp-categories.ts";

test("provides the eight website categories plus Uncategorized", () => {
  assert.deepEqual(INITIAL_WHATSAPP_CATEGORIES.map(({ name, slug, source }) => ({ name, slug, source })), [
    { name: "Networking", slug: "networking", source: "website" },
    { name: "Medical Equipment", slug: "medical-equipment", source: "website" },
    { name: "Energy", slug: "energy", source: "website" },
    { name: "Commercial Equipment", slug: "commercial-equipment", source: "website" },
    { name: "Garments", slug: "garments", source: "website" },
    { name: "Industrial Automation", slug: "industrial-automation", source: "website" },
    { name: "Industrial Components", slug: "industrial-components", source: "website" },
    { name: "Semiconductors", slug: "semiconductors", source: "website" },
    { name: "Uncategorized", slug: "uncategorized", source: "fallback" },
  ]);
  assert.deepEqual(
    INITIAL_WHATSAPP_CATEGORIES.map((category) => category.fileName),
    INITIAL_WHATSAPP_CATEGORIES.map((category) => `${category.slug}-customers.csv`),
  );
});

test("normalizes category names into safe lowercase filenames", () => {
  assert.equal(normalizeWhatsappCategorySlug("  Médical & Lab / Devices  "), "medical-lab-devices");
  assert.equal(whatsappCategoryFileName("Industrial Automation"), "industrial-automation-customers.csv");
  assert.throws(() => normalizeWhatsappCategorySlug("../"), /valid category name/i);
});

test("creates CRM-only categories and rejects normalized collisions", () => {
  const created = createWhatsappCategory("Data Centre Parts", INITIAL_WHATSAPP_CATEGORIES);
  assert.deepEqual(created, {
    name: "Data Centre Parts",
    slug: "data-centre-parts",
    fileName: "data-centre-parts-customers.csv",
    source: "crm",
  });
  assert.throws(
    () => createWhatsappCategory("NETWORKING", INITIAL_WHATSAPP_CATEGORIES),
    /already exists/i,
  );
});
