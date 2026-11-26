import "server-only";
import path from "node:path";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import type { Profile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createCloudClient, type CloudConfig } from "./cloud";
import { whatsappDirectoryForActor } from "./directory";
import { canSendCompanyWhatsapp, isWhatsappReplyWindowOpen, normalizeRecipient } from "./messages";

export async function hasCompanyWhatsappAccess(profile: Profile | null) {
  if (!profile || profile.status !== "active" || profile.archived_at) return false;
  if (profile.role === "admin") return true;
  if (profile.role !== "employee") return false;
  try { return canSendCompanyWhatsapp(profile, await getEffectivePermissions(profile.id)); } catch { return false; }
}

export async function isCompanyWhatsappRecipientAllowed(profile: Profile, recipient: string, phoneId: string) {
  if (profile.role === "admin") return true;
  if (profile.role !== "employee" || profile.status !== "active") return false;
  const [contact] = await whatsappDirectoryForActor(profile, phoneId, { recipient });
  return Boolean(contact?.customer_profile_id);
}

export function whatsappConnectionConfiguration(): CloudConfig | null {
  if (process.env.WHATSAPP_ENABLED !== "true") return null;
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim();
  const accountId = process.env.WHATSAPP_ACCOUNT_ID?.trim();
  if (!token || !phoneId || !/^\d+$/.test(phoneId) || !version || !/^v\d+\.\d+$/.test(version)
    || (accountId && !/^\d+$/.test(accountId))) return null;
  let businessNumber: string;
  try { businessNumber = normalizeRecipient(process.env.WHATSAPP_BUSINESS_NUMBER ?? ""); } catch { return null; }
  return { token, phoneId, version, accountId, businessNumber };
}

export function whatsappOutboxDirectory(): string | null {
  if (process.env.WHATSAPP_SEND_ENABLED !== "true") return null;
  const outbox = process.env.WHATSAPP_OUTBOX_DIR?.trim();
  return outbox && path.isAbsolute(outbox) ? outbox : null;
}

export function whatsappReplyOnly() {
  return process.env.WHATSAPP_SEND_MODE !== "full";
}

export async function hasOpenWhatsappReplyWindow(phoneId: string, recipient: string) {
  const { data, error } = await createSupabaseAdminClient().from("company_whatsapp_inbox")
    .select("received_at").eq("phone_number_id", phoneId).eq("sender", recipient)
    .lte("received_at", new Date().toISOString())
    .order("received_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("The WhatsApp reply window could not be checked.");
  return Boolean(data && isWhatsappReplyWindowOpen(data.received_at));
}

export { createCloudClient };

export async function readWhatsappJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new Error("Use a JSON message.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Enter a message.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) {
        await reader.cancel();
        throw new Error("The message is too long.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export function whatsappInboxConfiguration() {
  if (process.env.WHATSAPP_WEBHOOK_ENABLED !== "true") return null;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accountId = process.env.WHATSAPP_ACCOUNT_ID?.trim();
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!phoneId || !/^\d+$/.test(phoneId) || !accountId || !/^\d+$/.test(accountId) || !appSecret || !verifyToken) return null;
  return { appSecret, verifyToken, phoneId, accountId };
}
