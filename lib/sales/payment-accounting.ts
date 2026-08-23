export type CashbookReceiptChannel = "cash" | "bank" | "mfs";

export const SALE_PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "cheque",
  "mobile_banking",
  "card",
  "advance_payment",
  "cash_on_delivery",
  "other",
] as const;

export type SalePaymentMethod = (typeof SALE_PAYMENT_METHODS)[number];
export const AMBIGUOUS_RECEIPT_METHODS = ["advance_payment", "other"] as const;

export function requiresExplicitReceiptChannel(methodValue: unknown) {
  const method = String(methodValue ?? "").trim().toLowerCase();
  return (AMBIGUOUS_RECEIPT_METHODS as readonly string[]).includes(method);
}

export function normalizeSalePaymentReceipt(methodValue: unknown, channelValue: unknown): {
  method: SalePaymentMethod;
  receiptChannel: CashbookReceiptChannel;
} {
  const method = String(methodValue ?? "").trim().toLowerCase();
  const receiptChannel = String(channelValue ?? "").trim().toLowerCase();
  if (method === "credit_sale") {
    throw new Error("Credit Sale is not a received payment. Record the actual payment method when money is received.");
  }
  if (!SALE_PAYMENT_METHODS.includes(method as SalePaymentMethod)) {
    throw new Error("Select a valid received payment method.");
  }
  if (method === "cash" || method === "cash_on_delivery") {
    return { method: method as "cash" | "cash_on_delivery", receiptChannel: "cash" as const };
  }
  if (method === "mobile_banking") {
    return { method: "mobile_banking" as const, receiptChannel: "mfs" as const };
  }
  if (method === "bank_transfer" || method === "cheque" || method === "card") {
    return { method: method as "bank_transfer" | "cheque" | "card", receiptChannel: "bank" as const };
  }
  if (!(["cash", "bank", "mfs"] as const).includes(receiptChannel as CashbookReceiptChannel)) {
    throw new Error("Select the actual Cash, Bank, or MFS receiving channel.");
  }
  return {
    method: method as "advance_payment" | "other",
    receiptChannel: receiptChannel as CashbookReceiptChannel,
  };
}
