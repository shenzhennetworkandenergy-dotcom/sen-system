import { randomUUID } from "node:crypto";

import { connection } from "next/server";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/Shell";
import { PhysicalReturnReceiptForm } from "@/components/inventory/PhysicalReturnReceiptForm";
import { requirePermission } from "@/lib/auth/permissions";
import { getAuthorizedPhysicalReturnClaim } from "@/lib/inventory/rma-return-data";

export const dynamic = "force-dynamic";

export default async function EmployeePhysicalReturnReceiptPage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission("rma.receive");
  const { claimId } = await params;
  const claim = await getAuthorizedPhysicalReturnClaim(profile.id, claimId);
  if (!claim) notFound();

  return (
    <DashboardShell
      title={`Confirm Physical Return Receipt · ${claim.rmaNumber}`}
      subtitle="Receive only products physically returned against their original Sales Invoice and Stock Out history."
      employeePermissions={permissions}
    >
      <section className="grid gap-3 rounded-xl border bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><span className="text-xs text-[var(--muted-text)]">Customer</span><b className="block">{claim.customerName}</b></div>
        <div><span className="text-xs text-[var(--muted-text)]">Sales order</span><b className="block">{claim.orderNumber}</b></div>
        <div><span className="text-xs text-[var(--muted-text)]">Product</span><b className="block">{claim.productName}</b></div>
        <div><span className="text-xs text-[var(--muted-text)]">RMA status</span><b className="block capitalize">{claim.status.replaceAll("_", " ")}</b></div>
      </section>
      <p className="mt-3 rounded-xl bg-[var(--muted-surface)] p-3 text-sm">{claim.description}</p>
      <div className="mt-4 grid gap-4">
        {claim.items.map((item) => (
          <PhysicalReturnReceiptForm
            key={item.id}
            claimId={claim.id}
            item={item}
            operationId={randomUUID()}
          />
        ))}
        {!claim.items.length ? (
          <p className="rounded-xl border bg-[var(--surface)] p-6 text-center">No physically released units remain returnable for this RMA claim.</p>
        ) : null}
      </div>
    </DashboardShell>
  );
}
