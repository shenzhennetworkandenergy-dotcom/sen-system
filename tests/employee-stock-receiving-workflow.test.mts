import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const receiving = await import(
  "../lib/inventory/employee-stock-receiving.ts"
).catch(() => null);

test("employee receiving cards preserve carrier, tracking, and remaining quantities", () => {
  assert.ok(receiving, "Employee stock-receiving workflow helpers must exist.");
  if (!receiving) return;

  const cards = receiving.buildEmployeePurchaseReceiptCards([
    {
      id: "po-1",
      order_number: "PO-202608-00036",
      suppliers: { name: "Supplier" },
      warehouses: { name: "Dhaka Warehouse", code: "SEN-DHAKA-BD" },
      purchase_inbound_shipments: {
        carrier_name: "Shah Ship",
        tracking_number: "SF6048156141520",
      },
      purchase_order_items: [
        {
          id: "item-1",
          quantity_ordered: 5,
          quantity_received: 1,
          quantity_rejected: 1,
          product_name_snapshot: "Server rail kit",
        },
      ],
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].remaining, 3);
  assert.equal(cards[0].carrierName, "Shah Ship");
  assert.equal(cards[0].trackingNumber, "SF6048156141520");
});

test("employee receiving access is limited to arrived orders in the assigned warehouse", () => {
  assert.ok(receiving, "Employee stock-receiving workflow helpers must exist.");
  if (!receiving) return;

  assert.equal(
    receiving.canEmployeeReceivePurchaseOrder({
      assignedWarehouseId: "warehouse-a",
      destinationWarehouseId: "warehouse-a",
      orderStatus: "received",
    }),
    true,
  );
  assert.equal(
    receiving.canEmployeeReceivePurchaseOrder({
      assignedWarehouseId: "warehouse-a",
      destinationWarehouseId: "warehouse-b",
      orderStatus: "received",
    }),
    false,
  );
  assert.equal(
    receiving.canEmployeeReceivePurchaseOrder({
      assignedWarehouseId: "warehouse-a",
      destinationWarehouseId: "warehouse-a",
      orderStatus: "shipped",
    }),
    false,
  );
});

test("employee serial printing accepts only expected serials from an eligible purchase order", () => {
  assert.ok(receiving, "Employee stock-receiving workflow helpers must exist.");
  if (!receiving) return;

  const base = {
    assignedWarehouseId: "warehouse-a",
    destinationWarehouseId: "warehouse-a",
    orderStatus: "partially_received",
    serialStatus: "expected",
    purchaseOrderItemId: "item-1",
  };
  assert.equal(receiving.canEmployeePrintPurchaseSerial(base), true);
  assert.equal(
    receiving.canEmployeePrintPurchaseSerial({ ...base, serialStatus: "available" }),
    false,
  );
  assert.equal(
    receiving.canEmployeePrintPurchaseSerial({
      ...base,
      destinationWarehouseId: "warehouse-b",
    }),
    false,
  );
  assert.equal(
    receiving.canEmployeePrintPurchaseSerial({
      ...base,
      purchaseOrderItemId: null,
    }),
    false,
  );
});

test("existing global serial-print access is not narrowed by the receiving workflow", () => {
  assert.ok(receiving, "Employee stock-receiving workflow helpers must exist.");
  if (!receiving) return;
  assert.equal(
    typeof receiving.mustScopeSerialPrintToEmployeePurchaseReceipt,
    "function",
  );
  assert.equal(
    receiving.mustScopeSerialPrintToEmployeePurchaseReceipt({
      role: "employee",
      hasGlobalSerialPrintPermission: true,
    }),
    false,
  );
  assert.equal(
    receiving.mustScopeSerialPrintToEmployeePurchaseReceipt({
      role: "employee",
      hasGlobalSerialPrintPermission: false,
    }),
    true,
  );
  assert.equal(
    receiving.mustScopeSerialPrintToEmployeePurchaseReceipt({
      role: "admin",
      hasGlobalSerialPrintPermission: false,
    }),
    false,
  );
});

test("receive-only employees return from serial printing to the employee workflow", async () => {
  const source = await readFile("app/admin/serials/print/page.tsx", "utf8");
  assert.match(source, /scopedEmployeeReceiptPrint\?"\/employee\/inventory\/receive":"\/admin\/serials"/);
});
