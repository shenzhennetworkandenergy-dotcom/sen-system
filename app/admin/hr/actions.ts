"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const path = "/admin/hr";
const destination = (kind: "success" | "error", message: string) => `${path}?${kind}=${encodeURIComponent(message)}`;
const nullable = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;

export async function createDepartmentAction(form: FormData) {
  const { profile } = await requirePermission("hr.manage_employees");
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const name = String(form.get("name") ?? "").trim();
  const { error } = await createSupabaseAdminClient().from("hr_departments").insert({ code, name, created_by: profile.id });
  if (error) {
    console.error("Department creation failed", { code: error.code, message: error.message });
    redirect(destination("error", error.code === "23505" ? "Department code or name already exists." : "Unable to create department."));
  }
  revalidatePath(path);
  redirect(destination("success", "Department created."));
}

export async function createEmployeeRecordAction(form: FormData) {
  const { profile } = await requirePermission("hr.manage_employees");
  const salaryValue = nullable(form.get("base_salary"));
  const { error } = await createSupabaseAdminClient().rpc("create_hr_employee", {
    actor_profile_id: profile.id,
    requested_profile_id: String(form.get("profile_id") ?? ""),
    requested_department_id: nullable(form.get("department_id")),
    requested_job_title: String(form.get("job_title") ?? "").trim(),
    requested_employment_type: String(form.get("employment_type") ?? "full_time"),
    requested_hire_date: String(form.get("hire_date") ?? ""),
    requested_work_location_id: nullable(form.get("work_location_id")),
    requested_manager_profile_id: nullable(form.get("manager_profile_id")),
    requested_base_salary: salaryValue ? Number(salaryValue) : null,
    requested_currency: String(form.get("salary_currency") ?? "BDT"),
  });
  if (error) {
    console.error("Employee record creation failed", { code: error.code, message: error.message });
    const message = /active staff profile|required|employee/i.test(error.message) ? error.message : "Unable to create employee record.";
    redirect(destination("error", message));
  }
  revalidatePath(path);
  redirect(destination("success", "Employee HR record created."));
}

export async function reviewLeaveAction(leaveId: string, decision: "approved" | "rejected", form: FormData) {
  const { profile } = await requirePermission("hr.manage_leave");
  const { error } = await createSupabaseAdminClient().rpc("review_leave_request", {
    actor_profile_id: profile.id,
    requested_leave_id: leaveId,
    requested_decision: decision,
    requested_note: String(form.get("review_note") ?? ""),
  });
  if (error) {
    console.error("Leave review failed", { code: error.code, message: error.message });
    redirect(destination("error", "Unable to review leave request."));
  }
  revalidatePath(path);
  redirect(destination("success", `Leave request ${decision}.`));
}
