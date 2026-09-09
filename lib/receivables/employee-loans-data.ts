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
