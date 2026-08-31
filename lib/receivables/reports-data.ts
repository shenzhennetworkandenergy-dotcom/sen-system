import "server-only";

import { getReceivablesReportScope } from "@/lib/receivables/reporting-access";
import {
  buildStatementRows,
  buildAuthoritativeSalesPaymentEvents,
  classifyCustomerReceivableForReport,
  classifyInstallmentForReport,
  classifyReceivableActivity,
  customerStatementSaleLabel,
  getDhakaToday,
  groupAgingTotalsByCurrency,
  normalizeReceivablesReportParams,
  paginateStatementGroups,
  reconciliationReportFieldPolicy,
  sanitizeReportingReversalReference,
  summarizeActivityByCurrency,
  unsupportedReceivablesReportFilters,
  type ActivityKind,
  type AgingCurrencySummary,
  type ReceivablesReportParams,
  type StatementRow,
} from "@/lib/receivables/reports";
import {
  normalizeReportingCurrency,
  sanitizeReportingAccountingLink,
  sanitizeReportingRepaymentMethod,
  sanitizeReportingTransaction,
  type ReceivablesReportScope,
} from "@/lib/receivables/reporting";
import { mergeCustomerSummaryRows } from "@/lib/receivables/customer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const CUSTOMER_COLUMNS = [
  "source_id", "reference_number", "invoice_number", "invoice_date", "invoice_anchor_date",
  "customer_id", "customer_name", "company_name", "customer_email", "customer_phone", "party_name",
  "responsible_profile_id", "salesperson_name", "currency", "original_amount", "paid_amount",
  "refunded_amount", "outstanding_amount", "payment_status", "payment_terms_type", "credit_period_days",
  "payment_due_date", "due_date", "issue_date", "last_payment_date", "receivables_status", "aging_bucket",
  "days_overdue",
].join(",");

const NON_SALES_COLUMNS = [
  "id", "receivable_number", "category", "borrower_type", "borrower_display_name_snapshot", "currency",
  "requested_amount", "original_amount", "approved_amount", "opening_principal", "disbursed_amount",
  "repaid_amount", "adjustment_decrease_amount", "adjustment_increase_amount", "recovered_amount",
  "outstanding_amount", "default_repayment_method", "installment_count", "installment_amount",
  "first_due_date", "final_due_date", "disbursement_date", "status", "notes", "is_opening_balance",
  "opening_as_of_date", "opening_previously_repaid", "created_by", "approved_by", "approved_at",
  "disbursed_by", "disbursed_at", "created_at", "last_activity_date", "employee_record_id",
  "customer_profile_id", "supplier_id", "crm_company_id", "crm_contact_id", "external_party_id",
].join(",");

const TRANSACTION_COLUMNS = [
  "id", "receivable_account_id", "transaction_type", "direction", "amount", "effective_date",
  "payment_method", "source", "operation_id", "reversal_of_transaction_id", "notes", "metadata", "created_at",
].join(",");
const SAFE_TRANSACTION_COLUMNS = [
  "id", "receivable_account_id", "transaction_type", "direction", "amount", "effective_date",
  "payment_method", "source", "reversal_of_transaction_id", "created_at",
].join(",");
const RECONCILIATION_COLUMNS = [
  "receivable_account_id", "receivable_number", "borrower_name", "category", "currency",
  "receivable_transaction_id", "transaction_type", "direction", "amount", "effective_date",
  "payment_method", "source", "accounting_treatment", "posting_id", "posting_status",
  "posting_type", "posting_operation_id", "journal_entry_id", "journal_entry_number",
  "cashbook_entry_id", "accounting_date", "reversal_of_posting_id", "notes", "created_at",
].join(",");
const SAFE_RECONCILIATION_COLUMNS = [
  "receivable_account_id", "receivable_number", "borrower_name", "category", "currency",
  "receivable_transaction_id", "transaction_type", "direction", "amount", "effective_date",
  "payment_method", "source", "accounting_treatment", "posting_status", "posting_type", "notes", "created_at",
].join(",");
const CUSTOMER_METRIC_COLUMNS = [
  "currency", "responsible_profile_id", "customer_outstanding", "current_outstanding",
  "due_today", "due_next_7_days", "overdue", "no_due_date", "collected_this_month",
  "open_record_count",
].join(",");
const CUSTOMER_SUMMARY_COLUMNS = [
  "customer_id", "customer_name", "company_name", "customer_email", "customer_phone",
  "party_name", "currency", "responsible_profile_id", "total_invoiced", "total_paid",
  "total_outstanding", "total_overdue", "sale_count",
].join(",");
const NON_SALES_METRIC_COLUMNS = [
  "currency", "category", "account_count", "outstanding_amount", "due_today",
  "due_next_7_days", "overdue_amount", "recovered_this_month",
].join(",");
const NON_SALES_STATUS_COLUMNS = "id,currency,status,outstanding_amount";

const MAX_SOURCE_ROWS = 1000;
const MAX_STATEMENT_SALES = 500;
const MAX_STATEMENT_PAYMENTS = 2000;
const MAX_INSTALLMENT_ACCOUNTS = 500;

type RawRecord = Record<string, unknown>;

function value(row: RawRecord, key: string) {
  return row[key];
}

function asText(row: RawRecord, key: string, fallback = "") {
  const raw = value(row, key);
  return raw == null ? fallback : String(raw);
}

function asNullableText(row: RawRecord, key: string) {
  const raw = value(row, key);
  return raw == null || raw === "" ? null : String(raw);
}

function asNumber(row: RawRecord, key: string) {
  const number = Number(value(row, key) ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function netPaidSnapshot(row: RawRecord) {
  const raw = value(row, "paid_amount");
  if (raw == null || raw === "") return undefined;
  const number = Number(raw);
  return Number.isFinite(number) ? number : undefined;
}

function buildNetPaidBySale(sales: readonly RawRecord[]) {
  const snapshots = new Map<string, number>();
  for (const sale of sales) {
    const snapshot = netPaidSnapshot(sale);
    if (snapshot !== undefined) snapshots.set(asText(sale, "source_id"), snapshot);
  }
  return snapshots;
}

function errorMessage(context: string, error: { code?: string; message?: string } | null) {
  if (error) console.error(context, { code: error.code, message: error.message });
  return new Error(`Unable to load ${context.toLowerCase()}.`);
}

function customerAccess(access: ReceivablesReportScope) {
  return access.canViewReceivables && access.canViewCustomerReceivables && access.salesScope.kind !== "none";
}

function loanAccess(access: ReceivablesReportScope) {
  return access.canViewReceivables && access.canViewLoans;
}

function transactionColumnsForReport(access: ReceivablesReportScope) {
  // Accounting-linked operation identifiers, notes and metadata are not
  // fetched unless the caller has both protected-detail authorities. Payroll
  // metadata can exist on an otherwise Accounting-visible transaction, so a
  // caller missing either authority receives only the operational columns.
  // This is a query boundary, not merely a DTO/UI redaction.
  return access.canViewAccountingDetails && access.canViewPayrollDetails
    ? TRANSACTION_COLUMNS
    : SAFE_TRANSACTION_COLUMNS;
}

function reconciliationColumnsForReport(access: ReceivablesReportScope) {
  // Accounting authority is enough for ordinary posting/journal/Cash Book
  // references. Payroll-linked rows are excluded separately at the query
  // boundary when Payroll detail authority is absent.
  return reconciliationReportFieldPolicy(access).includeAccountingReferences
    ? RECONCILIATION_COLUMNS
    : SAFE_RECONCILIATION_COLUMNS;
}

function excludePayrollLinkedReconciliationRows<T extends {
  not(column: string, operator: string, value: string): T;
}>(query: T, access: ReceivablesReportScope) {
  if (!reconciliationReportFieldPolicy(access).excludePayrollLinkedRows) return query;
  // Payroll-linked reconciliation is a protected detail surface.  Exclude
  // it at the service-role query boundary (rather than fetching and masking
  // rows afterward), so counts and status totals cannot reveal payroll
  // activity to an Accounting-only viewer.
  return query
    .not("source", "ilike", "%payroll%")
    .not("payment_method", "ilike", "%payroll%")
    .not("payment_method", "ilike", "%salary%deduction%");
}

type ReversalContext = { source: string | null; paymentMethod: string | null };

/** Resolve only the classification of reversal targets; never fetch their sensitive metadata. */
async function loadReversalContexts(
  db: ReturnType<typeof createSupabaseAdminClient>,
  rows: readonly RawRecord[],
) {
  const ids = [...new Set(rows
    .map((row) => row.reversal_of_transaction_id ?? row.reversalOfTransactionId)
    .filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, MAX_SOURCE_ROWS);
  const contexts = new Map<string, ReversalContext>();
  if (!ids.length) return contexts;
  const result = await db.from("receivable_transactions")
    .select("id,source,payment_method")
    .in("id", ids);
  if (result.error) throw errorMessage("reversal context", result.error);
  for (const row of (result.data ?? []) as unknown as RawRecord[]) {
    contexts.set(asText(row, "id"), {
      source: asNullableText(row, "source"),
      paymentMethod: asNullableText(row, "payment_method"),
    });
  }
  return contexts;
}

function emptyPage<T>(params: ReceivablesReportParams, unsupportedFilters: string[] = []) {
  return {
    rows: [] as T[],
    count: 0,
    page: params.page,
    pageSize: params.pageSize,
    filters: params,
    unsupportedFilters,
    truncated: false,
  };
}

const CUSTOMER_REPORT_FILTERS = [
  "search", "currency", "fromDate", "toDate", "dueFrom", "dueTo", "customerId",
  "salesperson", "status", "dueStatus", "agingBucket", "outstandingOnly",
] as const;
const CUSTOMER_STATEMENT_FILTERS = ["search", "currency", "fromDate", "toDate", "customerId"] as const;
const NON_SALES_STATEMENT_FILTERS = [
  "currency", "fromDate", "toDate", "accountId", "source", "paymentMethod", "movementType",
] as const;
const INSTALLMENT_REPORT_FILTERS = [
  "search", "currency", "fromDate", "toDate", "dueFrom", "dueTo", "accountId", "borrower", "category", "status",
  "dueStatus", "agingBucket", "outstandingOnly",
] as const;
const ACTIVITY_REPORT_FILTERS = [
  "search", "currency", "fromDate", "toDate", "customerId", "accountId", "salesperson",
  "borrower", "category", "source", "paymentMethod", "movementType", "includeAdjustments",
] as const;
const RECONCILIATION_REPORT_FILTERS = [
  "search", "currency", "fromDate", "toDate", "category", "paymentMethod", "postingStatus",
  "accountingTreatment", "movementType",
] as const;

function unsupportedFilters(params: ReceivablesReportParams, supported: readonly string[]) {
  return unsupportedReceivablesReportFilters(params, supported);
}

function activityLabel(kind: ActivityKind) {
  switch (kind) {
    case "customer_collection": return "Customer collection";
    case "customer_refund": return "Customer refund";
    case "non_sales_repayment": return "Receivable repayment";
    case "non_sales_opening": return "Opening balance";
    case "non_sales_disbursement": return "Receivable disbursement";
    case "reversal": return "Reversal";
    case "non_cash_adjustment": return "Non-cash adjustment";
    case "non_sales_other": return "Receivable activity";
  }
}

export type CustomerOutstandingReportRow = {
  sourceId: string;
  referenceNumber: string;
  invoiceNumber: string | null;
  customerId: string;
  customerName: string | null;
  companyName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  partyName: string;
  salespersonName: string;
  responsibleProfileId: string;
  currency: string;
  invoiceDate: string | null;
  invoiceTotal: number;
  paidAmount: number;
  refundedAmount: number;
  outstandingAmount: number;
  paymentStatus: string;
  paymentTermsType: string | null;
  creditPeriodDays: number | null;
  dueDate: string | null;
  dueStatus: string;
  agingBucket: string;
  daysOverdue: number | null;
  lastPaymentDate: string | null;
  issueDate: string;
};

function mapCustomerRow(row: RawRecord, today = getDhakaToday()): CustomerOutstandingReportRow {
  const outstandingAmount = asNumber(row, "outstanding_amount");
  const dueDate = asNullableText(row, "due_date");
  const classification = classifyCustomerReceivableForReport({
    outstandingAmount,
    dueDate,
    today,
  });
  return {
    sourceId: asText(row, "source_id"),
    referenceNumber: asText(row, "reference_number"),
    invoiceNumber: asNullableText(row, "invoice_number"),
    customerId: asText(row, "customer_id"),
    customerName: asNullableText(row, "customer_name"),
    companyName: asNullableText(row, "company_name"),
    customerEmail: asNullableText(row, "customer_email"),
    customerPhone: asNullableText(row, "customer_phone"),
    partyName: asText(row, "party_name", "Customer"),
    salespersonName: asText(row, "salesperson_name", "Salesperson"),
    responsibleProfileId: asText(row, "responsible_profile_id"),
    currency: normalizeReportingCurrency(row.currency),
    invoiceDate: asNullableText(row, "invoice_date"),
    invoiceTotal: asNumber(row, "original_amount"),
    paidAmount: asNumber(row, "paid_amount"),
    refundedAmount: asNumber(row, "refunded_amount"),
    outstandingAmount,
    paymentStatus: asText(row, "payment_status"),
    paymentTermsType: asNullableText(row, "payment_terms_type"),
    creditPeriodDays: row.credit_period_days == null ? null : asNumber(row, "credit_period_days"),
    dueDate,
    dueStatus: classification.dueStatus,
    // Derive from the same current Dhaka date/balance as dueStatus rather
    // than trusting a stale view label across a midnight boundary.
    agingBucket: classification.agingBucket,
    daysOverdue: classification.daysOverdue,
    lastPaymentDate: asNullableText(row, "last_payment_date"),
    issueDate: asText(row, "issue_date"),
  };
}

type CustomerFilterQuery = {
  or(filters: string): CustomerFilterQuery;
  eq(column: string, value: string | number): CustomerFilterQuery;
  ilike(column: string, value: string): CustomerFilterQuery;
  gte(column: string, value: string): CustomerFilterQuery;
  lte(column: string, value: string): CustomerFilterQuery;
  gt(column: string, value: string | number): CustomerFilterQuery;
};

function applyCustomerFilters(query: unknown, params: ReceivablesReportParams, today: string): CustomerFilterQuery {
  let next: CustomerFilterQuery = query as CustomerFilterQuery;
  if (params.search) {
    next = next.or([
      `party_name.ilike.%${params.search}%`,
      `company_name.ilike.%${params.search}%`,
      `customer_email.ilike.%${params.search}%`,
      `customer_phone.ilike.%${params.search}%`,
      `reference_number.ilike.%${params.search}%`,
      `invoice_number.ilike.%${params.search}%`,
    ].join(","));
  }
  if (params.currency) next = next.eq("currency", params.currency);
  if (params.customerId) next = next.eq("customer_id", params.customerId);
  if (params.salesperson) next = next.ilike("salesperson_name", `%${params.salesperson}%`);
  if (params.status) next = next.eq("payment_status", params.status);
  if (params.fromDate) next = next.gte("issue_date", params.fromDate);
  if (params.toDate) next = next.lte("issue_date", params.toDate);
  if (params.dueFrom) next = next.gte("due_date", params.dueFrom);
  if (params.dueTo) next = next.lte("due_date", params.dueTo);
  if (params.agingBucket) next = next.eq("aging_bucket", params.agingBucket);
  if (params.dueStatus === "paid") next = next.eq("receivables_status", "paid");
  if (params.dueStatus === "overdue") next = next.eq("receivables_status", "overdue");
  if (params.dueStatus === "no_due_date") next = next.eq("receivables_status", "no_due_date");
  if (params.dueStatus === "due_today") next = next.eq("due_date", today).gt("outstanding_amount", 0);
  // Due Soon is strictly after today; today has its own state. Not Yet Due
  // starts after the centralized seven-day Due Soon window.
  if (params.dueStatus === "due_soon") next = next.gt("due_date", today).lte("due_date", addDays(today, 7)).gt("outstanding_amount", 0);
  if (params.dueStatus === "not_yet_due") next = next.gt("due_date", addDays(today, 7)).gt("outstanding_amount", 0);
  if (params.outstandingOnly) next = next.gt("outstanding_amount", 0);
  return next;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export type CustomerOutstandingReport = {
  rows: CustomerOutstandingReportRow[];
  count: number;
  page: number;
  pageSize: number;
  filters: ReceivablesReportParams;
  agingTotals: AgingCurrencySummary[];
  customerSummaries: CustomerOutstandingSummary[];
  customerSummaryTruncated: boolean;
  unsupportedFilters: string[];
  /** Whether the bounded aggregate sample was capped before grouping. */
  summaryTruncated: boolean;
  truncated: boolean;
};

export type CustomerOutstandingSummary = {
  customerId: string;
  customerName: string | null;
  companyName: string | null;
  currency: string;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  totalOverdue: number;
  saleCount: number;
};

/** Customer outstanding/due/aging rows, scoped before every service-role read. */
export async function getCustomerOutstandingReport(
  input: Record<string, unknown>,
  access: ReceivablesReportScope,
): Promise<CustomerOutstandingReport> {
  const params = normalizeReceivablesReportParams(input as ReceivablesReportParams);
  const unsupported = unsupportedFilters(params, CUSTOMER_REPORT_FILTERS);
  if (!customerAccess(access)) return {
    ...emptyPage<CustomerOutstandingReportRow>(params, unsupported),
    agingTotals: [],
    customerSummaries: [],
    customerSummaryTruncated: false,
    summaryTruncated: false,
  };
  const today = getDhakaToday();
  const db = createSupabaseAdminClient();
  let query = db.from("customer_receivables_detail_v").select(CUSTOMER_COLUMNS, { count: "exact" });
  if (access.salesScope.kind === "own") query = query.eq("responsible_profile_id", access.salesScope.profileId);
  query = applyCustomerFilters(query as unknown as CustomerFilterQuery, params, today) as unknown as typeof query;
  const result = await query
    .order("outstanding_amount", { ascending: false })
    .order("issue_date", { ascending: false })
    .order("source_id", { ascending: true })
    .range((params.page - 1) * params.pageSize, params.page * params.pageSize - 1);
  if (result.error) throw errorMessage("Customer outstanding report", result.error);

  // A separately bounded source sample powers bucket cards without loading an
  // unbounded browser dataset. The authoritative view remains the source.
  let totalsQuery = db.from("customer_receivables_detail_v")
    .select("currency,due_date,outstanding_amount")
    .gt("outstanding_amount", 0)
    .order("issue_date", { ascending: false })
    .order("source_id", { ascending: true })
    .limit(MAX_SOURCE_ROWS);
  if (access.salesScope.kind === "own") totalsQuery = totalsQuery.eq("responsible_profile_id", access.salesScope.profileId);
  totalsQuery = applyCustomerFilters(totalsQuery as unknown as CustomerFilterQuery, params, today) as unknown as typeof totalsQuery;
  const totalsResult = await totalsQuery;
  if (totalsResult.error) throw errorMessage("Customer aging summary", totalsResult.error);
  const summaryTruncated = (totalsResult.data?.length ?? 0) >= MAX_SOURCE_ROWS;
  const summarySupportsFilters = !params.fromDate && !params.toDate && !params.dueFrom && !params.dueTo
    && !params.status && !params.dueStatus && !params.agingBucket && !params.salesperson;
  let customerSummaries: CustomerOutstandingSummary[] = [];
  let customerSummaryTruncated = false;
  if (summarySupportsFilters) {
    let customerSummaryQuery = db.from("customer_receivables_summary_v")
      .select(CUSTOMER_SUMMARY_COLUMNS)
      .limit(MAX_SOURCE_ROWS);
    if (access.salesScope.kind === "own") customerSummaryQuery = customerSummaryQuery.eq("responsible_profile_id", access.salesScope.profileId);
    if (params.currency) customerSummaryQuery = customerSummaryQuery.eq("currency", params.currency);
    if (params.customerId) customerSummaryQuery = customerSummaryQuery.eq("customer_id", params.customerId);
    if (params.search) customerSummaryQuery = customerSummaryQuery.or(`party_name.ilike.%${params.search}%,company_name.ilike.%${params.search}%,customer_name.ilike.%${params.search}%,customer_email.ilike.%${params.search}%,customer_phone.ilike.%${params.search}%`);
    if (params.outstandingOnly) customerSummaryQuery = customerSummaryQuery.gt("total_outstanding", 0);
    const customerSummaryResult = await customerSummaryQuery
      .order("total_outstanding", { ascending: false })
      .order("customer_id", { ascending: true })
      .order("currency", { ascending: true });
    if (customerSummaryResult.error) throw errorMessage("Customer outstanding summary", customerSummaryResult.error);
    customerSummaryTruncated = (customerSummaryResult.data?.length ?? 0) >= MAX_SOURCE_ROWS;
    // The summary view can contain one row per authorized owner.  Merge those
    // rows by customer and currency before serializing so Admin/all-Sales
    // viewers receive a true customer rollup rather than duplicate cards.
    customerSummaries = mergeCustomerSummaryRows(
      ((customerSummaryResult.data ?? []) as unknown as RawRecord[]).map((row) => ({
        customerId: asText(row, "customer_id"),
        customerName: asNullableText(row, "customer_name"),
        companyName: asNullableText(row, "company_name"),
        currency: normalizeReportingCurrency(row.currency),
        totalInvoiced: asNumber(row, "total_invoiced"),
        totalPaid: asNumber(row, "total_paid"),
        totalOutstanding: asNumber(row, "total_outstanding"),
        totalOverdue: asNumber(row, "total_overdue"),
        receivableCount: asNumber(row, "sale_count"),
      })),
    ).map((row) => ({
      customerId: row.customerId,
      customerName: row.customerName,
      companyName: row.companyName,
      currency: row.currency,
      totalInvoiced: row.totalInvoiced,
      totalPaid: row.totalPaid,
      totalOutstanding: row.totalOutstanding,
      totalOverdue: row.totalOverdue,
      saleCount: row.receivableCount,
    }));
  }
  return {
    rows: ((result.data ?? []) as unknown as RawRecord[]).map((row) => mapCustomerRow(row, today)),
    count: result.count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
    filters: params,
    unsupportedFilters: unsupported,
    agingTotals: groupAgingTotalsByCurrency((totalsResult.data ?? []).map((row) => ({
      currency: String(row.currency),
      agingBucket: classifyCustomerReceivableForReport({
        outstandingAmount: Number(row.outstanding_amount ?? 0),
        dueDate: row.due_date == null || row.due_date === "" ? null : String(row.due_date),
        today,
      }).agingBucket,
      outstandingAmount: Number(row.outstanding_amount),
    }))),
    customerSummaries,
    customerSummaryTruncated,
    summaryTruncated,
    truncated: (result.count ?? 0) > MAX_SOURCE_ROWS || summaryTruncated,
  };
}

export type CustomerStatementEvent = StatementRow & {
  sourceId: string;
  customerId: string;
  referenceNumber: string;
  invoiceNumber: string | null;
  method: string | null;
  paymentStatus: string | null;
};

export type CustomerStatementGroup = {
  currency: string;
  rows: CustomerStatementEvent[];
  closingOutstanding: number;
  totalRows: number;
};

export type CustomerSalesStatement = {
  customerId: string;
  customerName: string | null;
  companyName: string | null;
  groups: CustomerStatementGroup[];
  sourceCount: number;
  eventCount: number;
  totalEventCount: number;
  hasNextPage: boolean;
  truncated: boolean;
  unsupportedFilters: string[];
  filters: ReceivablesReportParams;
};

/** Build a Sales-only statement after resolving authorized sale IDs first. */
export async function getCustomerSalesStatement(
  customerId: string,
  input: Record<string, unknown>,
  access: ReceivablesReportScope,
): Promise<CustomerSalesStatement | null> {
  const params = normalizeReceivablesReportParams({ ...input, customerId });
  const unsupported = unsupportedFilters(params, CUSTOMER_STATEMENT_FILTERS);
  if (!customerAccess(access) || !customerId.trim()) return null;
  const db = createSupabaseAdminClient();
  let saleQuery = db.from("customer_receivables_detail_v").select(CUSTOMER_COLUMNS).eq("customer_id", customerId).limit(MAX_STATEMENT_SALES);
  if (access.salesScope.kind === "own") saleQuery = saleQuery.eq("responsible_profile_id", access.salesScope.profileId);
  if (params.currency) saleQuery = saleQuery.eq("currency", params.currency);
  if (params.search) saleQuery = saleQuery.or(`party_name.ilike.%${params.search}%,company_name.ilike.%${params.search}%,customer_email.ilike.%${params.search}%,customer_phone.ilike.%${params.search}%,reference_number.ilike.%${params.search}%,invoice_number.ilike.%${params.search}%`);
  const salesResult = await saleQuery.order("issue_date", { ascending: true }).order("source_id", { ascending: true });
  if (salesResult.error) throw errorMessage("Customer Sales statement", salesResult.error);
  const sales = (salesResult.data ?? []) as unknown as RawRecord[];
  if (!sales.length) return null;
  const saleIds = sales.map((sale) => asText(sale, "source_id"));
  const paymentResult = await db.from("sale_payments")
    .select("id,order_id,amount,payment_date,method,reference_number,status,created_at")
    .in("order_id", saleIds)
    .in("status", ["received", "refunded"])
    .order("payment_date", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_STATEMENT_PAYMENTS);
  if (paymentResult.error) throw errorMessage("Customer Sales payment statement", paymentResult.error);
  const salesById = new Map(sales.map((sale) => [asText(sale, "source_id"), sale]));
  const netPaidBySale = buildNetPaidBySale(sales);
  const paymentEvents = buildAuthoritativeSalesPaymentEvents(
    ((paymentResult.data ?? []) as unknown as RawRecord[]).map((payment) => ({
      id: asText(payment, "id"),
      saleId: asText(payment, "order_id"),
      date: asText(payment, "payment_date"),
      status: asText(payment, "status"),
      amount: asNumber(payment, "amount"),
      method: asNullableText(payment, "method"),
      reference: asNullableText(payment, "reference_number"),
    })),
    netPaidBySale,
  );
  const eventsByCurrency = new Map<string, CustomerStatementEvent[]>();
  for (const sale of sales) {
    const currency = normalizeReportingCurrency(sale.currency);
    const saleId = asText(sale, "source_id");
    const invoiceNumber = asNullableText(sale, "invoice_number");
    const recordedInvoiceDate = asNullableText(sale, "invoice_date");
    const invoiceDate = recordedInvoiceDate ?? asText(sale, "issue_date");
    const invoiceEvent: CustomerStatementEvent = {
      id: `invoice:${saleId}`,
      sourceId: saleId,
      customerId,
      referenceNumber: asText(sale, "reference_number"),
      invoiceNumber,
      method: null,
      paymentStatus: null,
      date: invoiceDate,
      type: "invoice",
      direction: "increase",
      amount: asNumber(sale, "original_amount"),
      currency,
      label: customerStatementSaleLabel(invoiceNumber, recordedInvoiceDate),
      periodClass: "invoice",
      runningBalance: 0,
      reversalOfId: null,
    };
    const list = eventsByCurrency.get(currency) ?? [];
    list.push(invoiceEvent);
    eventsByCurrency.set(currency, list);
  }
  for (const payment of paymentEvents) {
    const sale = salesById.get(payment.saleId);
    if (!sale) continue;
    const isRefund = payment.type === "refund";
    const currency = normalizeReportingCurrency(sale.currency);
    const event: CustomerStatementEvent = {
      id: `${isRefund ? "refund" : "payment"}:${payment.id}`,
      sourceId: payment.saleId,
      customerId,
      referenceNumber: asText(sale, "reference_number"),
      invoiceNumber: asNullableText(sale, "invoice_number"),
      method: payment.method ?? null,
      paymentStatus: payment.status,
      date: payment.date,
      type: isRefund ? "refund" : "payment",
      direction: isRefund ? "increase" : "decrease",
      amount: payment.amount,
      currency,
      label: isRefund ? "Refund effect" : "Payment received",
      periodClass: isRefund ? "refund" : "collection",
      reference: payment.reference ?? null,
      metadata: { method: payment.method ?? null },
      runningBalance: 0,
      reversalOfId: null,
    };
    const list = eventsByCurrency.get(currency) ?? [];
    list.push(event);
    eventsByCurrency.set(currency, list);
  }
  const fullGroups = [...eventsByCurrency.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, events]) => {
    const allRows = buildStatementRows(events).filter((row) => {
      if (params.fromDate && row.date < params.fromDate) return false;
      if (params.toDate && row.date > params.toDate) return false;
      return true;
    }) as CustomerStatementEvent[];
    return {
      currency,
      rows: allRows,
      closingOutstanding: Number(sales.filter((sale) => normalizeReportingCurrency(sale.currency) === currency).reduce((total, sale) => total + asNumber(sale, "outstanding_amount"), 0).toFixed(4)),
    };
  });
  // Apply one global page window across currencies.  The rows remain grouped
  // and each running balance remains currency-local, while the response never
  // exceeds the normalized page size when a customer has multiple currencies.
  const paged = paginateStatementGroups<
    CustomerStatementEvent,
    { currency: string; rows: CustomerStatementEvent[]; closingOutstanding: number }
  >(fullGroups, params.page, params.pageSize);
  const groups = paged.groups;
  const totalEventCount = paged.totalRows;
  return {
    customerId,
    customerName: asNullableText(sales[0]!, "customer_name"),
    companyName: asNullableText(sales[0]!, "company_name"),
    groups,
    sourceCount: sales.length,
    eventCount: groups.reduce((total, group) => total + group.rows.length, 0),
    totalEventCount,
    hasNextPage: paged.hasNextPage,
    truncated: sales.length >= MAX_STATEMENT_SALES || (paymentResult.data?.length ?? 0) >= MAX_STATEMENT_PAYMENTS,
    unsupportedFilters: unsupported,
    filters: params,
  };
}

export type NonSalesAccountReport = {
  id: string;
  receivableNumber: string;
  category: string;
  borrowerType: string;
  borrowerName: string;
  currency: string;
  status: string;
  originalAmount: number;
  approvedAmount: number | null;
  openingPrincipal: number;
  disbursedAmount: number;
  repaidAmount: number;
  adjustmentAmount: number;
  outstandingAmount: number;
  isOpeningBalance: boolean;
  openingAsOfDate: string | null;
  firstDueDate: string | null;
  finalDueDate: string | null;
  defaultRepaymentMethod: string | null;
  createdAt: string;
};

function mapNonSalesAccount(row: RawRecord, access: ReceivablesReportScope): NonSalesAccountReport {
  // Payroll-linked methods are masked unless the centralized scope grants
  // canViewPayrollDetails (currently the active Admin boundary).
  const payrollVisibility = { canViewPayrollDetails: access.canViewPayrollDetails };
  return {
    id: asText(row, "id"),
    receivableNumber: asText(row, "receivable_number"),
    category: asText(row, "category"),
    borrowerType: asText(row, "borrower_type"),
    borrowerName: asText(row, "borrower_display_name_snapshot", "Borrower"),
    currency: normalizeReportingCurrency(row.currency),
    status: asText(row, "status"),
    originalAmount: asNumber(row, "original_amount"),
    approvedAmount: row.approved_amount == null ? null : asNumber(row, "approved_amount"),
    openingPrincipal: asNumber(row, "opening_principal"),
    disbursedAmount: asNumber(row, "disbursed_amount"),
    repaidAmount: asNumber(row, "repaid_amount"),
    adjustmentAmount: asNumber(row, "adjustment_decrease_amount") - asNumber(row, "adjustment_increase_amount"),
    outstandingAmount: asNumber(row, "outstanding_amount"),
    isOpeningBalance: Boolean(row.is_opening_balance),
    openingAsOfDate: asNullableText(row, "opening_as_of_date"),
    firstDueDate: asNullableText(row, "first_due_date"),
    finalDueDate: asNullableText(row, "final_due_date"),
    defaultRepaymentMethod: sanitizeReportingRepaymentMethod(row.default_repayment_method, payrollVisibility),
    createdAt: asText(row, "created_at"),
  };
}

export type NonSalesStatementEvent = StatementRow & {
  accountId: string;
  receivableNumber: string;
  paymentMethod: string | null;
  source: string;
  operationId: string | null;
  notes: string | null;
};

export type NonSalesAccountStatement = {
  account: NonSalesAccountReport;
  rows: NonSalesStatementEvent[];
  totalRows: number;
  hasNextPage: boolean;
  closingOutstanding: number;
  filters: ReceivablesReportParams;
  unsupportedFilters: string[];
  truncated: boolean;
};

/** Read-only non-Sales statement; immutable rows and reversals stay separate. */
export async function getNonSalesAccountStatement(
  accountId: string,
  input: Record<string, unknown>,
  access: ReceivablesReportScope,
): Promise<NonSalesAccountStatement | null> {
  const params = normalizeReceivablesReportParams({ ...input, accountId });
  const unsupported = unsupportedFilters(params, NON_SALES_STATEMENT_FILTERS);
  if (!loanAccess(access) || !/^[0-9a-f-]{36}$/i.test(accountId)) return null;
  const db = createSupabaseAdminClient();
  const accountResult = await db.from("non_sales_receivable_details_v").select(NON_SALES_COLUMNS).eq("id", accountId).maybeSingle();
  if (accountResult.error) throw errorMessage("non-Sales receivable account", accountResult.error);
  if (!accountResult.data) return null;
  const account = mapNonSalesAccount(accountResult.data as unknown as RawRecord, access);
  if (params.currency && params.currency !== account.currency) return null;
  const transactionResult = await db.from("receivable_transactions")
    .select(transactionColumnsForReport(access))
    .eq("receivable_account_id", accountId)
    .order("effective_date", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_SOURCE_ROWS);
  if (transactionResult.error) throw errorMessage("non-Sales receivable statement", transactionResult.error);
  const rawTransactions = (transactionResult.data ?? []) as unknown as RawRecord[];
  const reversalContexts = await loadReversalContexts(db, rawTransactions);
  const statementEvents = rawTransactions.map((transaction) => {
    const sanitized = sanitizeReportingTransaction(transaction, access);
    const reversalId = transaction.reversal_of_transaction_id ?? transaction.reversalOfTransactionId;
    const reversalContext = typeof reversalId === "string" ? reversalContexts.get(reversalId) : undefined;
    return {
      ...buildStatementRows([{
        id: sanitized.id,
        date: sanitized.effectiveDate,
        type: sanitized.transactionType,
        direction: sanitized.direction as "increase" | "decrease",
        amount: sanitized.amount,
        currency: account.currency,
        reference: sanitized.operationId === "financial-linked" || sanitized.operationId === "payroll-linked"
          ? null
          : sanitized.operationId || null,
          reversalOfId: sanitizeReportingReversalReference({
            reversalOfId: sanitized.reversalOfTransactionId,
            source: sanitized.source,
            paymentMethod: sanitized.paymentMethod,
            relatedSource: reversalContext?.source,
            relatedPaymentMethod: reversalContext?.paymentMethod,
            canViewAccountingDetails: access.canViewAccountingDetails,
            canViewPayrollDetails: access.canViewPayrollDetails,
          }),
        metadata: sanitized.metadata,
      }])[0]!,
      accountId,
      receivableNumber: account.receivableNumber,
      paymentMethod: sanitized.paymentMethod,
      source: sanitized.source,
      operationId: sanitized.operationId === "financial-linked" || sanitized.operationId === "payroll-linked"
        ? null
        : sanitized.operationId || null,
      notes: sanitized.notes,
    } as NonSalesStatementEvent;
  });
  // The rows are already ordered by the database, but rebuilding together is
  // necessary for a correct running balance across the whole account.
  const eventById = new Map(statementEvents.map((row) => [row.id, row]));
  const rebuilt = buildStatementRows(statementEvents.map((row) => ({
    id: row.id,
    date: row.date,
    type: row.type,
    direction: row.direction,
    amount: row.amount,
    currency: row.currency,
    reversalOfId: row.reversalOfId,
  }))).map((row) => {
    const original = eventById.get(row.id);
    if (!original) throw new Error("Statement event disappeared while rebuilding.");
    return { ...original, ...row };
  });
  const filtered = rebuilt.filter((row) => {
    if (params.fromDate && row.date < params.fromDate && row.periodClass !== "opening") return false;
    if (params.toDate && row.date > params.toDate) return false;
    if (params.paymentMethod && row.paymentMethod?.toLowerCase() !== params.paymentMethod) return false;
    if (params.movementType && row.type.toLowerCase() !== params.movementType) return false;
    if (params.source === "non_sales_repayment" && row.type !== "repayment") return false;
    if (params.source === "non_sales_adjustment" && row.periodClass !== "adjustment") return false;
    if (params.source === "non_sales_opening" && row.type !== "opening_balance") return false;
    if (params.source === "non_sales_disbursement" && row.type !== "disbursement") return false;
    if (params.source === "reversal" && row.type !== "reversal") return false;
    if (params.source === "customer_sales" || params.source === "customer_collection" || params.source === "customer_refund") return false;
    return true;
  });
  return {
    account,
    rows: filtered.slice((params.page - 1) * params.pageSize, params.page * params.pageSize),
    totalRows: filtered.length,
    hasNextPage: params.page * params.pageSize < filtered.length,
    closingOutstanding: account.outstandingAmount,
    filters: params,
    unsupportedFilters: unsupported,
    truncated: (transactionResult.data?.length ?? 0) >= MAX_SOURCE_ROWS,
  };
}

export type InstallmentReportRow = {
  id: string;
  accountId: string;
  receivableNumber: string;
  borrowerName: string;
  category: string;
  currency: string;
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  daysOverdue: number | null;
};

export type InstallmentReport = {
  rows: InstallmentReportRow[];
  count: number;
  page: number;
  pageSize: number;
  filters: ReceivablesReportParams;
  totals: Array<{ currency: string; scheduled: number; paid: number; remaining: number }>;
  unsupportedFilters: string[];
  /** Totals are marked when the bounded page/source cannot represent all rows. */
  totalsTruncated: boolean;
  truncated: boolean;
};

/** Bounded installment report backed by the Phase 3 FIFO status view. */
export async function getInstallmentReport(
  input: Record<string, unknown>,
  access: ReceivablesReportScope,
): Promise<InstallmentReport> {
  const params = normalizeReceivablesReportParams(input as ReceivablesReportParams);
  const unsupported = unsupportedFilters(params, INSTALLMENT_REPORT_FILTERS);
  if (!loanAccess(access)) return {
    ...emptyPage<InstallmentReportRow>(params, unsupported),
    totals: [],
    totalsTruncated: false,
  };
  const db = createSupabaseAdminClient();
  let accountIds: string[] | null = null;
  let accountFilterTruncated = false;
    if (params.accountId || params.category || params.borrower || params.search || params.currency) {
      let accountQuery = db.from("non_sales_receivable_details_v")
        .select("id")
        .order("id", { ascending: true })
        .limit(MAX_INSTALLMENT_ACCOUNTS);
      if (params.accountId) accountQuery = accountQuery.eq("id", params.accountId);
      if (params.category) accountQuery = accountQuery.eq("category", params.category);
      if (params.borrower) accountQuery = accountQuery.ilike("borrower_display_name_snapshot", `%${params.borrower}%`);
      if (params.search) accountQuery = accountQuery.or(`receivable_number.ilike.%${params.search}%,borrower_display_name_snapshot.ilike.%${params.search}%`);
      if (params.currency) accountQuery = accountQuery.eq("currency", params.currency);
    const accountResult = await accountQuery;
    if (accountResult.error) throw errorMessage("installment account filter", accountResult.error);
    accountIds = ((accountResult.data ?? []) as unknown as RawRecord[]).map((row) => asText(row, "id"));
    accountFilterTruncated = accountIds.length >= MAX_INSTALLMENT_ACCOUNTS;
    if (!accountIds.length) return {
      ...emptyPage<InstallmentReportRow>(params, unsupported),
      totals: [],
      totalsTruncated: accountFilterTruncated,
    };
  }
  let query = db.from("receivable_installment_status_v").select("id,receivable_account_id,installment_number,due_date,amount_due,currency,paid_amount,remaining_amount,installment_status,days_overdue", { count: "exact" });
  if (accountIds) query = query.in("receivable_account_id", accountIds);
  // `from`/`to` are report activity dates; for an installment schedule the
  // authoritative event date is the installment due date. Keep both aliases
  // supported and combine them as the narrowest requested interval.
  if (params.fromDate) query = query.gte("due_date", params.fromDate);
  if (params.toDate) query = query.lte("due_date", params.toDate);
  if (params.currency) query = query.eq("currency", params.currency);
  if (params.dueFrom) query = query.gte("due_date", params.dueFrom);
  if (params.dueTo) query = query.lte("due_date", params.dueTo);
  const today = getDhakaToday();
  if (params.status === "paid" || params.status === "partial" || params.status === "overdue" || params.status === "unpaid") {
    query = query.eq("installment_status", params.status);
  } else if (params.status === "upcoming") {
    query = query.eq("installment_status", "unpaid").gt("due_date", today);
  } else if (params.status === "due_today") {
    query = query.eq("installment_status", "unpaid").eq("due_date", today);
  }
  if (params.outstandingOnly) query = query.gt("remaining_amount", 0);
  if (params.dueStatus === "due_today") query = query.eq("due_date", today).gt("remaining_amount", 0);
  if (params.dueStatus === "due_soon") query = query.gt("due_date", today).lte("due_date", addDays(today, 7)).gt("remaining_amount", 0);
  if (params.dueStatus === "not_yet_due") query = query.gt("due_date", addDays(today, 7)).gt("remaining_amount", 0);
  if (params.dueStatus === "overdue") query = query.lt("due_date", today).gt("remaining_amount", 0);
  if (params.dueStatus === "no_due_date") return {
    ...emptyPage<InstallmentReportRow>(params, unsupported),
    totals: [],
    totalsTruncated: accountFilterTruncated,
  };
  if (params.dueStatus === "paid") query = query.eq("installment_status", "paid");
  if (params.agingBucket === "not_yet_due") query = query.gt("due_date", today).gt("remaining_amount", 0);
  if (params.agingBucket === "due_today") query = query.eq("due_date", today).gt("remaining_amount", 0);
  if (params.agingBucket === "1_30_days_overdue") query = query.gte("due_date", addDays(today, -30)).lt("due_date", today).gt("remaining_amount", 0);
  if (params.agingBucket === "31_60_days_overdue") query = query.gte("due_date", addDays(today, -60)).lt("due_date", addDays(today, -30)).gt("remaining_amount", 0);
  if (params.agingBucket === "61_90_days_overdue") query = query.gte("due_date", addDays(today, -90)).lt("due_date", addDays(today, -60)).gt("remaining_amount", 0);
  if (params.agingBucket === "90_plus_days_overdue") query = query.lt("due_date", addDays(today, -90)).gt("remaining_amount", 0);
  if (params.agingBucket === "paid") query = query.eq("installment_status", "paid");
  if (params.agingBucket === "no_due_date") return {
    ...emptyPage<InstallmentReportRow>(params, unsupported),
    totals: [],
    totalsTruncated: accountFilterTruncated,
  };
  const result = await query.order("due_date", { ascending: true }).order("receivable_account_id", { ascending: true }).order("installment_number", { ascending: true }).range((params.page - 1) * params.pageSize, params.page * params.pageSize - 1);
  if (result.error) throw errorMessage("installment report", result.error);
  const rawRows = (result.data ?? []) as unknown as RawRecord[];
  const ids = [...new Set(rawRows.map((row) => asText(row, "receivable_account_id")))];
  const accountResult = ids.length ? await db.from("non_sales_receivable_details_v").select("id,receivable_number,borrower_display_name_snapshot,category").in("id", ids) : { data: [], error: null };
  if (accountResult.error) throw errorMessage("installment account details", accountResult.error);
  const accounts = new Map(((accountResult.data ?? []) as unknown as RawRecord[]).map((row) => [asText(row, "id"), row]));
  const rows = rawRows.map((row) => {
    const account = accounts.get(asText(row, "receivable_account_id"));
    const currency = normalizeReportingCurrency(row.currency);
    return {
      id: asText(row, "id"),
      accountId: asText(row, "receivable_account_id"),
      receivableNumber: asText(account ?? {}, "receivable_number"),
      borrowerName: asText(account ?? {}, "borrower_display_name_snapshot", "Borrower"),
      category: asText(account ?? {}, "category"),
      currency,
      installmentNumber: asNumber(row, "installment_number"),
      dueDate: asText(row, "due_date"),
      amountDue: asNumber(row, "amount_due"),
      paidAmount: asNumber(row, "paid_amount"),
      remainingAmount: asNumber(row, "remaining_amount"),
      status: classifyInstallmentForReport({ status: asText(row, "installment_status"), dueDate: asText(row, "due_date"), paidAmount: asNumber(row, "paid_amount"), remainingAmount: asNumber(row, "remaining_amount"), today }),
      daysOverdue: row.days_overdue == null ? null : asNumber(row, "days_overdue"),
    } satisfies InstallmentReportRow;
  });
  const totalsMap = new Map<string, { currency: string; scheduled: number; paid: number; remaining: number }>();
  for (const row of rows) {
    const total = totalsMap.get(row.currency) ?? { currency: row.currency, scheduled: 0, paid: 0, remaining: 0 };
    total.scheduled += row.amountDue;
    total.paid += row.paidAmount;
    total.remaining += row.remainingAmount;
    totalsMap.set(row.currency, total);
  }
  return {
    rows,
    count: result.count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
    filters: params,
    totals: [...totalsMap.values()].map((row) => ({ ...row, scheduled: Number(row.scheduled.toFixed(4)), paid: Number(row.paid.toFixed(4)), remaining: Number(row.remaining.toFixed(4)) })),
    unsupportedFilters: unsupported,
    totalsTruncated: accountFilterTruncated || (result.count ?? 0) > rawRows.length,
    truncated: accountFilterTruncated || (result.count ?? 0) > MAX_SOURCE_ROWS,
  };
}

export type ActivityReportRow = {
  id: string;
  date: string;
  kind: ActivityKind;
  label: string;
  sourceType: "customer_sale" | "non_sales";
  reference: string;
  partyName: string;
  category: string | null;
  currency: string;
  amount: number;
  paymentMethod: string | null;
  salespersonName: string | null;
  reversalOfId: string | null;
};

export type ActivityReport = {
  rows: ActivityReportRow[];
  count: number;
  page: number;
  pageSize: number;
  filters: ReceivablesReportParams;
  summaries: ReturnType<typeof summarizeActivityByCurrency>;
  unsupportedFilters: string[];
  truncated: boolean;
};

/** Collection/repayment activity with explicit source and adjustment labels. */
export async function getReceivablesActivityReport(
  input: Record<string, unknown>,
  access: ReceivablesReportScope,
): Promise<ActivityReport> {
  const params = normalizeReceivablesReportParams(input as ReceivablesReportParams);
  const unsupportedSet = new Set(unsupportedFilters(params, ACTIVITY_REPORT_FILTERS));
  const markUnsupportedWhenActive = (name: string, active: unknown) => {
    if (active) unsupportedSet.add(name);
  };
  const sourceAllowsCustomer = params.source === "all"
    || params.source === "customer_sales"
    || params.source === "customer_collection"
    || params.source === "customer_refund";
  const sourceAllowsLoans = params.source === "all"
    || params.source === "non_sales"
    || params.source === "non_sales_repayment"
    || params.source === "non_sales_adjustment"
    || params.source === "non_sales_opening"
    || params.source === "non_sales_disbursement"
    || params.source === "reversal";
  const customerOnlyFilterActive = Boolean(params.customerId || params.salesperson);
  const nonSalesOnlyFilterActive = Boolean(params.accountId || params.borrower || params.category);
  // A source-specific filter narrows an `all` feed to the source it can
  // actually describe. This avoids returning unrelated customer rows when a
  // borrower/account filter was selected (and vice versa).
  const wantsCustomer = sourceAllowsCustomer && !nonSalesOnlyFilterActive;
  const wantsLoans = sourceAllowsLoans && !customerOnlyFilterActive;
  // Customer-only and non-Sales-only filters are context-dependent. Mark a
  // filter when the selected source cannot honor it, rather than silently
  // applying it to only one half of an `all` feed.
  if (params.source.startsWith("customer_")) {
    markUnsupportedWhenActive("accountId", params.accountId);
    markUnsupportedWhenActive("borrower", params.borrower);
    markUnsupportedWhenActive("category", params.category);
  }
  if (params.source.startsWith("non_sales") || params.source === "reversal") {
    markUnsupportedWhenActive("customerId", params.customerId);
    markUnsupportedWhenActive("salesperson", params.salesperson);
  }
  if (params.source === "all" && nonSalesOnlyFilterActive) {
    markUnsupportedWhenActive("customerId", params.customerId);
    markUnsupportedWhenActive("salesperson", params.salesperson);
  }
  if (params.source === "all" && customerOnlyFilterActive) {
    markUnsupportedWhenActive("accountId", params.accountId);
    markUnsupportedWhenActive("borrower", params.borrower);
    markUnsupportedWhenActive("category", params.category);
  }
  const unsupported = [...unsupportedSet].sort();
  const rows: ActivityReportRow[] = [];
  let sourceTruncated = false;
  // Do not even instantiate the service-role client for a caller who has no
  // authorized source.  Scope is resolved before every financial read.
  const db = (wantsCustomer && customerAccess(access)) || (wantsLoans && loanAccess(access))
    ? createSupabaseAdminClient()
    : null;
  if (db && wantsCustomer && customerAccess(access)) {
    let saleQuery = db.from("customer_receivables_detail_v").select(CUSTOMER_COLUMNS).limit(MAX_SOURCE_ROWS);
    if (access.salesScope.kind === "own") saleQuery = saleQuery.eq("responsible_profile_id", access.salesScope.profileId);
    if (params.currency) saleQuery = saleQuery.eq("currency", params.currency);
    if (params.customerId) saleQuery = saleQuery.eq("customer_id", params.customerId);
    if (params.salesperson) saleQuery = saleQuery.ilike("salesperson_name", `%${params.salesperson}%`);
    if (params.search) saleQuery = saleQuery.or(`party_name.ilike.%${params.search}%,company_name.ilike.%${params.search}%,customer_email.ilike.%${params.search}%,customer_phone.ilike.%${params.search}%,reference_number.ilike.%${params.search}%,invoice_number.ilike.%${params.search}%`);
    const saleResult = await saleQuery
      .order("issue_date", { ascending: false })
      .order("source_id", { ascending: true });
    if (saleResult.error) throw errorMessage("customer collection activity", saleResult.error);
    const sales = (saleResult.data ?? []) as unknown as RawRecord[];
    const ids = sales.map((sale) => asText(sale, "source_id"));
    if (ids.length) {
      // Read the bounded authorized payment source before applying report
      // date/method filters.  Refund effects are derived from each Sale's
      // authoritative net paid snapshot; filtering the raw rows first could
      // make that reconciliation incorrect for a selected period/method.
      const paymentQuery = db.from("sale_payments")
        .select("id,order_id,amount,payment_date,method,reference_number,status,created_at")
        .in("order_id", ids)
        .in("status", ["received", "refunded"])
        .order("payment_date", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(MAX_SOURCE_ROWS);
      const paymentResult = await paymentQuery;
      if (paymentResult.error) throw errorMessage("customer collection activity", paymentResult.error);
      sourceTruncated ||= sales.length >= MAX_SOURCE_ROWS || (paymentResult.data?.length ?? 0) >= MAX_SOURCE_ROWS;
      const salesMap = new Map(sales.map((sale) => [asText(sale, "source_id"), sale]));
      const netPaidBySale = buildNetPaidBySale(sales);
      const paymentEvents = buildAuthoritativeSalesPaymentEvents(
        ((paymentResult.data ?? []) as unknown as RawRecord[]).map((payment) => ({
          id: asText(payment, "id"),
          saleId: asText(payment, "order_id"),
          date: asText(payment, "payment_date"),
          status: asText(payment, "status"),
          amount: asNumber(payment, "amount"),
          method: asNullableText(payment, "method"),
          reference: asNullableText(payment, "reference_number"),
        })),
        netPaidBySale,
      );
      for (const payment of paymentEvents) {
        const sale = salesMap.get(payment.saleId);
        if (!sale) continue;
        if (params.fromDate && payment.date < params.fromDate) continue;
        if (params.toDate && payment.date > params.toDate) continue;
        if (params.paymentMethod && (payment.method ?? "").toLowerCase() !== params.paymentMethod) continue;
        const kind = classifyReceivableActivity({
          sourceType: "customer_sale",
          transactionType: payment.type === "refund" ? "refund" : "payment",
          status: payment.status,
        });
        if (params.source === "customer_collection" && kind !== "customer_collection") continue;
        if (params.source === "customer_refund" && kind !== "customer_refund") continue;
        if (params.movementType) {
          const movementType = params.movementType === "customer_collection" ? "payment"
            : params.movementType === "customer_refund" ? "refund"
              : params.movementType;
          if (movementType !== (kind === "customer_refund" ? "refund" : "payment")) continue;
        }
        rows.push({
          id: `sale-payment:${payment.id}`,
          date: payment.date,
          kind,
          label: kind === "customer_refund" ? "Customer refund" : "Customer collection",
          sourceType: "customer_sale",
          reference: asText(sale, "reference_number"),
          partyName: asText(sale, "party_name", "Customer"),
          category: null,
          currency: normalizeReportingCurrency(sale.currency),
          amount: payment.amount,
          paymentMethod: payment.method ?? null,
          salespersonName: asNullableText(sale, "salesperson_name"),
          reversalOfId: null,
        });
      }
    }
  }
  if (db && wantsLoans && loanAccess(access)) {
    let accountIds: string[] | null = null;
    let accountFilterTruncated = false;
    if (params.accountId || params.category || params.borrower || params.search || params.currency) {
      let accountQuery = db.from("non_sales_receivable_details_v")
        .select("id")
        .order("id", { ascending: true })
        .limit(MAX_SOURCE_ROWS);
      if (params.accountId) accountQuery = accountQuery.eq("id", params.accountId);
      if (params.category) accountQuery = accountQuery.eq("category", params.category);
      if (params.borrower) accountQuery = accountQuery.ilike("borrower_display_name_snapshot", `%${params.borrower}%`);
      if (params.search) accountQuery = accountQuery.or(`receivable_number.ilike.%${params.search}%,borrower_display_name_snapshot.ilike.%${params.search}%`);
      if (params.currency) accountQuery = accountQuery.eq("currency", params.currency);
      const accountResult = await accountQuery;
      if (accountResult.error) throw errorMessage("non-Sales collection account filter", accountResult.error);
      accountIds = ((accountResult.data ?? []) as unknown as RawRecord[]).map((row) => asText(row, "id"));
      accountFilterTruncated = accountIds.length >= MAX_SOURCE_ROWS;
    }
    // An account filter can legitimately match no non-Sales accounts while
    // customer activity is still in scope. Skip only this branch rather than
    // returning early and discarding already-collected customer rows.
    if (accountIds?.length !== 0) {
      let transactionQuery = db.from("receivable_transactions")
        .select(transactionColumnsForReport(access))
        .order("effective_date", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(MAX_SOURCE_ROWS);
      if (accountIds) transactionQuery = transactionQuery.in("receivable_account_id", accountIds);
      // Keep a second predicate at the movement source as a defense in depth
      // for callers that do not provide an account filter. Account currency is
      // authoritative; this prevents mixed-currency activity summaries.
      if (params.currency) {
        transactionQuery = transactionQuery.in("receivable_account_id", accountIds ?? []);
      }
      if (params.fromDate) transactionQuery = transactionQuery.gte("effective_date", params.fromDate);
      if (params.toDate) transactionQuery = transactionQuery.lte("effective_date", params.toDate);
      if (params.paymentMethod) transactionQuery = transactionQuery.eq("payment_method", params.paymentMethod);
      if (params.movementType) transactionQuery = transactionQuery.eq("transaction_type", params.movementType);
      const transactionResult = await transactionQuery;
      if (transactionResult.error) throw errorMessage("non-Sales collection activity", transactionResult.error);
       sourceTruncated ||= accountFilterTruncated || (transactionResult.data?.length ?? 0) >= MAX_SOURCE_ROWS;
       const transactions = (transactionResult.data ?? []) as unknown as RawRecord[];
       const reversalContexts = await loadReversalContexts(db, transactions);
       const transactionAccountIds = [...new Set(transactions.map((row) => asText(row, "receivable_account_id")))];
      const accountsResult = transactionAccountIds.length ? await db.from("non_sales_receivable_details_v").select("id,receivable_number,borrower_display_name_snapshot,category,currency").in("id", transactionAccountIds) : { data: [], error: null };
      if (accountsResult.error) throw errorMessage("non-Sales collection accounts", accountsResult.error);
      const accounts = new Map(((accountsResult.data ?? []) as unknown as RawRecord[]).map((row) => [asText(row, "id"), row]));
      for (const transaction of transactions) {
        const account = accounts.get(asText(transaction, "receivable_account_id"));
        if (!account) continue;
        const type = asText(transaction, "transaction_type");
        const isAdjustment = type === "adjustment_increase" || type === "adjustment_decrease";
        const explicitNonSalesMovement = params.source === "non_sales"
          || params.source === "non_sales_opening"
          || params.source === "non_sales_disbursement"
          || params.source === "non_sales_adjustment"
          || params.source === "reversal";
        // The activity feed is a collections view by default. Opening and
        // disbursement movements remain available through their explicit
        // source filters, while adjustments require the explicit toggle.
        if (!explicitNonSalesMovement && type !== "repayment" && !isAdjustment && type !== "reversal") continue;
        // The explicit adjustment toggle controls the broad/all activity
        // feed. Selecting the dedicated adjustment source is itself an
        // explicit request, so it remains visible even when the toggle is off.
        if (isAdjustment && !params.includeAdjustments && params.source !== "non_sales_adjustment") continue;
        if (params.source === "non_sales_repayment" && type !== "repayment") continue;
        if (params.source === "non_sales_adjustment" && !isAdjustment) continue;
        if (params.source === "non_sales_opening" && type !== "opening_balance") continue;
        if (params.source === "non_sales_disbursement" && type !== "disbursement") continue;
       if (params.source === "reversal" && type !== "reversal") continue;
       if (params.source === "customer_sales" || params.source === "customer_collection" || params.source === "customer_refund") continue;
       const sanitized = sanitizeReportingTransaction(transaction, access);
       const reversalId = transaction.reversal_of_transaction_id ?? transaction.reversalOfTransactionId;
       const reversalContext = typeof reversalId === "string" ? reversalContexts.get(reversalId) : undefined;
       const kind = classifyReceivableActivity({ sourceType: "non_sales", transactionType: type });
        rows.push({
          id: `receivable:${sanitized.id}`,
          date: sanitized.effectiveDate,
          kind,
          label: activityLabel(kind),
          sourceType: "non_sales",
          reference: asText(account, "receivable_number"),
          partyName: asText(account, "borrower_display_name_snapshot", "Borrower"),
          category: asNullableText(account, "category"),
          currency: normalizeReportingCurrency(account.currency),
          amount: sanitized.amount,
          paymentMethod: sanitized.paymentMethod,
          salespersonName: null,
          reversalOfId: sanitizeReportingReversalReference({
            reversalOfId: sanitized.reversalOfTransactionId,
            source: sanitized.source,
            paymentMethod: sanitized.paymentMethod,
            relatedSource: reversalContext?.source,
            relatedPaymentMethod: reversalContext?.paymentMethod,
            canViewAccountingDetails: access.canViewAccountingDetails,
            canViewPayrollDetails: access.canViewPayrollDetails,
          }),
        });
      }
    }
  }
  rows.sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id));
  const pageRows = rows.slice((params.page - 1) * params.pageSize, params.page * params.pageSize);
  return {
    rows: pageRows,
    count: rows.length,
    page: params.page,
    pageSize: params.pageSize,
    filters: params,
    summaries: summarizeActivityByCurrency(rows.map((row) => ({ currency: row.currency, kind: row.kind, amount: row.amount }))),
    unsupportedFilters: unsupported,
    truncated: sourceTruncated || rows.length >= MAX_SOURCE_ROWS,
  };
}

export type ReconciliationReportRow = {
  accountId: string;
  receivableNumber: string;
  borrowerName: string;
  category: string;
  currency: string;
  transactionId: string;
  transactionType: string;
  direction: string;
  amount: number;
  effectiveDate: string;
  paymentMethod: string | null;
  source: string;
  accountingTreatment: string | null;
  postingStatus: string;
  postingId: string | null;
  journalEntryNumber: string | null;
  cashbookEntryId: string | null;
  reversalOfPostingId: string | null;
  notes: string | null;
};

export type ReconciliationReport = {
  rows: ReconciliationReportRow[];
  count: number;
  page: number;
  pageSize: number;
  filters: ReceivablesReportParams;
  unsupportedFilters: string[];
};

/** Accounting-gated reconciliation report with server-side filters. */
export async function getReceivablesReconciliationReport(
  input: Record<string, unknown>,
  access: ReceivablesReportScope,
): Promise<ReconciliationReport> {
  const params = normalizeReceivablesReportParams(input as ReceivablesReportParams);
  const unsupported = unsupportedFilters(params, RECONCILIATION_REPORT_FILTERS);
  if (!access.canViewReceivables || !access.canViewLoans || !access.canViewAccountingDetails) {
    return { ...emptyPage<ReconciliationReportRow>(params, unsupported) };
  }
  const db = createSupabaseAdminClient();
  let query = db.from("receivable_accounting_reconciliation_v").select(reconciliationColumnsForReport(access), { count: "exact" });
  query = excludePayrollLinkedReconciliationRows(query, access);
  if (params.search) query = query.or(`receivable_number.ilike.%${params.search}%,borrower_name.ilike.%${params.search}%,journal_entry_number.ilike.%${params.search}%`);
  if (params.currency) query = query.eq("currency", params.currency);
  if (params.category) query = query.eq("category", params.category);
  if (params.movementType) query = query.eq("transaction_type", params.movementType);
  if (params.postingStatus) query = query.eq("posting_status", params.postingStatus);
  if (params.accountingTreatment) query = query.eq("accounting_treatment", params.accountingTreatment);
  if (params.paymentMethod) query = query.eq("payment_method", params.paymentMethod);
  if (params.fromDate) query = query.gte("effective_date", params.fromDate);
  if (params.toDate) query = query.lte("effective_date", params.toDate);
  const result = await query.order("effective_date", { ascending: false }).order("created_at", { ascending: false }).order("receivable_transaction_id", { ascending: true }).range((params.page - 1) * params.pageSize, params.page * params.pageSize - 1);
  if (result.error) throw errorMessage("Receivables reconciliation report", result.error);
  const rows = ((result.data ?? []) as unknown as RawRecord[]).map((row) => {
    const protectedLink = sanitizeReportingAccountingLink(row, access);
    const payrollLinkHidden = !access.canViewPayrollDetails
      && (protectedLink.source === "payroll-linked" || protectedLink.paymentMethod === "payroll-linked");
    return {
      accountId: asText(row, "receivable_account_id"),
      receivableNumber: asText(row, "receivable_number"),
      borrowerName: asText(row, "borrower_name", "Borrower"),
      category: asText(row, "category"),
      currency: normalizeReportingCurrency(row.currency),
      transactionId: asText(row, "receivable_transaction_id"),
      transactionType: asText(row, "transaction_type"),
      direction: asText(row, "direction"),
      amount: asNumber(row, "amount"),
      effectiveDate: asText(row, "effective_date"),
      paymentMethod: protectedLink.paymentMethod,
      source: protectedLink.source,
      accountingTreatment: asNullableText(row, "accounting_treatment"),
      postingStatus: asText(row, "posting_status"),
      // A user may have Accounting visibility without Payroll visibility. In
      // that case keep the operational reconciliation state but do not expose
      // posting identifiers that could reveal a protected Payroll linkage.
      postingId: payrollLinkHidden ? null : asNullableText(row, "posting_id"),
      journalEntryNumber: payrollLinkHidden ? null : asNullableText(row, "journal_entry_number"),
      cashbookEntryId: payrollLinkHidden ? null : asNullableText(row, "cashbook_entry_id"),
       // The target posting can itself be Payroll-linked even when this
       // reversal row has a generic/accounting source. Keep the reversal
       // status visible, but expose the target identifier only to Payroll
       // detail viewers.
       reversalOfPostingId: !access.canViewPayrollDetails || payrollLinkHidden
         ? null
         : asNullableText(row, "reversal_of_posting_id"),
      notes: protectedLink.notes,
    } satisfies ReconciliationReportRow;
  });
  return { rows, count: result.count ?? 0, page: params.page, pageSize: params.pageSize, filters: params, unsupportedFilters: unsupported };
}

export type ManagementSummaryCurrency = {
  currency: string;
  customerOutstanding: number;
  currentOutstanding: number;
  nonSalesOutstanding: number;
  dueToday: number;
  dueNext7Days: number;
  overdue: number;
  noDueDate: number;
  collectionsThisMonth: number;
  repaymentsThisMonth: number;
  activeLoans: number;
  fullyRepaid: number;
  /** Present only for users allowed to inspect accounting reconciliation. */
  needsReview?: number;
  /** Present only for users allowed to inspect accounting reconciliation. */
  notPosted?: number;
  /** A bounded status source was capped before all accounts were counted. */
  statusCountsTruncated?: boolean;
  /** A bounded reconciliation source was capped before all movements were counted. */
  reconciliationTruncated?: boolean;
};

function emptyManagementSummary(currency: string): ManagementSummaryCurrency {
  return {
    currency,
    customerOutstanding: 0,
    currentOutstanding: 0,
    nonSalesOutstanding: 0,
    dueToday: 0,
    dueNext7Days: 0,
    overdue: 0,
    noDueDate: 0,
    collectionsThisMonth: 0,
    repaymentsThisMonth: 0,
    activeLoans: 0,
    fullyRepaid: 0,
  };
}

/** Currency-separated management summary, with each source queried only when visible. */
export async function getReceivablesManagementSummary(access: ReceivablesReportScope): Promise<ManagementSummaryCurrency[]> {
  if (!access.canViewReceivables) return [];
  const canReadCustomer = customerAccess(access);
  const canReadLoans = loanAccess(access);
  if (!canReadCustomer && !canReadLoans) return [];
  const db = createSupabaseAdminClient();
  const summaries = new Map<string, ManagementSummaryCurrency>();
  if (canReadCustomer) {
    let query = db.from("customer_receivables_metrics_v").select(CUSTOMER_METRIC_COLUMNS);
    if (access.salesScope.kind === "own") query = query.eq("responsible_profile_id", access.salesScope.profileId);
    const result = await query;
    if (result.error) throw errorMessage("Customer Receivables management summary", result.error);
    for (const row of (result.data ?? []) as unknown as RawRecord[]) {
      const currency = normalizeReportingCurrency(row.currency);
      const summary = summaries.get(currency) ?? emptyManagementSummary(currency);
      summary.customerOutstanding += asNumber(row, "customer_outstanding");
      summary.currentOutstanding += asNumber(row, "current_outstanding");
      summary.dueToday += asNumber(row, "due_today");
      summary.dueNext7Days += asNumber(row, "due_next_7_days");
      summary.overdue += asNumber(row, "overdue");
      summary.noDueDate += asNumber(row, "no_due_date");
      summary.collectionsThisMonth += asNumber(row, "collected_this_month");
      summaries.set(currency, summary);
    }
  }
  if (canReadLoans) {
    const [metricsResult, statusResult] = await Promise.all([
      db.from("non_sales_receivable_metrics_v").select(NON_SALES_METRIC_COLUMNS),
      db.from("non_sales_receivable_details_v").select(NON_SALES_STATUS_COLUMNS, { count: "exact" }).limit(MAX_SOURCE_ROWS),
    ]);
    if (metricsResult.error) throw errorMessage("non-Sales management summary", metricsResult.error);
    if (statusResult.error) throw errorMessage("non-Sales account status summary", statusResult.error);
    for (const row of (metricsResult.data ?? []) as unknown as RawRecord[]) {
      const currency = normalizeReportingCurrency(row.currency);
      const summary = summaries.get(currency) ?? emptyManagementSummary(currency);
      summary.nonSalesOutstanding += asNumber(row, "outstanding_amount");
      summary.dueToday += asNumber(row, "due_today");
      summary.dueNext7Days += asNumber(row, "due_next_7_days");
      summary.overdue += asNumber(row, "overdue_amount");
      summary.repaymentsThisMonth += asNumber(row, "recovered_this_month");
      summaries.set(currency, summary);
    }
    // Status counts come from the account detail source rather than treating
    // every account with an outstanding amount as an active loan. The read is
    // bounded just like the other reporting primitives.
    const statusRows = (statusResult.data ?? []) as unknown as RawRecord[];
    const statusCountsTruncated = (statusResult.count ?? 0) > statusRows.length;
    for (const row of statusRows) {
      const currency = normalizeReportingCurrency(row.currency);
      const summary = summaries.get(currency) ?? emptyManagementSummary(currency);
      if (asText(row, "status") === "active" && asNumber(row, "outstanding_amount") > 0) summary.activeLoans += 1;
      if (asText(row, "status") === "fully_repaid") summary.fullyRepaid += 1;
      if (statusCountsTruncated) summary.statusCountsTruncated = true;
      summaries.set(currency, summary);
    }
    // Accounting/reconciliation counts are optional and are queried only for
    // callers with accounting detail authority. This keeps the management
    // summary useful without leaking protected posting payloads.
    if (access.canViewAccountingDetails && access.canViewPayrollDetails) {
      const reconciliationResult = await db
        .from("receivable_accounting_reconciliation_v")
        .select("currency,posting_status", { count: "exact" })
        .limit(MAX_SOURCE_ROWS);
      if (reconciliationResult.error) throw errorMessage("Receivables reconciliation management summary", reconciliationResult.error);
      const reconciliationRows = (reconciliationResult.data ?? []) as unknown as RawRecord[];
      const reconciliationTruncated = (reconciliationResult.count ?? 0) > reconciliationRows.length;
      for (const row of reconciliationRows) {
        const currency = normalizeReportingCurrency(row.currency);
        const summary = summaries.get(currency) ?? emptyManagementSummary(currency);
        const postingStatus = asText(row, "posting_status");
        if (postingStatus === "needs_review") summary.needsReview = (summary.needsReview ?? 0) + 1;
        if (postingStatus === "not_posted") summary.notPosted = (summary.notPosted ?? 0) + 1;
        if (reconciliationTruncated) summary.reconciliationTruncated = true;
        summaries.set(currency, summary);
      }
    }
  }
  return [...summaries.values()].map((summary) => Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, typeof value === "number" ? Number(value.toFixed(4)) : value])) as ManagementSummaryCurrency).sort((left, right) => left.currency.localeCompare(right.currency));
}

/** Current-session wrappers keep actor resolution at the server boundary. */
export async function getCustomerOutstandingReportForCurrentActor(input: Record<string, unknown>) {
  return getCustomerOutstandingReport(input, await getReceivablesReportScope());
}

export async function getCustomerSalesStatementForCurrentActor(customerId: string, input: Record<string, unknown>) {
  return getCustomerSalesStatement(customerId, input, await getReceivablesReportScope());
}

export async function getNonSalesAccountStatementForCurrentActor(accountId: string, input: Record<string, unknown>) {
  return getNonSalesAccountStatement(accountId, input, await getReceivablesReportScope());
}

export async function getInstallmentReportForCurrentActor(input: Record<string, unknown>) {
  return getInstallmentReport(input, await getReceivablesReportScope());
}

export async function getReceivablesActivityReportForCurrentActor(input: Record<string, unknown>) {
  return getReceivablesActivityReport(input, await getReceivablesReportScope());
}

export async function getReceivablesReconciliationReportForCurrentActor(input: Record<string, unknown>) {
  return getReceivablesReconciliationReport(input, await getReceivablesReportScope());
}
