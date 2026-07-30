import { connection } from "next/server";
import { EmployeeHrShell } from "@/components/hr/EmployeeHrShell";
import { routes } from "@/lib/constants/routes";
import { getEmployeeHrWorkspace } from "@/lib/hr/self-service";

export const dynamic = "force-dynamic";

export default async function EmployeeAttendancePage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const [data,params] = await Promise.all([getEmployeeHrWorkspace(),searchParams]);
  return <EmployeeHrShell title="My attendance" subtitle="Review your attendance and correction requests." success={params.success} error={params.error}>
    <div className="mb-4 flex justify-end"><a href={routes.employeeHrAttendanceCorrection} className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">Request correction</a></div>
    <section className="overflow-x-auto rounded-2xl border bg-[var(--surface)] shadow-sm"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr><th className="p-3">Date</th><th>Status</th><th>Check in</th><th>Check out</th><th>Source</th><th>Notes</th></tr></thead><tbody>{data.attendance.map((row)=><tr key={row.id} className="border-t"><td className="p-3">{row.work_date}</td><td className="capitalize">{row.status.replaceAll("_"," ")}</td><td>{row.check_in?new Date(row.check_in).toLocaleString():"—"}</td><td>{row.check_out?new Date(row.check_out).toLocaleString():"—"}</td><td className="capitalize">{row.source}</td><td>{row.notes||"—"}</td></tr>)}</tbody></table>{!data.attendance.length?<p className="p-8 text-center text-[var(--muted-text)]">No attendance has been recorded.</p>:null}</section>
  </EmployeeHrShell>;
}
