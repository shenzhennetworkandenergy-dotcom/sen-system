import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { reconcileEpsAttempt } from "@/lib/payments/eps-server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const secret = process.env.EPS_RECONCILIATION_SECRET ?? "",
    incoming = request.headers.get("authorization") ?? "",
    expected = `Bearer ${secret}`;
  if (
    secret.length < 32 ||
    Buffer.byteLength(incoming) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(incoming), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("eps_payment_attempts")
    .select("id")
    .in("status", ["initializing", "ready", "unknown", "pending"])
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(10);
  if (error) return Response.json({ error: "Unavailable" }, { status: 503 });
  let checked = 0;
  for (let i = 0; i < (data ?? []).length; i += 2) {
    const batch = data!.slice(i, i + 2);
    await Promise.all(batch.map((a) => reconcileEpsAttempt(a.id)));
    checked += batch.length;
  }
  if (process.env.EPS_RECEIVING_ADMIN_ID) {
    const { error: expiryError } = await db.rpc("expire_eps_unpaid_orders", {
      requested_admin_id: process.env.EPS_RECEIVING_ADMIN_ID,
    });
    if (expiryError) return Response.json({ error: "Checkout recovery unavailable", checked }, { status: 503 });
  }
  return Response.json(
    { checked },
    { headers: { "cache-control": "no-store" } },
  );
}
