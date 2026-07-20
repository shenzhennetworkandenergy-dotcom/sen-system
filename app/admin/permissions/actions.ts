"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { getPermissionCatalogue } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { routes } from "@/lib/constants/routes";
import { uniqueStrings } from "@/lib/auth/access-validation";

function templateKey(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48);
}

async function validatedPermissionIds(formData: FormData) {
  const requested = uniqueStrings(formData.getAll("permissionKeys"));
  const catalogue = await getPermissionCatalogue();
  const valid = new Map(catalogue.flatMap((module) => module.permissions.map((permission) => [permission.key, permission.id])));
  if (requested.some((key) => !valid.has(key))) throw new Error("Invalid permission selection.");
  return requested.map((key) => valid.get(key)!);
}

export async function saveTemplateAction(formData: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const supabase = createSupabaseAdminClient();
  const id = String(formData.get("templateId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const description = String(formData.get("description") ?? "").trim().slice(0, 240);
  if (!name) redirect(`${routes.adminPermissions}?error=${encodeURIComponent("Template name is required.")}`);
  const permissionIds = await validatedPermissionIds(formData);
  let templateId = id;
  if (id) {
    const { data: existing } = await supabase.from("permission_templates").select("id,is_system").eq("id", id).maybeSingle();
    if (!existing || existing.is_system) redirect(`${routes.adminPermissions}?error=${encodeURIComponent("System templates cannot be edited.")}`);
    const { error } = await supabase.from("permission_templates").update({ name, description, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) redirect(`${routes.adminPermissions}?error=${encodeURIComponent("Unable to update the template.")}`);
    await supabase.from("permission_template_items").delete().eq("template_id", id);
  } else {
    const key = `${templateKey(name)}_${Date.now().toString(36)}`;
    const { data, error } = await supabase.from("permission_templates").insert({ key, name, description, created_by: profile.id }).select("id").single();
    if (error || !data) redirect(`${routes.adminPermissions}?error=${encodeURIComponent("Unable to create the template.")}`);
    templateId = data.id;
  }
  if (permissionIds.length) {
    const { error } = await supabase.from("permission_template_items").insert(permissionIds.map((permissionId) => ({ template_id: templateId, permission_id: permissionId })));
    if (error) redirect(`${routes.adminPermissions}?error=${encodeURIComponent("Template saved, but its permissions could not be updated.")}`);
  }
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: id ? "permissions.template_updated" : "permissions.template_created", module: "permissions", entityType: "permission_template", entityId: templateId, description: id ? "Permission template updated." : "Permission template created.", newValues: { name, permission_count: permissionIds.length } });
  revalidatePath(routes.adminPermissions);
  redirect(`${routes.adminPermissions}?success=${encodeURIComponent("Permission template saved.")}`);
}

export async function duplicateTemplateAction(formData: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const sourceId = String(formData.get("templateId") ?? "");
  const supabase = createSupabaseAdminClient();
  const [{ data: source }, { data: items }] = await Promise.all([supabase.from("permission_templates").select("name,description").eq("id", sourceId).maybeSingle(), supabase.from("permission_template_items").select("permission_id").eq("template_id", sourceId)]);
  if (!source) redirect(`${routes.adminPermissions}?error=${encodeURIComponent("Template not found.")}`);
  const { data: created, error } = await supabase.from("permission_templates").insert({ key: `${templateKey(source.name)}_copy_${Date.now().toString(36)}`, name: `${source.name} Copy`, description: source.description, created_by: profile.id }).select("id").single();
  if (error || !created) redirect(`${routes.adminPermissions}?error=${encodeURIComponent("Unable to duplicate the template.")}`);
  if (items?.length) await supabase.from("permission_template_items").insert(items.map((item) => ({ template_id: created.id, permission_id: item.permission_id })));
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "permissions.template_duplicated", module: "permissions", entityType: "permission_template", entityId: created.id, description: "Permission template duplicated.", newValues: { source_template_id: sourceId } });
  revalidatePath(routes.adminPermissions);
  redirect(`${routes.adminPermissions}?success=${encodeURIComponent("Permission template duplicated.")}`);
}

export async function toggleTemplateAction(formData: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const id = String(formData.get("templateId") ?? "");
  const supabase = createSupabaseAdminClient();
  const { data: template } = await supabase.from("permission_templates").select("is_active,is_system,is_default").eq("id", id).maybeSingle();
  if (!template || template.is_system || template.is_default) redirect(`${routes.adminPermissions}?error=${encodeURIComponent("The protected default template cannot be deactivated.")}`);
  const isActive = !template.is_active;
  await supabase.from("permission_templates").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id);
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "permissions.template_status_changed", module: "permissions", entityType: "permission_template", entityId: id, description: isActive ? "Permission template activated." : "Permission template deactivated.", oldValues: { is_active: template.is_active }, newValues: { is_active: isActive } });
  revalidatePath(routes.adminPermissions);
  redirect(`${routes.adminPermissions}?success=${encodeURIComponent("Template status updated.")}`);
}
