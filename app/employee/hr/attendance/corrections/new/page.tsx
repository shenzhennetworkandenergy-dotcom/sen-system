import { connection } from "next/server";
import { EmployeeHrShell } from "@/components/hr/EmployeeHrShell";
import { routes } from "@/lib/constants/routes";
import { getEmployeeHrWorkspace } from "@/lib/hr/self-service";
import { requestAttendanceCorrectionAction } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function AttendanceCorrectionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const [data,params] = await Promise.all([getEmployeeHrWorkspace(),searchParams]);
  return <EmployeeHrShell title="Attendance correction" subtitle="Submit a correction for administrator approval." error={params.error}>
    {!data.employee?<p className="rounded-xl border p-5">Your employee HR record has not been configured.</p>:<form action={requestAttendanceCorrectionAction} className="mx-auto max-w-3xl rounded-2xl border bg-[var(--surface)] p-6 shadow-sm"><input type="hidden" name="return_to" value={routes.employeeHrAttendanceCorrection}/><label className="block font-semibold">Work date<input className="mt-1 w-full rounded-lg border px-3 py-2.5" type="date" name="work_date" required/></label><label className="mt-4 block font-semibold">Requested status<select className="mt-1 w-full rounded-lg border px-3 py-2.5" name="requested_status">{["present","late","absent","half_day","remote","leave","holiday"].map((status)=><option key={status} value={status}>{status.replaceAll("_"," ")}</option>)}</select></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="font-semibold">Requested check in<input className="mt-1 w-full rounded-lg border px-3 py-2.5" type="datetime-local" name="requested_check_in"/></label><label className="font-semibold">Requested check out<input className="mt-1 w-full rounded-lg border px-3 py-2.5" type="datetime-local" name="requested_check_out"/></label></div><label className="mt-4 block font-semibold">Reason<textarea className="mt-1 min-h-28 w-full rounded-lg border px-3 py-2.5" name="reason" required minLength={3} maxLength={1000}/></label><button className="mt-5 rounded-lg bg-[var(--primary)] px-4 py-2.5 font-semibold text-[var(--primary-foreground)]">Submit correction</button></form>}
  </EmployeeHrShell>;
}
