import { createHmac, timingSafeEqual } from "node:crypto";
import { readEpsProductSelection } from "./eps-product-checkout";

export const powerSemiCheckoutPath = "/checkout/powersemi";
export const powerSemiIntentTtl = 15 * 60;
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export function readPowerSemiSelection(slug: unknown, qty: unknown, total: unknown) {
  const selection = readEpsProductSelection(qty, null);
  if (typeof slug !== "string" || !/^[a-z0-9_-]{1,240}$/i.test(slug) ||
      !selection || typeof total !== "string" || !/^(0|[1-9][0-9]{0,11})\.[0-9]{2}$/.test(total) ||
      total === "0.00") return null;
  return { slug, quantity: selection.quantity, total };
}

type Intent = NonNullable<ReturnType<typeof readPowerSemiSelection>> & { id: string; expires: number };

export function sealPowerSemiIntent(intent: Intent, secret: string) {
  const body = Buffer.from(JSON.stringify(intent)).toString("base64url");
  const signature = createHmac("sha256", secret).update("powersemi-checkout:").update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function openPowerSemiIntent(token: string | undefined, id: unknown, secret: string, now = Date.now()): Intent | null {
  if (!token || token.length > 1024 || typeof id !== "string" || !uuidPattern.test(id)) return null;
  const match = /^([\w-]+)\.([\w-]{43})$/.exec(token);
  if (!match) return null;
  const [, body, signature] = match;
  const expected = createHmac("sha256", secret).update("powersemi-checkout:").update(body).digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const intent = JSON.parse(Buffer.from(body, "base64url").toString());
    const selection = readPowerSemiSelection(intent.slug, String(intent.quantity), intent.total);
    if (!selection || intent.id !== id || !Number.isSafeInteger(intent.expires) || intent.expires <= now) return null;
    return { ...selection, id, expires: intent.expires };
  } catch {
    return null;
  }
}

export function powerSemiResumePath(id: unknown) {
  return typeof id === "string" && uuidPattern.test(id) ? `${powerSemiCheckoutPath}?request=${id}` : null;
}

export function powerSemiCookieName(local: boolean) {
  return local ? "sen-powersemi-intent" : "__Host-sen-powersemi-intent";
}

export function checkoutIntentSecret() {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Checkout is not configured.");
  return secret;
}
