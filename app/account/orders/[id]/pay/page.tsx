import Link from "next/link";
import { connection } from "next/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CustomerPaymentShell } from "@/components/payments/CustomerPaymentShell";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  availableEpsGateway,
  getOrderEpsAttempts,
} from "@/lib/payments/eps-server";
import { money, dateTime } from "@/lib/orders/types";
import { getPaymentOrigin } from "@/lib/payments/eps-config";
import { beginPaymentAction, checkEpsPaymentAction } from "./actions";

export const dynamic = "force-dynamic";
export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { profile } = await requireProfile(["customer", "admin"]);
  const { id } = await params,
    notice = await searchParams,
    db = createSupabaseAdminClient();
  const [
    { data: order },
    eps,
    attempts,
    { data: onlineOrder },
    { data: gateways },
  ] = await Promise.all([
    db
      .from("sales_orders")
      .select(
        "id,order_number,total_amount,paid_amount,currency,status,payment_status",
      )
      .eq("id", id)
      .eq("customer_profile_id", profile.id)
      .maybeSingle(),
    availableEpsGateway(),
    getOrderEpsAttempts(id, profile.id),
    db
      .from("eps_checkout_requests")
      .select("order_id")
      .eq("order_id", id)
      .eq("profile_id", profile.id)
      .maybeSingle(),
    db
      .from("payment_gateways")
      .select("id,name,adapter,public_config")
      .eq("enabled", true)
      .neq("adapter", "eps")
      .order("display_order"),
  ]);
  if (!order) notFound();
  let legacyOrigin = "";
  if (!onlineOrder) {
    try {
      legacyOrigin = getPaymentOrigin();
    } catch {
      const h = await headers();
      legacyOrigin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
    }
  }
  const due = Math.max(
    0,
    Number(order.total_amount) - Number(order.paid_amount ?? 0),
  );
  const latest = attempts[0];
  const resumable = Boolean(
    latest &&
    ["ready", "pending"].includes(latest.status) &&
    latest.checkout_url,
  );
  const unresolved = Boolean(
    latest && ["initializing", "unknown", "pending"].includes(latest.status),
  );
  const blocked = Boolean(
    latest &&
    (["initializing", "unknown", "review_required"].includes(latest.status) ||
      (latest.status === "pending" && !resumable)),
  );
  const sandboxPaid = attempts.some((a) => a.status === "sandbox_paid");
  const hasEpsReceipt = attempts.some((a) =>
    ["paid", "sandbox_paid"].includes(a.status),
  );
  const paid = due <= 0;
  return (
    <CustomerPaymentShell
      title={`Payment · ${order.order_number}`}
      subtitle="Secure checkout and payment confirmation for your order."
    >
      <Link
        href={`/account/orders/${id}`}
        className="font-bold text-[var(--primary)]"
      >
        ← Back to order
      </Link>
      {notice.error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-950"
        >
          {notice.error}
        </p>
      ) : null}
      <section className="mt-5 max-w-3xl rounded-2xl border bg-[var(--surface)] p-5 sm:p-7">
        <p className="text-sm text-[var(--muted-text)]">
          {paid ? "Amount paid" : "Outstanding amount"}
        </p>
        <p className="mt-1 text-3xl font-bold">
          {money(paid ? order.paid_amount : due, order.currency)}
        </p>
        <div
          className={`mt-5 rounded-xl border p-4 ${paid ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "bg-[var(--muted-surface)]"}`}
        >
          <h2 className="font-bold">
            {paid
              ? "Payment confirmed"
              : sandboxPaid
                ? "Sandbox payment completed"
                : latest?.status === "review_required"
                  ? "Payment requires SEN review"
                  : order.status === "cancelled"
                    ? "Order cancelled"
                    : unresolved
                      ? "Payment awaiting confirmation"
                      : "Ready for payment"}
          </h2>
          <p className="mt-2 text-sm">
            {paid
              ? "Your payment has been verified. Follow delivery progress from your order."
              : sandboxPaid
                ? "The test payment succeeded. No real money was collected and the order has not been marked paid."
                : latest?.status === "review_required"
                  ? "Please contact SEN with your order number. Do not make another payment."
                  : order.status === "cancelled"
                    ? "Do not pay for this order. If you already attempted payment, check its status or contact SEN."
                    : resumable
                      ? "If you left EPS before finishing, continue the same payment below. Check the status before paying again."
                      : blocked
                        ? "Do not pay again while this transaction is being checked. Use Check payment status below."
                        : onlineOrder
                          ? "Complete payment on EPS. Your card and wallet details are entered on the payment provider's secure page."
                          : "Choose an available payment method for this order."}
          </p>
        </div>
        {!paid &&
        eps &&
        onlineOrder &&
        !sandboxPaid &&
        order.status !== "cancelled" ? (
          <form action={beginPaymentAction.bind(null, id)} className="mt-5">
            <input type="hidden" name="gateway_id" value={eps.id} />
            <button
              disabled={blocked}
              className="w-full rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)] disabled:opacity-40"
            >
              {resumable
                ? "Continue existing EPS payment"
                : "Pay securely with EPS"}
              {eps.test_mode ? " · Sandbox" : ""}
            </button>
          </form>
        ) : null}
        {attempts.length && !paid && !sandboxPaid ? (
          <form action={checkEpsPaymentAction.bind(null, id)} className="mt-3">
            <button className="w-full rounded-xl border px-5 py-3 font-bold">
              Check payment status
            </button>
          </form>
        ) : null}
        {!onlineOrder && !paid && order.status !== "cancelled" ? (
          <div className="mt-5 grid gap-3">
            {(gateways ?? []).map((gateway) => (
              <form
                action={beginPaymentAction.bind(null, id)}
                key={gateway.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
              >
                <input type="hidden" name="gateway_id" value={gateway.id} />
                <input type="hidden" name="origin" value={legacyOrigin} />
                <div>
                  <b>{gateway.name}</b>
                  <p className="text-sm text-[var(--muted-text)]">
                    {String(
                      (gateway.public_config as Record<string, unknown> | null)
                        ?.description ?? "Secure payment",
                    )}
                  </p>
                </div>
                <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)]">
                  Continue
                </button>
              </form>
            ))}
          </div>
        ) : null}
        {hasEpsReceipt && (paid || sandboxPaid) ? (
          <Link
            href={`/account/orders/${id}/receipt`}
            className="mt-4 block rounded-xl border px-5 py-3 text-center font-bold"
          >
            View / print payment receipt
          </Link>
        ) : null}
        {((onlineOrder && !eps) || (!onlineOrder && !gateways?.length)) &&
        !paid &&
        !sandboxPaid ? (
          <p className="mt-4 text-sm text-[var(--muted-text)]">
            Online payment is temporarily unavailable. Please contact SEN for
            assistance.
          </p>
        ) : null}
      </section>
      {attempts.length ? (
        <section className="mt-5 max-w-3xl rounded-2xl border bg-[var(--surface)] p-5">
          <h2 className="text-lg font-bold">Payment history</h2>
          <div className="mt-3 space-y-3">
            {attempts.map((a) => (
              <article key={a.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <b>
                    {money(a.amount)} {a.test_mode ? "· Sandbox" : ""}
                  </b>
                  <span className="font-semibold">
                    {a.status.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-1 break-all text-sm text-[var(--muted-text)]">
                  Reference: {a.eps_transaction_id || a.merchant_transaction_id}
                  <br />
                  {dateTime(a.verified_at || a.created_at)}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </CustomerPaymentShell>
  );
}
