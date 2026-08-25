import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  mergeCustomerMetricRows,
  mergeCustomerSummaryRows,
  normalizeCustomerReceivablesParams,
  type CustomerMetric,
  type CustomerReceivablesListParams,
  type CustomerSummary,
} from "@/lib/receivables/customer";
import {
  summarizeReceivablesRows,
  type ReceivablesSummaryRow,
} from "@/lib/receivables/summary";
import type { SalesVisibilityScope } from "@/lib/sales/visibility";

const RECEIVABLE_COLUMNS = [
  "source_type",
  "source_id",
  "reference_number",
  "invoice_number",
  "receivable_type",
  "party_type",
  "party_id",
  "party_name",
  "currency",
  "original_amount",
  "paid_amount",
  "outstanding_amount",
  "receivable_status",
  "issue_date",
  "due_date",
  "days_overdue",
  "responsible_profile_id",
  "last_activity_date",
  "is_opening_balance",
].join(",");

export type ReceivablesAccess = {
  canViewCustomer: boolean;
  canViewLoans: boolean;
  canManageAccounts?: boolean;
  salesScope?: SalesVisibilityScope;
};

export type ReceivablesListParams = {
  q?: string;
  page?: string;
  pageSize?: string;
};

export type ReceivableRow = ReceivablesSummaryRow & {
  referenceNumber: string;
  invoiceNumber: string | null;
  receivableType: string;
  partyType: string;
  partyId: string;
  partyName: string;
  originalAmount: number;
  paidAmount: number;
  receivableStatus: string;
  issueDate: string;
  daysOverdue: number | null;
  responsibleProfileId: string | null;
  isOpeningBalance: boolean;
};

type ViewRow = {
  source_type: "customer_sale" | "non_sales";
  source_id: string;
  reference_number: string;
  invoice_number: string | null;
  receivable_type: string;
  party_type: string;
  party_id: string;
  party_name: string;
  currency: string;
  original_amount: string | number;
  paid_amount: string | number;
  outstanding_amount: string | number;
  receivable_status: string;
  issue_date: string;
  due_date: string | null;
  days_overdue: number | null;
  responsible_profile_id: string | null;
  last_activity_date: string | null;
  is_opening_balance: boolean;
};

const CUSTOMER_DETAIL_COLUMNS = [
  "source_id",
  "reference_number",
  "invoice_number",
  "invoice_date",
  "invoice_anchor_date",
  "customer_id",
  "customer_name",
  "company_name",
  "customer_email",
  "customer_phone",
  "party_name",
  "responsible_profile_id",
  "salesperson_name",
  "currency",
  "original_amount",
  "paid_amount",
  "refunded_amount",
  "outstanding_amount",
  "payment_status",
  "payment_terms_type",
  "credit_period_days",
  "payment_due_date",
  "due_date",
  "issue_date",
  "last_payment_date",
  "receivables_status",
  "aging_bucket",
  "days_overdue",
].join(",");

export type CustomerReceivableRow = {
  sourceId: string;
  referenceNumber: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceAnchorDate: string | null;
  customerId: string;
  customerName: string | null;
  companyName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  partyName: string;
  responsibleProfileId: string;
  salespersonName: string;
  currency: string;
  originalAmount: number;
  paidAmount: number;
  refundedAmount: number;
  outstandingAmount: number;
  paymentStatus: string;
  paymentTermsType: string | null;
  creditPeriodDays: number | null;
  paymentDueDate: string | null;
  dueDate: string | null;
  issueDate: string;
  lastPaymentDate: string | null;
  receivablesStatus: string;
  agingBucket: string;
  daysOverdue: number | null;
};

type CustomerDetailViewRow = {
  source_id: string;
  reference_number: string;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_anchor_date: string | null;
  customer_id: string;
  customer_name: string | null;
  company_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  party_name: string;
  responsible_profile_id: string;
  salesperson_name: string;
  currency: string;
  original_amount: string | number;
  paid_amount: string | number;
  refunded_amount: string | number;
  outstanding_amount: string | number;
  payment_status: string;
  payment_terms_type: string | null;
  credit_period_days: number | null;
  payment_due_date: string | null;
  due_date: string | null;
  issue_date: string;
  last_payment_date: string | null;
  receivables_status: string;
  aging_bucket: string;
  days_overdue: number | null;
};

function mapCustomerRow(row: CustomerDetailViewRow): CustomerReceivableRow {
  return {
    sourceId: row.source_id,
    referenceNumber: row.reference_number,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    invoiceAnchorDate: row.invoice_anchor_date,
    customerId: row.customer_id,
    customerName: row.customer_name,
    companyName: row.company_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    partyName: row.party_name,
    responsibleProfileId: row.responsible_profile_id,
    salespersonName: row.salesperson_name,
    currency: row.currency,
    originalAmount: Number(row.original_amount),
    paidAmount: Number(row.paid_amount),
    refundedAmount: Number(row.refunded_amount),
    outstandingAmount: Number(row.outstanding_amount),
    paymentStatus: row.payment_status,
    paymentTermsType: row.payment_terms_type,
    creditPeriodDays: row.credit_period_days,
    paymentDueDate: row.payment_due_date,
    dueDate: row.due_date,
    issueDate: row.issue_date,
    lastPaymentDate: row.last_payment_date,
    receivablesStatus: row.receivables_status,
    agingBucket: row.aging_bucket,
    daysOverdue: row.days_overdue,
  };
}

function mapRow(row: ViewRow): ReceivableRow {
  return {
    sourceType: row.source_type,
    sourceId: row.source_id,
    referenceNumber: row.reference_number,
    invoiceNumber: row.invoice_number,
    receivableType: row.receivable_type,
    partyType: row.party_type,
    partyId: row.party_id,
    partyName: row.party_name,
    currency: row.currency,
    originalAmount: Number(row.original_amount),
    paidAmount: Number(row.paid_amount),
    outstandingAmount: Number(row.outstanding_amount),
    receivableStatus: row.receivable_status,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    daysOverdue: row.days_overdue,
    responsibleProfileId: row.responsible_profile_id,
    lastActivityDate: row.last_activity_date,
    isOpeningBalance: row.is_opening_balance,
  };
}

function parseList(params: ReceivablesListParams) {
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(10, Number.parseInt(params.pageSize ?? "25", 10) || 25),
  );
  const search = String(params.q ?? "")
    .trim()
    .slice(0, 80)
    .replace(/[%,().]/g, " ")
    .replace(/\s+/g, " ");
  return { page, pageSize, search };
}

async function getViewPage(
  view: "customer_receivables_v" | "non_sales_receivables_v",
  params: ReceivablesListParams,
) {
  const { page, pageSize, search } = parseList(params);
  const db = createSupabaseAdminClient();
  let query = db.from(view).select(RECEIVABLE_COLUMNS, { count: "exact" });
  if (search) {
    query = query.or(
      `party_name.ilike.%${search}%,reference_number.ilike.%${search}%,invoice_number.ilike.%${search}%`,
    );
  }
  const result = await query
    .order("outstanding_amount", { ascending: false })
    .order("issue_date", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (result.error) {
    console.error("Receivables list query failed", {
      view,
      code: result.error.code,
      message: result.error.message,
    });
    throw new Error("Unable to load receivables.");
  }
  return {
    rows: ((result.data ?? []) as unknown as ViewRow[]).map(mapRow),
    count: result.count ?? 0,
    page,
    pageSize,
    search,
  };
}

async function getAllViewRows(
  view: "customer_receivables_v" | "non_sales_receivables_v",
) {
  const db = createSupabaseAdminClient();
  const rows: ViewRow[] = [];
  const batchSize = 500;
  for (let offset = 0; ; offset += batchSize) {
    const result = await db
      .from(view)
      .select(RECEIVABLE_COLUMNS)
      .order("source_id", { ascending: true })
      .range(offset, offset + batchSize - 1);
    if (result.error) {
      console.error("Receivables dashboard query failed", {
        view,
        code: result.error.code,
        message: result.error.message,
      });
      throw new Error("Unable to load the Receivables dashboard.");
    }
    const batch = (result.data ?? []) as unknown as ViewRow[];
    rows.push(...batch);
    if (batch.length < batchSize) break;
  }
  return rows.map(mapRow);
}

function dhakaBusinessDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function getReceivablesDashboard(access: ReceivablesAccess) {
  const salesScope = access.salesScope ?? { kind: "none" as const };
  const [customerMetrics, customerRows, loanRows] = await Promise.all([
    access.canViewCustomer && salesScope.kind !== "none"
      ? getCustomerReceivableMetrics(salesScope)
      : Promise.resolve([]),
    access.canViewCustomer && salesScope.kind !== "none"
      ? getRecentCustomerReceivables(salesScope)
      : Promise.resolve([]),
    access.canViewLoans ? getAllViewRows("non_sales_receivables_v") : Promise.resolve([]),
  ]);
  const loanSummary = summarizeReceivablesRows(loanRows, dhakaBusinessDate());
  const summaries = new Map(
    loanSummary.byCurrency.map((summary) => [summary.currency, { ...summary }]),
  );
  for (const metric of customerMetrics) {
    const current = summaries.get(metric.currency) ?? {
      currency: metric.currency,
      totalOutstanding: 0,
      customerOutstanding: 0,
      nonSalesOutstanding: 0,
      dueToday: 0,
      dueThisWeek: 0,
      overdue: 0,
      recordCount: 0,
    };
    current.totalOutstanding += metric.customerOutstanding;
    current.customerOutstanding += metric.customerOutstanding;
    current.dueToday += metric.dueToday;
    current.dueThisWeek += metric.dueNext7Days;
    current.overdue += metric.overdue;
    current.recordCount += metric.recordCount;
    summaries.set(metric.currency, current);
  }
  const customerRecentRows: ReceivableRow[] = customerRows.map((row) => ({
    sourceType: "customer_sale",
    sourceId: row.sourceId,
    referenceNumber: row.referenceNumber,
    invoiceNumber: row.invoiceNumber,
    receivableType: "customer_sale",
    partyType: "customer",
    partyId: row.customerId,
    partyName: row.partyName,
    currency: row.currency,
    originalAmount: row.originalAmount,
    paidAmount: row.paidAmount,
    outstandingAmount: row.outstandingAmount,
    receivableStatus: row.receivablesStatus,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    daysOverdue: row.daysOverdue,
    responsibleProfileId: row.responsibleProfileId,
    lastActivityDate: row.lastPaymentDate ?? row.invoiceDate ?? row.issueDate,
    isOpeningBalance: false,
  }));
  const rows = [...customerRecentRows, ...loanRows];
  const recent = [...customerRecentRows, ...loanSummary.recent]
    .sort((left, right) =>
      (right.lastActivityDate ?? "").localeCompare(left.lastActivityDate ?? ""),
    )
    .slice(0, 8);
  return {
    byCurrency: [...summaries.values()].sort((left, right) =>
      left.currency.localeCompare(right.currency),
    ),
    customerMetrics,
    recent,
    rows,
  };
}

export async function getCustomerReceivables(
  params: CustomerReceivablesListParams,
  access: Pick<ReceivablesAccess, "canViewCustomer" | "salesScope">,
) {
  const filters = normalizeCustomerReceivablesParams(params);
  const salesScope = access.salesScope ?? { kind: "none" as const };
  if (!access.canViewCustomer || salesScope.kind === "none") {
    return { rows: [], count: 0, ...filters };
  }
  const db = createSupabaseAdminClient();
  let query = db
    .from("customer_receivables_detail_v")
    .select(CUSTOMER_DETAIL_COLUMNS, { count: "exact" });
  if (salesScope.kind === "own") {
    query = query.eq("responsible_profile_id", salesScope.profileId);
  }
  if (filters.search) {
    query = query.or(
      [
        `party_name.ilike.%${filters.search}%`,
        `company_name.ilike.%${filters.search}%`,
        `customer_email.ilike.%${filters.search}%`,
        `customer_phone.ilike.%${filters.search}%`,
        `reference_number.ilike.%${filters.search}%`,
        `invoice_number.ilike.%${filters.search}%`,
      ].join(","),
    );
  }
  if (filters.paymentStatus) query = query.eq("payment_status", filters.paymentStatus);
  if (filters.receivablesStatus) {
    query = query.eq("receivables_status", filters.receivablesStatus);
  }
  if (filters.agingBucket) query = query.eq("aging_bucket", filters.agingBucket);
  if (filters.dueFrom) query = query.gte("due_date", filters.dueFrom);
  if (filters.dueTo) query = query.lte("due_date", filters.dueTo);
  if (filters.salesperson) query = query.ilike("salesperson_name", `%${filters.salesperson}%`);
  if (filters.outstandingOnly) query = query.gt("outstanding_amount", 0);
  const result = await query
    .order("outstanding_amount", { ascending: false })
    .order("issue_date", { ascending: false })
    .range(
      (filters.page - 1) * filters.pageSize,
      filters.page * filters.pageSize - 1,
    );
  if (result.error) {
    console.error("Customer Receivables query failed", {
      code: result.error.code,
      message: result.error.message,
    });
    throw new Error("Unable to load Customer Receivables.");
  }
  return {
    rows: ((result.data ?? []) as unknown as CustomerDetailViewRow[]).map(mapCustomerRow),
    count: result.count ?? 0,
    ...filters,
  };
}

async function getRecentCustomerReceivables(salesScope: SalesVisibilityScope) {
  if (salesScope.kind === "none") return [];
  const db = createSupabaseAdminClient();
  let query = db
    .from("customer_receivables_detail_v")
    .select(CUSTOMER_DETAIL_COLUMNS)
    .gt("outstanding_amount", 0);
  if (salesScope.kind === "own") {
    query = query.eq("responsible_profile_id", salesScope.profileId);
  }
  const result = await query
    .order("last_payment_date", { ascending: false, nullsFirst: false })
    .order("issue_date", { ascending: false })
    .limit(8);
  if (result.error) {
    console.error("Recent Customer Receivables query failed", {
      code: result.error.code,
      message: result.error.message,
    });
    throw new Error("Unable to load the Receivables dashboard.");
  }
  return ((result.data ?? []) as unknown as CustomerDetailViewRow[]).map(mapCustomerRow);
}

export async function getCustomerReceivableSummaries(
  salesScope: SalesVisibilityScope,
) {
  if (salesScope.kind === "none") return [];
  const db = createSupabaseAdminClient();
  let query = db.from("customer_receivables_summary_v").select("*");
  if (salesScope.kind === "own") {
    query = query.eq("responsible_profile_id", salesScope.profileId);
  }
  const result = await query.order("total_outstanding", { ascending: false });
  if (result.error) {
    console.error("Customer Receivables summary query failed", {
      code: result.error.code,
      message: result.error.message,
    });
    throw new Error("Unable to load Customer Receivables summaries.");
  }
  return mergeCustomerSummaryRows(
    (result.data ?? []).map((row) => ({
      customerId: String(row.customer_id),
      customerName: row.customer_name ? String(row.customer_name) : null,
      companyName: row.company_name ? String(row.company_name) : null,
      currency: String(row.currency),
      totalInvoiced: Number(row.total_invoiced),
      totalPaid: Number(row.total_paid),
      totalOutstanding: Number(row.total_outstanding),
      totalOverdue: Number(row.total_overdue),
      receivableCount: Number(row.sale_count),
    } satisfies CustomerSummary)),
  );
}

async function getCustomerReceivableMetrics(salesScope: SalesVisibilityScope) {
  if (salesScope.kind === "none") return [];
  const db = createSupabaseAdminClient();
  let query = db.from("customer_receivables_metrics_v").select("*");
  if (salesScope.kind === "own") {
    query = query.eq("responsible_profile_id", salesScope.profileId);
  }
  const result = await query.order("currency", { ascending: true });
  if (result.error) {
    console.error("Customer Receivables metrics query failed", {
      code: result.error.code,
      message: result.error.message,
    });
    throw new Error("Unable to load Customer Receivables metrics.");
  }
  return mergeCustomerMetricRows(
    (result.data ?? []).map((row) => ({
      currency: String(row.currency),
      customerOutstanding: Number(row.customer_outstanding),
      currentOutstanding: Number(row.current_outstanding),
      dueToday: Number(row.due_today),
      dueNext7Days: Number(row.due_next_7_days),
      overdue: Number(row.overdue),
      noDueDate: Number(row.no_due_date),
      collectedThisMonth: Number(row.collected_this_month),
      recordCount: Number(row.open_record_count),
    } satisfies CustomerMetric)),
  );
}

export async function getNonSalesReceivables(
  params: ReceivablesListParams,
  access: Pick<ReceivablesAccess, "canViewLoans">,
) {
  if (!access.canViewLoans) return { rows: [], count: 0, page: 1, pageSize: 25, search: "" };
  return getViewPage("non_sales_receivables_v", params);
}

export async function getReceivablePartyOptions(
  access: Pick<ReceivablesAccess, "canManageAccounts">,
) {
  const empty = {
    employees: [],
    customers: [],
    suppliers: [],
    crmCompanies: [],
    crmContacts: [],
    externalParties: [],
  };
  if (!access.canManageAccounts) return empty;
  const db = createSupabaseAdminClient();
  const [employees, customers, suppliers, crmCompanies, crmContacts, externalParties] =
    await Promise.all([
      db
        .from("hr_employee_records")
        .select("id,employee_number,job_title,employment_status,profiles:profile_id(full_name,email)")
        .in("employment_status", ["active", "probation", "on_leave"])
        .order("employee_number"),
      db
        .from("profiles")
        .select("id,full_name,company_name,email,phone")
        .eq("role", "customer")
        .eq("status", "active")
        .order("full_name"),
      db.from("suppliers").select("id,code,name").neq("status", "archived").order("name"),
      db.from("crm_companies").select("id,name").neq("status", "inactive").order("name"),
      db.from("crm_contacts").select("id,full_name,email,phone").eq("status", "active").order("full_name"),
      db
        .from("receivable_external_parties")
        .select("id,party_type,display_name,company_name")
        .eq("is_active", true)
        .order("display_name"),
    ]);
  const error =
    employees.error ??
    customers.error ??
    suppliers.error ??
    crmCompanies.error ??
    crmContacts.error ??
    externalParties.error;
  if (error) {
    console.error("Receivable party options query failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Unable to load receivable party options.");
  }
  return {
    employees: employees.data ?? [],
    customers: customers.data ?? [],
    suppliers: suppliers.data ?? [],
    crmCompanies: crmCompanies.data ?? [],
    crmContacts: crmContacts.data ?? [],
    externalParties: externalParties.data ?? [],
  };
}
