import { connection } from "next/server";
import { HrPage, hrCard } from "@/components/hr/HrPage";
import { routes } from "@/lib/constants/routes";
import { getHrAttendance, getHrEmployees, getHrLeave, getHrPayroll, getHrReferences } from "@/lib/hr/operational";

export const dynamic = "force-dynamic";

export default async function HrReportsPage() {
  await connection();
  const [employees,attendance,leave,payroll,refs] = await Promise.all([getHrEmployees({pageSize:100,status:"all"}),getHrAttendance(),getHrLeave(),getHrPayroll(),getHrReferences()]);
  const cards = [
    ["Employees",employees.count,"/admin/hr/reports/employees.csv"],
    ["Departments",refs.departments.length,"/admin/hr/reports/departments.csv"],
    ["Today attendance",attendance.rows.length,"/admin/hr/reports/attendance.csv"],
    ["Leave requests",leave.requests.length,"/admin/hr/reports/leave.csv"],
    ["Payroll records",payroll.length,"/admin/hr/reports/payroll.csv"],
  ] as const;
  return <HrPage title="HR reports" subtitle="Administrator-only operational exports and printable summaries.">
    <div className="mb-4 flex justify-end"><a href="/admin/hr/reports/print" className="rounded-lg bg-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-foreground)]">Open printable / PDF report</a></div>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{cards.map(([label,count,href])=><article key={label} className={hrCard}><p className="text-sm text-[var(--muted-text)]">{label}</p><strong className="mt-2 block text-3xl">{count}</strong><a href={href} className="mt-4 inline-block font-semibold text-blue-700">Download CSV →</a></article>)}</section>
    <form action="/admin/hr/reports/attendance.csv" method="get" className={`${hrCard} mt-5 grid gap-3 md:grid-cols-4`}>
      <label className="grid gap-1 text-sm font-semibold">From
        <input name="from" type="date" defaultValue={new Date().toISOString().slice(0,10)} className="rounded-lg border px-3 py-2 font-normal" />
      </label>
      <label className="grid gap-1 text-sm font-semibold">To
        <input name="to" type="date" defaultValue={new Date().toISOString().slice(0,10)} className="rounded-lg border px-3 py-2 font-normal" />
      </label>
      <label className="grid gap-1 text-sm font-semibold">Department
        <select name="department" className="rounded-lg border px-3 py-2 font-normal">
          <option value="">All departments</option>
          {refs.departments.map((department)=><option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </label>
      <button className="self-end rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">Download attendance report</button>
    </form>
    <p className={`${hrCard} mt-5 text-sm text-[var(--muted-text)]`}>CSV files open directly in Microsoft Excel and contain current database records. Payroll exports and printable reports remain protected by the HR administrator guard. Return to <a href={routes.adminHr} className="font-semibold text-blue-700">HR overview</a>.</p>
  </HrPage>;
}
