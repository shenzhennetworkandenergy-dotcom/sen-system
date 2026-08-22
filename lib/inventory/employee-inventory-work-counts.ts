export type EmployeeInventoryWorkCounts = {
  "receive-new-stock"?: number;
  "stock-out-product-release"?: number;
};

export type PendingPurchaseOrder = {
  id: string;
  destination_warehouse_id: string;
  status: string;
  purchase_order_items: Array<{
    quantity_ordered: number | string;
    quantity_received: number | string;
    quantity_rejected: number | string;
  }>;
};

export type PendingStockOutRequest = {
  id: string;
  warehouse_id: string;
  status: string;
};

export function buildEmployeeInventoryWorkCounts({
  permissions,
  warehouseIds,
  purchaseOrders,
  stockOutRequests,
}: {
  permissions: ReadonlySet<string>;
  warehouseIds: string[];
  purchaseOrders: PendingPurchaseOrder[];
  stockOutRequests: PendingStockOutRequest[];
}): EmployeeInventoryWorkCounts {
  const warehouses = new Set(warehouseIds);
  const counts: EmployeeInventoryWorkCounts = {};

  if (permissions.has("inventory.receive_new_stock")) {
    const pendingOrders = new Set(
      purchaseOrders
        .filter(
          (order) =>
            warehouses.has(order.destination_warehouse_id) &&
            ["received", "partially_received"].includes(order.status) &&
            order.purchase_order_items.some(
              (item) =>
                Number(item.quantity_ordered) -
                  Number(item.quantity_received) -
                  Number(item.quantity_rejected) >
                0,
            ),
        )
        .map((order) => order.id),
    );
    if (pendingOrders.size > 0) counts["receive-new-stock"] = pendingOrders.size;
  }

  if (permissions.has("inventory.release_sales_stock")) {
    const pendingRequests = new Set(
      stockOutRequests
        .filter(
          (request) =>
            warehouses.has(request.warehouse_id) &&
            ["pending_release", "partially_released"].includes(request.status),
        )
        .map((request) => request.id),
    );
    if (pendingRequests.size > 0) {
      counts["stock-out-product-release"] = pendingRequests.size;
    }
  }

  return counts;
}

export async function getEmployeeInventoryWorkCounts(
  profileId: string,
  permissionKeys: Iterable<string>,
): Promise<EmployeeInventoryWorkCounts> {
  const permissions = new Set(permissionKeys);
  const mayReceive = permissions.has("inventory.receive_new_stock");
  const mayRelease = permissions.has("inventory.release_sales_stock");
  if (!mayReceive && !mayRelease) return {};

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const db = createSupabaseAdminClient();
  const assignments = await db
    .from("profile_warehouse_assignments")
    .select("warehouse_id")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .is("ended_at", null);
  if (assignments.error) throw new Error("Unable to load employee warehouse assignments.");

  const assignedIds = [
    ...new Set((assignments.data ?? []).map((assignment) => assignment.warehouse_id)),
  ];
  if (!assignedIds.length) return {};
  const warehouses = await db
    .from("warehouses")
    .select("id")
    .in("id", assignedIds)
    .eq("is_active", true);
  if (warehouses.error) throw new Error("Unable to load active employee warehouses.");
  const warehouseIds = (warehouses.data ?? []).map((warehouse) => warehouse.id);
  if (!warehouseIds.length) return {};

  const [purchaseResult, stockOutResult] = await Promise.all([
    mayReceive
      ? db
          .from("purchase_orders")
          .select(
            "id,destination_warehouse_id,status,purchase_order_items(quantity_ordered,quantity_received,quantity_rejected)",
          )
          .in("destination_warehouse_id", warehouseIds)
          .in("status", ["received", "partially_received"])
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
    mayRelease
      ? db
          .from("sales_stock_out_requests")
          .select("id,warehouse_id,status")
          .in("warehouse_id", warehouseIds)
          .in("status", ["pending_release", "partially_released"])
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (purchaseResult.error || stockOutResult.error) {
    throw new Error("Unable to load employee inventory work counts.");
  }

  return buildEmployeeInventoryWorkCounts({
    permissions,
    warehouseIds,
    purchaseOrders: (purchaseResult.data ?? []) as PendingPurchaseOrder[],
    stockOutRequests: (stockOutResult.data ?? []) as PendingStockOutRequest[],
  });
}
