"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHrAdmin } from "@/lib/hr/admin";
import { assertPayrollStatusTransition, type PayrollStatus } from "@/lib/hr/payroll-receivables";
import type { PayrollAutofill, PayrollQuote } from "@/lib/hr/payroll-autofill";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const uuid = (value: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("Choose a valid employee or payroll record.");
  return value;
};
// Decimal strings go to PostgreSQL unchanged. Never round an untrusted value
// differently in the browser/server, or convert large money through JS floats.
const money = (value: string) => {
  if (!/^\d{1,14}(\.\d{1,2})?$/.test(value)) throw new Error("Enter a nonnegative amount with at most two decimal places.");
  return value;
};
const date = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid date.");
  return value;
};

export async function getPayrollAutofillAction(employeeId: string): Promise<PayrollAutofill> {
  const { profile } = await requireHrAdmin();
  const { data, error } = await createSupabaseAdminClient().rpc("hr_payroll_autofill_v1", {
    actor_profile_id: profile.id, requested_employee_id: uuid(employeeId),
  });
  if (error) throw new Error(error.message);
  return data as PayrollAutofill;
}

export async function getPayrollQuoteAction(input: {
  employeeId: string; effective: string; currency: string; base: string;
  allowance: string; bonus: string; manual: string; payrollId?: string;
}): Promise<PayrollQuote> {
  const { profile } = await requireHrAdmin();
  const { data, error } = await createSupabaseAdminClient().rpc("hr_payroll_quote_v1", {
    actor_profile_id: profile.id, requested_employee_id: uuid(input.employeeId),
    effective_date: date(input.effective), requested_currency: input.currency,
    base: money(input.base), allowance: money(input.allowance || "0"), bonus: money(input.bonus || "0"), manual: money(input.manual || "0"),
    excluded_payroll_id: input.payrollId ? uuid(input.payrollId) : null,
  });
  if (error) throw new Error(error.message);
  return data as PayrollQuote;
}

export async function savePayrollDraftV1(form: FormData) {
  const { profile } = await requireHrAdmin();
  let message = "Draft payroll saved. No repayment was posted."; let kind = "success";
  try {
    if (form.get("effective_date_confirmed") !== "on") throw new Error("Explicitly confirm the payment effective date.");
    const { error } = await createSupabaseAdminClient().rpc("save_hr_payroll_draft_v1", {
      actor_profile_id: profile.id, requested_employee_id: uuid(field(form, "employee_record_id")),
      requested_start: date(field(form, "period_start")), requested_end: date(field(form, "period_end")),
      requested_base: money(field(form, "base_salary")), requested_allowance: money(field(form, "allowance") || "0"),
      requested_bonus: money(field(form, "bonus") || "0"), requested_manual: money(field(form, "deduction") || "0"),
      requested_currency: field(form, "currency"), requested_effective: date(field(form, "payment_effective_date")), date_confirmed: true,
      requested_notes: field(form, "notes") || null, requested_payroll_id: field(form, "payroll_id") ? uuid(field(form, "payroll_id")) : null,
      expected_updated_at: field(form, "expected_updated_at") || null,
    });
    if (error) throw new Error(error.message);
  } catch (error) { kind = "error"; message = error instanceof Error ? error.message : "Unable to save payroll."; }
  revalidatePath("/admin/hr/payroll");
  redirect(`/admin/hr/payroll?${kind}=${encodeURIComponent(message)}`);
}

export async function changePayrollStatusV1(form: FormData) {
  const { profile } = await requireHrAdmin();
  let kind = "success"; let message = "Payroll updated.";
  try {
    const id = uuid(field(form, "payroll_id")); const status = field(form, "status") as PayrollStatus;
    if (!["approved", "paid", "cancelled"].includes(status)) throw new Error("Invalid payroll status.");
    const db = createSupabaseAdminClient();
    const current = await db.from("hr_payroll_records").select("status").eq("id", id).single();
    if (current.error) throw new Error("Unable to load payroll.");
    if (!(status === "paid" && current.data.status === "paid")) assertPayrollStatusTransition(current.data.status, status);
    const result = status === "paid"
      ? await db.rpc("mark_hr_payroll_paid_with_receivables", { actor_profile_id: profile.id, requested_payroll_id: id, requested_operation_id: randomUUID() })
      : status === "approved"
        ? await db.rpc("confirm_hr_payroll_approval_v1", { actor_profile_id: profile.id, requested_payroll_id: id,
          confirmed_date: date(field(form, "payment_effective_date")), date_confirmed: form.get("effective_date_confirmed") === "on", expected_updated_at: field(form, "expected_updated_at") || null })
        : await db.rpc("cancel_hr_payroll_v1", { actor_profile_id: profile.id, requested_payroll_id: id });
    if (result.error) throw new Error(result.error.message);
    message = `Payroll marked ${status}.`;
  } catch (error) { kind = "error"; message = error instanceof Error ? error.message : "Unable to update payroll."; }
  revalidatePath("/admin/hr/payroll");
  redirect(`/admin/hr/payroll?${kind}=${encodeURIComponent(message)}`);
}
