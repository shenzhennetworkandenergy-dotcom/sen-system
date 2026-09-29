import { randomUUID } from "node:crypto";

export const whatsappCrmStatuses = [
  "new",
  "communicating",
  "interested",
  "quotation",
  "waiting_customer",
  "purchase_confirmed",
  "purchased",
  "paused",
  "do_not_contact",
] as const;

export type WhatsappCrmStatus = (typeof whatsappCrmStatuses)[number];
export type WhatsappConversationEntry = { at: string; role: "C" | "S"; text: string };

export const WHATSAPP_CSV_HEADERS = [
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
] as const;

export type WhatsappCustomerRecord = Record<(typeof WHATSAPP_CSV_HEADERS)[number], string> & {
  customer_id: string;
  category_slug: string;
  assigned_to: string;
  status: WhatsappCrmStatus;
};

export type WhatsappCustomerInput = Pick<WhatsappCustomerRecord, "whatsapp_name" | "whatsapp_number" | "conversation_history"> &
  Partial<Omit<WhatsappCustomerRecord, "customer_id" | "whatsapp_name" | "whatsapp_number" | "whatsapp_link" | "conversation_history">>;

const inactiveStatuses = new Set<WhatsappCrmStatus>(["purchase_confirmed", "purchased", "paused", "do_not_contact"]);

export function normalizeWhatsappNumber(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15) throw new Error("Enter a valid WhatsApp number with country code.");
  return digits;
}

export function whatsappLink(value: string) {
  return `https://wa.me/${normalizeWhatsappNumber(value)}`;
}

function encodeConversationPart(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("\r", "\\r").replaceAll("\n", "\\n");
}

function splitConversationLine(line: string) {
  const parts: string[] = [];
  let value = "";
  let escaped = false;
  for (const character of line) {
    if (escaped) {
      value += character === "n" ? "\n" : character === "r" ? "\r" : character === "|" || character === "\\" ? character : `\\${character}`;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|" && parts.length < 2) {
      parts.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  if (escaped) value += "\\";
  parts.push(value);
  return parts;
}

export function parseWhatsappConversation(value: string): WhatsappConversationEntry[] {
  if (!value.trim()) return [];
  return value.split(/\r?\n/).filter(Boolean).map((line) => {
    const [at, role, text, ...extra] = splitConversationLine(line);
    if (extra.length || !at || (role !== "C" && role !== "S") || !text || Number.isNaN(Date.parse(at))) {
      throw new Error("Invalid WhatsApp conversation line.");
    }
    return { at, role, text };
  });
}

export function formatWhatsappConversation(entries: readonly WhatsappConversationEntry[]) {
  return entries.map((entry) => `${encodeConversationPart(entry.at)}|${entry.role}|${encodeConversationPart(entry.text)}`).join("\n");
}

export function calculateWhatsappNextFollowup(lastCommunicationAt: string, status: WhatsappCrmStatus) {
  if (inactiveStatuses.has(status)) return null;
  const last = new Date(lastCommunicationAt);
  if (Number.isNaN(last.getTime())) throw new Error("Invalid last communication date.");
  return new Date(last.getTime() + 3 * 86_400_000).toISOString();
}

export function isWhatsappFollowupAllowed(record: Pick<WhatsappCustomerRecord, "status" | "conversation_history">) {
  return !inactiveStatuses.has(record.status) && !/\[do not contact\]/i.test(record.conversation_history);
}

function latestConversationTime(entries: readonly WhatsappConversationEntry[]) {
  return entries.reduce((latest, entry) => Date.parse(entry.at) > Date.parse(latest) ? entry.at : latest, entries[0]?.at ?? "");
}

export function mergeWhatsappCustomer(existing: WhatsappCustomerRecord | null, input: WhatsappCustomerInput, now = new Date()): WhatsappCustomerRecord {
  const whatsappNumber = normalizeWhatsappNumber(input.whatsapp_number);
  if (existing && normalizeWhatsappNumber(existing.whatsapp_number) !== whatsappNumber) throw new Error("WhatsApp number does not match this customer.");

  const messages = [...parseWhatsappConversation(existing?.conversation_history ?? ""), ...parseWhatsappConversation(input.conversation_history)];
  const uniqueMessages = [...new Map(messages.map((entry) => [`${entry.at}\0${entry.role}\0${entry.text}`, entry])).values()]
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const status = input.status ?? existing?.status ?? "new";
  const lastCommunication = input.last_communication_at || latestConversationTime(uniqueMessages) || existing?.last_communication_at || "";
  const timestamp = now.toISOString();
  const value = (key: keyof WhatsappCustomerInput) => {
    const incoming = String(input[key] ?? "").trim();
    return incoming || String(existing?.[key as keyof WhatsappCustomerRecord] ?? "").trim();
  };
  const draftReply = Object.hasOwn(input, "draft_reply")
    ? String(input.draft_reply ?? "").trim()
    : existing?.draft_reply ?? "";

  return {
    customer_id: existing?.customer_id ?? randomUUID(),
    category_slug: value("category_slug") || "uncategorized",
    assigned_to: value("assigned_to"),
    messenger_profile_link: value("messenger_profile_link"),
    whatsapp_name: value("whatsapp_name"),
    whatsapp_number: whatsappNumber,
    whatsapp_link: whatsappLink(whatsappNumber),
    interested_products: value("interested_products"),
    quantity_requirements: value("quantity_requirements"),
    urgency: value("urgency"),
    status,
    follow_up_report: value("follow_up_report"),
    last_communication_at: lastCommunication,
    next_follow_up_at: lastCommunication ? calculateWhatsappNextFollowup(lastCommunication, status) ?? "" : "",
    conversation_history: formatWhatsappConversation(uniqueMessages),
    draft_reply: draftReply,
    created_at: existing?.created_at ?? (value("created_at") || timestamp),
    updated_at: String(input.updated_at ?? "").trim() || timestamp,
  };
}
