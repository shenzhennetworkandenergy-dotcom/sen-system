type DiscountItem = {
  line_discount?: unknown;
  discount_amount?: unknown;
};

const money = (value: number) =>
  Math.round((Math.max(0, value) + Number.EPSILON) * 100) / 100;

export function calculateDocumentDiscounts(
  items: DiscountItem[],
  orderDiscount: unknown,
) {
  const lineDiscount = money(
    items.reduce(
      (sum, item) =>
        sum +
        Math.max(
          0,
          Number(item.line_discount ?? item.discount_amount ?? 0) || 0,
        ),
      0,
    ),
  );
  const normalizedOrderDiscount = money(Number(orderDiscount ?? 0) || 0);
  return {
    lineDiscount,
    orderDiscount: normalizedOrderDiscount,
    totalDiscount: money(lineDiscount + normalizedOrderDiscount),
  };
}
