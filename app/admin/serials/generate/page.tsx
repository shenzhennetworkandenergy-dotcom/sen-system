import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/Shell";
import { InventoryProductTypeahead } from "@/components/inventory/InventoryProductTypeahead";
import { requirePermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function GlobalSerialGenerator({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { profile, permissions } = await requirePermission("serials.generate");
  const params = await searchParams;
  if (params.product) redirect(`/admin/products/${params.product}/stock/add`);

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Generate and receive serials"
      subtitle="Select an existing catalogue model, then receive its physical units."
    >
      <form className="rounded-xl border bg-[var(--surface)] p-6">
        <InventoryProductTypeahead scope="serial-generate" name="product" label="Product model" />
        <p className="mt-2 text-xs text-[var(--muted-text)]">
          Only active catalogue products configured for serial tracking can be selected.
        </p>
        <button className="mt-4 rounded bg-[var(--primary)] px-5 py-3 font-semibold text-white">
          Open stock receiver
        </button>
      </form>
    </DashboardShell>
  );
}
