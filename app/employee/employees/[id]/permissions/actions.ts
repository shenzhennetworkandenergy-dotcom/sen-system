"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { uniqueStrings } from "@/lib/auth/access-validation";
import { getPermissionCatalogue, getPermissionTemplates, requirePermission, updatePermissionOverrides } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);

function destination(employeeId: string, type: "success" | "error", message: string) {
  return `/employee/employees/${employeeId}/permissions?${type}=${encodeURIComponent(message)}`;
}

export async function saveEmployeePermissionsAction(employeeId: string, formData: FormData) {
  const { profile } = await requirePermission("employees.manage_permissions");
  if (!isUuid(employeeId)) redirect("/employee/employees");
  if (profile.id === employeeId) redirect(destination(employeeId, "error", "You cannot change your own permissions."));

  try {
    const db = createSupabaseAdminClient();
    const { data: target, error } = await db.from("profiles").select("id").eq("id", employeeId).eq("role", "employee").eq("status", "active").is("archived_at", null).maybeSingle();
    if (error || !target) throw new Error("This active employee could not be found.");
    const templateId = String(formData.get("templateId") ?? "");
    const [catalogue, templates] = await Promise.all([getPermissionCatalogue(), getPermissionTemplates()]);
    const validKeys = new Set(catalogue.flatMap((module) => module.permissions.map((permission) => permission.key)));
    const selected = uniqueStrings(formData.getAll("permissionKeys"));
    if (selected.some((key) => !validKeys.has(key))) throw new Error("Invalid permission selection.");
    const template = templates.find((item) => item.id === templateId);
    if (!template) throw new Error("An active employee template is required.");
    const templateKeys = new Set(template.permissionKeys);
    const allowKeys = selected.filter((key) => !templateKeys.has(key));
    const denyKeys = template.permissionKeys.filter((key) => !selected.includes(key));
    await updatePermissionOverrides(profile.id, employeeId, template.id, allowKeys, denyKeys);
  } catch (error) {
    console.error("Delegated employee permission action failed", { message: error instanceof Error ? error.message : "Unknown error" });
    const message = error instanceof Error && /own permissions|active employee|invalid permission|template/i.test(error.message) ? error.message : "Unable to save employee permissions.";
    redirect(destination(employeeId, "error", message));
  }

  revalidatePath(`/employee/employees/${employeeId}/permissions`);
  revalidatePath(`/employee/employees/${employeeId}`);
  revalidatePath("/employee/employees");
  revalidatePath(`/admin/users/${employeeId}`);
  redirect(destination(employeeId, "success", "Employee permissions saved."));
}
