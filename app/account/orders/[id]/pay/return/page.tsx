import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { profile } = await requireProfile(["customer", "admin"]);
  const { id } = await params;
  const db = createSupabaseAdminClient();
  const { data: order } = await db
    .from("sales_orders")
    .select("id,order_number,payment_status")
    .eq("id", id)
    .eq("customer_profile_id", profile.id)
    .maybeSingle();
  if (!order) notFound();
  const { data: transaction } = await db
    .from("payment_transactions")
    .select("status,created_at,payment_gateways(name)")
    .eq("order_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <DashboardShell
      title={`Payment for ${order.order_number}`}
      subtitle="SEN verifies provider callbacks on the server before marking an order paid."
    >
      <section className="max-w-2xl rounded-2xl border bg-[var(--surface)] p-6">
        <h2 className="text-xl font-bold">Payment received for verification</h2>
        <p className="mt-3 text-[var(--muted-text)]">
          Current status:{" "}
          <b>{transaction?.status ?? order.payment_status ?? "pending"}</b>.
          Do not pay again while a transaction is processing.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/account/orders/${id}`}
            className="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]"
          >
            Return to order
          </Link>
          <Link
            href="/account/orders"
            className="rounded-xl border px-5 py-3 font-bold"
          >
            My orders
          </Link>
        </div>
      </section>
    </DashboardShell>
  );
}
