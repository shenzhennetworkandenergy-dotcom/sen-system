"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { getPermissionCatalogue, getPermissionTemplates, updateAccountAccess, updatePermissionOverrides } from "@/lib/auth/permissions";
import { isAccountRole, isAccountStatus, uniqueStrings } from "@/lib/auth/access-validation";
import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function destination(userId: string, type: "success" | "error", message: string) {
  return `/admin/users/${userId}?${type}=${encodeURIComponent(message)}`;
}

async function validatedSelection(formData: FormData, templateId: string) {
  const [catalogue, templates] = await Promise.all([getPermissionCatalogue(), getPermissionTemplates()]);
  const validKeys = new Set(catalogue.flatMap((module) => module.permissions.map((permission) => permission.key)));
  const selected = uniqueStrings(formData.getAll("permissionKeys"));
  if (selected.some((key) => !validKeys.has(key))) throw new Error("Invalid permission selection.");
  const template = templates.find((item) => item.id === templateId);
  if (!template) throw new Error("An active employee template is required.");
  const templateKeys = new Set(template.permissionKeys);
  return { selected, allowKeys: selected.filter((key) => !templateKeys.has(key)), denyKeys: template.permissionKeys.filter((key) => !selected.includes(key)) };
}

export async function updateUserAction(userId: string, formData: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const role = String(formData.get("role") ?? "");
  const status = String(formData.get("status") ?? "");
  const templateId = String(formData.get("templateId") ?? "") || null;
  if (!isAccountRole(role) || !isAccountStatus(status)) redirect(destination(userId, "error", "Invalid role or status."));
  try {
    const selection = role === "employee" && templateId ? await validatedSelection(formData, templateId) : null;
    await updateAccountAccess(profile.id, userId, role, status, templateId);
    if (selection && templateId) await updatePermissionOverrides(profile.id, userId, templateId, selection.allowKeys, selection.denyKeys);
  } catch (error) {
    console.error("Admin account access action failed", { message: error instanceof Error ? error.message : "Unknown error" });
    const message = error instanceof Error && /final active admin|own role|active employee template/i.test(error.message) ? error.message : "Unable to update account access.";
    redirect(destination(userId, "error", message));
  }
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  redirect(destination(userId, "success", "Account access updated."));
}

export async function savePermissionsAction(userId: string, formData: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const templateId = String(formData.get("templateId") ?? "");
  try {
    const selection = await validatedSelection(formData, templateId);
    await updatePermissionOverrides(profile.id, userId, templateId, selection.allowKeys, selection.denyKeys);
  } catch (error) {
    console.error("Admin permission action failed", { message: error instanceof Error ? error.message : "Unknown error" });
    redirect(destination(userId, "error", "Unable to save employee permissions."));
  }
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/employee");
  redirect(destination(userId, "success", "Employee permissions saved."));
}

export async function resetUserPasswordAction(userId: string, formData: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const temporaryPassword = String(formData.get("temporaryPassword") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) redirect(destination(userId, "error", "Invalid account."));
  if (temporaryPassword.length < 12 || temporaryPassword.length > 72 || !/[a-z]/.test(temporaryPassword) || !/[A-Z]/.test(temporaryPassword) || !/[0-9]/.test(temporaryPassword)) redirect(destination(userId, "error", "Temporary password must be 12-72 characters and include uppercase, lowercase and a number."));
  const supabase = createSupabaseAdminClient();
  const { data: target, error: lookupError } = await supabase.from("profiles").select("id,email").eq("id", userId).maybeSingle();
  if (lookupError || !target) redirect(destination(userId, "error", "Unable to validate this account."));
  const { error } = await supabase.auth.admin.updateUserById(userId, { password: temporaryPassword });
  if (error) {
    console.error("Admin password reset failed", { message: error.message, status: error.status });
    redirect(destination(userId, "error", "Unable to set the temporary password."));
  }
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, targetProfileId: userId, action: "account.password_reset_by_admin", module: "users", entityType: "profile", entityId: userId, description: "Administrator set a temporary password. The password value was not recorded." });
  revalidatePath(`/admin/users/${userId}`);
  redirect(destination(userId, "success", "Temporary password set securely. Share it privately and ask the user to change it."));
}

export async function deleteUserAction(userId: string) {
  const { profile } = await requireProfile(["admin"]);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) redirect(destination(userId, "error", "Invalid account."));
  if (profile.id === userId) redirect(destination(userId, "error", "You cannot delete your own administrator account."));
  const supabase = createSupabaseAdminClient();
  const { data: target, error: lookupError } = await supabase.from("profiles").select("id,email,full_name,role,status").eq("id", userId).maybeSingle();
  if (lookupError || !target) redirect(destination(userId, "error", "Unable to validate this account."));
  if (target.role === "admin" && target.status === "active") {
    const { count, error: countError } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("status", "active");
    if (countError || (count ?? 0) <= 1) redirect(destination(userId, "error", "The final active administrator cannot be deleted."));
  }
  const snapshot = { email: target.email, full_name: target.full_name, role: target.role, status: target.status };
  const { error } = await supabase.auth.admin.deleteUser(userId, false);
  if (error) {
    console.error("Admin account deletion failed", { message: error.message, status: error.status });
    redirect(destination(userId, "error", "This account cannot be permanently deleted because it has protected operational history. Disable it instead to preserve audit and business records."));
  }
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "account.deleted_by_admin", module: "users", entityType: "profile", entityId: userId, description: "Unused user account permanently deleted by an administrator.", oldValues: snapshot });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  redirect("/admin/users?success=User%20account%20deleted.");
}
