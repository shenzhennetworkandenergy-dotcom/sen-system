export type PurchaseWorkflowStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "ordered"
  | "ready_for_shipment"
  | "shipped"
  | "received"
  | "partially_received"
  | "stock_received"
  | "cancelled"
  | "closed";

export type PurchaseWorkflowAction =
  | "submit"
  | "approve"
  | "order"
  | "prepare"
  | "ship"
  | "receive"
  | "close";

export const purchaseWorkflowSteps = [
  { status: "draft", label: "Draft" },
  { status: "pending_approval", label: "Pending Approval" },
  { status: "approved", label: "Approved" },
  { status: "ordered", label: "Ordered" },
  { status: "ready_for_shipment", label: "Ready for Shipment" },
  { status: "shipped", label: "Shipped" },
  { status: "received", label: "Received" },
  { status: "stock_received", label: "Stock Received" },
  { status: "closed", label: "Closed" },
] as const;

const transitions: Partial<
  Record<PurchaseWorkflowStatus, Partial<Record<PurchaseWorkflowAction, PurchaseWorkflowStatus>>>
> = {
  draft: { submit: "pending_approval" },
  pending_approval: { approve: "approved" },
  approved: { order: "ordered" },
  ordered: { prepare: "ready_for_shipment" },
  ready_for_shipment: { ship: "shipped" },
  shipped: { receive: "received" },
  stock_received: { close: "closed" },
};

export function nextPurchaseStatus(
  status: PurchaseWorkflowStatus,
  action: PurchaseWorkflowAction,
) {
  return transitions[status]?.[action] ?? null;
}

export function canPostPurchaseStock(status: PurchaseWorkflowStatus) {
  return status === "received" || status === "partially_received";
}
