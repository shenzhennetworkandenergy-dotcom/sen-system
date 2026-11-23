import { NextRequest } from "next/server";
import { decryptEpsIpn } from "@/lib/payments/eps";
import { epsIpnSecret } from "@/lib/payments/eps-config";
import { reconcileEpsAttempt } from "@/lib/payments/eps-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > 25000)
    return Response.json({ status: "ERROR" }, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ status: "ERROR" }, { status: 400 });
  let bytes = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 25000) {
        await reader.cancel();
        return Response.json({ status: "ERROR" }, { status: 413 });
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    return Response.json({ status: "ERROR" }, { status: 400 });
  }
  let data: unknown;
  try {
    data = (JSON.parse(text) as { Data?: unknown }).Data;
  } catch {
    return Response.json({ status: "ERROR" }, { status: 400 });
  }
  let configured = false;
  for (const testMode of [false, true]) {
    const key = epsIpnSecret(testMode);
    if (!key) continue;
    configured = true;
    try {
      const notice = decryptEpsIpn(data, key);
      const { data: attempt } = await createSupabaseAdminClient()
        .from("eps_payment_attempts")
        .select("id")
        .eq("merchant_transaction_id", notice.merchantTransactionId)
        .eq("test_mode", testMode)
        .maybeSingle();
      if (attempt) await reconcileEpsAttempt(attempt.id);
      return Response.json(
        { status: "OK" },
        { headers: { "cache-control": "no-store" } },
      );
    } catch {
      /* A second configured mode may use a different key. */
    }
  }
  return Response.json({ status: "ERROR" }, { status: configured ? 400 : 503 });
}
