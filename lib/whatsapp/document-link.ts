import { createHmac, timingSafeEqual } from "node:crypto";

const lifetimeSeconds = 7 * 24 * 60 * 60;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export type WhatsappDocument = { kind: "quotation" | "invoice"; id: string };
type DocumentLink = WhatsappDocument & { customerId: string; expiresAt: number };

export function readDocumentReference(value: unknown): WhatsappDocument | null {
  if (!value || typeof value !== "object") return null;
  const { kind, id } = value as Record<string, unknown>;
  return (kind === "quotation" || kind === "invoice") && typeof id === "string" && uuid.test(id)
    ? { kind, id } : null;
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update("sen-whatsapp-document-v1:" + payload).digest();
}

export function createWhatsappDocumentToken(document: WhatsappDocument, customerId: string, secret: string, now = Date.now()) {
  const data: DocumentLink = { ...document, customerId, expiresAt: Math.floor(now / 1000) + lifetimeSeconds };
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return payload + "." + signature(payload, secret).toString("base64url");
}

export function verifyWhatsappDocumentToken(token: string, secret: string, now = Date.now()): DocumentLink | null {
  if (!/^[\w-]{1,350}\.[\w-]{43}$/.test(token)) return null;
  const [payload, proof] = token.split(".");
  const supplied = Buffer.from(proof, "base64url");
  const expected = signature(payload, secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const document = readDocumentReference(data);
    if (!document || typeof data.customerId !== "string" || !uuid.test(data.customerId)
      || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Math.floor(now / 1000)) return null;
    return { ...document, customerId: data.customerId, expiresAt: data.expiresAt };
  } catch { return null; }
}
