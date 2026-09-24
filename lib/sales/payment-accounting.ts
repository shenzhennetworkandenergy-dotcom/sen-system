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

export function buildSalePaymentRpcArguments(input: {
  actorProfileId: string;
  saleId: string;
  amount: number;
  paymentDate: string;
  method: unknown;
  receiptChannel: unknown;
  reference: string | null;
  note: string | null;
  operationId: string;
}) {
  const receipt = normalizeSalePaymentReceipt(input.method, input.receiptChannel);
  return {
    actor_profile_id: input.actorProfileId,
    requested_order_id: input.saleId,
    requested_amount: input.amount,
    requested_date: input.paymentDate,
    requested_method: receipt.method,
    requested_reference: input.reference,
    requested_note: input.note,
    requested_operation_id: input.operationId,
    requested_receipt_channel: receipt.receiptChannel,
  };
}

export function normalizeSalePaymentAccountingLink(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const row = input as {
    id?: unknown;
    journal_entry_id?: unknown;
    journal_entries?: { entry_number?: unknown } | { entry_number?: unknown }[] | null;
  };
  const cashbookEntryId = String(row.id ?? "").trim();
  const journalEntryId = String(row.journal_entry_id ?? "").trim();
  if (!cashbookEntryId || !journalEntryId) return null;
  const relatedJournal = Array.isArray(row.journal_entries)
    ? row.journal_entries[0]
    : row.journal_entries;
  return {
    cashbookEntryId,
    journalEntryId,
    journalEntryNumber: String(relatedJournal?.entry_number ?? "").trim() || null,
  };
}

export function formatReceiptMethodForAccounting(exactMethodValue: unknown, channelValue: unknown) {
  const exactMethod = String(exactMethodValue ?? "").trim().toLowerCase();
  const channel = String(channelValue ?? "").trim().toLowerCase();
  const channelLabel = channel === "mfs"
    ? "MFS"
    : channel ? channel[0].toUpperCase() + channel.slice(1) : "Unclassified";
  if (!exactMethod || exactMethod === channel) return channelLabel;
  const exactLabel = exactMethod
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
  return `${exactLabel} (${channelLabel})`;
}
