import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { PermissionChecklist } from "@/components/permissions/PermissionChecklist";
import { getPermissionCatalogue, getPermissionMatrix, getPermissionTemplates, requireAnyPermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveEmployeePermissionsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EmployeePermissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const { profile, permissions } = await requireAnyPermission(["employees.view_permissions", "employees.manage_permissions"]);
  const canManage = permissions.has("employees.manage_permissions");
  const { id } = await params;
  const messages = await searchParams;
  const { data: employee, error } = await createSupabaseAdminClient().from("profiles").select("id,full_name,email").eq("id", id).eq("role", "employee").eq("status", "active").is("archived_at", null).maybeSingle();
  if (error || !employee) notFound();
  const [matrix, modules, templates] = await Promise.all([getPermissionMatrix(id), getPermissionCatalogue(), getPermissionTemplates()]);
  const baseline = templates.find((template) => template.id === matrix.template?.id) ?? templates.find((template) => template.is_default) ?? templates[0] ?? null;
  const permissionAction = saveEmployeePermissionsAction.bind(null, id);

  return <DashboardShell employeePermissions={permissions} title={`${employee.full_name ?? employee.email ?? "Employee"} permissions`} subtitle="Permission access granted to this employee account.">
    <Link href="/employee/employees" className="mb-4 inline-block font-semibold text-[var(--primary)]">← Employees</Link>
    {messages.success ? <p className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">{messages.success}</p> : null}
    {messages.error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{messages.error}</p> : null}
    <section className="rounded-xl border bg-[var(--surface)] p-6">
      <h2 className="text-xl font-semibold">Permission access</h2>
      <p className="mt-2 text-sm text-[var(--muted-text)]">Effective permissions: {matrix.effectiveKeys.length}{matrix.template ? ` · Baseline: ${matrix.template.name}` : ""}</p>
      {!canManage ? <div className="mt-5 space-y-5">
        {modules.map((module) => {
          const granted = module.permissions.filter((permission) => matrix.effectiveKeys.includes(permission.key));
          return granted.length ? <section key={module.id} className="rounded-xl border p-4"><h3 className="font-semibold">{module.name}</h3><ul className="mt-3 grid gap-2 md:grid-cols-2">{granted.map((permission) => <li key={permission.id} className="rounded-lg bg-[var(--muted-surface)] p-3"><span className="font-medium">{permission.name}</span><span className="block text-xs text-[var(--muted-text)]">{permission.description}</span></li>)}</ul></section> : null;
        })}
      </div> : profile.id === id ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">You cannot change your own permissions. Ask an administrator or another authorized employee.</p> : baseline ? <form action={permissionAction} className="mt-5">
        <label className="mb-5 block max-w-xl font-semibold">Baseline permission template<select name="templateId" defaultValue={baseline.id} className="mt-2 w-full rounded-lg border p-3 font-normal">{templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.is_default ? " (Default)" : ""}</option>)}</select></label>
        <PermissionChecklist modules={modules} initialSelected={matrix.effectiveKeys} templateKeys={baseline.permissionKeys} allowKeys={matrix.allowKeys} denyKeys={matrix.denyKeys} />
        <button className="mt-5 rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)]">Save employee permissions</button>
      </form> : <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">No active employee permission template is available.</p>}
    </section>
  </DashboardShell>;
}
