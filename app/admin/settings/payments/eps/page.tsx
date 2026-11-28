import Link from "next/link";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { money, dateTime } from "@/lib/orders/types";
import { getPendingEpsCheckoutChanges, hasEpsCheckoutExpired } from "@/lib/payments/eps-server";
import { confirmClosedEpsCheckoutAction, verifyEpsPaymentAction } from "./actions";

export const dynamic = "force-dynamic";
const closureMessages: Record<string, string> = {
  removed: "Checkout deleted and reserved stock released.",
  restored: "Items returned to the customer’s cart and reserved stock released.",
  verification_busy: "EPS is being checked. Wait for that check to finish before confirming closure.",
  "confirmation-required": "Confirm EPS closed the payment without collecting it and enter the confirmation reference.",
  "not-eligible": "This checkout could not be closed. Check its latest payment and order status.",
};

export default async function EpsPayments({ searchParams }: { searchParams: Promise<{ closure?: string }> }) {
  await connection();
  await requireProfile(["admin"]);
  const [{ data, error }, { requests, error: requestError }, notice] = await Promise.all([
    createSupabaseAdminClient()
      .from("eps_payment_attempts")
      .select("id,order_id,merchant_transaction_id,eps_transaction_id,amount,test_mode,status,financial_entity,created_at,verified_at,verification_error")
      .order("created_at", { ascending: false })
      .limit(100),
    getPendingEpsCheckoutChanges(),
    searchParams,
  ]);
  const message = notice.closure && Object.hasOwn(closureMessages, notice.closure) ? closureMessages[notice.closure] : null;
  const expiredRequests = requests.filter(request => hasEpsCheckoutExpired(request.payment_expires_at));
  return (
    <DashboardShell
      admin
      title="EPS online payments"
      subtitle="Verify online transactions and review payments requiring attention."
    >
      <Link
        href="/admin/settings/payments"
        className="font-bold text-[var(--primary)]"
      >
        ← Payment settings
      </Link>
      <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        Verified live payments are recorded against EPS funds awaiting
        settlement. They are not posted as cash or as a bank deposit. Sandbox
        payments never create Sales income. Refunds and EPS settlement remain
        separate accounting actions.
      </p>
      <section id="checkout-reviews" className="mt-5 scroll-m-4 rounded-xl border p-4" aria-labelledby="checkout-review-title">
        <h2 id="checkout-review-title" className="font-bold">Expired checkout requests</h2>
        {message ? <p role="status" className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-950">{message}</p> : null}
        {requestError ? <p role="alert" className="mt-3 text-sm">Unable to load checkout requests.</p> : null}
        {!requestError && expiredRequests.length === 0 ? <p className="mt-2 text-sm">No expired checkout requests.</p> : null}
        <div className="divide-y">
          {expiredRequests.map(({ order_id, requested_change, sales_orders: order }) => {
            const canConfirm = order.eps_payment_attempts.some(attempt => ["initializing", "ready", "unknown", "pending"].includes(attempt.status))
              && !order.eps_payment_attempts.some(attempt => ["paid", "sandbox_paid", "review_required"].includes(attempt.status));
            return (
              <article key={order_id} className="space-y-2 py-4">
                <div className="flex flex-wrap items-center gap-x-4">
                  <Link href={`/admin/orders/${order_id}`} className="font-bold underline">{order.order_number}</Link>
                  <span className="text-sm">{money(order.total_amount, order.currency)} · {requested_change === "remove" ? "Delete checkout" : "Return items to cart"}</span>
                </div>
                <ul className="break-all text-sm">
                  {order.eps_payment_attempts.map(attempt => (
                    <li key={attempt.merchant_transaction_id}>
                      {attempt.merchant_transaction_id} · {attempt.status.replaceAll("_", " ")}{attempt.verification_error ? " · Verification needs attention" : ""}
                    </li>
                  ))}
                </ul>
                {canConfirm ? (
                  <form action={confirmClosedEpsCheckoutAction.bind(null, order_id)} className="grid max-w-xl gap-2">
                    <label className="text-sm font-semibold">
                      EPS confirmation reference
                      <input name="eps_confirmation_reference" minLength={6} maxLength={80} required className="mt-1 block w-full rounded-lg border px-3 py-2" />
                    </label>
                    <label className="flex items-start gap-2 text-sm">
                      <input name="confirmed_unpaid" type="checkbox" value="yes" required className="mt-1 shrink-0" />
                      EPS confirmed every reference above is closed and unpaid.
                    </label>
                    <button className="justify-self-start rounded-lg border px-3 py-2 text-sm font-bold">Complete request</button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
      {error ? (
        <p role="alert" className="mt-4 text-red-700">
          Payment records are unavailable. Check that the EPS migration has been
          applied.
        </p>
      ) : null}
      <div className="mt-5 space-y-3">
        {data?.map((a) => (
          <article
            key={a.id}
            className="rounded-2xl border bg-[var(--surface)] p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link
                  className="font-bold text-[var(--primary)]"
                  href={`/admin/orders/${a.order_id}`}
                >
                  View order →
                </Link>
                <p className="mt-2 text-lg font-bold">
                  {money(a.amount)} {a.test_mode ? "· Sandbox" : "· Live"}
                </p>
                <p className="mt-1 break-all text-sm">
                  {a.eps_transaction_id || a.merchant_transaction_id}
                </p>
                <p className="text-sm text-[var(--muted-text)]">
                  {dateTime(a.verified_at || a.created_at)}
                </p>
              </div>
              <div>
                <b
                  className={
                    a.status === "review_required" ? "text-amber-700" : ""
                  }
                >
                  {a.status.replaceAll("_", " ")}
                </b>
                {a.verification_error ? (
                  <p className="mt-1 text-sm text-amber-700">
                    Verification needs attention
                  </p>
                ) : null}
                {!["paid", "sandbox_paid"].includes(a.status) ? (
                  <form action={verifyEpsPaymentAction} className="mt-3">
                    <input type="hidden" name="attempt_id" value={a.id} />
                    <button className="rounded-lg border px-4 py-2 font-bold">
                      Verify with EPS
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!data?.length && !error ? (
        <p className="mt-5 rounded-xl border p-8 text-center">
          No online payment attempts yet.
        </p>
      ) : null}
    </DashboardShell>
  );
}
