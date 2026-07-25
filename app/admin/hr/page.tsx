import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { getHrDashboard } from "@/lib/hr/data";
import { createDepartmentAction, createEmployeeRecordAction, reviewLeaveAction } from "./actions";

export const dynamic = "force-dynamic";
const field = "mt-1 w-full rounded-lg border p-3";
const relation = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;

export default async function HrPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("hr.view");
  const params = await searchParams;
  const data = await getHrDashboard();
  const canManage = profile.role === "admin" || permissions.has("hr.manage_employees");
  const canApprove = profile.role === "admin" || permissions.has("hr.manage_leave");
  const assigned = new Set(data.employees.map((employee) => employee.profile_id));
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Human Resources" subtitle="Employee master records, departments, attendance foundations and leave oversight.">
    {params.success ? <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p> : null}
    {params.error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p> : null}
    <section className="mb-6 grid gap-3 sm:grid-cols-3"><article className="rounded-2xl border bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted-text)]">Employee records</p><strong className="mt-2 block text-3xl">{data.employees.length}</strong></article><article className="rounded-2xl border bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted-text)]">Departments</p><strong className="mt-2 block text-3xl">{data.departments.length}</strong></article><article className="rounded-2xl border bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted-text)]">Pending leave</p><strong className="mt-2 block text-3xl">{data.leave.filter((item) => item.status === "pending").length}</strong></article></section>
    {canManage ? <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
      <form action={createDepartmentAction} className="rounded-2xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-semibold">New department</h2><label className="mt-4 block text-sm font-semibold">Code<input name="code" minLength={2} maxLength={20} required className={field}/></label><label className="mt-3 block text-sm font-semibold">Name<input name="name" minLength={2} maxLength={120} required className={field}/></label><button className="mt-4 rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)]">Create department</button></form>
      <form action={createEmployeeRecordAction} className="rounded-2xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-semibold">Create employee record</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm font-semibold">Staff profile<select name="profile_id" required className={field}><option value="">Choose staff member</option>{data.profiles.filter((item) => !assigned.has(item.id)).map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}</select></label>
        <label className="text-sm font-semibold">Job title<input name="job_title" minLength={2} maxLength={120} required className={field}/></label>
        <label className="text-sm font-semibold">Department<select name="department_id" className={field}><option value="">Unassigned</option>{data.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Employment type<select name="employment_type" className={field}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="intern">Intern</option></select></label>
        <label className="text-sm font-semibold">Hire date<input name="hire_date" type="date" required className={field}/></label>
        <label className="text-sm font-semibold">Work location<select name="work_location_id" className={field}><option value="">Unassigned</option>{data.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Manager<select name="manager_profile_id" className={field}><option value="">No manager</option>{data.profiles.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}</select></label>
        <label className="text-sm font-semibold">Base salary<input name="base_salary" type="number" min="0" step="0.01" className={field}/></label>
        <label className="text-sm font-semibold">Currency<input name="salary_currency" defaultValue="BDT" maxLength={3} className={field}/></label>
      </div><button className="mt-4 rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)]">Create employee record</button></form>
    </div> : null}
    <section className="mt-6 rounded-2xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-semibold">Employee directory</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr><th className="p-3">Employee</th><th>Number</th><th>Department</th><th>Job title</th><th>Type</th><th>Status</th><th>Hire date</th></tr></thead><tbody>{data.employees.map((employee) => { const person = relation(employee.profiles); const department = relation(employee.hr_departments); return <tr key={employee.id} className="border-t"><td className="p-3 font-semibold">{person?.full_name || person?.email || "—"}</td><td>{employee.employee_number}</td><td>{department?.name || "—"}</td><td>{employee.job_title}</td><td className="capitalize">{employee.employment_type.replaceAll("_", " ")}</td><td className="capitalize">{employee.employment_status}</td><td>{employee.hire_date}</td></tr>; })}</tbody></table>{!data.employees.length ? <p className="p-8 text-center text-[var(--muted-text)]">No employee HR records yet.</p> : null}</div></section>
    <section className="mt-6 rounded-2xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-semibold">Leave requests</h2><div className="mt-4 space-y-3">{data.leave.map((item) => { const employee = relation(item.hr_employee_records); const person = employee ? relation(employee.profiles) : null; return <article key={item.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-3"><div><strong>{person?.full_name || person?.email || employee?.employee_number || "Employee"}</strong><p className="text-sm capitalize text-[var(--muted-text)]">{item.leave_type} · {item.start_date} to {item.end_date}</p></div><span className="capitalize">{item.status}</span></div>{item.reason ? <p className="mt-2 text-sm">{item.reason}</p> : null}{item.status === "pending" && canApprove ? <form className="mt-3 flex flex-wrap gap-2"><input name="review_note" placeholder="Optional review note" className="min-w-60 flex-1 rounded-lg border p-2"/><button formAction={reviewLeaveAction.bind(null, item.id, "approved")} className="rounded-lg border border-green-700 px-4 py-2 font-semibold text-green-800">Approve</button><button formAction={reviewLeaveAction.bind(null, item.id, "rejected")} className="rounded-lg border border-red-700 px-4 py-2 font-semibold text-red-800">Reject</button></form> : null}</article>; })}{!data.leave.length ? <p className="text-[var(--muted-text)]">No leave requests yet.</p> : null}</div></section>
  </DashboardShell>;
}
