import "server-only";

import crypto from "node:crypto";

const MAX_BODY_BYTES = 16_384;
const rateState = globalThis as typeof globalThis & {
  __senChatbotRates?: Map<string, number[]>;
};

function rateMap() {
  rateState.__senChatbotRates ??= new Map();
  return rateState.__senChatbotRates;
}

export function safeJsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function verifySameOrigin(request: Request, requireOrigin = false) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;
  if (!origin) return !requireOrigin;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function readSmallJson(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new Error("body_too_large");
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new Error("body_too_large");
  return JSON.parse(text) as unknown;
}

export function clientIpHash(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const direct = request.headers.get("x-real-ip")?.trim();
  const value = forwarded || direct || "unknown";
  const salt = process.env.CHATBOT_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "sen-chatbot";
  return crypto.createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

export function hashUpdateToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createUpdateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function rateLimit(keys: string[], limit: number, windowMs: number) {
  const now = Date.now();
  const rates = rateMap();
  for (const key of keys) {
    const recent = (rates.get(key) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) return false;
  }
  for (const key of keys) {
    const recent = (rates.get(key) ?? []).filter((time) => now - time < windowMs);
    recent.push(now);
    rates.set(key, recent);
  }
  if (rates.size > 5_000) {
    for (const [key, values] of rates) {
      if (!values.some((time) => now - time < windowMs)) rates.delete(key);
    }
  }
  return true;
}

export function uuid(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

export function validPhone(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 32 || !/^\+?[0-9\s()\-]+$/.test(text)) return null;
  const digits = text.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `${text.startsWith("+") ? "+" : ""}${digits}`;
}
