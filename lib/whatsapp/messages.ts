export const COMPANY_WHATSAPP_PERMISSION = "crm.send_whatsapp";

export type WhatsappInboxMessage = {
  message_id: string;
  sender: string;
  received_at: string;
  body: string;
};

export function isWhatsappReplyWindowOpen(receivedAt: string, now = Date.now()) {
  const elapsed = now - Date.parse(receivedAt);
  return elapsed >= 0 && elapsed < 24 * 60 * 60 * 1000;
}

export function canSendCompanyWhatsapp(profile: { role: string; status: string; archived_at?: string | null } | null, permissions: ReadonlySet<string> = new Set()) {
  return Boolean(profile && profile.status === "active" && !profile.archived_at && (profile.role === "admin" || (profile.role === "employee" && permissions.has(COMPANY_WHATSAPP_PERMISSION))));
}

export type WhatsappTemplate = {
  name: string;
  language: string;
  body: string;
  parameterCount: number;
};

export type WhatsappMessage = { to: string } & (
  | { kind: "text"; text: string }
  | { kind: "template"; name: string; language: string; parameters: string[] }
);

export function normalizeRecipient(value: string) {
  const text = value.trim().replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)));
  if (!/^\+?[\d\s()-]+$/.test(text)) throw new Error("Enter a valid WhatsApp number with country code.");
  let digits = text.replace(/\D/g, "");
  const international = text.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!international && /^01[3-9]\d{8}$/.test(digits)) digits = `88${digits}`;
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw new Error("Enter a valid WhatsApp number with country code.");
  return digits;
}

export function matchesCustomerPhone(recipient: string, phone: string | null) {
  if (!phone) return false;
  try { return normalizeRecipient(phone) === recipient; } catch { return false; }
}

export function parseMessage(value: unknown): { requestId: string; message: WhatsappMessage } {
  if (!value || typeof value !== "object") throw new Error("Enter a recipient and message.");
  const data = value as Record<string, unknown>;
  if (typeof data.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.requestId)) throw new Error("Reopen WhatsApp and try again.");
  const to = normalizeRecipient(typeof data.to === "string" ? data.to : "");
  if (data.kind === "text") {
    if (typeof data.text !== "string" || !data.text.trim() || data.text.length > 4096) throw new Error("Enter a message of up to 4,096 characters.");
    return { requestId: data.requestId, message: { to, kind: "text", text: data.text.trim() } };
  }
  if (data.kind !== "template" || typeof data.name !== "string" || !/^[a-z0-9_]{1,512}$/.test(data.name)
    || typeof data.language !== "string" || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(data.language)
    || !Array.isArray(data.parameters) || data.parameters.length > 20
    || !data.parameters.every((item) => typeof item === "string" && item.trim() && item.length <= 1024)) {
    throw new Error("Choose an approved template and complete its fields.");
  }
  return { requestId: data.requestId, message: { to, kind: "template", name: data.name, language: data.language, parameters: data.parameters.map((item: string) => item.trim()) } };
}

// Only plain text templates are supported here; media and dynamic buttons need their own composer.
export function supportedTemplates(value: unknown): WhatsappTemplate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || item.status !== "APPROVED" || typeof item.name !== "string" || typeof item.language !== "string" || !Array.isArray(item.components)) return [];
    if (item.components.some((part: { type?: string; format?: string; text?: string }) => !["BODY", "HEADER", "FOOTER"].includes(part.type ?? "")
      || (part.type === "HEADER" && part.format !== "TEXT")
      || (part.type !== "BODY" && String(part.text ?? "").includes("{{")))) return [];
    const body = item.components.find((part: { type?: string }) => part.type === "BODY")?.text;
    if (typeof body !== "string" || body.length > 4096) return [];
    const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
    if (body.replace(/\{\{\d+\}\}/g, "").includes("{{")) return [];
    const unique = [...new Set<number>(matches)].sort((a, b) => a - b);
    if (unique.length > 20 || unique.some((number, index) => number !== index + 1)) return [];
    return [{ name: item.name, language: item.language, body, parameterCount: unique.length }];
  });
}

export function templatePreview(template: WhatsappTemplate, parameters: string[]) {
  return template.body.replace(/\{\{(\d+)\}\}/g, (placeholder, position) => parameters[Number(position) - 1] || placeholder);
}
