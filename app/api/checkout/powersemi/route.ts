import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPaymentOrigin } from "@/lib/payments/eps-config";
import { checkoutIntentSecret, powerSemiCookieName, powerSemiIntentTtl, powerSemiResumePath, readPowerSemiSelection, sealPowerSemiIntent } from "@/lib/orders/powersemi-checkout";

export async function POST(request: Request) {
  const paymentOrigin = getPaymentOrigin();
  const local = paymentOrigin === "http://127.0.0.1:3035" && process.env.EPS_LIVE_ENABLED !== "true";
  const storefront = local ? "http://127.0.0.1:4310" : "https://powersemi.sen.com.bd";
  if (request.headers.get("origin") !== storefront) return new Response("Checkout origin is not allowed.", { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") {
    return new Response("Invalid checkout request.", { status: 415 });
  }
  const form = await request.formData().catch(() => null);
  const selection = readPowerSemiSelection(form?.get("product"), form?.get("quantity"), form?.get("total"));
  if (!selection) return new Response("Choose a valid product and quantity on PowerSemi.", { status: 400 });

  const id = randomUUID();
  const token = sealPowerSemiIntent({ ...selection, id, expires: Date.now() + powerSemiIntentTtl * 1000 }, checkoutIntentSecret());
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: powerSemiResumePath(id)!, "Cache-Control": "no-store" },
  });
  response.cookies.set(powerSemiCookieName(local), token, {
    httpOnly: true, secure: !local, sameSite: "lax", path: "/", maxAge: powerSemiIntentTtl,
  });
  return response;
}
