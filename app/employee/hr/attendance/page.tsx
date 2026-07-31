import { connection } from "next/server";
import { AttendanceClockControls } from "@/components/hr/AttendanceClockControls";
import { EmployeeHrShell } from "@/components/hr/EmployeeHrShell";
import { routes } from "@/lib/constants/routes";
import { formatAttendanceVariance, resolveAttendanceWorkDate } from "@/lib/hr/attendance";
import { getSelfAttendanceAvailability } from "@/lib/hr/self-attendance";
import { getEmployeeHrWorkspace } from "@/lib/hr/self-service";

export const dynamic = "force-dynamic";

export default async function EmployeeAttendancePage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const [data,params] = await Promise.all([getEmployeeHrWorkspace(),searchParams]);
  const instant = new Date().toISOString();
  const todayAttendance = data.attendance.find(
    (row) => row.work_date === resolveAttendanceWorkDate(instant, row.timezone),
  ) ?? null;
  const availability = getSelfAttendanceAvailability(todayAttendance);
  return <EmployeeHrShell title="My attendance" subtitle="Review your attendance, work-hour differences and correction requests." success={params.success} error={params.error}>
    <AttendanceClockControls
      {...availability}
      checkIn={todayAttendance?.check_in ?? null}
      checkOut={todayAttendance?.check_out ?? null}
      recordedTimezone={todayAttendance?.timezone ?? null}
    />
    <div className="mb-4 flex justify-end"><a href={routes.employeeHrAttendanceCorrection} className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">Request correction</a></div>
    <section className="overflow-x-auto rounded-2xl border bg-[var(--surface)] shadow-sm">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-[var(--muted-surface)]"><tr><th className="p-3">Date</th><th>Status</th><th>Check in</th><th>Arrival</th><th>Check out</th><th>Departure</th><th>Timezone</th><th>Source</th><th>Notes</th></tr></thead>
        <tbody>{data.attendance.map((row)=><tr key={row.id} className="border-t"><td className="p-3">{row.work_date}</td><td className="capitalize">{row.status.replaceAll("_"," ")}</td><td>{row.check_in?new Date(row.check_in).toLocaleString("en",{timeZone:row.timezone}):"—"}</td><td>{formatAttendanceVariance(row.check_in_variance_minutes)}</td><td>{row.check_out?new Date(row.check_out).toLocaleString("en",{timeZone:row.timezone}):"—"}</td><td>{formatAttendanceVariance(row.check_out_variance_minutes)}</td><td>{row.timezone}</td><td className="capitalize">{row.source.replaceAll("_"," ")}</td><td>{row.notes||"—"}</td></tr>)}</tbody>
      </table>
      {!data.attendance.length?<p className="p-8 text-center text-[var(--muted-text)]">No attendance has been recorded.</p>:null}
    </section>
  </EmployeeHrShell>;
}
