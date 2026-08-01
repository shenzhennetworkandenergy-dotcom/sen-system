import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { getEmployeePrimaryWarehouseId } from "@/lib/inventory/employee-stock-receiving";
import { remainingPurchaseReceiptUnits } from "@/lib/inventory/purchase-receiving";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PurchaseItem = {
  id: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_rejected: number;
  product_name_snapshot: string;
};

type PurchaseOrderRow = {
  id: string;
  order_number: string;
  suppliers: { name: string } | null;
  warehouses: { name: string; code: string } | null;
  purchase_order_items: PurchaseItem[];
};

export default async function EmployeePurchaseStockReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const [{ profile, permissions }, messages] = await Promise.all([
    requirePermission("inventory.receive_new_stock"),
    searchParams,
  ]);
  const warehouseId = await getEmployeePrimaryWarehouseId(profile.id);
  const query = createSupabaseAdminClient()
    .from("purchase_orders")
    .select(
      "id,order_number,status,updated_at,suppliers(name),warehouses:destination_warehouse_id(name,code),purchase_order_items(id,quantity_ordered,quantity_received,quantity_rejected,product_name_snapshot)",
    )
    .in("status", ["received", "partially_received"]);
  const { data, error } = warehouseId
    ? await query
        .eq("destination_warehouse_id", warehouseId)
        .order("updated_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };
  const orders = ((data ?? []) as unknown as PurchaseOrderRow[])
    .map((order) => ({
      ...order,
      remaining: remainingPurchaseReceiptUnits(order.purchase_order_items),
    }))
    .filter((order) => order.remaining > 0);

  return (
    <DashboardShell
      employeePermissions={permissions}
      title="স্টকে নতুন পণ্য রিসিভ করুন"
      subtitle="Receive physically arrived supplier products, print each SEN serial, and post confirmed units into inventory."
    >
      {messages.success ? (
        <p className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">
          {messages.success}
        </p>
      ) : null}
      {messages.error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          {messages.error}
        </p>
      ) : null}
      <section className="mb-5 rounded-xl border border-cyan-200 bg-cyan-50 p-5 text-cyan-950">
        <h2 className="font-semibold">Physical receiving workflow</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>Open a supplier order whose shipment has physically arrived.</li>
          <li>Print the expected SEN serial label for each physical unit.</li>
          <li>Check quantity, condition and optional manufacturer serial.</li>
          <li>Confirm the receipt to make those units available in inventory.</li>
        </ol>
      </section>
      {!warehouseId ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
          An administrator must assign your primary warehouse before you can
          receive physical stock.
        </p>
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
          Unable to load physically arrived purchase orders.
        </p>
      ) : orders.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {orders.map((order) => (
            <article
              key={order.id}
              className="rounded-xl border bg-[var(--surface)] p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{order.order_number}</h2>
                  <p className="text-sm text-[var(--muted-text)]">
                    {order.suppliers?.name ?? "Supplier"} →{" "}
                    {order.warehouses
                      ? `${order.warehouses.name} (${order.warehouses.code})`
                      : "Destination warehouse"}
                  </p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                  {order.remaining} unit(s) remaining
                </span>
              </div>
              <ul className="mt-4 space-y-1 text-sm">
                {order.purchase_order_items.map((item) => {
                  const remaining = remainingPurchaseReceiptUnits([item]);
                  return remaining > 0 ? (
                    <li key={item.id}>
                      {item.product_name_snapshot} · {remaining}
                    </li>
                  ) : null;
                })}
              </ul>
              <a
                href={`/admin/purchasing/${order.id}/receive`}
                className="mt-5 inline-block rounded-lg bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)]"
              >
                Print serials and receive into stock
              </a>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border bg-[var(--surface)] p-8 text-center text-[var(--muted-text)]">
          No supplier shipments are currently waiting for physical stock receipt.
        </p>
      )}
    </DashboardShell>
  );
}
