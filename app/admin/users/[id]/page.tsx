import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard/Shell";
import { PermissionChecklist } from "@/components/permissions/PermissionChecklist";
import { getPermissionCatalogue, getPermissionMatrix, getPermissionTemplates } from "@/lib/auth/permissions";
import { savePermissionsAction, updateUserAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }){
  await connection();
  await requireProfile(["admin"]);
  const [{ id }, message] = await Promise.all([params, searchParams]);
  const supabase=createSupabaseAdminClient();
  const {data:user,error}=await supabase.from("profiles").select("id,email,full_name,phone,country_code,country_name,customer_type,company_name,role,status").eq("id",id).maybeSingle();
  if(error){
    console.error("Admin user detail query failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    return <DashboardShell admin title="User detail" subtitle="Review profile details, employment access, permissions and activity."><div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900"><h2 className="text-lg font-semibold">Unable to load user details</h2><p className="mt-2 text-sm">Your admin session is still active, but this profile could not be loaded.</p></div></DashboardShell>;
  }
  if(!user) notFound();
  const [modules, templates, matrix] = await Promise.all([getPermissionCatalogue(), getPermissionTemplates(), getPermissionMatrix(id)]);
  const defaultTemplate = templates.find((template) => template.is_default) ?? templates[0] ?? null;
  const selectedTemplate = matrix.template ?? defaultTemplate;
  const selectedKeys = user.role === "employee" ? matrix.effectiveKeys : selectedTemplate?.permissionKeys ?? [];
  const accountAction=updateUserAction.bind(null,id);
  const permissionAction=savePermissionsAction.bind(null,id);
  return <DashboardShell admin title={user.full_name ?? "User detail"} subtitle="Review profile details, employment access, permissions and activity.">
    {message.success ? <p className="mb-5 rounded border border-green-200 bg-green-50 p-3 text-green-900">{message.success}</p> : null}
    {message.error ? <p className="mb-5 rounded border border-red-200 bg-red-50 p-3 text-red-900">{message.error}</p> : null}
    <section className="rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Account</h2><dl className="mt-4 grid gap-3 md:grid-cols-2"><div><dt className="text-sm text-[var(--muted-text)]">Email</dt><dd>{user.email}</dd></div><div><dt className="text-sm text-[var(--muted-text)]">Phone</dt><dd>{user.phone ?? "—"}</dd></div><div><dt className="text-sm text-[var(--muted-text)]">Country</dt><dd>{user.country_name ?? user.country_code ?? "—"}</dd></div><div><dt className="text-sm text-[var(--muted-text)]">Customer type</dt><dd>{user.customer_type ?? "—"}</dd></div><div><dt className="text-sm text-[var(--muted-text)]">Company</dt><dd>{user.company_name ?? "—"}</dd></div></dl></section>
    <form action={accountAction} className="mt-6 rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Employment and Role</h2><div className="mt-4 grid gap-4 md:grid-cols-3"><label>Role<select name="role" defaultValue={user.role} className="mt-1 w-full rounded border p-3"><option value="customer">customer</option><option value="employee">employee</option><option value="admin">admin</option></select></label><label>Status<select name="status" defaultValue={user.status} className="mt-1 w-full rounded border p-3"><option value="active">active</option><option value="suspended">suspended</option><option value="disabled">disabled</option></select></label><label>Employee template<select name="templateId" defaultValue={selectedTemplate?.id} className="mt-1 w-full rounded border p-3" disabled={!templates.length}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.is_default ? " (Default)" : ""}</option>)}</select></label></div><p className="mt-3 text-sm text-[var(--muted-text)]">The final active admin cannot be downgraded or suspended. Customers promoted to employee receive the selected active template.</p>{user.role !== "admin" && selectedTemplate ? <div className="mt-6"><h3 className="mb-4 text-lg font-semibold">Permissions applied with this account change</h3><PermissionChecklist modules={modules} initialSelected={selectedKeys} templateKeys={selectedTemplate.permissionKeys} allowKeys={matrix.allowKeys} denyKeys={matrix.denyKeys}/></div> : <p className="mt-6 rounded border bg-[var(--muted-surface)] p-4 font-semibold">Administrators have full access.</p>}<button className="mt-5 rounded bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)]">Save account access</button></form>
    <section className="mt-6 rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Permissions</h2>{user.role === "admin" ? <p className="mt-3">Administrators have full access and are not restricted by employee templates.</p> : user.role === "customer" ? <p className="mt-3">Staff permissions are inactive while this account is a customer. Select employee above to prepare access.</p> : selectedTemplate ? <form action={permissionAction} className="mt-5"><label className="mb-5 block">Current template<select name="templateId" defaultValue={selectedTemplate.id} className="mt-1 w-full rounded border p-3 md:max-w-md">{templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.is_default ? " (Default)" : ""}</option>)}</select></label><p className="mb-4 text-sm"><b>Effective permissions:</b> {matrix.effectiveKeys.length} · Template: {matrix.templateKeys.length} · Explicit allow: {matrix.allowKeys.length} · Explicit deny: {matrix.denyKeys.length}</p><PermissionChecklist modules={modules} initialSelected={matrix.effectiveKeys} templateKeys={selectedTemplate.permissionKeys} allowKeys={matrix.allowKeys} denyKeys={matrix.denyKeys}/><button className="mt-5 rounded bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)]">Save permissions</button></form> : <p className="mt-3 text-red-800">No active employee template is available.</p>}</section>
    <section className="mt-6 rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Activity</h2><p className="mt-2 text-[var(--muted-text)]">This account’s safe activity timeline is available from Team Activity.</p><a href={`/admin/activity/${id}`} className="mt-4 inline-block rounded border px-4 py-2 font-semibold">Open activity timeline</a></section>
  </DashboardShell>;
}
