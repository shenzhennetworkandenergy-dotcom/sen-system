import {
  isWhatsappFollowupAllowed,
  parseWhatsappConversation,
  type WhatsappCustomerRecord,
} from "./whatsapp-records.ts";
import type { WhatsappProductEvidence } from "./whatsapp-products.ts";

export function detectWhatsappReplyLanguage(history: string): "bn" | "en" | "mixed" {
  const hasBangla = /[\u0980-\u09ff]/.test(history);
  const hasEnglish = /[a-z]/i.test(history);
  return hasBangla && hasEnglish ? "mixed" : hasBangla ? "bn" : "en";
}

function evidenceLine(evidence: WhatsappProductEvidence) {
  const price = evidence.price === null
    ? "price requires staff confirmation"
    : evidence.price_max !== null && evidence.price_max > evidence.price
      ? `${evidence.currency} ${evidence.price.toLocaleString("en-US")}–${evidence.price_max.toLocaleString("en-US")}`
      : `${evidence.currency} ${evidence.price.toLocaleString("en-US")}`;
  return [
    `${evidence.name} (${evidence.sku}${evidence.model ? ` / ${evidence.model}` : ""})`,
    price,
    evidence.availability === "in_stock" ? "listed in stock" : "sourceable; confirm availability",
    evidence.description,
    evidence.public_url,
    evidence.review_warning,
  ].filter(Boolean).join(" | ");
}

export function buildWhatsappDraftBrief(
  record: WhatsappCustomerRecord,
  evidence: readonly WhatsappProductEvidence[],
) {
  const messages = parseWhatsappConversation(record.conversation_history).slice(-12);
  return [
    "Prepare one friendly, concise, professional WhatsApp reply. Do not send it.",
    `Reply language: ${detectWhatsappReplyLanguage(record.conversation_history)}.`,
    `Customer: ${record.whatsapp_name}.`,
    `Product interest: ${record.interested_products || "not yet confirmed"}.`,
    `Quantity: ${record.quantity_requirements || "not yet confirmed"}.`,
    `Status: ${record.status}.`,
    "Use only these verified product facts:",
    ...(evidence.length ? evidence.map(evidenceLine) : ["No verified catalogue match; ask staff to review before stating product facts."]),
    "Recent conversation:",
    ...messages.map((message) => `${message.role === "C" ? "Customer" : "SEN"}: ${message.text}`),
    "Do not repeat questions already answered above. If mentioning price or availability, state that the customer must speak with SEN staff before the order is confirmed.",
  ].join("\n");
}

function displayPrice(evidence: WhatsappProductEvidence) {
  if (evidence.price === null) return null;
  const start = `${evidence.currency} ${evidence.price.toLocaleString("en-US")}`;
  return evidence.price_max !== null && evidence.price_max > evidence.price
    ? `${start}–${evidence.price_max.toLocaleString("en-US")}`
    : start;
}

export function buildWhatsappFallbackDraft(
  record: WhatsappCustomerRecord,
  evidence: readonly WhatsappProductEvidence[],
) {
  if (!isWhatsappFollowupAllowed(record)) return null;
  const item = evidence[0];
  const language = detectWhatsappReplyLanguage(record.conversation_history);
  if (language === "bn") {
    const productText = item ? `${item.name}${displayPrice(item) ? `-এর বর্তমান তালিকাভুক্ত মূল্য ${displayPrice(item)}` : "-এর মূল্য আমাদের টিম নিশ্চিত করবে"}` : "আপনার প্রয়োজনীয় পণ্যের তথ্য আমাদের টিম যাচাই করবে";
    return `আসসালামু আলাইকুম ${record.whatsapp_name}, ধন্যবাদ। ${productText}। চূড়ান্ত মূল্য, স্টক ও অর্ডার নিশ্চিত করার আগে অনুগ্রহ করে SEN টিমের সঙ্গে যোগাযোগ করুন।`;
  }
  const greeting = language === "mixed" ? `Assalamu Alaikum ${record.whatsapp_name}, ধন্যবাদ।` : `Hello ${record.whatsapp_name}, thank you for your interest.`;
  const productText = item
    ? `${item.name}${displayPrice(item) ? ` is currently listed at ${displayPrice(item)}` : " pricing needs staff confirmation"}${item.availability === "in_stock" ? " and is shown in stock" : " and may be sourceable"}.`
    : "Our team needs to review the requested product details.";
  return `${greeting} ${productText} Please speak with our SEN staff to confirm the final price, availability, and order before confirming your purchase.`;
}
