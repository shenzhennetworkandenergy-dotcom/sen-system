import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { money } from "@/lib/orders/types";

export async function OrderOnlinePayment({
  orderId,
  customerId,
  total,
  paid,
}: {
  orderId: string;
  customerId: string;
  total: number | string;
  paid: number | string;
}) {
  const { data } = await createSupabaseAdminClient()
    .from("eps_checkout_requests")
    .select("order_id,requested_change,discarded_at")
    .eq("order_id", orderId)
    .eq("profile_id", customerId)
    .maybeSingle();
  if (!data) return null;
  const due = Math.max(0, Number(total) - Number(paid));
  const closed = Boolean(data.discarded_at) && due > 0;
  return (
    <section className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-[var(--surface)] p-5">
      <div>
        <h2 className="text-lg font-bold">{closed ? "Checkout closed" : data.requested_change && due > 0 ? "Checkout request" : "Online payment"}</h2>
        {!closed ? (
          <p className="mt-1 text-sm text-[var(--muted-text)]">
            {due <= 0 ? "Payment confirmed" : data.requested_change ? "EPS payment review pending" : `Outstanding: ${money(due)}`}
          </p>
        ) : null}
      </div>
      <Link
        href={`/account/orders/${orderId}/pay`}
        className="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]"
      >
        {closed ? "View checkout history" : due <= 0 ? "Payment receipt" : data.requested_change ? "View request" : "Payment & status"}
      </Link>
    </section>
  );
}
