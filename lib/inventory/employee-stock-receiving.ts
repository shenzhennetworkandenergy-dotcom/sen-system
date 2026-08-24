export type EmployeePurchaseReceiptItem = {
  id: string;
  quantity_ordered: number | string;
  quantity_received: number | string;
  quantity_rejected: number | string;
  product_name_snapshot: string;
};

type InboundShipment = {
  carrier_name: string | null;
  tracking_number: string | null;
};

export type EmployeePurchaseReceiptOrder = {
  id: string;
  order_number: string;
  suppliers: { name: string } | null;
  warehouses: { name: string; code: string } | null;
  purchase_inbound_shipments: InboundShipment | InboundShipment[] | null;
  purchase_order_items: EmployeePurchaseReceiptItem[];
};

export function remainingPurchaseReceiptUnits(
  items: EmployeePurchaseReceiptItem[],
) {
  return items.reduce(
    (total, item) =>
      total +
      Math.max(
        0,
        Number(item.quantity_ordered) -
          Number(item.quantity_received) -
          Number(item.quantity_rejected),
      ),
    0,
  );
}

export function buildEmployeePurchaseReceiptCards(
  orders: EmployeePurchaseReceiptOrder[],
) {
  return orders
    .map((order) => {
      const shipment = Array.isArray(order.purchase_inbound_shipments)
        ? order.purchase_inbound_shipments[0] ?? null
        : order.purchase_inbound_shipments;
      return {
        ...order,
        remaining: remainingPurchaseReceiptUnits(order.purchase_order_items),
        carrierName: shipment?.carrier_name ?? null,
        trackingNumber: shipment?.tracking_number ?? null,
      };
    })
    .filter((order) => order.remaining > 0);
}

type EmployeePurchaseAccess = {
  assignedWarehouseId: string | null;
  destinationWarehouseId: string | null;
  orderStatus: string;
};

export function canEmployeeReceivePurchaseOrder({
  assignedWarehouseId,
  destinationWarehouseId,
  orderStatus,
}: EmployeePurchaseAccess) {
  return Boolean(
    assignedWarehouseId &&
      assignedWarehouseId === destinationWarehouseId &&
      ["received", "partially_received"].includes(orderStatus),
  );
}

export function canEmployeePrintPurchaseSerial({
  serialStatus,
  purchaseOrderItemId,
  ...access
}: EmployeePurchaseAccess & {
  serialStatus: string;
  purchaseOrderItemId: string | null;
}) {
  return Boolean(
    purchaseOrderItemId &&
      serialStatus === "expected" &&
      canEmployeeReceivePurchaseOrder(access),
  );
}

export function mustScopeSerialPrintToEmployeePurchaseReceipt({
  role,
  hasGlobalSerialPrintPermission,
}: {
  role: string;
  hasGlobalSerialPrintPermission: boolean;
}) {
  return role === "employee" && !hasGlobalSerialPrintPermission;
}

