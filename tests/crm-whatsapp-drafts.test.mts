import assert from "node:assert/strict";
import test from "node:test";

import { mergeWhatsappCustomer } from "../lib/crm/whatsapp-records.ts";
import {
  buildWhatsappDraftBrief,
  buildWhatsappFallbackDraft,
  detectWhatsappReplyLanguage,
} from "../lib/crm/whatsapp-drafts.ts";
import { mapWhatsappProductEvidence } from "../lib/crm/whatsapp-products.ts";

const record = mergeWhatsappCustomer(null, {
  whatsapp_name: "Rahim",
  whatsapp_number: "+880 1712-345678",
  interested_products: "Cisco C9200 switch",
  quantity_requirements: "2 units",
  status: "interested",
  conversation_history: [
    "2026-09-28T10:15+06:00|C|Cisco C9200 switch দুইটা দরকার",
    "2026-09-28T10:17+06:00|S|Delivery location please?",
    "2026-09-28T10:18+06:00|C|Dhaka",
  ].join("\n"),
}, new Date("2026-09-28T05:00:00.000Z"));

const product = {
  id: "product-1",
  variationId: null,
  name: "Cisco Catalyst C9200",
  slug: "cisco-catalyst-c9200",
  sku: "C9200-24P",
  modelNumber: "C9200-24P",
  shortDescription: "Managed 24-port PoE network switch.",
  productType: "simple",
  price: 125000,
  priceMax: 125000,
  currency: "BDT",
  available: true,
  availability: "in_stock" as const,
  variationLabel: null,
  attributes: {},
};

test("maps catalogue matches to internal price stock and public product URL evidence", () => {
  const evidence = mapWhatsappProductEvidence(product);
  assert.deepEqual({
    name: evidence.name,
    sku: evidence.sku,
    model: evidence.model,
    price: evidence.price,
    price_max: evidence.price_max,
    currency: evidence.currency,
    availability: evidence.availability,
    public_url: evidence.public_url,
  }, {
    name: "Cisco Catalyst C9200",
    sku: "C9200-24P",
    model: "C9200-24P",
    price: 125000,
    price_max: 125000,
    currency: "BDT",
    availability: "in_stock",
    public_url: "/products/cisco-catalyst-c9200",
  });
});

test("labels missing or conflicting product facts for staff review instead of inventing them", () => {
  const evidence = mapWhatsappProductEvidence({ ...product, price: null, priceMax: null, shortDescription: null, available: false, availability: "sourceable" });
  assert.equal(evidence.price, null);
  assert.equal(evidence.description, null);
  assert.match(evidence.review_warning ?? "", /confirm.*price.*description/i);
});

test("detects Bangla English and mixed conversation language", () => {
  assert.equal(detectWhatsappReplyLanguage("Need a switch and price"), "en");
  assert.equal(detectWhatsappReplyLanguage("একটি সুইচের দাম জানতে চাই"), "bn");
  assert.equal(detectWhatsappReplyLanguage("Cisco switch দুইটা দরকার"), "mixed");
});

test("uses prior conversation facts and does not repeat answered questions", () => {
  const evidence = [mapWhatsappProductEvidence(product)];
  const brief = buildWhatsappDraftBrief(record, evidence);
  const draft = buildWhatsappFallbackDraft(record, evidence) ?? "";
  assert.match(brief, /2 units/);
  assert.match(brief, /Dhaka/);
  assert.doesNotMatch(brief, /Budget:|Delivery:/);
  assert.doesNotMatch(draft, /where.*delivery|how many|quantity\?/i);
});

test("includes the staff-confirmation warning when quoting price or availability", () => {
  const draft = buildWhatsappFallbackDraft(record, [mapWhatsappProductEvidence(product)]) ?? "";
  assert.match(draft, /BDT 125,000/);
  assert.match(draft, /speak with|talk to|যোগাযোগ/i);
  assert.match(draft, /confirm/i);
});

test("returns no draft for purchased paused do-not-contact or refusal records", () => {
  for (const status of ["purchased", "paused", "do_not_contact"] as const) {
    assert.equal(buildWhatsappFallbackDraft({ ...record, status }, [mapWhatsappProductEvidence(product)]), null);
  }
  assert.equal(buildWhatsappFallbackDraft({ ...record, conversation_history: `${record.conversation_history}\n2026-09-28T10:20+06:00|C|[Do not contact]` }, [mapWhatsappProductEvidence(product)]), null);
});
