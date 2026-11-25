import { createHmac, timingSafeEqual } from "node:crypto";
import type { WhatsappInboxMessage } from "./messages.ts";

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function whatsappWebhookChallenge(url: URL, verifyToken: string) {
  const { searchParams } = url;
  const token = Buffer.from(searchParams.get("hub.verify_token") ?? "");
  const expected = Buffer.from(verifyToken);
  if (searchParams.get("hub.mode") !== "subscribe" || !token.length
    || token.length !== expected.length || !timingSafeEqual(token, expected)) return null;
  const challenge = searchParams.get("hub.challenge");
  return challenge && /^\d{1,32}$/.test(challenge) ? challenge : null;
}

export function isWhatsappWebhookSigned(body: Uint8Array, signature: string, appSecret: string) {
  if (!/^sha256=[0-9a-f]{64}$/i.test(signature) || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(body).digest();
  return timingSafeEqual(Buffer.from(signature.slice(7), "hex"), expected);
}

export function whatsappInboxMessages(payload: unknown, accountId: string, phoneId: string) {
  const root = record(payload);
  if (root?.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return [];
  const messages: WhatsappInboxMessage[] = [];
  for (const item of root.entry as unknown[]) {
    const entry = record(item);
    if (entry?.id !== accountId || !Array.isArray(entry.changes)) continue;
    for (const event of entry.changes as unknown[]) {
      const change = record(event);
      const value = record(change?.value);
      if (change?.field !== "messages" || record(value?.metadata)?.phone_number_id !== phoneId
        || !Array.isArray(value?.messages)) continue;
      for (const item of value.messages as unknown[]) {
        const message = record(item);
        if (message?.type !== "text") continue;
        const { id, from, timestamp } = message;
        const body = record(message.text)?.body;
        if (typeof id !== "string" || !/^wamid\.[A-Za-z0-9_+/=.-]{1,250}$/.test(id)
          || typeof from !== "string" || !/^[1-9]\d{7,14}$/.test(from)
          || typeof timestamp !== "string" || !/^\d{1,12}$/.test(timestamp)
          || typeof body !== "string" || !body.trim() || body.length > 4096 || body.includes("\0")) continue;
        const time = Number(timestamp);
        if (time <= 0 || time > 253_402_300_799) continue;
        messages.push({ message_id: id, sender: from, received_at: new Date(time * 1000).toISOString(), body });
      }
    }
  }
  return messages;
}
