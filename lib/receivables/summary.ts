export type ReceivablesSummaryRow = {
  sourceType: "customer_sale" | "non_sales";
  sourceId: string;
  currency: string;
  outstandingAmount: number;
  dueDate: string | null;
  lastActivityDate: string | null;
};

export type ReceivablesCurrencySummary = {
  currency: string;
  totalOutstanding: number;
  customerOutstanding: number;
  nonSalesOutstanding: number;
  dueToday: number;
  dueThisWeek: number;
  overdue: number;
  recordCount: number;
};

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function summarizeReceivablesRows(
  rows: ReceivablesSummaryRow[],
  today: string,
) {
  const weekEnd = addDays(today, 7);
  const summaries = new Map<string, ReceivablesCurrencySummary>();
  const outstandingRows = rows.filter(
    (row) => Number.isFinite(row.outstandingAmount) && row.outstandingAmount > 0,
  );

  for (const row of outstandingRows) {
    const currency = row.currency.toUpperCase();
    const summary = summaries.get(currency) ?? {
      currency,
      totalOutstanding: 0,
      customerOutstanding: 0,
      nonSalesOutstanding: 0,
      dueToday: 0,
      dueThisWeek: 0,
      overdue: 0,
      recordCount: 0,
    };
    summary.totalOutstanding += row.outstandingAmount;
    if (row.sourceType === "customer_sale") {
      summary.customerOutstanding += row.outstandingAmount;
    } else {
      summary.nonSalesOutstanding += row.outstandingAmount;
    }
    if (row.dueDate === today) summary.dueToday += row.outstandingAmount;
    if (row.dueDate && row.dueDate >= today && row.dueDate <= weekEnd) {
      summary.dueThisWeek += row.outstandingAmount;
    }
    if (row.dueDate && row.dueDate < today) summary.overdue += row.outstandingAmount;
    summary.recordCount += 1;
    summaries.set(currency, summary);
  }

  return {
    byCurrency: [...summaries.values()].sort((left, right) =>
      left.currency.localeCompare(right.currency),
    ),
    recent: [...outstandingRows]
      .sort((left, right) =>
        (right.lastActivityDate ?? "").localeCompare(left.lastActivityDate ?? ""),
      )
      .slice(0, 8),
  };
}
