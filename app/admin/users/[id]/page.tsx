import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { PermissionChecklist } from "@/components/permissions/PermissionChecklist";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { getPermissionCatalogue, getPermissionMatrix, getPermissionTemplates } from "@/lib/auth/permissions";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteUserAction, resetUserPasswordAction, savePermissionsAction, updateUserAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  await requireProfile(["admin"]);
  const [{ id }, message] = await Promise.all([params, searchParams]);
  const supabase = createSupabaseAdminClient();
  const { data: user, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Admin user detail query failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    return <DashboardShell admin title="User detail" subtitle="Review profile details, employment access, permissions and activity."><div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900"><h2 className="text-lg font-semibold">Unable to load user details</h2><p className="mt-2 text-sm">Your admin session is still active, but this profile could not be loaded.</p></div></DashboardShell>;
  }
  if (!user) notFound();

  const [modules, templates, matrix, authResult] = await Promise.all([getPermissionCatalogue(), getPermissionTemplates(), getPermissionMatrix(id), supabase.auth.admin.getUserById(id)]);
  if (authResult.error) console.error("Admin auth account detail query failed", { message: authResult.error.message, status: authResult.error.status });
  const authUser = authResult.data.user;
  const defaultTemplate = templates.find((template) => template.is_default) ?? templates[0] ?? null;
  const selectedTemplate = matrix.template ?? defaultTemplate;
  const selectedKeys = user.role === "employee" ? matrix.effectiveKeys : selectedTemplate?.permissionKeys ?? [];
  const accountAction = updateUserAction.bind(null, id);
  const permissionAction = savePermissionsAction.bind(null, id);
  const profileValues = [
    ["Full name", user.full_name], ["Email", user.email], ["Phone", user.phone], ["Country", user.country ?? user.country_name ?? user.country_code],
    ["Customer type", user.customer_type], ["Company", user.company_name], ["Role", user.role], ["Status", user.status],
    ["Created", user.created_at ? new Date(user.created_at).toLocaleString() : null], ["Last updated", user.updated_at ? new Date(user.updated_at).toLocaleString() : null],
  ];
  const authValues = [
    ["Authentication ID", authUser?.id], ["Authentication email", authUser?.email], ["Authentication phone", authUser?.phone],
    ["Email confirmed", authUser?.email_confirmed_at ? new Date(authUser.email_confirmed_at).toLocaleString() : "Not confirmed"],
    ["Phone confirmed", authUser?.phone_confirmed_at ? new Date(authUser.phone_confirmed_at).toLocaleString() : "Not confirmed"],
    ["Last sign-in", authUser?.last_sign_in_at ? new Date(authUser.last_sign_in_at).toLocaleString() : "Never"],
    ["Auth created", authUser?.created_at ? new Date(authUser.created_at).toLocaleString() : null],
    ["Auth updated", authUser?.updated_at ? new Date(authUser.updated_at).toLocaleString() : null],
    ["Providers", Array.isArray(authUser?.app_metadata?.providers) ? authUser.app_metadata.providers.join(", ") : authUser?.app_metadata?.provider],
  ];
  const safeMetadata = (value: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => !/password|token|secret|key|session/i.test(key)));

  return <DashboardShell admin title={user.full_name ?? "User detail"} subtitle="Complete profile, account access, employee permissions and activity.">
    {message.success ? <p className="mb-5 rounded border border-green-200 bg-green-50 p-3 text-green-900">{message.success}</p> : null}
    {message.error ? <p className="mb-5 rounded border border-red-200 bg-red-50 p-3 text-red-900">{message.error}</p> : null}
    {authUser ? <section className="mb-6 rounded-2xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Authentication account</h2><p className="mt-2 text-sm text-[var(--muted-text)]">All safe authentication details available to administrators are shown below. Passwords are never readable because Supabase stores secure password hashes.</p><dl className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{authValues.map(([label, item]) => <div key={label}><dt className="text-sm text-[var(--muted-text)]">{label}</dt><dd className="mt-1 break-words font-medium">{item ?? "—"}</dd></div>)}</dl><details className="mt-5 rounded border p-4"><summary className="cursor-pointer font-semibold">Safe account metadata</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ app_metadata: safeMetadata(authUser.app_metadata), user_metadata: safeMetadata(authUser.user_metadata) }, null, 2)}</pre></details></section> : <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950"><h2 className="font-semibold">Authentication record unavailable</h2><p className="mt-2 text-sm">The profile exists, but its Supabase Auth record could not be loaded.</p></section>}
    <section className="rounded-2xl border bg-[var(--surface)] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-[var(--muted-text)]">Complete profile</p><h2 className="text-xl font-semibold">Account information</h2></div><code className="max-w-full truncate rounded bg-[var(--muted-surface)] px-3 py-2 text-xs" title={user.id}>{user.id}</code></div><dl className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{profileValues.map(([label, item]) => <div key={label}><dt className="text-sm text-[var(--muted-text)]">{label}</dt><dd className="mt-1 font-medium capitalize">{item ?? "—"}</dd></div>)}</dl></section>
    <form action={accountAction} className="mt-6 rounded-2xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Role and account status</h2><p className="mt-2 text-sm text-[var(--muted-text)]">Promote a customer to employee here, then assign exact permissions below or from the central Permissions page.</p><div className="mt-4 grid gap-4 md:grid-cols-3"><label>Role<select name="role" defaultValue={user.role} className="mt-1 w-full rounded border p-3"><option value="customer">Customer</option><option value="employee">Employee</option><option value="admin">Administrator</option></select></label><label>Status<select name="status" defaultValue={user.status} className="mt-1 w-full rounded border p-3"><option value="active">Active</option><option value="suspended">Suspended</option><option value="disabled">Disabled</option></select></label><label>Employee baseline<select name="templateId" defaultValue={selectedTemplate?.id} className="mt-1 w-full rounded border p-3" disabled={!templates.length}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.is_default ? " (Default)" : ""}</option>)}</select></label></div><p className="mt-3 text-sm text-[var(--muted-text)]">The final active administrator cannot be downgraded or suspended.</p>{user.role !== "admin" && selectedTemplate ? <div className="mt-6"><h3 className="mb-4 text-lg font-semibold">Permissions prepared with this role change</h3><PermissionChecklist modules={modules} initialSelected={selectedKeys} templateKeys={selectedTemplate.permissionKeys} allowKeys={matrix.allowKeys} denyKeys={matrix.denyKeys}/></div> : <p className="mt-6 rounded border bg-[var(--muted-surface)] p-4 font-semibold">Administrators have unrestricted access.</p>}<button className="mt-5 rounded bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)]">Save account access</button></form>
    <section className="mt-6 rounded-2xl border bg-[var(--surface)] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Specific employee permissions</h2><p className="mt-1 text-sm text-[var(--muted-text)]">These settings apply only to this employee.</p></div><a href={`/admin/permissions?employee=${id}`} className="rounded border px-4 py-2 text-sm font-semibold">Open focused permission editor</a></div>{user.role === "admin" ? <p className="mt-3">Administrators have full access and are not restricted by employee templates.</p> : user.role === "customer" ? <p className="mt-3">Change this account’s role to Employee before activating staff permissions.</p> : selectedTemplate ? <form action={permissionAction} className="mt-5"><label className="mb-5 block">Baseline template<select name="templateId" defaultValue={selectedTemplate.id} className="mt-1 w-full rounded border p-3 md:max-w-md">{templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.is_default ? " (Default)" : ""}</option>)}</select></label><p className="mb-4 text-sm"><b>Effective:</b> {matrix.effectiveKeys.length} · Template: {matrix.templateKeys.length} · Additional grants: {matrix.allowKeys.length} · Removed: {matrix.denyKeys.length}</p><PermissionChecklist modules={modules} initialSelected={matrix.effectiveKeys} templateKeys={selectedTemplate.permissionKeys} allowKeys={matrix.allowKeys} denyKeys={matrix.denyKeys}/><button className="mt-5 rounded bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)]">Save this employee’s permissions</button></form> : <p className="mt-3 text-red-800">No active employee template is available.</p>}</section>
    <section className="mt-6 rounded-2xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Activity and sales history</h2><p className="mt-2 text-[var(--muted-text)]">Review this account’s safe activity timeline and customer purchase history.</p><div className="mt-4 flex flex-wrap gap-3"><a href={`/admin/activity/${id}`} className="inline-block rounded border px-4 py-2 font-semibold">Open activity timeline</a>{user.role==="customer"?<a href={`/admin/users/${id}/sales`} className="inline-block rounded border px-4 py-2 font-semibold">Open sales history</a>:null}</div></section>
    <section className="mt-6 rounded-2xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Credential security</h2><p className="mt-2 text-sm text-[var(--muted-text)]">The current password cannot be displayed. Set a temporary password only when the account owner requests recovery, then share it through a private channel.</p><form action={resetUserPasswordAction.bind(null, id)} className="mt-4 flex max-w-xl flex-col gap-3 sm:flex-row"><label className="flex-1">Temporary password<input type="password" name="temporaryPassword" minLength={12} maxLength={72} required autoComplete="new-password" className="mt-1 w-full rounded border p-3" /></label><button className="self-end rounded bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)]">Set temporary password</button></form></section>
    <section className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-6 text-red-950"><h2 className="text-xl font-semibold">Delete user account</h2><p className="mt-2 text-sm">Permanent deletion is allowed only when protected business and audit history will remain intact. Otherwise, disable the account above.</p><form action={deleteUserAction.bind(null, id)}><ConfirmSubmitButton confirmation={`Permanently delete ${user.full_name ?? user.email ?? "this user"}? This cannot be undone.`} className="mt-4 rounded border border-red-700 bg-white px-4 py-3 font-semibold text-red-800">Delete user permanently</ConfirmSubmitButton></form></section>
  </DashboardShell>;
}
