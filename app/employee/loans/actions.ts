"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireEmployeeHrRecord } from "@/lib/hr/self-service";
import {
  EMPLOYEE_LOAN_DOCUMENT_BUCKET,
  normalizeEmployeeLoanApplication,
  normalizeLoanConsent,
  validatePrivateLoanDocument,
} from "@/lib/receivables/employee-loans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const go = (path: string, kind: "success" | "error", message: string): never =>
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);

export async function acceptLoanGuidanceAction(form: FormData) {
  const context = await requireEmployeeHrRecord();
  const employeeId = context.employee?.id;
  if (!employeeId) go("/employee/loans/apply", "error", "Your employee record is not configured.");
  let consentId = "";
  try {
    const consent = normalizeLoanConsent(Object.fromEntries(form.entries()));
    const { data, error } = await createSupabaseAdminClient()
      .from("receivable_employee_loan_consents")
      .insert({
        employee_profile_id: context.profile.id,
        employee_record_id: employeeId,
        consent_version: consent.version,
        consent_items: consent.items,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Unable to record your acknowledgement.");
    consentId = data.id;
  } catch (error) {
    go("/employee/loans/apply", "error", error instanceof Error ? error.message : "Unable to continue.");
  }
  redirect(`/employee/loans/apply/details?consent=${encodeURIComponent(consentId)}`);
}

export async function submitEmployeeLoanApplicationAction(form: FormData) {
  const context = await requireEmployeeHrRecord();
  if (!context.employee) go("/employee/loans/apply", "error", "Your employee record is not configured.");
  let applicationId = "";
  try {
    const witnessNames = form.getAll("witness_name");
    const witnessAddresses = form.getAll("witness_address");
    const witnessPhones = form.getAll("witness_phone");
    const witnessCount = Math.max(witnessNames.length, witnessAddresses.length, witnessPhones.length);
    const input = normalizeEmployeeLoanApplication({
      requestedAmount: value(form, "requested_amount"), purpose: value(form, "purpose"),
      repaymentMonths: value(form, "repayment_months"), repaymentDays: value(form, "repayment_days"),
      installmentFrequency: value(form, "installment_frequency"),
      proposedInstallment: value(form, "proposed_installment"), preferredStartDate: value(form, "preferred_start_date"),
      detailedExplanation: value(form, "detailed_explanation"), employeeNote: value(form, "employee_note"),
      witnesses: Array.from({ length: witnessCount }, (_, index) => ({
        name: String(witnessNames[index] ?? "").trim(),
        address: String(witnessAddresses[index] ?? "").trim(),
        phone: String(witnessPhones[index] ?? "").trim(),
      })),
    });
    const consentId = value(form, "consent_id");
    const { data, error } = await createSupabaseAdminClient().rpc("create_employee_loan_application", {
      actor_profile_id: context.profile.id,
      requested_consent_id: consentId,
      requested_operation_id: randomUUID(),
      requested_amount: input.requestedAmount,
      requested_purpose: input.purpose,
      requested_months: input.repaymentMonths,
      requested_days: input.repaymentDays,
      requested_installment_frequency: input.installmentFrequency,
      requested_installment: input.proposedInstallment,
      requested_start_date: input.preferredStartDate,
      requested_explanation: input.detailedExplanation,
      requested_employee_note: input.employeeNote,
      requested_witnesses: input.witnesses,
    });
    if (error || !data) throw new Error(error?.message || "Unable to submit your loan application.");
    applicationId = data;
  } catch (error) {
    const consentId = value(form, "consent_id");
    go(`/employee/loans/apply/details?consent=${encodeURIComponent(consentId)}`, "error", error instanceof Error ? error.message : "Unable to submit application.");
  }
  revalidatePath("/employee/loans");
  redirect(`/employee/loans/${applicationId}?success=${encodeURIComponent("Loan application submitted for Admin review.")}`);
}

export async function uploadSignedLoanAgreementAction(form: FormData) {
  const context = await requireEmployeeHrRecord();
  const accountId = value(form, "account_id");
  const employeeId = context.employee?.id;
  if (!employeeId) go("/employee/loans", "error", "Your employee record is not configured.");
  const db = createSupabaseAdminClient();
  let storagePath: string | null = null;
  try {
    const { data: account, error: accessError } = await db.from("receivable_accounts")
      .select("id,receivable_employee_loan_details!inner(agreement_sent_at)")
      .eq("id", accountId)
      .eq("employee_record_id", employeeId)
      .eq("category", "employee_loan")
      .not("receivable_employee_loan_details.agreement_sent_at", "is", null)
      .maybeSingle();
    if (accessError || !account) throw new Error("Only your own sent agreement may be uploaded.");
    const rawFile = form.get("signed_agreement");
    if (!(rawFile instanceof File)) throw new Error("Choose the signed agreement file.");
    const file = validatePrivateLoanDocument(rawFile);
    storagePath = `${employeeId}/${accountId}/signed-agreement/${randomUUID()}.${file.extension}`;
    const upload = await db.storage.from(EMPLOYEE_LOAN_DOCUMENT_BUCKET)
      .upload(storagePath, await rawFile.arrayBuffer(), { contentType: file.mimeType, upsert: false });
    if (upload.error) throw new Error("Unable to upload the signed agreement.");
    const result = await db.rpc("record_employee_loan_document", {
      actor_profile_id: context.profile.id,
      requested_account_id: accountId,
      requested_document_type: "signed_agreement",
      requested_storage_path: storagePath,
      requested_original_name: file.originalName,
      requested_mime_type: file.mimeType,
      requested_file_size: file.size,
    });
    if (result.error) throw new Error(result.error.message);
    revalidatePath(`/employee/loans/${accountId}`);
    revalidatePath(`/admin/receivables/loans/${accountId}`);
    go(`/employee/loans/${accountId}`, "success", "Signed agreement submitted for final Admin review.");
  } catch (error) {
    if (storagePath) await db.storage.from(EMPLOYEE_LOAN_DOCUMENT_BUCKET).remove([storagePath]);
    go(`/employee/loans/${accountId}`, "error", error instanceof Error ? error.message : "Unable to upload agreement.");
  }
}
