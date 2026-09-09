import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { getAdminEmployeeLoanApplications } from "@/lib/receivables/employee-loans-data";

export const dynamic = "force-dynamic";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);

const label = (value: string | null | undefined) =>
  String(value ?? "submitted").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function EmployeeLoanAdminListPage() {
  await connection();
  const { profile, permissions } = await requireAllPermissions(["receivables.view", "receivables.view_loans"]);
  const rows = await getAdminEmployeeLoanApplications();

  return (
    <DashboardShell
      admin
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="Employee Loans"
      subtitle="Review employee loan applications using the current admin workspace."
    >
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--primary)]">Loan applications</h2>
            <p className="text-sm text-[var(--muted-text)]">Only employee-loan accounts are listed here.</p>
          </div>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">{rows.length} application(s)</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-100">
              <tr>{["Reference", "Employee", "Requested", "Approved", "Stage", "Created"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const employee = row.employee as { employee_number?: string; profiles?: { full_name?: string; email?: string } | { full_name?: string; email?: string }[] } | null;
                const profile = Array.isArray(employee?.profiles) ? employee?.profiles[0] : employee?.profiles;
                const detail = row.detail as { workflow_stage?: string } | null;
                return (
                  <tr key={row.id} className="border-t">
                    <td className="p-3 font-semibold"><Link className="text-blue-800 underline-offset-2 hover:underline" href={`/admin/receivables/loans/${row.id}`}>{row.receivable_number}</Link></td>
                    <td className="p-3">{profile?.full_name || profile?.email || employee?.employee_number || "Employee"}</td>
                    <td className="p-3">{money(Number(row.requested_amount), row.currency)}</td>
                    <td className="p-3">{row.approved_amount == null ? "—" : money(Number(row.approved_amount), row.currency)}</td>
                    <td className="p-3"><span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">{label(detail?.workflow_stage)}</span></td>
                    <td className="p-3">{new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeZone: "Asia/Dhaka" }).format(new Date(row.created_at))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length ? <p className="p-8 text-center text-slate-500">No employee loan applications yet.</p> : null}
        </div>
      </section>
    </DashboardShell>
  );
}
