import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { EmployeeWorkplaceSummary } from "@/components/hr/EmployeeWorkplaceSummary";
import {
  employeePermissionModuleKeys,
  resolveEmployeeDetailAccess,
} from "@/lib/auth/employee-permission-submodules";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { getEmployeeWorkplaceSummary } from "@/lib/hr/profile-workplace";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateEmployeeProfileAction } from "./actions";

export const dynamic = "force-dynamic";

const display = (value: string | null | undefined) => value?.trim() || "—";

export default async function EmployeeDirectoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const { permissions } = await requireAnyPermission([...employeePermissionModuleKeys]);
  const access = resolveEmployeeDetailAccess(permissions);
  if (!access.canViewDetails && !access.canEditProfile && !access.canViewPermissions && !access.canManagePermissions && !access.canViewActivity) redirect("/employee/employees");
  const { id } = await params;
  const messages = await searchParams;
  const { data: employee, error } = await createSupabaseAdminClient()
    .from("profiles")
    .select("id,full_name,email,phone,country,company_name,created_at")
    .eq("id", id)
    .eq("role", "employee")
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (error || !employee) notFound();
  const workplace = access.canViewDetails ? await getEmployeeWorkplaceSummary(id) : null;
  const updateAction = updateEmployeeProfileAction.bind(null, id);

  return (
    <DashboardShell employeePermissions={permissions} title={employee.full_name ?? "Employee details"} subtitle="Employee tools allowed by your assigned permissions.">
      <Link href="/employee/employees" className="mb-4 inline-block font-semibold text-[var(--primary)]">← Employees</Link>
      {messages.success ? <p className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">{messages.success}</p> : null}
      {messages.error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{messages.error}</p> : null}
      {access.canViewDetails ? <section className="rounded-xl border bg-[var(--surface)] p-6">
        <h2 className="text-xl font-semibold">Contact information</h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-sm text-[var(--muted-text)]">Name</dt><dd className="font-medium">{display(employee.full_name)}</dd></div>
          <div><dt className="text-sm text-[var(--muted-text)]">Email</dt><dd className="font-medium">{display(employee.email)}</dd></div>
          <div><dt className="text-sm text-[var(--muted-text)]">Phone</dt><dd className="font-medium">{display(employee.phone)}</dd></div>
          <div><dt className="text-sm text-[var(--muted-text)]">Company</dt><dd className="font-medium">{display(employee.company_name)}</dd></div>
          <div><dt className="text-sm text-[var(--muted-text)]">Country</dt><dd className="font-medium">{display(employee.country)}</dd></div>
          <div><dt className="text-sm text-[var(--muted-text)]">Joined</dt><dd className="font-medium">{new Date(employee.created_at).toLocaleDateString()}</dd></div>
        </dl>
      </section> : null}
      {access.canViewDetails && workplace ? <div className="mt-5"><EmployeeWorkplaceSummary summary={workplace} /></div> : null}
      {access.canEditProfile ? <section id="edit-employee-profile" className="mt-5 rounded-xl border bg-[var(--surface)] p-6">
        <h2 className="text-xl font-semibold">Edit employee profile</h2>
        <p className="mt-1 text-sm text-[var(--muted-text)]">Update safe contact fields only. Account role, status, password and authentication details are protected.</p>
        <form action={updateAction} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">Full name<input name="full_name" required defaultValue={employee.full_name ?? ""} className="mt-1 w-full rounded-lg border p-3 font-normal" /></label>
          <label className="text-sm font-semibold">Phone<input name="phone" defaultValue={employee.phone ?? ""} className="mt-1 w-full rounded-lg border p-3 font-normal" /></label>
          <label className="text-sm font-semibold">Company<input name="company_name" defaultValue={employee.company_name ?? ""} className="mt-1 w-full rounded-lg border p-3 font-normal" /></label>
          <label className="text-sm font-semibold">Country<input name="country" defaultValue={employee.country ?? ""} className="mt-1 w-full rounded-lg border p-3 font-normal" /></label>
          <button className="rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)] md:col-span-2 md:justify-self-start">Save employee profile</button>
        </form>
      </section> : null}
      {access.canViewPermissions || access.canManagePermissions || access.canViewActivity ? <section className="mt-5 rounded-xl border bg-[var(--surface)] p-6">
        <h2 className="text-xl font-semibold">Allowed employee tools</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {access.canViewPermissions || access.canManagePermissions ? <Link href={`/employee/employees/${id}/permissions`} className="rounded-lg border px-4 py-3 font-semibold">{access.canManagePermissions ? "Manage employee permissions" : "View employee permissions"}</Link> : null}
          {access.canViewActivity ? <Link href={`/employee/employees/${id}/activity`} className="rounded-lg border px-4 py-3 font-semibold">View employee activity</Link> : null}
        </div>
      </section> : null}
    </DashboardShell>
  );
}
