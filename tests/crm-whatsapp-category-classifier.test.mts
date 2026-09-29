import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_WHATSAPP_CATEGORIES } from "../lib/crm/whatsapp-categories.ts";
import {
  classifyWhatsappInterest,
  type WhatsappCatalogueProduct,
} from "../lib/crm/whatsapp-category-classifier.ts";

const products: WhatsappCatalogueProduct[] = [
  { name: "Cisco Catalyst 9300", slug: "cisco-catalyst-9300", modelNumber: "C9300-24T", sku: "NET-C9300", categorySlug: "networking" },
  { name: "CONTEC CMS8000 Patient Monitor", slug: "contec-cms8000-patient-monitor", modelNumber: "CMS8000", categorySlug: "medical-equipment" },
  { name: "Delta VFD MS300", slug: "delta-vfd-ms300", modelNumber: "MS300", categorySlug: "industrial-automation" },
];

test("matches catalogue names models SKUs and slugs case-insensitively", () => {
  for (const interestedProducts of ["cisco catalyst 9300", "C9300-24T", "net-c9300", "Cisco-Catalyst-9300"]) {
    const [assignment] = classifyWhatsappInterest({ interestedProducts, quantityRequirements: "2 units" }, products, INITIAL_WHATSAPP_CATEGORIES);
    assert.equal(assignment.categorySlug, "networking");
    assert.equal(assignment.interestedProducts, interestedProducts);
    assert.equal(assignment.quantityRequirements, "2 units");
  }
});

test("creates isolated product and requirement subsets for two categories", () => {
  const assignments = classifyWhatsappInterest({
    interestedProducts: "Cisco C9300-24T; CONTEC CMS8000 Patient Monitor",
    quantityRequirements: "Need 2 C9300-24T switches. Need 1 CMS8000 monitor with SpO2.",
  }, products, INITIAL_WHATSAPP_CATEGORIES);

  assert.deepEqual(assignments, [
    {
      categorySlug: "networking",
      interestedProducts: "Cisco C9300-24T",
      quantityRequirements: "Need 2 C9300-24T switches.",
    },
    {
      categorySlug: "medical-equipment",
      interestedProducts: "CONTEC CMS8000 Patient Monitor",
      quantityRequirements: "Need 1 CMS8000 monitor with SpO2.",
    },
  ]);
});

test("uses conversation evidence and keeps a generic quantity for one matched category", () => {
  const [assignment] = classifyWhatsappInterest({
    interestedProducts: "",
    quantityRequirements: "Need 30 pieces",
    conversationHistory: "2026-09-29T08:00:00.000Z|C|Can you quote Delta MS300?",
  }, products, INITIAL_WHATSAPP_CATEGORIES);

  assert.deepEqual(assignment, {
    categorySlug: "industrial-automation",
    interestedProducts: "Delta VFD MS300",
    quantityRequirements: "Need 30 pieces",
  });
});

test("sends unmatched product requirements to Uncategorized without data loss", () => {
  assert.deepEqual(classifyWhatsappInterest({
    interestedProducts: "Custom kitchen oven",
    quantityRequirements: "One gas unit for a restaurant",
  }, products, INITIAL_WHATSAPP_CATEGORIES), [{
    categorySlug: "uncategorized",
    interestedProducts: "Custom kitchen oven",
    quantityRequirements: "One gas unit for a restaurant",
  }]);
});
