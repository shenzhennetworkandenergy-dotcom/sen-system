"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { getPermissionCatalogue, getPermissionTemplates, updateAccountAccess, updatePermissionOverrides } from "@/lib/auth/permissions";
import { isAccountRole, isAccountStatus, uniqueStrings } from "@/lib/auth/access-validation";

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
