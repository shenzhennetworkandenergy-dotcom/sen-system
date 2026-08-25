import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  summarizeReceivablesRows,
  type ReceivablesSummaryRow,
} from "@/lib/receivables/summary";

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
  const [customerRows, loanRows] = await Promise.all([
    access.canViewCustomer ? getAllViewRows("customer_receivables_v") : Promise.resolve([]),
    access.canViewLoans ? getAllViewRows("non_sales_receivables_v") : Promise.resolve([]),
  ]);
  const rows = [...customerRows, ...loanRows];
  return {
    ...summarizeReceivablesRows(rows, dhakaBusinessDate()),
    rows,
  };
}

export async function getCustomerReceivables(
  params: ReceivablesListParams,
  access: Pick<ReceivablesAccess, "canViewCustomer">,
) {
  if (!access.canViewCustomer) return { rows: [], count: 0, page: 1, pageSize: 25, search: "" };
  return getViewPage("customer_receivables_v", params);
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
