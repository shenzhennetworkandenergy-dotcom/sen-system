import Link from "next/link";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { money, dateTime } from "@/lib/orders/types";
import { verifyEpsPaymentAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function EpsPayments() {
  await connection();
  await requireProfile(["admin"]);
  const { data, error } = await createSupabaseAdminClient()
    .from("eps_payment_attempts")
    .select(
      "id,order_id,merchant_transaction_id,eps_transaction_id,amount,test_mode,status,financial_entity,created_at,verified_at,verification_error",
    )
    .order("created_at", { ascending: false })
    .limit(100);
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
