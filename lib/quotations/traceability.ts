import type { QuotationTraceabilityLookup } from "@/lib/quotations/access-policy";

type QueryResult<T> = { data: T | null; error: unknown | null };

type SourceQuotationRow = { id: string; reference: string };

export type SourceQuotation = SourceQuotationRow;
export type LinkedSale = { id: string; orderNumber: string };

export function getSaleSourceQuotationLink(sourceQuotation: SourceQuotation | null) {
  if (!sourceQuotation) return null;
  return {
    label: "Source Quotation",
    reference: sourceQuotation.reference,
    href: `/admin/quotations/${sourceQuotation.id}/manage`,
  };
}

export function getConvertedSaleLink(status: string, linkedSale: LinkedSale | null) {
  if (status !== "converted_to_sale" || !linkedSale) return null;
  return {
    label: "Converted Sale",
    number: linkedSale.orderNumber,
    href: `/admin/sales/${linkedSale.id}`,
  };
}

export function getLegacyInvoiceConversion(
  status: string,
  convertedOrderId: string | null,
  convertedInvoiceId: string | null,
) {
  if (status !== "converted_to_invoice") return null;
  const saleLink = convertedOrderId
    ? { label: "Open sales order", href: `/admin/sales/${convertedOrderId}` }
    : null;
  const invoiceLink = convertedOrderId && convertedInvoiceId
    ? {
      label: "Open sales invoice",
      href: `/admin/sales/${convertedOrderId}/documents/${convertedInvoiceId}`,
    }
    : null;
  return {
    title: "Converted to Invoice",
    description: "This quotation is locked and linked to its sales records.",
    saleLink,
    invoiceLink,
  };
}

export async function resolveSourceQuotation(
  lookup: QuotationTraceabilityLookup | null | undefined,
  read: (lookup: QuotationTraceabilityLookup) => PromiseLike<QueryResult<SourceQuotationRow>>,
): Promise<SourceQuotation | null> {
  if (!lookup) return null;

  let result: QueryResult<SourceQuotationRow>;
  try {
    result = await read(lookup);
  } catch {
    throw new Error("Unable to load source quotation.");
  }
  if (result.error) throw new Error("Unable to load source quotation.");
  return result.data ? { id: result.data.id, reference: result.data.reference } : null;
}

export async function resolveLinkedSale(
  convertedOrderId: string | null | undefined,
  read: (saleId: string) => PromiseLike<QueryResult<{ id: string; order_number: string }>>,
): Promise<LinkedSale | null> {
  if (!convertedOrderId) return null;

  let result: QueryResult<{ id: string; order_number: string }>;
  try {
    result = await read(convertedOrderId);
  } catch {
    throw new Error("Unable to load linked sale.");
  }
  if (result.error) throw new Error("Unable to load linked sale.");
  return result.data
    ? { id: result.data.id, orderNumber: result.data.order_number }
    : null;
}
