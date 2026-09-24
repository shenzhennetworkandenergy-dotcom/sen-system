import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { isAdmin, requirePermission } from "@/lib/auth/permissions";
import { routes } from "@/lib/constants/routes";
import { getStaffRmaClaims } from "@/lib/rma/data";
import { rmaStatuses, titleCase } from "@/lib/rma/workflow";

export const dynamic = "force-dynamic";

function dateTime(value: string) {
  return new Date(value).toLocaleString("en-BD");
}

export default async function AdminRmaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; error?: string; success?: string }>;
}) {
  await connection();
  const context = await requirePermission("rma.view");
  const params = await searchParams;
  const status = rmaStatuses.includes(params.status as (typeof rmaStatuses)[number]) ? params.status : undefined;
  const claims = await getStaffRmaClaims(status, params.q);
  const admin = isAdmin(context.profile);

  return (
    <DashboardShell
      admin={admin}
      employeePermissions={admin ? undefined : context.permissions}
      title="RMA & Warranty"
      subtitle="Review warranty claims, product returns, damage reports and resolutions from one queue."
    >
      {params.success ? <p className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-900">{params.success}</p> : null}
      {params.error ? <p className="mb-4 rounded-xl bg-red-50 p-4 text-red-900">{params.error}</p> : null}

      <form className="mb-4 grid gap-2 rounded-2xl border bg-[var(--surface)] p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_15rem_auto]">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Search RMA, customer, order, product, SKU or serial"
          className="rounded-xl border px-4 py-2.5"
        />
        <select name="status" defaultValue={status ?? ""} className="rounded-xl border px-4 py-2.5">
          <option value="">All statuses</option>
          {rmaStatuses.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
        </select>
        <button className="rounded-xl bg-[var(--primary)] px-5 py-2.5 font-semibold text-[var(--primary-foreground)]">Filter</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border bg-[var(--surface)] shadow-sm">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-[var(--muted-surface)]">
            <tr><th className="p-4">RMA</th><th className="p-4">Customer</th><th className="p-4">Product</th><th className="p-4">Claim</th><th className="p-4">Status</th><th className="p-4">Updated</th><th className="p-4">Action</th></tr>
          </thead>
          <tbody>
            {claims.map((claim) => (
              <tr key={claim.id} className="border-t transition-colors hover:bg-[var(--muted-surface)]/60">
                <td className="p-4"><strong>{claim.rma_number}</strong><br/><span className="text-xs text-[var(--muted-text)]">{claim.order_number}</span></td>
                <td className="p-4"><strong>{claim.customer_name}</strong><br/><span className="text-xs text-[var(--muted-text)]">{claim.customer_email}</span></td>
                <td className="p-4"><strong>{claim.product_name}</strong><br/><span className="text-xs text-[var(--muted-text)]">{claim.sen_serial || claim.product_sku}</span></td>
                <td className="p-4">{titleCase(claim.claim_type)} × {claim.quantity}</td>
                <td className="p-4"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-900">{titleCase(claim.status)}</span></td>
                <td className="p-4">{dateTime(claim.updated_at)}</td>
                <td className="p-4"><a href={`${routes.adminRma}/${claim.id}`} className="rounded-lg border px-3 py-2 font-semibold">Open claim</a></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!claims.length ? <p className="p-10 text-center text-[var(--muted-text)]">No RMA claims match these filters.</p> : null}
      </div>
      <p className="mt-3 text-sm text-[var(--muted-text)]">{claims.length} claim(s) shown</p>
    </DashboardShell>
  );
}
