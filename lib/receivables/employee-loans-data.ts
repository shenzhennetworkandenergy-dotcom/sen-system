import "server-only";

import { requireEmployeeHrRecord } from "@/lib/hr/self-service";
import { hasCompleteLoanConsent } from "@/lib/receivables/employee-loans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getEmployeeLoanIdentity() {
  const context = await requireEmployeeHrRecord();
  if (!context.employee) return { ...context, identity: null };
  const { data, error } = await createSupabaseAdminClient()
    .from("hr_employee_records")
    .select("id,profile_id,employee_number,job_title,employment_status,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email,phone,address_line,city,region,postal_code),hr_departments(name),hr_designations(name),hr_employee_profiles(national_id,present_address,permanent_address)")
    .eq("id", context.employee.id)
    .maybeSingle();
  if (error) throw new Error("Unable to load your employee identity.");
  return { ...context, identity: data };
}

export async function getEmployeeLoanConsent(consentId: string) {
  const context = await requireEmployeeHrRecord();
  if (!context.employee || !UUID.test(consentId)) return { ...context, consent: null };
  const { data, error } = await createSupabaseAdminClient()
    .from("receivable_employee_loan_consents")
    .select("id,consent_version,consent_items,accepted_at,used_at")
    .eq("id", consentId)
    .eq("employee_profile_id", context.profile.id)
    .eq("employee_record_id", context.employee.id)
    .is("used_at", null)
    .maybeSingle();
  if (error) throw new Error("Unable to verify your loan guidance acceptance.");
  return { ...context, consent: data && hasCompleteLoanConsent(data) ? data : null };
}

export async function getEmployeeLoanApplications() {
  const context = await requireEmployeeHrRecord();
  if (!context.employee) return { ...context, rows: [] };
  const { data, error } = await createSupabaseAdminClient()
    .from("receivable_accounts")
    .select("id,receivable_number,requested_amount,approved_amount,currency,status,created_at,receivable_employee_loan_details(workflow_stage,agreement_sent_at,final_approved_at)")
    .eq("employee_record_id", context.employee.id)
    .eq("category", "employee_loan")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Unable to load your loan applications.");
  return { ...context, rows: data ?? [] };
}

export async function getEmployeeLoanApplication(accountId: string) {
  const context = await getEmployeeLoanIdentity();
  if (!context.employee || !UUID.test(accountId)) return { ...context, application: null };
  const db = createSupabaseAdminClient();
  const [account, detail, documents, disbursement] = await Promise.all([
    db.from("receivable_accounts")
      .select("id,receivable_number,employee_record_id,requested_amount,approved_amount,currency,status,installment_count,installment_amount,first_due_date,final_due_date,disbursement_date,created_at")
      .eq("id", accountId)
      .eq("employee_record_id", context.employee.id)
      .eq("category", "employee_loan")
      .maybeSingle(),
    db.from("receivable_employee_loan_details").select("*")
      .eq("receivable_account_id", accountId)
      .eq("employee_profile_id", context.profile.id)
      .maybeSingle(),
    db.from("receivable_loan_documents")
      .select("id,document_type,document_status,original_file_name,mime_type,file_size,uploaded_at")
      .eq("receivable_account_id", accountId)
      .eq("employee_profile_id", context.profile.id)
      .order("uploaded_at", { ascending: false })
      .limit(20),
    db.from("receivable_transactions")
      .select("id,amount,effective_date,notes,created_at")
      .eq("receivable_account_id", accountId)
      .eq("transaction_type", "disbursement")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const error = account.error ?? detail.error ?? documents.error ?? disbursement.error;
  if (error) throw new Error("Unable to load your loan application.");
  if (!account.data || !detail.data) return { ...context, application: null };
  return { ...context, application: { account: account.data, detail: detail.data, documents: documents.data ?? [], disbursement: disbursement.data } };
}

export async function getAdminEmployeeLoanExtension(accountId: string) {
  if (!UUID.test(accountId)) return null;
  const db = createSupabaseAdminClient();
  const { data: detail, error } = await db.from("receivable_employee_loan_details")
    .select("*,receivable_employee_loan_consents(consent_version,consent_items,accepted_at)").eq("receivable_account_id", accountId).maybeSingle();
  if (error) throw new Error("Unable to load employee loan application details.");
  if (!detail) return null;
  const [employee, documents, representatives, disbursement] = await Promise.all([
    db.from("hr_employee_records")
      .select("id,employee_number,job_title,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email,phone,address_line,city,region,postal_code),hr_departments(name),hr_designations(name),hr_employee_profiles(national_id,present_address,permanent_address)")
      .eq("profile_id", detail.employee_profile_id).maybeSingle(),
    db.from("receivable_loan_documents")
      .select("id,document_type,document_status,original_file_name,mime_type,file_size,uploaded_at,uploaded_by,verified_at")
      .eq("receivable_account_id", accountId).order("uploaded_at", { ascending: false }).limit(50),
    db.from("profiles")
      .select("id,full_name,email")
      .eq("role", "admin").eq("status", "active").is("archived_at", null)
      .order("full_name").limit(200),
    db.from("receivable_transactions")
      .select("id,amount,effective_date,notes,created_at")
      .eq("receivable_account_id", accountId)
      .eq("transaction_type", "disbursement")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (employee.error ?? documents.error ?? representatives.error ?? disbursement.error) throw new Error("Unable to load employee loan evidence.");
  return { detail, employee: employee.data, documents: documents.data ?? [], representatives: representatives.data ?? [], disbursement: disbursement.data };
}

type AdminLoanRow = {
  id: string;
  receivable_number: string;
  requested_amount: number;
  approved_amount: number | null;
  currency: string;
  status: string;
  created_at: string;
  employee_record_id: string;
  receivable_employee_loan_details: Record<string, unknown> | Record<string, unknown>[] | null;
  employee?: Record<string, unknown> | null;
};

function relation<T extends Record<string, unknown>>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function getAdminEmployeeLoanApplications() {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("receivable_accounts")
    .select("id,receivable_number,requested_amount,approved_amount,currency,status,created_at,employee_record_id,receivable_employee_loan_details(workflow_stage,agreement_sent_at,final_approved_at)")
    .eq("category", "employee_loan")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("Unable to load employee loan applications.");
  const rows = (data ?? []) as unknown as AdminLoanRow[];
  const employeeIds = rows.map((row) => row.employee_record_id).filter(Boolean);
  if (!employeeIds.length) return [];
  const { data: employees, error: employeeError } = await db
    .from("hr_employee_records")
    .select("id,employee_number,job_title,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email)")
    .in("id", employeeIds);
  if (employeeError) throw new Error("Unable to load employee loan owners.");
  const byId = new Map((employees ?? []).map((employee) => [employee.id, employee]));
  return rows.map((row) => ({
    ...row,
    detail: relation(row.receivable_employee_loan_details),
    employee: byId.get(row.employee_record_id) ?? null,
  }));
}

export async function getAdminEmployeeLoanDetail(accountId: string) {
  if (!UUID.test(accountId)) return null;
  const extension = await getAdminEmployeeLoanExtension(accountId);
  if (!extension) return null;
  const db = createSupabaseAdminClient();
  const [{ data: account, error: accountError }, { data: installments, error: installmentsError }, { data: transactions, error: transactionsError }, { data: audit, error: auditError }] = await Promise.all([
    db.from("receivable_accounts")
      .select("id,receivable_number,employee_record_id,category,requested_amount,approved_amount,currency,status,installment_count,installment_amount,first_due_date,final_due_date,disbursement_date,created_at,approved_at,existing_exposure,outstanding_amount,recovered_amount,disbursed_amount,opening_principal,opening_as_of_date,default_repayment_method,notes")
      .eq("id", accountId).eq("category", "employee_loan").maybeSingle(),
    db.from("receivable_installments")
      .select("id,installment_number,due_date,amount_due,paid_amount,remaining_amount,status")
      .eq("receivable_account_id", accountId).order("installment_number"),
    db.from("receivable_transactions")
      .select("id,transaction_type,direction,amount,effective_date,payment_method,notes,operation_id,created_at")
      .eq("receivable_account_id", accountId).order("created_at", { ascending: false }),
    db.from("audit_logs")
      .select("id,action,description,created_at")
      .eq("entity_id", accountId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (accountError || installmentsError || transactionsError || auditError) throw new Error("Unable to load employee loan detail.");
  if (!account) return null;
  const accountView = {
    id: account.id,
    receivableNumber: account.receivable_number,
    borrowerName: relation(extension.employee?.profiles as Record<string, unknown> | Record<string, unknown>[] | null)?.full_name
      || extension.employee?.employee_number || "Employee",
    borrowerType: "employee",
    category: account.category,
    requestedAmount: Number(account.requested_amount),
    approvedAmount: account.approved_amount == null ? null : Number(account.approved_amount),
    currency: account.currency,
    status: account.status,
    installmentCount: account.installment_count,
    installmentAmount: account.installment_amount,
    firstDueDate: account.first_due_date,
    finalDueDate: account.final_due_date,
    disbursementDate: account.disbursement_date,
    createdAt: account.created_at,
    approvedAt: account.approved_at,
    existingExposure: Number(account.existing_exposure ?? 0),
    outstandingAmount: Number(account.outstanding_amount ?? 0),
    recoveredAmount: Number(account.recovered_amount ?? 0),
    disbursedAmount: Number(account.disbursed_amount ?? 0),
    openingPrincipal: Number(account.opening_principal ?? 0),
    openingAsOfDate: account.opening_as_of_date,
    defaultRepaymentMethod: account.default_repayment_method,
    notes: account.notes,
  };
  return {
    account: accountView,
    extension,
    installments: installments ?? [],
    transactions: transactions ?? [],
    audit: audit ?? [],
  };
}
