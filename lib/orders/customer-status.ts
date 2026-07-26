export const customerOrderStatuses = [
  "confirmed",
  "preparing_delivery",
  "on_the_way",
  "delivered",
  "received",
] as const;

export type CustomerOrderStatus =
  | "awaiting_confirmation"
  | (typeof customerOrderStatuses)[number];

export const customerOrderStatusCopy: Record<
  CustomerOrderStatus,
  { label: string; description: string }
> = {
  awaiting_confirmation: {
    label: "Order placed",
    description: "Your order was placed successfully and is waiting for SEN confirmation.",
  },
  confirmed: {
    label: "Order confirmed",
    description: "SEN has confirmed your order.",
  },
  preparing_delivery: {
    label: "Preparing for delivery",
    description: "Your products are being prepared for dispatch.",
  },
  on_the_way: {
    label: "On the way",
    description: "Your order is travelling to the delivery address.",
  },
  delivered: {
    label: "Delivered",
    description: "The delivery was completed.",
  },
  received: {
    label: "Received successfully",
    description: "The customer confirmed successful receipt.",
  },
};

export function normalizeCustomerOrderStatus(
  value: string | null | undefined,
  operationalStatus?: string | null,
): CustomerOrderStatus {
  if (value && value in customerOrderStatusCopy) {
    return value as CustomerOrderStatus;
  }
  if (operationalStatus === "draft") return "awaiting_confirmation";
  if (operationalStatus === "packing") return "preparing_delivery";
  if (["partially_shipped", "shipped"].includes(operationalStatus ?? "")) {
    return "on_the_way";
  }
  if (operationalStatus === "delivered") return "delivered";
  return "confirmed";
}

