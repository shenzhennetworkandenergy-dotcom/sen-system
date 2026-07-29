import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  await connection();
  const { profile } = await requireProfile(["customer", "admin"]);
  const notice = await searchParams;
  const db = createSupabaseAdminClient();
  await db.rpc("queue_quotation_expiry_notifications");
  const { data } = await db
    .from("quotation_requests")
    .select(
      "id,reference,status,subject,message,total_amount,currency,expiration_date,converted_order_id,converted_invoice_id,created_at,quotation_request_items(product_name_snapshot,quantity)",
    )
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false });

  return (
    <DashboardShell
      title="My quotations"
      subtitle="Track pricing and sourcing requests submitted to SEN."
    >
      {notice.success ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-emerald-900">
          {notice.success}
        </p>
      ) : null}
      <Link
        href="/products"
        className="mt-4 inline-block font-bold text-[var(--primary)]"
      >
        Browse products →
      </Link>
      <div className="mt-5 grid gap-4">
        {(data ?? []).map((quotation) => (
          <article
            key={quotation.id}
            className="rounded-2xl border bg-[var(--surface)] p-5"
          >
            <div className="flex justify-between gap-3">
              <div>
                <b>{quotation.reference}</b>
                <h2 className="text-lg font-bold">{quotation.subject}</h2>
              </div>
              <span className="h-fit rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-800">
                {quotation.status.replaceAll("_", " ")}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted-text)]">
              {quotation.message || "No additional requirements."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <b>
                {quotation.currency ?? "BDT"}{" "}
                {Number(quotation.total_amount ?? 0).toLocaleString("en-BD", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </b>
              {quotation.expiration_date ? (
                <span>
                  Valid until{" "}
                  {new Date(quotation.expiration_date).toLocaleDateString("en-BD")}
                </span>
              ) : null}
              {quotation.converted_order_id ? (
                <Link
                  href={`/account/orders/${quotation.converted_order_id}`}
                  className="font-bold text-[var(--primary)]"
                >
                  Open converted order →
                </Link>
              ) : null}
            </div>
          </article>
        ))}
        {!data?.length ? (
          <p className="rounded-2xl border p-8 text-center">
            No quotation requests yet.
          </p>
        ) : null}
      </div>
    </DashboardShell>
  );
}
