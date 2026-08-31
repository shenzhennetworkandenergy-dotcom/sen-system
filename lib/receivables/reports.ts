import {
  normalizeDhakaDateRange,
  normalizeReportingCurrency,
  normalizeReportingListParams,
  normalizeReportingSearch,
  type DhakaDateRange,
} from "./reporting.ts";

/** Report-level due states.  These are presentation states, not Sales status values. */
export const REPORT_DUE_STATUSES = [
  "not_yet_due",
  "due_today",
  "due_soon",
  "overdue",
  "no_due_date",
  "paid",
] as const;
export type ReportDueStatus = (typeof REPORT_DUE_STATUSES)[number];

export const REPORT_AGING_BUCKETS = [
  "not_yet_due",
  "due_today",
  "1_30_days_overdue",
  "31_60_days_overdue",
  "61_90_days_overdue",
  "90_plus_days_overdue",
  "no_due_date",
  "paid",
] as const;
export type ReportAgingBucket = (typeof REPORT_AGING_BUCKETS)[number];

export const REPORT_SOURCES = [
  "all",
  "customer_sales",
  "customer_collection",
  "customer_refund",
  "non_sales",
  "non_sales_repayment",
  "non_sales_adjustment",
  "non_sales_opening",
  "non_sales_disbursement",
  "reversal",
] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export type ReconciliationReportFieldPolicy = {
  includeAccountingReferences: boolean;
  excludePayrollLinkedRows: boolean;
};

/**
 * Decide which reconciliation projection is safe for the resolved actor.
 * Accounting authority is sufficient for ordinary journal/Cash Book
 * references; Payroll authority controls whether Payroll-linked rows may be
 * included.  The server DAL still applies the row exclusion at query time.
 */
export function reconciliationReportFieldPolicy(input: {
  canViewAccountingDetails: boolean;
  canViewPayrollDetails: boolean;
}): ReconciliationReportFieldPolicy {
  return {
    includeAccountingReferences: input.canViewAccountingDetails,
    excludePayrollLinkedRows: !input.canViewPayrollDetails,
  };
}

export type ReceivablesReportParamsInput = {
  q?: string | null;
  page?: string | number | null;
  pageSize?: string | number | null;
  currency?: string | null;
  from?: string | null;
  to?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  dueFrom?: string | null;
  dueTo?: string | null;
  customerId?: string | null;
  accountId?: string | null;
  salesperson?: string | null;
  borrower?: string | null;
  category?: string | null;
  status?: string | null;
  dueStatus?: string | null;
  agingBucket?: string | null;
  source?: string | null;
  paymentMethod?: string | null;
  postingStatus?: string | null;
  accountingTreatment?: string | null;
  movementType?: string | null;
  includeAdjustments?: string | boolean | null;
  outstandingOnly?: string | boolean | null;
};

export type ReceivablesReportParams = {
  page: number;
  pageSize: number;
  search: string;
  currency: string;
  fromDate: string | null;
  toDate: string | null;
  dateRange: DhakaDateRange;
  dueFrom: string | null;
  dueTo: string | null;
  customerId: string;
  accountId: string;
  salesperson: string;
  borrower: string;
  category: string;
  status: string;
  dueStatus: ReportDueStatus | "";
  agingBucket: ReportAgingBucket | "";
  source: ReportSource;
  paymentMethod: string;
  postingStatus: string;
  accountingTreatment: string;
  movementType: string;
  includeAdjustments: boolean;
  outstandingOnly: boolean;
};

/**
 * Return normalized filters that a particular report family cannot apply.
 * Report routes can expose these names instead of silently pretending that a
 * filter was applied. The names are canonical server-side parameter names.
 */
export function unsupportedReceivablesReportFilters(
  params: ReceivablesReportParams,
  supported: readonly string[],
): string[] {
  const active: Array<[string, unknown]> = [
    ["search", params.search],
    ["currency", params.currency],
    ["fromDate", params.fromDate],
    ["toDate", params.toDate],
    ["dueFrom", params.dueFrom],
    ["dueTo", params.dueTo],
    ["customerId", params.customerId],
    ["accountId", params.accountId],
    ["salesperson", params.salesperson],
    ["borrower", params.borrower],
    ["category", params.category],
    ["status", params.status],
    ["dueStatus", params.dueStatus],
    ["agingBucket", params.agingBucket],
    ["source", params.source === "all" ? "" : params.source],
    ["paymentMethod", params.paymentMethod],
    ["postingStatus", params.postingStatus],
    ["accountingTreatment", params.accountingTreatment],
    ["movementType", params.movementType],
    ["includeAdjustments", params.includeAdjustments],
    ["outstandingOnly", params.outstandingOnly],
  ];
  const supportedSet = new Set(supported);
  return active
    .filter(([name, value]) => Boolean(value) && !supportedSet.has(name))
    .map(([name]) => name);
}

const enumValue = <T extends readonly string[]>(value: unknown, allowed: T): "" | T[number] => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return allowed.includes(normalized as T[number]) ? normalized as T[number] : "";
};

const boundedText = (value: unknown, max = 80) => String(value ?? "").trim().slice(0, max);

/** Normalize all report filters once, retaining the shared Phase 6A bounds. */
export function normalizeReceivablesReportParams(
  input: ReceivablesReportParamsInput,
): ReceivablesReportParams {
  const from = input.from ?? input.dateFrom ?? null;
  const to = input.to ?? input.dateTo ?? null;
  // `from`/`to` are the report event/issue date range.  Due-date filters are
  // independent and are only populated by the explicit dueFrom/dueTo names.
  // Keeping these ranges separate prevents a generic activity date from
  // accidentally narrowing a due-date report (and avoids false unsupported
  // filter warnings on statement/activity pages).
  const shared = normalizeReportingListParams({
    q: input.q,
    page: input.page,
    pageSize: input.pageSize,
    currency: input.currency,
  });
  const dateRange = normalizeDhakaDateRange({ from, to });
  const dueRange = normalizeDhakaDateRange({
    from: input.dueFrom,
    to: input.dueTo,
  });
  const dueStatus = enumValue(input.dueStatus, REPORT_DUE_STATUSES);
  const agingBucket = enumValue(input.agingBucket, REPORT_AGING_BUCKETS);
  const source = enumValue(input.source, REPORT_SOURCES) || "all";
  const includeAdjustments = input.includeAdjustments === true
    || input.includeAdjustments === "true"
    || input.includeAdjustments === "1";
  return {
    page: shared.page,
    pageSize: shared.pageSize,
    search: normalizeReportingSearch(shared.search),
    currency: normalizeReportingCurrency(shared.currency),
    fromDate: dateRange.fromDate,
    toDate: dateRange.toDate,
    dateRange,
    dueFrom: dueRange.fromDate,
    dueTo: dueRange.toDate,
    customerId: boundedText(input.customerId, 80),
    accountId: boundedText(input.accountId, 80),
    salesperson: normalizeReportingSearch(input.salesperson),
    borrower: normalizeReportingSearch(input.borrower),
    category: boundedText(input.category, 60).toLowerCase(),
    status: boundedText(input.status, 60).toLowerCase(),
    dueStatus,
    agingBucket,
    source,
    paymentMethod: boundedText(input.paymentMethod, 60).toLowerCase(),
    postingStatus: boundedText(input.postingStatus, 60).toLowerCase(),
    accountingTreatment: boundedText(input.accountingTreatment, 80).toLowerCase(),
    movementType: boundedText(input.movementType, 60).toLowerCase(),
    includeAdjustments,
    outstandingOnly: input.outstandingOnly === true
      || input.outstandingOnly === "true"
      || input.outstandingOnly === "1",
  };
}

function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Return the current business date independent of the host/session timezone. */
export function getDhakaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function dayDifference(later: string, earlier: string) {
  const [ly, lm, ld] = later.split("-").map(Number);
  const [ey, em, ed] = earlier.split("-").map(Number);
  return Math.round((Date.UTC(ly, lm - 1, ld) - Date.UTC(ey, em - 1, ed)) / 86_400_000);
}

export type CustomerReportClassification = {
  dueStatus: ReportDueStatus;
  agingBucket: ReportAgingBucket;
  daysOverdue: number | null;
};

/** Derive report labels from the authoritative due date and outstanding amount. */
export function classifyCustomerReceivableForReport(input: {
  outstandingAmount: number;
  dueDate: string | null;
  today: string;
}): CustomerReportClassification {
  if (!Number.isFinite(input.outstandingAmount) || input.outstandingAmount <= 0) {
    return { dueStatus: "paid", agingBucket: "paid", daysOverdue: null };
  }
  if (!input.dueDate) {
    return { dueStatus: "no_due_date", agingBucket: "no_due_date", daysOverdue: null };
  }
  const delta = dayDifference(input.today, input.dueDate);
  if (delta > 0) {
    const agingBucket: ReportAgingBucket = delta <= 30
      ? "1_30_days_overdue"
      : delta <= 60
        ? "31_60_days_overdue"
        : delta <= 90
          ? "61_90_days_overdue"
          : "90_plus_days_overdue";
    return { dueStatus: "overdue", agingBucket, daysOverdue: delta };
  }
  if (delta === 0) {
    return { dueStatus: "due_today", agingBucket: "due_today", daysOverdue: 0 };
  }
  return {
    dueStatus: input.dueDate <= addCalendarDays(input.today, 7) ? "due_soon" : "not_yet_due",
    agingBucket: "not_yet_due",
    daysOverdue: null,
  };
}

export type AgingReportRow = {
  currency: string;
  agingBucket: string;
  outstandingAmount: number;
};

export type AgingCurrencySummary = {
  currency: string;
  totalOutstanding: number;
  buckets: Record<string, number>;
};

export function groupAgingTotalsByCurrency(rows: readonly AgingReportRow[]): AgingCurrencySummary[] {
  const grouped = new Map<string, AgingCurrencySummary>();
  for (const row of rows) {
    const amount = Number(row.outstandingAmount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const bucket = String(row.agingBucket);
    if (bucket === "paid") continue;
    const currency = normalizeReportingCurrency(row.currency);
    if (!currency) throw new RangeError("A valid three-letter currency code is required.");
    const summary = grouped.get(currency) ?? { currency, totalOutstanding: 0, buckets: {} };
    summary.totalOutstanding += amount;
    summary.buckets[bucket] = (summary.buckets[bucket] ?? 0) + amount;
    grouped.set(currency, summary);
  }
  return [...grouped.values()]
    .map((summary) => ({
      ...summary,
      totalOutstanding: roundAmount(summary.totalOutstanding),
      buckets: Object.fromEntries(
        Object.entries(summary.buckets).map(([key, value]) => [key, roundAmount(value)]),
      ),
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

export type SalesPaymentReportInput = {
  id: string;
  saleId: string;
  date: string;
  status: string;
  amount: number;
  method?: string | null;
  reference?: string | null;
};

export type SalesPaymentReportEvent = SalesPaymentReportInput & {
  type: "payment" | "refund";
};

/**
 * Present Sales payments without assuming that every legacy `refunded` row is
 * an independent refund event. The current Sales source of truth stores the
 * authoritative net paid amount on the Sale, but does not link a refund row to
 * its original payment. Received rows remain visible as collections; refunded
 * rows are applied only up to the proven difference between received activity
 * and the Sale's net paid amount.
 */
export function buildAuthoritativeSalesPaymentEvents(
  payments: readonly SalesPaymentReportInput[],
  netPaidBySale: ReadonlyMap<string, number>,
): SalesPaymentReportEvent[] {
  const grouped = new Map<string, SalesPaymentReportInput[]>();
  for (const payment of payments) {
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const status = payment.status.trim().toLowerCase();
    if (status !== "received" && status !== "refunded") continue;
    const list = grouped.get(payment.saleId) ?? [];
    list.push({ ...payment, amount, status });
    grouped.set(payment.saleId, list);
  }

  const events: SalesPaymentReportEvent[] = [];
  for (const [saleId, salePayments] of grouped) {
    const ordered = [...salePayments].sort((left, right) =>
      left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
    );
    const received = ordered.filter((payment) => payment.status === "received");
    const receivedTotal = received.reduce((total, payment) => total + payment.amount, 0);
    for (const payment of received) events.push({ ...payment, type: "payment" });

    const netPaid = Number(netPaidBySale.get(saleId));
    // When a net snapshot is unavailable, no separate refund effect is proven.
    let remainingRefund = Number.isFinite(netPaid)
      ? Math.max(receivedTotal - Math.max(netPaid, 0), 0)
      : 0;
    for (const payment of ordered.filter((item) => item.status === "refunded")) {
      if (remainingRefund <= 0) break;
      const amount = Math.min(payment.amount, remainingRefund);
      if (amount > 0) events.push({ ...payment, amount: roundAmount(amount), type: "refund" });
      remainingRefund = roundAmount(remainingRefund - amount);
    }
  }
  return events.sort((left, right) =>
    left.date.localeCompare(right.date)
      || (left.type === right.type ? 0 : left.type === "payment" ? -1 : 1)
      || left.id.localeCompare(right.id),
  );
}

export type StatementInput = {
  id: string;
  date: string;
  type: string;
  direction: "increase" | "decrease";
  amount: number;
  currency: string;
  label?: string;
  reference?: string | null;
  reversalOfId?: string | null;
  periodClass?: StatementPeriodClass;
  metadata?: Record<string, unknown>;
};

export type StatementPeriodClass =
  | "opening"
  | "disbursement"
  | "collection"
  | "adjustment"
  | "reversal"
  | "invoice"
  | "refund";

export type StatementRow = StatementInput & {
  currency: string;
  amount: number;
  runningBalance: number;
  label: string;
  periodClass: StatementPeriodClass;
  reversalOfId: string | null;
};

/**
 * Keep the document label honest when a confirmed Sale has not produced an
 * invoice document yet.  The Sale remains in the same derived statement; only
 * its presentation label changes so an issue-date fallback is not mistaken for
 * an invoice date.
 */
export function customerStatementSaleLabel(
  invoiceNumber: string | null | undefined,
  invoiceDate: string | null | undefined,
): "Invoice" | "Sale (not invoiced)" {
  return invoiceNumber?.trim() || invoiceDate?.trim()
    ? "Invoice"
    : "Sale (not invoiced)";
}

const statementRank: Record<string, number> = {
  opening_balance: 0,
  invoice: 1,
  disbursement: 1,
  repayment: 2,
  payment: 2,
  adjustment_increase: 2,
  adjustment_decrease: 2,
  refund: 3,
  reversal: 4,
};

function statementLabel(type: string, explicit?: string) {
  if (explicit) return explicit;
  if (type === "opening_balance") return "Historical Opening Balance";
  if (type === "disbursement") return "Disbursement";
  if (type === "repayment") return "Repayment";
  if (type === "adjustment_increase") return "Adjustment Increase";
  if (type === "adjustment_decrease") return "Adjustment";
  if (type === "reversal") return "Reversal";
  if (type === "invoice") return "Invoice";
  if (type === "refund") return "Refund";
  if (type === "payment") return "Payment";
  return type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statementClass(type: string, explicit?: StatementPeriodClass): StatementPeriodClass {
  if (explicit) return explicit;
  if (type === "opening_balance") return "opening";
  if (type === "disbursement") return "disbursement";
  if (type === "repayment") return "collection";
  if (type === "adjustment_increase" || type === "adjustment_decrease") return "adjustment";
  if (type === "reversal") return "reversal";
  if (type === "invoice") return "invoice";
  if (type === "refund") return "refund";
  return "collection";
}

function roundAmount(value: number) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

/** Build a deterministic statement for one currency; mixed currencies are rejected. */
export function buildStatementRows(events: readonly StatementInput[]): StatementRow[] {
  if (!events.length) return [];
  const normalizedCurrencies = events.map((event) => normalizeReportingCurrency(event.currency));
  if (normalizedCurrencies.some((currency) => !currency)) {
    throw new RangeError("A valid three-letter currency code is required.");
  }
  const currencies = new Set(normalizedCurrencies);
  if (currencies.size > 1) throw new RangeError("A statement must be grouped by currency.");
  const sorted = [...events].sort((left, right) =>
    left.date.localeCompare(right.date)
      || (statementRank[left.type] ?? 9) - (statementRank[right.type] ?? 9)
      || left.id.localeCompare(right.id),
  );
  let balance = 0;
  return sorted.map((event) => {
    const amount = Number(event.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError("Statement amount must be finite and non-negative.");
    balance += event.direction === "increase" ? amount : -amount;
    return {
      ...event,
      amount: roundAmount(amount),
      currency: normalizeReportingCurrency(event.currency),
      runningBalance: roundAmount(balance),
      label: statementLabel(event.type, event.label),
      periodClass: statementClass(event.type, event.periodClass),
      reversalOfId: event.reversalOfId ?? null,
    };
  });
}

/**
 * Apply one global page window while retaining separate currency groups.
 * Statement rows are already fully derived (and bounded) before this helper is
 * called, so running balances remain currency-local and page boundaries never
 * return more than the requested page size across all currencies.
 */
export function paginateStatementGroups<
  T,
  G extends { currency: string; rows: readonly T[] },
>(
  groups: readonly G[],
  page: number,
  pageSize: number,
): {
  groups: Array<Omit<G, "rows"> & { rows: T[]; totalRows: number }>;
  totalRows: number;
  hasNextPage: boolean;
} {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 1;
  const offset = (safePage - 1) * safePageSize;
  const end = offset + safePageSize;
  let cursor = 0;
  let totalRows = 0;
  const pagedGroups = groups.map((group) => {
    const groupRows = group.rows;
    const groupStart = Math.max(0, offset - cursor);
    const groupEnd = Math.min(groupRows.length, end - cursor);
    const rows = groupStart < groupEnd
      ? groupRows.slice(groupStart, groupEnd)
      : [];
    cursor += groupRows.length;
    totalRows += groupRows.length;
    return {
      ...group,
      rows,
      totalRows: groupRows.length,
    } as Omit<G, "rows"> & { rows: T[]; totalRows: number };
  });
  return {
    groups: pagedGroups,
    totalRows,
    hasNextPage: end < totalRows,
  };
}

export type InstallmentReportStatus = "upcoming" | "due_today" | "partial" | "overdue" | "paid";

export function classifyInstallmentForReport(input: {
  status: string;
  dueDate: string;
  paidAmount: number;
  remainingAmount: number;
  today: string;
}): InstallmentReportStatus {
  if (input.remainingAmount <= 0 || input.status === "paid") return "paid";
  if (input.dueDate < input.today) return "overdue";
  if (input.paidAmount > 0 || input.status === "partial") return "partial";
  if (input.dueDate === input.today) return "due_today";
  return "upcoming";
}

export type ActivityKind =
  | "customer_collection"
  | "customer_refund"
  | "non_sales_repayment"
  | "non_sales_opening"
  | "non_sales_disbursement"
  | "non_sales_other"
  | "non_cash_adjustment"
  | "reversal";

export function classifyReceivableActivity(input: {
  sourceType: "customer_sale" | "non_sales";
  transactionType: string;
  status?: string;
}): ActivityKind {
  const transactionType = input.transactionType.trim().toLowerCase();
  if (transactionType === "reversal") return "reversal";
  if (input.sourceType === "customer_sale") {
    return transactionType === "refund" || input.status?.trim().toLowerCase() === "refunded"
      ? "customer_refund"
      : "customer_collection";
  }
  if (transactionType === "repayment") return "non_sales_repayment";
  if (transactionType === "opening_balance") return "non_sales_opening";
  if (transactionType === "disbursement") return "non_sales_disbursement";
  if (transactionType === "adjustment_increase" || transactionType === "adjustment_decrease") {
    return "non_cash_adjustment";
  }
  // Unknown future movement types must not be reported as adjustments (which
  // are often interpreted as recoveries). Keep them visible but separate.
  return "non_sales_other";
}

/**
 * Keep reversal relationships useful for operational viewers while hiding an
 * identifier when the row itself is linked to protected Payroll/Accounting
 * detail. The source/payment values are the canonical redacted values emitted
 * by the Phase 6A sanitizer (``payroll-linked``/``financial-linked``).
 */
export function sanitizeReportingReversalReference(input: {
  reversalOfId: string | null | undefined;
  source?: string | null;
  paymentMethod?: string | null;
  /** Classification of the original transaction, when the caller resolved it safely. */
  relatedSource?: string | null;
  relatedPaymentMethod?: string | null;
  canViewAccountingDetails: boolean;
  canViewPayrollDetails: boolean;
}): string | null {
  if (!input.reversalOfId) return null;
  const source = String(input.source ?? "").trim().toLowerCase();
  const paymentMethod = String(input.paymentMethod ?? "").trim().toLowerCase();
  const relatedSource = String(input.relatedSource ?? "").trim().toLowerCase();
  const relatedPaymentMethod = String(input.relatedPaymentMethod ?? "").trim().toLowerCase();
  const accountingAlias = (value: string) => {
    const normalized = value.replace(/[^a-z0-9]+/g, "_");
    return normalized.includes("accounting")
      || normalized.includes("journal")
      || normalized.includes("cashbook")
      || normalized.includes("cash_book")
      || normalized.includes("posting");
  };
  const payrollLinked = source === "payroll-linked"
    || paymentMethod === "payroll-linked"
    || source.includes("payroll")
    || paymentMethod.includes("payroll")
    || /salary[\s_-]*deduction/.test(paymentMethod)
    || relatedSource.includes("payroll")
    || relatedPaymentMethod.includes("payroll")
    || /salary[\s_-]*deduction/.test(relatedPaymentMethod);
  const accountingLinked = source === "financial-linked"
    || accountingAlias(source)
    || accountingAlias(relatedSource)
    || accountingAlias(paymentMethod)
    || accountingAlias(relatedPaymentMethod);
  if ((payrollLinked && !input.canViewPayrollDetails)
      || (accountingLinked && !input.canViewAccountingDetails)) {
    return null;
  }
  return String(input.reversalOfId);
}

export type ActivitySummary = {
  currency: string;
  customerCollections: number;
  nonSalesRepayments: number;
  adjustments: number;
  refunds: number;
  /** Present only when at least one reversal exists in the group. */
  reversals?: number;
  /** Present only when an opening movement exists in the group. */
  openingBalances?: number;
  /** Present only when a disbursement movement exists in the group. */
  disbursements?: number;
};

export function summarizeActivityByCurrency(rows: readonly {
  currency: string;
  kind: ActivityKind;
  amount: number;
}[]): ActivitySummary[] {
  const grouped = new Map<string, ActivitySummary>();
  for (const row of rows) {
    const currency = normalizeReportingCurrency(row.currency);
    const amount = Number(row.amount);
    if (!currency || !Number.isFinite(amount)) throw new RangeError("Activity rows require a valid currency and amount.");
    const summary = grouped.get(currency) ?? { currency, customerCollections: 0, nonSalesRepayments: 0, adjustments: 0, refunds: 0 };
    if (row.kind === "customer_collection") summary.customerCollections += amount;
    else if (row.kind === "non_sales_repayment") summary.nonSalesRepayments += amount;
    else if (row.kind === "non_cash_adjustment") summary.adjustments += amount;
    else if (row.kind === "customer_refund") summary.refunds += amount;
    else if (row.kind === "reversal") summary.reversals = (summary.reversals ?? 0) + amount;
    else if (row.kind === "non_sales_opening") summary.openingBalances = (summary.openingBalances ?? 0) + amount;
    else if (row.kind === "non_sales_disbursement") summary.disbursements = (summary.disbursements ?? 0) + amount;
    // Opening/disbursement and unknown movements are intentionally omitted
    // from collection summaries; they remain visible as classified rows.
    grouped.set(currency, summary);
  }
  return [...grouped.values()]
    .map((summary) => Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, typeof value === "number" ? roundAmount(value) : value])) as ActivitySummary)
    .sort((left, right) => left.currency.localeCompare(right.currency));
}
