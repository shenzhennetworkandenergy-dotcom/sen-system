export const QUOTATION_PAGE_SIZE = 6;

export type QuotationAmountItem = {
  quantity: number;
  target_price?: number | null;
  unit_price?: number | null;
  line_total?: number | null;
};

export type QuotationStoredTotals = {
  subtotal?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  total_amount?: number | null;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function paginateQuotationItems<T>(
  items: readonly T[],
  pageSize = QUOTATION_PAGE_SIZE,
): T[][] {
  if (!items.length) {
    return [[]];
  }

  return Array.from(
    { length: Math.ceil(items.length / pageSize) },
    (_, index) => items.slice(index * pageSize, (index + 1) * pageSize),
  );
}

export function resolveQuotationItemAmounts(item: QuotationAmountItem): {
  unitPrice: number;
  lineTotal: number;
} {
  const unitPrice = Number(item.unit_price ?? item.target_price ?? 0);
  const lineTotal = Number(
    item.line_total ?? unitPrice * Number(item.quantity || 0),
  );

  return {
    unitPrice: roundMoney(unitPrice),
    lineTotal: roundMoney(lineTotal),
  };
}

export function resolveQuotationTotals(
  quotation: QuotationStoredTotals,
  items: readonly QuotationAmountItem[],
): {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
} {
  const calculatedSubtotal = items.reduce(
    (sum, item) => sum + resolveQuotationItemAmounts(item).lineTotal,
    0,
  );
  const subtotal = Number(quotation.subtotal ?? calculatedSubtotal);
  const discount = Number(quotation.discount_amount ?? 0);
  const tax = Number(quotation.tax_amount ?? 0);
  const total = Number(
    quotation.total_amount ?? subtotal - discount + tax,
  );

  return {
    subtotal: roundMoney(subtotal),
    discount: roundMoney(discount),
    tax: roundMoney(tax),
    total: roundMoney(total),
  };
}
