import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const statuses = [
  "submitted",
  "reviewing",
  "quoted",
  "accepted",
  "declined",
  "additional_info_required",
  "approved",
  "rejected",
  "expired",
  "converted_to_invoice",
  "closed",
];

export default async function AdminQuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; success?: string; error?: string }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission("quotations.view");
  const canCreate =
    profile.role === "admin" || permissions.has("quotations.create");
  const params = await searchParams;
  const db = createSupabaseAdminClient();
  let query = db
    .from("quotation_requests")
    .select(
      "id,reference,status,subject,message,company_name,required_by,created_at,profiles!quotation_requests_profile_id_fkey(full_name,email,phone),quotation_request_items(product_name_snapshot,sku_snapshot,quantity,target_price)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (params.status && statuses.includes(params.status)) {
    query = query.eq("status", params.status);
  }
  const { data, error } = await query;

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={
        profile.role === "employee" ? permissions : undefined
      }
      title="Quotations"
      subtitle="Review product pricing and sourcing requests from customers."
    >
      {params.success ? (
        <p className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-900">
          {params.success}
        </p>
      ) : null}
      {params.error || error ? (
        <p className="mb-4 rounded-xl bg-red-50 p-4 text-red-900">
          {params.error ?? "Unable to load quotations."}
        </p>
      ) : null}
      {canCreate ? (
        <div className="mb-5 flex justify-end">
          <Link
            href="/admin/quotations/new"
            className="rounded-xl bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)]"
          >
            Create quotation
          </Link>
        </div>
      ) : null}
      <form className="mb-5 flex flex-wrap gap-3 rounded-2xl border bg-[var(--surface)] p-4">
        <select
          name="status"
          defaultValue={params.status}
          className="rounded-xl border px-4 py-2.5"
        >
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <button className="rounded-xl border px-4 py-2.5 font-semibold">
          Filter
        </button>
      </form>
      <div className="grid gap-4">
        {(data ?? []).map((quotation) => {
          const customer = quotation.profiles as unknown as {
            full_name: string | null;
            email: string | null;
            phone: string | null;
          } | null;
          return (
            <article
              key={quotation.id}
              className="rounded-2xl border bg-[var(--surface)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <b className="text-[var(--primary)]">
                    {quotation.reference}
                  </b>
                  <h2 className="text-xl font-bold"><a href={`/admin/quotations/${quotation.id}/manage`} className="hover:text-[var(--primary)]">{quotation.subject}</a></h2>
                  <p className="text-sm text-[var(--muted-text)]">
                    {customer?.full_name ?? "Customer"} · {customer?.email} ·{" "}
                    {customer?.phone ?? "No phone"}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--muted-surface)] px-3 py-1.5 text-sm font-semibold capitalize">
                  {quotation.status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={`/admin/quotations/${quotation.id}/manage`} className="inline-flex rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--primary-foreground)]">Manage quotation</a>
                <a href={`/admin/quotations/${quotation.id}`} className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold">Print quotation</a>
              </div>
              <p className="mt-3">{quotation.message || "No additional notes."}</p>
              <div className="mt-4 grid gap-2">
                {quotation.quotation_request_items?.map(
                  (
                    item: {
                      product_name_snapshot: string;
                      sku_snapshot: string | null;
                      quantity: number;
                    },
                    index: number,
                  ) => (
                    <p
                      key={`${quotation.id}-${index}`}
                      className="rounded-lg bg-[var(--muted-surface)] p-3 text-sm"
                    >
                      <b>{item.product_name_snapshot}</b> · SKU{" "}
                      {item.sku_snapshot ?? "—"} · Quantity {item.quantity}
                    </p>
                  ),
                )}
              </div>
            </article>
          );
        })}
        {!data?.length && !error ? (
          <p className="rounded-2xl border p-10 text-center">
            No quotation requests found.
          </p>
        ) : null}
      </div>
    </DashboardShell>
  );
}
