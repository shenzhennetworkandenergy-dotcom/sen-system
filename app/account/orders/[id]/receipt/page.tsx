import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { getOrderEpsAttempts } from "@/lib/payments/eps-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { money, dateTime } from "@/lib/orders/types";
import { PrintDocumentButton } from "@/components/sales/PrintDocumentButton";
import styles from "./receipt.module.css";
export const dynamic = "force-dynamic";
export default async function EpsReceipt({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { profile } = await requireProfile(["customer", "admin"]),
    { id } = await params;
  const [{ data: order }, attempts] = await Promise.all([
    createSupabaseAdminClient()
      .from("sales_orders")
      .select("order_number,total_amount")
      .eq("id", id)
      .eq("customer_profile_id", profile.id)
      .maybeSingle(),
    getOrderEpsAttempts(id, profile.id),
  ]);
  const received = attempts.filter((a) =>
    ["paid", "sandbox_paid"].includes(a.status),
  );
  if (!order || !received.length) notFound();
  return (
    <main className={styles.page}>
      <nav className={styles.controls}>
        <Link href={`/account/orders/${id}`}>← Order</Link>
        <PrintDocumentButton fileName={`SEN-Payment-${order.order_number}`} />
      </nav>
      <article className={styles.sheet}>
        <p className={styles.brand}>Shenzhen Energy &amp; Networks</p>
        <h1>Online payment receipt</h1>
        <p>
          Order: <b>{order.order_number}</b>
        </p>
        <p>Customer: {profile.full_name || profile.email}</p>
        {received.map((a) => (
          <section key={a.id} className={styles.payment}>
            <h2>
              {a.test_mode
                ? "SANDBOX TEST — NO MONEY COLLECTED"
                : "Payment verified by EPS"}
            </h2>
            <p>
              Amount: <b>{money(a.amount)}</b>
            </p>
            <p>
              Transaction reference:{" "}
              <b>{a.eps_transaction_id || a.merchant_transaction_id}</b>
            </p>
            <p>Verified: {dateTime(a.verified_at)}</p>
          </section>
        ))}
        <p className={styles.note}>
          This confirms the payment result for the order above. It is not a tax
          invoice or delivery confirmation.
        </p>
        <footer>
          sen.com.bd · Generated electronically; no signature required.
        </footer>
      </article>
    </main>
  );
}
