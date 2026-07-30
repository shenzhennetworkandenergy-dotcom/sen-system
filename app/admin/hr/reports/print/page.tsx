import { connection } from "next/server";
import { PrintReportButton } from "@/components/hr/PrintReportButton";
import { HrPage, hrCard, relation } from "@/components/hr/HrPage";
import { getHrAttendance, getHrEmployees, getHrLeave, getHrPayroll } from "@/lib/hr/operational";

export const dynamic = "force-dynamic";

export default async function HrPrintReportPage() {
  await connection();
  const [employees,attendance,leave,payroll] = await Promise.all([
    getHrEmployees({pageSize:100,status:"all"}), getHrAttendance(), getHrLeave(), getHrPayroll(),
  ]);
  return <HrPage title="HR printable summary" subtitle={`Generated ${new Date().toLocaleString("en-BD")}`}>
    <div className="mb-4 flex justify-end"><PrintReportButton/></div>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[["Employees",employees.count],["Today attendance",attendance.rows.length],["Pending leave",leave.requests.filter((row)=>row.status==="pending").length],["Payroll records",payroll.length]].map(([label,value])=><article key={String(label)} className={hrCard}><p className="text-sm text-[var(--muted-text)]">{label}</p><strong className="text-3xl">{value}</strong></article>)}
    </section>
    <section className={`${hrCard} mt-4 overflow-x-auto`}><h2 className="mb-3 font-semibold">Employee register</h2><table className="w-full min-w-[720px] text-left text-sm"><thead><tr><th>Number</th><th>Name</th><th>Job</th><th>Status</th><th>Hire date</th></tr></thead><tbody>{employees.rows.map((employee)=>{const profile=relation(employee.profiles);return <tr key={employee.id} className="border-t"><td className="py-2">{employee.employee_number}</td><td>{profile?.full_name}</td><td>{employee.job_title}</td><td className="capitalize">{employee.employment_status.replaceAll("_"," ")}</td><td>{employee.hire_date}</td></tr>;})}</tbody></table></section>
    {employees.count > employees.rows.length ? <p className="mt-3 text-sm text-[var(--muted-text)]">The printable preview shows the first {employees.rows.length} employees. Use the employee CSV for the complete register.</p> : null}
  </HrPage>;
}
