import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { PrintButton } from "@/components/inventory/PrintButton";
import { WarehouseStockReportView } from "@/components/inventory/WarehouseStockReport";
import { requirePermission } from "@/lib/auth/permissions";
import { getWarehouseStockReport, listStockReportWarehouses } from "@/lib/inventory/warehouse-report-data";

export const metadata = { title: "Warehouse Stock Report" };

export default async function WarehouseStockPrintPage({ searchParams }: {
  searchParams: Promise<{ warehouse?: string }>;
}) {
  await connection();
  await requirePermission("inventory.view");
  const [{ warehouse: warehouseId }, warehouses] = await Promise.all([searchParams, listStockReportWarehouses()]);
  const warehouse = warehouses.find((option) => option.id === warehouseId);
  if (!warehouse) notFound();
  const report = await getWarehouseStockReport(warehouse.id);

  return (
    <main className="bg-white p-4 print:p-0">
      <div className="mx-auto mb-4 flex max-w-[870px] flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/admin/inventory/warehouse-report?warehouse=${warehouse.id}`} prefetch={false} className="rounded border px-4 py-2 font-semibold">Back to stock report</Link>
        <PrintButton label="Print / Save PDF" />
      </div>
      <WarehouseStockReportView warehouse={warehouse} {...report} print />
    </main>
  );
}
