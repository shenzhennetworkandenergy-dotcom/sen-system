import { DashboardShell } from "@/components/dashboard/Shell";
import { WorkSchedulerCreateForm } from "@/components/work-scheduler/WorkSchedulerCreateForm";
import { deactivateWorkScheduleAction, reassignWorkAssignmentAction } from "@/app/admin/work-scheduler/actions";
import { requirePermission } from "@/lib/auth/permissions";
import { getAdminWorkDashboard } from "@/lib/work-scheduler/data";

export const dynamic = "force-dynamic";

const statusTone: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  UNABLE_TO_COMPLETE: "border-rose-200 bg-rose-50 text-rose-800",
};

export default async function WorkSchedulerAdminPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; titleId?: string }> }) {
  const { profile, permissions } = await requirePermission("work_scheduler.manage");
  const [data, params] = await Promise.all([getAdminWorkDashboard(), searchParams]);
  const today = data.assignments.filter((assignment) => assignment.occurrence_date === data.today);
  const counts = {
    pending: today.filter((item) => item.status === "PENDING").length,
    completed: today.filter((item) => item.status === "COMPLETED").length,
    unable: today.filter((item) => item.status === "UNABLE_TO_COMPLETE").length,
    reassigned: today.filter((item) => item.effective_profile_id !== item.scheduled_profile_id).length,
  };
  const employeeName = (id: string) => {
    const person = data.employees.find((employee) => employee.id === id);
    return person?.full_name ?? person?.email ?? "Employee";
  };
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Work Scheduler" subtitle="Coordinate today’s operational work without changing any ERP transaction.">
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#111b4f] via-indigo-700 to-blue-600 p-6 text-white shadow-xl shadow-indigo-200 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-black uppercase tracking-[.18em] text-indigo-200">Operations control</p><h2 className="mt-2 text-3xl font-black">Work Scheduler</h2><p className="mt-2 max-w-xl text-sm text-indigo-100">A calm, shared view of what is assigned, completed, blocked, or reassigned today.</p></div><div className="rounded-2xl border border-white/20 bg-white/10 p-4 text-right"><p className="text-xs font-bold uppercase tracking-wider text-indigo-100">Today</p><p className="text-2xl font-black">{today.length} assigned</p></div></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4">{Object.entries(counts).map(([label, value]) => <div key={label} className="rounded-2xl bg-white/10 p-4"><p className="text-xs font-bold capitalize text-indigo-100">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</div>
    </section>
    {params.success || params.error ? <p className={`mt-4 rounded-xl border p-3 text-sm font-semibold ${params.error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{params.error ?? params.success}</p> : null}
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,.65fr)]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-blue-600">Today</p><h2 className="mt-1 text-xl font-black text-slate-950">Assignments at a glance</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{today.length} assigned</span></div><div className="mt-4 space-y-3">{today.length ? today.map((assignment) => <article key={assignment.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black text-slate-950">{assignment.title}</h3><p className="mt-1 text-sm text-slate-600">{employeeName(assignment.effective_profile_id)} · {assignment.work_type.replaceAll("_", " ")}</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone[assignment.status]}`}>{assignment.status.replaceAll("_", " ")}</span></div>{assignment.effective_profile_id !== assignment.scheduled_profile_id ? <p className="mt-2 text-xs font-bold text-indigo-700">↪ Reassigned from {employeeName(assignment.scheduled_profile_id)}</p> : null}<div className="mt-3 flex flex-wrap gap-2"><a href={`/admin/work-scheduler/assignments/${assignment.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">View</a>{assignment.status === "PENDING" ? <form action={reassignWorkAssignmentAction} className="flex flex-wrap gap-2"><input type="hidden" name="assignment_id" value={assignment.id}/><select name="target_profile_id" required className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"><option value="">Reassign to…</option>{data.employees.filter((employee) => employee.id !== assignment.effective_profile_id).map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name ?? employee.email}</option>)}</select><button className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">Reassign</button></form> : null}</div></article>) : <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No work assigned today.</p>}</div></section>
      <WorkSchedulerCreateForm employees={data.employees.map((employee) => ({ id: employee.id, full_name: employee.full_name, email: employee.email }))} titles={data.titles} customers={data.customers} selectedTitleId={params.titleId}/>
    </div>
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-violet-600">Schedules</p><h2 className="mt-1 text-xl font-black text-slate-950">Active and historical rules</h2></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{data.schedules.length} schedules</span></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.schedules.length ? data.schedules.map((schedule) => <article key={schedule.id} className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{schedule.schedule_type.replaceAll("_", " ")}</p><p className="mt-1 font-black text-slate-950">{data.assignments.find((assignment) => assignment.work_item_id === schedule.work_item_id)?.title ?? "Work schedule"}</p><p className="mt-2 text-sm text-slate-500">{schedule.start_date} → {schedule.end_date}</p><div className="mt-3 flex items-center justify-between"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${schedule.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{schedule.is_active ? "Active" : "Inactive"}</span>{schedule.is_active ? <form action={deactivateWorkScheduleAction}><input type="hidden" name="schedule_id" value={schedule.id}/><button className="text-xs font-bold text-rose-700">Deactivate</button></form> : null}</div></article>) : <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">No recurring schedules yet.</p>}</div></section>
  </DashboardShell>;
}
