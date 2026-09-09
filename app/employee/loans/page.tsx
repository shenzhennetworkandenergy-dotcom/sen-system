import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { employeeLoanStageLabel } from "@/lib/receivables/employee-loans";
import { getEmployeeLoanApplications } from "@/lib/receivables/employee-loans-data";

export const dynamic = "force-dynamic";

export default async function EmployeeLoansPage() {
  await connection();
  const data = await getEmployeeLoanApplications();
  return <DashboardShell employeePermissions={[]} title="My Loan Applications" subtitle="Apply for a loan and follow only your own applications and agreements.">
    <div className="mb-5 flex flex-wrap gap-3"><Link href="/employee" className="rounded-lg border px-4 py-2 font-semibold">← Employee dashboard</Link><Link href="/employee/loans/apply" className="rounded-lg bg-blue-800 px-4 py-2 font-semibold text-white">Apply for Loan</Link></div>
    {!data.employee ? <p className="rounded-xl border bg-white p-6">Your active employee record is not configured.</p> :
      <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-100"><tr>{["Reference","Requested","Approved","Stage","Submitted"].map((head)=><th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{data.rows.map((row) => {
        const detail = (Array.isArray(row.receivable_employee_loan_details) ? row.receivable_employee_loan_details[0] : row.receivable_employee_loan_details) as { workflow_stage?: string } | null;
        return <tr key={row.id} className="border-t"><td className="p-3"><Link className="font-semibold text-blue-800 underline" href={`/employee/loans/${row.id}`}>{row.receivable_number}</Link></td><td className="p-3">{row.currency} {Number(row.requested_amount).toLocaleString("en-BD")}</td><td className="p-3">{row.approved_amount == null ? "—" : `${row.currency} ${Number(row.approved_amount).toLocaleString("en-BD")}`}</td><td className="p-3">{employeeLoanStageLabel({ accountStatus: row.status, workflowStage: detail?.workflow_stage ?? null })}</td><td className="p-3">{new Intl.DateTimeFormat("en-BD",{dateStyle:"medium",timeZone:"Asia/Dhaka"}).format(new Date(row.created_at))}</td></tr>;
      })}</tbody></table>{!data.rows.length ? <p className="p-8 text-center text-slate-500">No loan applications yet.</p> : null}</div>}
  </DashboardShell>;
}
