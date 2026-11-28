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
  hasEpsCheckoutExpired,
  resumableEpsUrl,
} from "@/lib/payments/eps-server";
import { money, dateTime } from "@/lib/orders/types";
import { getPaymentOrigin } from "@/lib/payments/eps-config";
import { beginPaymentAction, checkEpsPaymentAction, manageEpsCheckoutAction } from "./actions";

export const dynamic = "force-dynamic";
export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; from?: string }>;
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
        "id,order_number,total_amount,paid_amount,currency,status,payment_status,sales_order_items(id,product_name_snapshot,quantity)",
      )
      .eq("id", id)
      .eq("customer_profile_id", profile.id)
      .maybeSingle(),
    availableEpsGateway(),
    getOrderEpsAttempts(id, profile.id),
    db
      .from("eps_checkout_requests")
      .select("order_id,cart_restored_at,discarded_at,payment_expires_at")
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
  const resumeUrl = resumableEpsUrl(latest);
  const unresolved = Boolean(
    latest && ["initializing", "ready", "unknown", "pending"].includes(latest.status),
  );
  const sandboxPaid = attempts.some((a) => a.status === "sandbox_paid");
  const hasEpsReceipt = attempts.some((a) =>
    ["paid", "sandbox_paid"].includes(a.status),
  );
  const paid = due <= 0;
  const terminal = latest && ["failed", "cancelled"].includes(latest.status);
  const expired = Boolean(onlineOrder && hasEpsCheckoutExpired(onlineOrder.payment_expires_at));
  const canManage = onlineOrder && !onlineOrder.discarded_at && Number(order.paid_amount ?? 0) === 0 && !hasEpsReceipt &&
    ["confirmed", "cancelled"].includes(order.status) && latest?.status !== "review_required";
  const canOpenEps = eps && canManage &&
    order.status === "confirmed" && !expired && latest?.test_mode === eps.test_mode && resumeUrl;
  const canPrepareEps = eps && onlineOrder && !paid && !sandboxPaid && !expired && (!latest || terminal) &&
    order.status === "confirmed";
  return (
    <CustomerPaymentShell
      title={`Payment · ${order.order_number}`}
      subtitle="Secure checkout and payment confirmation for your order."
    >
      <nav aria-label="Checkout navigation" className="flex flex-wrap gap-4 font-bold text-[var(--primary)]">
        <Link href={`/account/orders/${id}`}>← Back to order</Link>
        {onlineOrder ? <Link href="/cart">Go to cart</Link> : null}
      </nav>
      {onlineOrder && notice.from === "powersemi-selection" ? (
        <p role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-950">
          You already have an EPS checkout for this product. It has different order details. Review the saved items and amount below before paying.
        </p>
      ) : null}
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
        {onlineOrder && order.sales_order_items.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {order.sales_order_items.map((item) => (
              <li key={item.id}>{Number(item.quantity)} × {item.product_name_snapshot}</li>
            ))}
          </ul>
        ) : null}
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
                    ? onlineOrder?.discarded_at ? "Saved checkout removed" : "Order cancelled"
                    : expired
                      ? "Checkout window ended"
                      : terminal
                      ? "Payment did not complete"
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
                    ? onlineOrder?.discarded_at
                      ? "You can view this order in your history."
                      : onlineOrder?.cart_restored_at
                      ? "Your items were returned to your cart."
                      : "Edit the items in your cart or remove this saved checkout once EPS confirms the payment is closed."
                    : expired
                      ? "Check this payment’s status. If no payment went through, return these items to your cart to start a new checkout."
                      : terminal
                      ? "Retry with the same order, or return the items to your cart to start over."
                      : canOpenEps
                        ? "Open the secure EPS page to pay. If it stalls or you already tried to pay, come back here to check the same payment."
                      : unresolved
                        ? "Do not pay again while this transaction is being checked. Use Check payment status below."
                        : onlineOrder
                          ? "Complete payment on EPS. Your card and wallet details are entered on the payment provider's secure page."
                          : "Choose an available payment method for this order."}
          </p>
        </div>
        {canOpenEps ? (
          <a href={resumeUrl} rel="noreferrer" className="mt-5 block rounded-xl bg-[var(--primary)] px-5 py-3 text-center font-bold text-[var(--primary-foreground)]">
            Continue to EPS{eps.test_mode ? " · Sandbox" : ""}
          </a>
        ) : null}
        {canPrepareEps ? (
          <form action={beginPaymentAction.bind(null, id)} className="mt-5">
            <input type="hidden" name="gateway_id" value={eps.id} />
            <button
              className="w-full rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]"
            >
              {terminal ? "Retry EPS checkout" : "Prepare EPS checkout"}
              {eps.test_mode ? " · Sandbox" : ""}
            </button>
          </form>
        ) : null}
        {canManage ? (
          onlineOrder.cart_restored_at ? (
            <Link href="/cart" className="mt-3 block rounded-xl border px-5 py-3 text-center font-bold">Go to cart</Link>
          ) : (
            <div className="mt-4">
              <form action={manageEpsCheckoutAction.bind(null, id)} className="flex flex-wrap gap-3">
                <button name="mode" value="edit" className="min-h-11 rounded-xl border px-4 py-2 font-bold">Edit items in cart</button>
                <button name="mode" value="remove" className="min-h-11 rounded-xl border border-red-200 px-4 py-2 font-bold text-red-800">Remove saved checkout</button>
              </form>
              {unresolved ? (
                <p className="mt-2 text-sm text-[var(--muted-text)]">
                  To change an unpaid checkout, cancel the open payment on EPS first.
                </p>
              ) : null}
            </div>
          )
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
