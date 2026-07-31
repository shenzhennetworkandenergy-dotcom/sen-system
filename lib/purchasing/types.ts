export type PurchaseStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "ordered"
  | "ready_for_shipment"
  | "shipped"
  | "partially_received"
  | "received"
  | "stock_received"
  | "cancelled"
  | "closed";

export type PurchaseBuilderItem = {
  product_id: string;
  variation_id: string | null;
  name: string;
  sku: string;
  serial_tracking_required: boolean;
  quantity: number;
  unit_cost: number;
  discount_amount: number;
  tax_amount: number;
  description: string;
};

export const purchaseStatuses: PurchaseStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "ordered",
  "ready_for_shipment",
  "shipped",
  "partially_received",
  "received",
  "stock_received",
  "cancelled",
  "closed",
];

