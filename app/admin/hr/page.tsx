import { connection } from "next/server";
import { HrPage, hrCard } from "@/components/hr/HrPage";
import { routes } from "@/lib/constants/routes";
import { getIntegratedHrDashboard } from "@/lib/hr/operational";

export const dynamic = "force-dynamic";

export default async function HrDashboard({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const [data, params] = await Promise.all([getIntegratedHrDashboard(), searchParams]);
  const active = data.employees.filter((employee) => employee.employment_status === "active").length;
  const present = data.attendance.filter((item) => ["present","late","remote"].includes(item.status)).length;
  const links = [
    ["Employees", routes.adminHrEmployees, "Employee records and lifecycle"],
    ["Attendance", routes.adminHrAttendance, "Daily attendance and corrections"],
    ["Leave", routes.adminHrLeaves, "Requests, types and balances"],
    ["Payroll", routes.adminHrPayroll, "Salary records and payment status"],
    ["Performance", routes.adminHrPerformance, "Reviews and employee goals"],
    ["Reports", routes.adminHrReports, "HR summaries and CSV exports"],
  ] as const;
  return (
    <HrPage title="Human Resources" subtitle="People, attendance, leave, payroll and performance in one control center." success={params.success} error={params.error}>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Employees", data.employees.length],
          ["Active", active],
          ["Departments", data.departments.length],
          ["Present today", present],
          ["Pending leave", data.pendingLeave],
          ["Corrections", data.pendingCorrections],
        ].map(([label,value]) => <article key={label} className={hrCard}><p className="text-sm text-[var(--muted-text)]">{label}</p><strong className="mt-2 block text-3xl">{value}</strong></article>)}
      </section>
      <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {links.map(([label,href,description]) => <a key={href} href={href} className={`${hrCard} transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md`}><h2 className="font-semibold">{label} →</h2><p className="mt-1 text-sm text-[var(--muted-text)]">{description}</p></a>)}
      </section>
      <section className={`${hrCard} mt-5`}><h2 className="text-lg font-semibold">Recent HR activity</h2><div className="mt-3 divide-y">{data.activity.map((item) => <article key={item.id} className="py-3"><div className="flex justify-between gap-4"><strong>{item.action.replaceAll("_"," ")}</strong><time className="text-xs text-[var(--muted-text)]">{new Date(item.created_at).toLocaleString()}</time></div><p className="text-sm text-[var(--muted-text)]">{item.description}</p></article>)}{!data.activity.length ? <p className="py-4 text-sm text-[var(--muted-text)]">No HR activity recorded yet.</p> : null}</div></section>
    </HrPage>
  );
}
