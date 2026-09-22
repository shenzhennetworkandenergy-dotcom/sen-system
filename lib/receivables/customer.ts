export const CUSTOMER_PAYMENT_STATUSES = [
  "unpaid",
  "partially_paid",
  "paid",
] as const;

export const CUSTOMER_RECEIVABLES_STATUSES = [
  "paid",
  "current",
  "due_soon",
  "overdue",
  "no_due_date",
] as const;

export const CUSTOMER_AGING_BUCKETS = [
  "paid",
  "not_yet_due",
  "due_today",
  "1_30_days_overdue",
  "31_60_days_overdue",
  "61_90_days_overdue",
  "90_plus_days_overdue",
  "no_due_date",
] as const;

export type CustomerReceivablesListParams = {
  q?: string;
  page?: string;
  pageSize?: string;
  paymentStatus?: string;
  receivablesStatus?: string;
  agingBucket?: string;
  dueFrom?: string;
  dueTo?: string;
  salesperson?: string;
  outstandingOnly?: string;
};

const cleanSearch = (value: string | undefined, length: number) =>
  String(value ?? "")
    .trim()
    .slice(0, length)
    .replace(/[%,().]/g, " ")
    .replace(/\s+/g, " ");

const cleanEnum = <T extends readonly string[]>(
  value: string | undefined,
  allowed: T,
) => (allowed.includes(String(value ?? "") as T[number]) ? String(value) : "");

const cleanDate = (value: string | undefined) => {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
};

export function normalizeCustomerReceivablesParams(
  params: CustomerReceivablesListParams,
) {
  return {
    page: Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
    pageSize: Math.min(
      100,
      Math.max(10, Number.parseInt(params.pageSize ?? "25", 10) || 25),
    ),
    search: cleanSearch(params.q, 80),
    paymentStatus: cleanEnum(params.paymentStatus, CUSTOMER_PAYMENT_STATUSES),
    receivablesStatus: cleanEnum(
      params.receivablesStatus,
      CUSTOMER_RECEIVABLES_STATUSES,
    ),
    agingBucket: cleanEnum(params.agingBucket, CUSTOMER_AGING_BUCKETS),
    dueFrom: cleanDate(params.dueFrom),
    dueTo: cleanDate(params.dueTo),
    salesperson: cleanSearch(params.salesperson, 80),
    outstandingOnly: params.outstandingOnly === "1",
  };
}

export type CustomerSummary = {
  customerId: string;
  customerName: string | null;
  companyName: string | null;
  currency: string;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  totalOverdue: number;
  receivableCount: number;
};

export function mergeCustomerSummaryRows(rows: CustomerSummary[]) {
  const merged = new Map<string, CustomerSummary>();
  for (const row of rows) {
    const currency = row.currency.toUpperCase();
    const key = `${row.customerId}:${currency}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...row, currency });
      continue;
    }
    current.totalInvoiced += row.totalInvoiced;
    current.totalPaid += row.totalPaid;
    current.totalOutstanding += row.totalOutstanding;
    current.totalOverdue += row.totalOverdue;
    current.receivableCount += row.receivableCount;
  }
  return [...merged.values()].sort(
    (left, right) =>
      left.customerName?.localeCompare(right.customerName ?? "") ||
      left.currency.localeCompare(right.currency),
  );
}

export type CustomerMetric = {
  currency: string;
  customerOutstanding: number;
  currentOutstanding: number;
  dueToday: number;
  dueNext7Days: number;
  overdue: number;
  noDueDate: number;
  collectedThisMonth: number;
  recordCount: number;
};

export function mergeCustomerMetricRows(rows: CustomerMetric[]) {
  const merged = new Map<string, CustomerMetric>();
  for (const row of rows) {
    const currency = row.currency.toUpperCase();
    const current = merged.get(currency);
    if (!current) {
      merged.set(currency, { ...row, currency });
      continue;
    }
    current.customerOutstanding += row.customerOutstanding;
    current.currentOutstanding += row.currentOutstanding;
    current.dueToday += row.dueToday;
    current.dueNext7Days += row.dueNext7Days;
    current.overdue += row.overdue;
    current.noDueDate += row.noDueDate;
    current.collectedThisMonth += row.collectedThisMonth;
    current.recordCount += row.recordCount;
  }
  return [...merged.values()].sort((left, right) =>
    left.currency.localeCompare(right.currency),
  );
}
