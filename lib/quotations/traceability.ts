import type { QuotationTraceabilityLookup } from "@/lib/quotations/access-policy";

type QueryResult<T> = { data: T | null; error: unknown | null };

type SourceQuotationRow = { id: string; reference: string };

export type SourceQuotation = SourceQuotationRow;
export type LinkedSale = { id: string; orderNumber: string };

export async function resolveSourceQuotation(
  lookup: QuotationTraceabilityLookup | null | undefined,
  read: (lookup: QuotationTraceabilityLookup) => PromiseLike<QueryResult<SourceQuotationRow>>,
): Promise<SourceQuotation | null> {
  if (!lookup) return null;

  const result = await read(lookup);
  if (result.error) throw new Error("Unable to load source quotation.");
  return result.data ? { id: result.data.id, reference: result.data.reference } : null;
}

export async function resolveLinkedSale(
  convertedOrderId: string | null | undefined,
  read: (saleId: string) => PromiseLike<QueryResult<{ id: string; order_number: string }>>,
): Promise<LinkedSale | null> {
  if (!convertedOrderId) return null;

  const result = await read(convertedOrderId);
  if (result.error) throw new Error("Unable to load linked sale.");
  return result.data
    ? { id: result.data.id, orderNumber: result.data.order_number }
    : null;
}
