import { createHash } from "node:crypto";

import {
  normalizeWhatsappNumber,
  whatsappLink,
  WHATSAPP_CSV_HEADERS,
  whatsappCrmStatuses,
  type WhatsappCustomerRecord,
  type WhatsappCrmStatus,
} from "./whatsapp-records.ts";

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("Malformed quoted CSV field.");
  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function csvField(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function fallbackCustomerId(categorySlug: string, whatsappNumber: string) {
  const hex = createHash("sha256").update(`${categorySlug}\0${whatsappNumber}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function parseWhatsappCustomerCsv(text: string, categorySlug = "uncategorized"): WhatsappCustomerRecord[] {
  if (!text.trim()) return [];
  const [header, ...rows] = parseCsvRows(text);
  if (header.length !== WHATSAPP_CSV_HEADERS.length || header.some((value, index) => value !== WHATSAPP_CSV_HEADERS[index])) {
    throw new Error("Invalid WhatsApp CRM CSV header.");
  }
  const seen = new Set<string>();
  return rows.map((row) => {
    if (row.length !== WHATSAPP_CSV_HEADERS.length) throw new Error("Invalid WhatsApp CRM CSV row.");
    const record = Object.fromEntries(WHATSAPP_CSV_HEADERS.map((key, index) => [key, row[index]])) as WhatsappCustomerRecord;
    record.whatsapp_number = normalizeWhatsappNumber(record.whatsapp_number);
    record.whatsapp_link = whatsappLink(record.whatsapp_number);
    record.category_slug = categorySlug;
    record.customer_id = fallbackCustomerId(categorySlug, record.whatsapp_number);
    record.assigned_to = "";
    if (seen.has(record.whatsapp_number)) throw new Error("Duplicate WhatsApp number in CSV.");
    seen.add(record.whatsapp_number);
    if (!whatsappCrmStatuses.includes(record.status as WhatsappCrmStatus)) throw new Error("Invalid WhatsApp CRM status.");
    return record;
  });
}

export function serializeWhatsappCustomerCsv(records: readonly WhatsappCustomerRecord[]) {
  const rows = [WHATSAPP_CSV_HEADERS.join(",")];
  for (const record of records) rows.push(WHATSAPP_CSV_HEADERS.map((key) => csvField(record[key])).join(","));
  return `${rows.join("\r\n")}\r\n`;
}
