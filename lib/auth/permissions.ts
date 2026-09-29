import "server-only";
import { redirect } from "next/navigation";
import { requireProfile, type Profile } from "@/lib/auth/session";
import { dashboardPathForRole, type AccountRole, type AccountStatus } from "@/lib/constants/routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PermissionEffect = "allow" | "deny";
export type PermissionRecord = { id: string; key: string; name: string; description: string | null; action: string; is_sensitive: boolean; sort_order: number };
export type PermissionModule = { id: string; key: string; name: string; description: string | null; icon_key: string | null; sort_order: number; is_active: boolean; is_implemented: boolean; permissions: PermissionRecord[] };
export type PermissionTemplate = { id: string; key: string; name: string; description: string | null; is_default: boolean; is_system: boolean; is_active: boolean; permissionKeys: string[] };
export type PermissionMatrix = { template: PermissionTemplate | null; templateKeys: string[]; allowKeys: string[]; denyKeys: string[]; effectiveKeys: string[] };

function safeDatabaseError(context: string, error: { code?: string; message?: string; details?: string; hint?: string } | null) {
  if (error) console.error(context, { code: error.code, message: error.message, details: error.details, hint: error.hint });
}

export function isAdmin(profile: Pick<Profile, "role" | "status">) {
  return profile.role === "admin" && profile.status === "active";
}

export function isActiveEmployee(profile: Pick<Profile, "role" | "status">) {
  return profile.role === "employee" && profile.status === "active";
}

export async function getEffectivePermissions(profileId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("effective_permissions_for_profile", { requested_profile_id: profileId });
  safeDatabaseError("Effective permission query failed", error);
  if (error) throw new Error("Unable to resolve permissions.");
  return new Set<string>((data ?? []).map((row: { permission_key: string }) => row.permission_key));
}

export async function hasPermission(profileId: string, permissionKey: string) {
  return (await getEffectivePermissions(profileId)).has(permissionKey);
}

export async function requirePermission(permissionKey: string) {
  const context = await requireProfile();
  if (isAdmin(context.profile)) return { ...context, permissions: new Set<string>([permissionKey]) };
  if (!isActiveEmployee(context.profile) || !(await hasPermission(context.profile.id, permissionKey))) redirect(dashboardPathForRole(context.profile.role));
  return { ...context, permissions: await getEffectivePermissions(context.profile.id) };
}

export async function requireAnyPermission(permissionKeys: string[]) {
  const context = await requireProfile();
  if (isAdmin(context.profile)) return { ...context, permissions: new Set(permissionKeys) };
  const permissions = await getEffectivePermissions(context.profile.id);
  if (!isActiveEmployee(context.profile) || !permissionKeys.some((key) => permissions.has(key))) redirect(dashboardPathForRole(context.profile.role));
  return { ...context, permissions };
}

export async function requireAllPermissions(permissionKeys: string[]) {
  const context = await requireProfile();
  if (isAdmin(context.profile)) return { ...context, permissions: new Set(permissionKeys) };
  const permissions = await getEffectivePermissions(context.profile.id);
  if (!isActiveEmployee(context.profile) || !permissionKeys.every((key) => permissions.has(key))) redirect(dashboardPathForRole(context.profile.role));
  return { ...context, permissions };
}

export async function getPermissionCatalogue() {
  const supabase = createSupabaseAdminClient();
  const [{ data: modules, error: modulesError }, { data: permissions, error: permissionsError }] = await Promise.all([
    supabase.from("app_modules").select("id,key,name,description,icon_key,sort_order,is_active,is_implemented").eq("is_active", true).order("sort_order"),
    supabase.from("permissions").select("id,module_id,key,name,description,action,is_sensitive,sort_order").eq("is_active", true).order("sort_order"),
  ]);
  safeDatabaseError("Permission module query failed", modulesError);
  safeDatabaseError("Permission catalogue query failed", permissionsError);
  if (modulesError || permissionsError) throw new Error("Unable to load the permission catalogue.");
  return (modules ?? []).map((module) => ({ ...module, permissions: (permissions ?? []).filter((permission) => permission.module_id === module.id) })) as PermissionModule[];
}

export async function getPermissionTemplates(includeInactive = false) {
  const supabase = createSupabaseAdminClient();
  let templateQuery = supabase.from("permission_templates").select("id,key,name,description,is_default,is_system,is_active").order("name");
  if (!includeInactive) templateQuery = templateQuery.eq("is_active", true);
  const [{ data: templates, error }, { data: items, error: itemError }] = await Promise.all([
    templateQuery,
    supabase.from("permission_template_items").select("template_id,permissions(key)"),
  ]);
  safeDatabaseError("Permission template query failed", error ?? itemError);
  if (error || itemError) throw new Error("Unable to load permission templates.");
  return (templates ?? []).map((template) => ({
    ...template,
    permissionKeys: (items ?? []).filter((item) => item.template_id === template.id).map((item) => {
      const relation = item.permissions as unknown as { key: string } | null;
      return relation?.key;
    }).filter((key): key is string => Boolean(key)),
  })) as PermissionTemplate[];
}

export async function getPermissionMatrix(profileId: string): Promise<PermissionMatrix> {
  const supabase = createSupabaseAdminClient();
  const [{ data: assignment, error: assignmentError }, { data: overrides, error: overrideError }, templates, effective] = await Promise.all([
    supabase.from("profile_permission_templates").select("template_id").eq("profile_id", profileId).eq("is_active", true).maybeSingle(),
    supabase.from("profile_permission_overrides").select("effect,permissions(key)").eq("profile_id", profileId).eq("is_active", true),
    getPermissionTemplates(true),
    getEffectivePermissions(profileId),
  ]);
  safeDatabaseError("Permission assignment query failed", assignmentError ?? overrideError);
  if (assignmentError || overrideError) throw new Error("Unable to load employee permissions.");
  const template = templates.find((item) => item.id === assignment?.template_id) ?? null;
  const keyedOverrides = (overrides ?? []).map((item) => ({ effect: item.effect as PermissionEffect, key: (item.permissions as unknown as { key: string } | null)?.key })).filter((item): item is { effect: PermissionEffect; key: string } => Boolean(item.key));
  return {
    template,
    templateKeys: template?.permissionKeys ?? [],
    allowKeys: keyedOverrides.filter((item) => item.effect === "allow").map((item) => item.key),
    denyKeys: keyedOverrides.filter((item) => item.effect === "deny").map((item) => item.key),
    effectiveKeys: [...effective],
  };
}

export async function assignPermissionTemplate(actorId: string, profileId: string, templateId: string, allowKeys: string[] = [], denyKeys: string[] = []) {
  return updatePermissionOverrides(actorId, profileId, templateId, allowKeys, denyKeys);
}

export async function updatePermissionOverrides(actorId: string, profileId: string, templateId: string, allowKeys: string[], denyKeys: string[]) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("admin_set_profile_permissions", { actor_profile_id: actorId, target_profile_id: profileId, requested_template_id: templateId, allowed_permission_keys: allowKeys, denied_permission_keys: denyKeys });
  safeDatabaseError("Permission update failed", error);
  if (error) throw new Error(error.message || "Unable to update permissions.");
}

export async function clearOrDeactivateEmployeePermissions(actorId: string, profileId: string, role: AccountRole, status: AccountStatus) {
  return updateAccountAccess(actorId, profileId, role, status, null);
}

export async function updateAccountAccess(actorId: string, profileId: string, role: AccountRole, status: AccountStatus, templateId: string | null) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("admin_update_profile_access", { actor_profile_id: actorId, target_profile_id: profileId, requested_role: role, requested_status: status, requested_template_id: templateId });
  safeDatabaseError("Account access update failed", error);
  if (error) throw new Error(error.message || "Unable to update account access.");
}
