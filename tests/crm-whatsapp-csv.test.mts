import assert from "node:assert/strict";
import test from "node:test";

import {
  parseWhatsappCustomerCsv,
  serializeWhatsappCustomerCsv,
} from "../lib/crm/whatsapp-csv.ts";
import { formatWhatsappConversation, mergeWhatsappCustomer } from "../lib/crm/whatsapp-records.ts";

const input = (number: string, message = "Need Cisco switch") => ({
  whatsapp_name: `Customer ${number.slice(-2)}`,
  whatsapp_number: number,
  conversation_history: `2026-09-28T10:15+06:00|C|${message}`,
});

test("round trips RFC 4180 commas quotes Unicode pipes and multiline history", () => {
  const record = mergeWhatsappCustomer(null, {
    messenger_profile_link: "https://business.facebook.com/latest/inbox/all?selected_item_id=1001",
    ...input("8801712345678"),
    conversation_history: formatWhatsappConversation([
      { at: "2026-09-28T10:15+06:00", role: "C", text: "Need \"Cisco, PoE\" | বাংলা\nsecond line" },
    ]),
  }, new Date("2026-09-28T04:00:00Z"));
  const decoded = parseWhatsappCustomerCsv(serializeWhatsappCustomerCsv([record]), "networking");

  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].messenger_profile_link, record.messenger_profile_link);
  assert.equal(decoded[0].whatsapp_link, "https://wa.me/8801712345678");
  assert.equal(decoded[0].conversation_history, record.conversation_history);
  assert.equal(decoded[0].category_slug, "networking");
});

test("allows one WhatsApp number in different category files but rejects it twice in one file", () => {
  const record = mergeWhatsappCustomer(null, {
    ...input("8801712345678"),
    interested_products: "Cisco C9300",
    category_slug: "networking",
  });
  const csv = serializeWhatsappCustomerCsv([record]);
  assert.equal(parseWhatsappCustomerCsv(csv, "networking")[0].whatsapp_number, "8801712345678");
  assert.equal(parseWhatsappCustomerCsv(csv, "medical-equipment")[0].whatsapp_number, "8801712345678");
  const duplicated = `${csv}${csv.split(/\r?\n/)[1]}\r\n`;
  assert.throws(() => parseWhatsappCustomerCsv(duplicated, "networking"), /duplicate WhatsApp number/i);
});

test("retains different customers that share a display name", () => {
  const first = mergeWhatsappCustomer(null, input("8801712345678"));
  const second = mergeWhatsappCustomer(null, { ...input("8801812345678"), whatsapp_name: first.whatsapp_name });
  const rows = parseWhatsappCustomerCsv(serializeWhatsappCustomerCsv([first, second]), "networking");
  assert.deepEqual(rows.map((row) => row.whatsapp_number), ["8801712345678", "8801812345678"]);
});

test("rejects malformed headers", () => {
  assert.throws(() => parseWhatsappCustomerCsv("wrong,headers\r\n1,2\r\n"), /CSV header/i);
});
