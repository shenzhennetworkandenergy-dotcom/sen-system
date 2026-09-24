"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/permissions";
import { normalizeProfileInput } from "@/lib/profile/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);

function destination(employeeId: string, type: "success" | "error", message: string) {
  return `/employee/employees/${employeeId}?${type}=${encodeURIComponent(message)}${type === "success" ? "" : "#edit-employee-profile"}`;
}

export async function updateEmployeeProfileAction(employeeId: string, formData: FormData) {
  const { profile } = await requirePermission("employees.edit_profile");
  if (!isUuid(employeeId)) redirect("/employee/employees");

  let input;
  try {
    input = normalizeProfileInput({
      full_name: formData.get("full_name"),
      phone: formData.get("phone"),
      company_name: formData.get("company_name"),
      country: formData.get("country"),
    });
    if (!input.full_name) throw new Error("Full name is required.");
  } catch (error) {
    redirect(destination(employeeId, "error", error instanceof Error ? error.message : "Enter valid employee information."));
  }

  const db = createSupabaseAdminClient();
  const { data: target, error: lookupError } = await db
    .from("profiles")
    .select("id,full_name,phone,company_name,country")
    .eq("id", employeeId)
    .eq("role", "employee")
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (lookupError || !target) redirect(destination(employeeId, "error", "This active employee could not be found."));

  const update = { ...input, updated_at: new Date().toISOString() };
  const { error } = await db.from("profiles").update(update).eq("id", employeeId);
  if (error) {
    console.error("Delegated employee profile update failed", { code: error.code, message: error.message });
    redirect(destination(employeeId, "error", "Unable to save the employee profile."));
  }

  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    targetProfileId: employeeId,
    action: "employee.profile_updated",
    module: "employees",
    entityType: "profile",
    entityId: employeeId,
    description: "Employee profile contact information was updated by an authorized employee.",
    oldValues: target,
    newValues: input,
  });
  revalidatePath(`/employee/employees/${employeeId}`);
  revalidatePath("/employee/employees");
  revalidatePath(`/admin/users/${employeeId}`);
  redirect(destination(employeeId, "success", "Employee profile updated."));
}
