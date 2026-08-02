import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import {
  employeePermissionModuleKeys,
  resolveEmployeeDirectoryAccess,
} from "@/lib/auth/employee-permission-submodules";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const display = (value: string | null | undefined) => value?.trim() || "—";

export default async function EmployeeDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await connection();
  const { permissions } = await requireAnyPermission([...employeePermissionModuleKeys]);
  const access = resolveEmployeeDirectoryAccess(permissions);
  const params = await searchParams;
  const queryText = params.q?.trim().slice(0, 80) ?? "";
  let query = createSupabaseAdminClient()
    .from("profiles")
    .select("id,full_name,email,phone,country,company_name")
    .eq("role", "employee")
    .eq("status", "active")
    .is("archived_at", null)
    .order("full_name")
    .limit(100);
  if (queryText) {
    const escaped = queryText.replaceAll(",", " ");
    query = access.canViewContactSummary
      ? query.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%,company_name.ilike.%${escaped}%`)
      : query.ilike("full_name", `%${escaped}%`);
  }
  const { data: employees, error } = await query;

  return (
    <DashboardShell
      employeePermissions={permissions}
      title="Employees"
      subtitle="View the active employee directory allowed by your assigned permissions."
    >
      <form className="mb-4 flex flex-col gap-3 rounded-xl border bg-[var(--surface)] p-4 sm:flex-row">
        <label className="flex-1 text-sm font-semibold">
          Search employees
          <input
            name="q"
            defaultValue={queryText}
            placeholder={access.canViewContactSummary ? "Name, email, phone or company" : "Employee name"}
            className="mt-1 w-full rounded-lg border p-3 font-normal"
          />
        </label>
        <button className="self-end rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)]">Search</button>
      </form>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">Unable to load employees. Please try again or contact an administrator.</p>
      ) : employees?.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {employees.map((employee) => (
            <article key={employee.id} className="rounded-xl border bg-[var(--surface)] p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-100 font-bold text-blue-900">
                  {(employee.full_name ?? employee.email ?? "E").slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{display(employee.full_name)}</h2>
                  {access.canViewContactSummary ? <p className="truncate text-sm text-[var(--muted-text)]">{display(employee.email)}</p> : null}
                </div>
              </div>
              {access.canViewContactSummary ? <dl className="mt-4 grid gap-2 text-sm">
                <div><dt className="text-[var(--muted-text)]">Phone</dt><dd>{display(employee.phone)}</dd></div>
                <div><dt className="text-[var(--muted-text)]">Company</dt><dd>{display(employee.company_name)}</dd></div>
                <div><dt className="text-[var(--muted-text)]">Country</dt><dd>{display(employee.country)}</dd></div>
              </dl> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {access.canViewDetails ? <Link href={`/employee/employees/${employee.id}`} className="rounded-lg border px-3 py-2 text-sm font-semibold">View employee details</Link> : null}
                {access.canEditProfile ? <Link href={`/employee/employees/${employee.id}#edit-employee-profile`} className="rounded-lg border px-3 py-2 text-sm font-semibold">Edit employee profile</Link> : null}
                {access.canViewPermissions || access.canManagePermissions ? <Link href={`/employee/employees/${employee.id}/permissions`} className="rounded-lg border px-3 py-2 text-sm font-semibold">{access.canManagePermissions ? "Manage permissions" : "View permissions"}</Link> : null}
                {access.canViewActivity ? <Link href={`/employee/employees/${employee.id}/activity`} className="rounded-lg border px-3 py-2 text-sm font-semibold">View activity</Link> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border bg-[var(--surface)] p-8 text-center text-[var(--muted-text)]">No employees match this search.</p>
      )}
    </DashboardShell>
  );
}
