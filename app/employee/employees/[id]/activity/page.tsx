import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ActivityTable, type ActivityRow } from "@/components/activity/ActivityTable";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function EmployeeActivityPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { permissions } = await requirePermission("employees.view_activity");
  const { id } = await params;
  const db = createSupabaseAdminClient();
  const [{ data: employee, error: employeeError }, { data: activity, error: activityError }] = await Promise.all([
    db.from("profiles").select("id,full_name,email").eq("id", id).eq("role", "employee").eq("status", "active").is("archived_at", null).maybeSingle(),
    db.from("audit_logs").select("id,actor_id,action,module,entity_type,entity_id,description,old_values,new_values,created_at").or(`actor_id.eq.${id},target_profile_id.eq.${id}`).order("created_at", { ascending: false }).limit(100),
  ]);
  if (!employee && !employeeError) notFound();
  const people = employee ? { [employee.id]: { name: employee.full_name ?? employee.email ?? "Unnamed employee", email: employee.email } } : {};

  return <DashboardShell employeePermissions={permissions} title={`${employee?.full_name ?? employee?.email ?? "Employee"} activity`} subtitle="Employee activity performed by or affecting this account.">
    <Link href="/employee/employees" className="mb-4 inline-block font-semibold text-[var(--primary)]">← Employees</Link>
    {employeeError || activityError ? <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">Unable to load this employee activity.</p> : <ActivityTable rows={(activity ?? []) as ActivityRow[]} people={people} profileHrefBase={null} />}
  </DashboardShell>;
}
