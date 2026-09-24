export type SalesSummaryCard = readonly [name: string, value: string | number];

const employeeHiddenSummaryCards = new Set([
  "Today's sales",
  "This month",
  "Outstanding",
]);

export function visibleSalesSummaryCards(
  role: string,
  cards: readonly SalesSummaryCard[],
): readonly SalesSummaryCard[] {
  return role === "employee"
    ? cards.filter(([name]) => !employeeHiddenSummaryCards.has(name))
    : cards;
}
