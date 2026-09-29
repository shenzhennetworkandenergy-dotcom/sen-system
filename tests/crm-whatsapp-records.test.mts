import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateWhatsappNextFollowup,
  formatWhatsappConversation,
  isWhatsappFollowupAllowed,
  mergeWhatsappCustomer,
  normalizeWhatsappNumber,
  parseWhatsappConversation,
  WHATSAPP_CSV_HEADERS,
  whatsappLink,
} from "../lib/crm/whatsapp-records.ts";

test("uses the approved category CSV columns without legacy customer fields", () => {
  assert.deepEqual(WHATSAPP_CSV_HEADERS, [
    "messenger_profile_link",
    "whatsapp_name",
    "whatsapp_number",
    "whatsapp_link",
    "interested_products",
    "quantity_requirements",
    "urgency",
    "status",
    "follow_up_report",
    "last_communication_at",
    "next_follow_up_at",
    "conversation_history",
    "draft_reply",
    "created_at",
    "updated_at",
  ]);
  for (const removed of ["customer_id", "budget", "delivery_location", "assigned_to", "company", "country"]) {
    assert.equal(WHATSAPP_CSV_HEADERS.includes(removed as never), false);
  }
});

test("normalizes international WhatsApp numbers without merging invalid input", () => {
  assert.equal(normalizeWhatsappNumber("+880 1712-345678"), "8801712345678");
  assert.equal(normalizeWhatsappNumber("00880 1712 345678"), "8801712345678");
  assert.throws(() => normalizeWhatsappNumber("12345"), /valid WhatsApp number/i);
});

test("preserves chronological customer and SEN text including Unicode pipes and line breaks", () => {
  const entries = [
    { at: "2026-09-28T10:15+06:00", role: "C" as const, text: "Cisco | switch, দরকার\nPoE must work" },
    { at: "2026-09-28T10:18+06:00", role: "S" as const, text: "Which model \\ quantity?" },
  ];
  const encoded = formatWhatsappConversation(entries);

  assert.deepEqual(parseWhatsappConversation(encoded), entries);
  assert.match(encoded, /\\\|/);
  assert.match(encoded, /\\n/);
});

test("merges the same normalized number into one complete customer record", () => {
  const first = mergeWhatsappCustomer(null, {
    messenger_profile_link: "https://business.facebook.com/latest/inbox/all?selected_item_id=1001",
    whatsapp_name: "Customer One",
    whatsapp_number: "+880 1712-345678",
    interested_products: "Cisco switch",
    conversation_history: "2026-09-28T10:15+06:00|C|Need a Cisco switch",
  }, new Date("2026-09-28T05:00:00.000Z"));
  const updated = mergeWhatsappCustomer(first, {
    whatsapp_name: "Customer One",
    whatsapp_number: "8801712345678",
    quantity_requirements: "2 units with PoE",
    conversation_history: [
      "2026-09-28T10:15+06:00|C|Need a Cisco switch",
      "2026-09-28T10:20+06:00|C|Two units with PoE",
    ].join("\n"),
  }, new Date("2026-09-28T06:00:00.000Z"));

  assert.equal(updated.customer_id, first.customer_id);
  assert.equal(updated.whatsapp_number, "8801712345678");
  assert.equal(updated.whatsapp_link, "https://wa.me/8801712345678");
  assert.equal(updated.messenger_profile_link, "https://business.facebook.com/latest/inbox/all?selected_item_id=1001");
  assert.equal(updated.interested_products, "Cisco switch");
  assert.equal(updated.quantity_requirements, "2 units with PoE");
  assert.equal(parseWhatsappConversation(updated.conversation_history).length, 2);
});

test("blank collection fields do not erase category facts while an approved send can clear its draft", () => {
  const first = mergeWhatsappCustomer(null, {
    whatsapp_name: "Customer One",
    whatsapp_number: "+880 1712-345678",
    interested_products: "Existing Server",
    urgency: "Urgent",
    draft_reply: "Review me",
    conversation_history: "2026-09-28T10:15+06:00|C|Need a server",
  }, new Date("2026-09-28T05:00:00.000Z"));
  const updated = mergeWhatsappCustomer(first, {
    whatsapp_name: "Customer One",
    whatsapp_number: "8801712345678",
    interested_products: "",
    urgency: "",
    draft_reply: "",
    conversation_history: "2026-09-28T10:20+06:00|C|Please follow up",
  }, new Date("2026-09-28T06:00:00.000Z"));

  assert.equal(updated.interested_products, "Existing Server");
  assert.equal(updated.urgency, "Urgent");
  assert.equal(updated.draft_reply, "");
});

test("builds WhatsApp chat links only from normalized valid numbers", () => {
  assert.equal(whatsappLink("+880 1712-345678"), "https://wa.me/8801712345678");
  assert.throws(() => whatsappLink("123"), /valid WhatsApp number/i);
});

test("sets the next follow-up exactly three Dhaka calendar days later", () => {
  assert.equal(
    calculateWhatsappNextFollowup("2026-09-28T10:15:00+06:00", "interested"),
    "2026-10-01T04:15:00.000Z",
  );
  assert.equal(calculateWhatsappNextFollowup("2026-09-28T10:15:00+06:00", "purchased"), null);
});

test("suppresses purchased paused do-not-contact and explicit refusal records", () => {
  for (const status of ["purchase_confirmed", "purchased", "paused", "do_not_contact"] as const) {
    assert.equal(isWhatsappFollowupAllowed({ status, conversation_history: "" }), false);
  }
  assert.equal(isWhatsappFollowupAllowed({ status: "interested", conversation_history: "2026-09-28T10:15+06:00|C|[Do not contact]" }), false);
  assert.equal(isWhatsappFollowupAllowed({ status: "interested", conversation_history: "2026-09-28T10:15+06:00|C|Please send price" }), true);
});
