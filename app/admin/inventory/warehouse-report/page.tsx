import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { WarehouseStockReportView } from "@/components/inventory/WarehouseStockReport";
import { requirePermission } from "@/lib/auth/permissions";
import { getWarehouseStockReport, listStockReportWarehouses } from "@/lib/inventory/warehouse-report-data";

export default async function WarehouseReportPage({ searchParams }: {
  searchParams: Promise<{ warehouse?: string }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission("inventory.view");
  const [{ warehouse: warehouseId }, warehouses] = await Promise.all([searchParams, listStockReportWarehouses()]);
  const selected = warehouses.find((warehouse) => warehouse.id === warehouseId);
  const report = selected ? await getWarehouseStockReport(selected.id) : null;

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Warehouse Stock Report"
      subtitle="Current quantities and selling value by warehouse."
    >
      <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-[var(--surface)] p-4">
        <div className="grid grow gap-1 text-sm font-semibold sm:max-w-md">
          <label htmlFor="warehouse-report-selection">Warehouse</label>
          <select id="warehouse-report-selection" name="warehouse" required defaultValue={selected?.id ?? ""} className="rounded-lg border px-3 py-2 font-normal">
            <option value="">Choose a warehouse</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name} ({warehouse.code}){warehouse.is_active ? "" : " · Inactive"}
              </option>
            ))}
          </select>
        </div>
        <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-white">View stock</button>
        {selected ? (
          <Link href={`/admin/inventory/warehouse-report/print?warehouse=${selected.id}`} prefetch={false} className="rounded-lg border px-4 py-2 font-semibold">
            Print / Save PDF
          </Link>
        ) : null}
      </form>
      {selected && report ? <WarehouseStockReportView warehouse={selected} {...report} /> : (
        <p className="rounded-xl border bg-[var(--surface)] p-5 text-sm text-[var(--muted-text)]">
          {warehouseId ? "Choose a listed warehouse." : "Choose a warehouse to view its current stock."}
        </p>
      )}
    </DashboardShell>
  );
}
