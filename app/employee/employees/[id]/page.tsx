import { notFound } from "next/navigation";
import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { EmployeeWorkplaceSummary } from "@/components/hr/EmployeeWorkplaceSummary";
import { requirePermission } from "@/lib/auth/permissions";
import { getEmployeeWorkplaceSummary } from "@/lib/hr/profile-workplace";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const display = (value: string | null | undefined) => value?.trim() || "—";

export default async function EmployeeDirectoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { permissions } = await requirePermission("employees.view_detail");
  const { id } = await params;
  const [{ data: employee, error }, workplace] = await Promise.all([
    createSupabaseAdminClient()
      .from("profiles")
      .select("id,full_name,email,phone,country_name,company_name,created_at")
      .eq("id", id)
      .eq("role", "employee")
      .eq("status", "active")
      .is("archived_at", null)
      .maybeSingle(),
    getEmployeeWorkplaceSummary(id),
  ]);
  if (error || !employee) notFound();

  return (
    <DashboardShell employeePermissions={permissions} title={employee.full_name ?? "Employee details"} subtitle="Employee contact and workplace information.">
      <Link href="/employee/employees" className="mb-4 inline-block font-semibold text-[var(--primary)]">← Employees</Link>
      <section className="rounded-xl border bg-[var(--surface)] p-6">
        <h2 className="text-xl font-semibold">Contact information</h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-sm text-[var(--muted-text)]">Name</dt><dd className="font-medium">{display(employee.full_name)}</dd></div>
          <div><dt className="text-sm text-[var(--muted-text)]">Email</dt><dd className="font-medium">{display(employee.email)}</dd></div>
          <div><dt className="text-sm text-[var(--muted-text)]">Phone</dt><dd className="font-medium">{display(employee.phone)}</dd></div>
          <div><dt className="text-sm text-[var(--muted-text)]">Company</dt><dd className="font-medium">{display(employee.company_name)}</dd></div>
          <div><dt className="text-sm text-[var(--muted-text)]">Country</dt><dd className="font-medium">{display(employee.country_name)}</dd></div>
          <div><dt className="text-sm text-[var(--muted-text)]">Joined</dt><dd className="font-medium">{new Date(employee.created_at).toLocaleDateString()}</dd></div>
        </dl>
      </section>
      <div className="mt-5"><EmployeeWorkplaceSummary summary={workplace} /></div>
    </DashboardShell>
  );
}
