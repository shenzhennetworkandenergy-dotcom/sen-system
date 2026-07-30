import { connection } from "next/server";
import { EmployeeHrShell } from "@/components/hr/EmployeeHrShell";
import { routes } from "@/lib/constants/routes";
import { getEmployeeHrWorkspace } from "@/lib/hr/self-service";

export const dynamic = "force-dynamic";

export default async function EmployeeHrPage() {
  await connection();
  const data = await getEmployeeHrWorkspace();
  const today = new Date().toISOString().slice(0, 10);
  const todayAttendance = data.attendance.find((row) => row.work_date === today);
  const pendingLeave = data.leaveRequests.filter((row) => row.status === "pending").length;
  const pendingCorrections = data.corrections.filter((row) => row.status === "pending").length;
  return <EmployeeHrShell title="My HR" subtitle="Your attendance, leave, goals and HR requests in one secure workspace.">
    {!data.employee ? <section className="rounded-2xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">HR profile setup is pending</h2><p className="mt-2 text-[var(--muted-text)]">Your account is active, but an administrator has not created your employee HR record yet.</p></section> : <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Employee number",data.employee.employee_number],["Today",todayAttendance?.status?.replaceAll("_"," ")??"Not recorded"],["Pending leave",String(pendingLeave)],["Pending corrections",String(pendingCorrections)]].map(([label,value])=><article key={label} className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm"><p className="text-sm text-[var(--muted-text)]">{label}</p><strong className="mt-2 block text-xl capitalize">{value}</strong></article>)}
      </section>
      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm"><h2 className="font-semibold">Quick actions</h2><div className="mt-3 flex flex-wrap gap-2"><a className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]" href={routes.employeeHrNewLeave}>Request leave</a><a className="rounded-lg border px-4 py-2 font-semibold" href={routes.employeeHrAttendanceCorrection}>Request attendance correction</a></div></article>
        <article className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm"><h2 className="font-semibold">Performance goals</h2><div className="mt-3 space-y-2">{data.goals.slice(0,5).map((goal)=><div key={goal.id} className="rounded-xl bg-[var(--muted-surface)] p-3"><div className="flex justify-between gap-3"><strong>{goal.title}</strong><span>{goal.progress_percent}%</span></div><p className="mt-1 text-sm capitalize text-[var(--muted-text)]">{goal.status.replaceAll("_"," ")}</p></div>)}{!data.goals.length?<p className="text-sm text-[var(--muted-text)]">No performance goals assigned.</p>:null}</div></article>
      </section>
    </>}
  </EmployeeHrShell>;
}
