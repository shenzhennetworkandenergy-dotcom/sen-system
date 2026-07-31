import { connection } from "next/server";
import { AttendanceTimeFields } from "@/components/hr/AttendanceTimeFields";
import { EmployeeCombobox } from "@/components/hr/EmployeeCombobox";
import { HrPage, hrCard, hrField, hrPrimary, relation } from "@/components/hr/HrPage";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { getDeletionMode } from "@/lib/deletion/settings";
import { formatAttendanceVariance } from "@/lib/hr/attendance";
import { attendanceStatuses } from "@/lib/hr/types";
import { getHrAttendance, getHrEmployeeOptions } from "@/lib/hr/operational";
import { deleteAttendanceAction, importAttendanceCsvAction, recordAttendanceAction } from "../hr-actions";

export const dynamic = "force-dynamic";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string; success?: string; error?: string }> }) {
  await connection();
  const params = await searchParams;
  const date = params.date || new Date().toISOString().slice(0, 10);
  const [data, employees, deletionMode] = await Promise.all([getHrAttendance(date), getHrEmployeeOptions(), getDeletionMode()]);
  return <HrPage title="Attendance" subtitle="Record and review timezone-aware attendance from manual, CSV and device sources." success={params.success} error={params.error}>
    <form action={importAttendanceCsvAction} className={`${hrCard} mb-4 flex flex-wrap items-end gap-3`}>
      <input type="hidden" name="return_to" value="/admin/hr/attendance" />
      <label className="min-w-64 flex-1 text-sm font-semibold">Import attendance CSV<input type="file" name="file" accept=".csv,text/csv" required className={hrField}/></label>
      <button className={hrPrimary}>Import CSV</button>
      <p className="w-full text-xs text-[var(--muted-text)]">Headers: employee_number, work_date, status, check_in, check_out, timezone, notes.</p>
    </form>
    <div className="grid gap-4 xl:grid-cols-[1fr_2fr]">
      <form action={recordAttendanceAction} className={hrCard}>
        <input type="hidden" name="return_to" value="/admin/hr/attendance" />
        <h2 className="font-semibold">Record attendance</h2>
        <label className="mt-3 block text-sm font-semibold">Employee<EmployeeCombobox employees={employees} required className={hrField}/></label>
        <AttendanceTimeFields defaultWorkDate={date} fieldClass={hrField} />
        <label className="mt-3 block text-sm font-semibold">Status<select name="status" className={hrField}>{attendanceStatuses.map((status)=><option key={status} value={status}>{status.replaceAll("_"," ")}</option>)}</select></label>
        <label className="mt-3 block text-sm font-semibold">Notes<textarea name="notes" className={hrField}/></label>
        <button className={`${hrPrimary} mt-4`}>Save attendance</button>
      </form>
      <section className={hrCard}>
        <form className="mb-3 flex items-end gap-3"><label className="text-sm font-semibold">Work date<input type="date" name="date" defaultValue={date} className={hrField}/></label><button className={hrPrimary}>View date</button></form>
        <form action={deleteAttendanceAction}>
          <input type="hidden" name="return_to" value={`/admin/hr/attendance?date=${date}`} />
          {deletionMode.permanentEnabled && data.rows.length ? <div className="mb-3 flex justify-end"><ConfirmSubmitButton confirmation="Permanently delete the selected attendance records? This cannot be undone." className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 font-semibold text-red-700">Delete selected attendance</ConfirmSubmitButton></div> : null}
          <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-sm"><thead><tr>{deletionMode.permanentEnabled ? <th className="w-10 p-2"><span className="sr-only">Select</span></th> : null}<th className="p-2">Employee</th><th>Status</th><th>Check in</th><th>Arrival</th><th>Check out</th><th>Departure</th><th>Timezone</th><th>Source</th></tr></thead><tbody>{data.rows.map((row)=>{const employee=relation(row.hr_employee_records);const person=employee?relation(employee.profiles):null;const employeeName=person?.full_name||employee?.employee_number||row.work_date;return <tr key={row.id} className="border-t">{deletionMode.permanentEnabled ? <td className="p-2"><input type="checkbox" name="attendance_ids" value={row.id} aria-label={`Select attendance for ${employeeName}`}/></td> : null}<td className="p-2">{employeeName}</td><td className="capitalize">{row.status.replaceAll("_"," ")}</td><td>{row.check_in?new Date(row.check_in).toLocaleTimeString("en",{timeZone:row.timezone}):"—"}</td><td>{formatAttendanceVariance(row.check_in_variance_minutes,data.settings?.late_grace_minutes)}</td><td>{row.check_out?new Date(row.check_out).toLocaleTimeString("en",{timeZone:row.timezone}):"—"}</td><td>{formatAttendanceVariance(row.check_out_variance_minutes)}</td><td>{row.timezone}</td><td>{row.source}</td></tr>})}</tbody></table>{!data.rows.length?<p className="p-8 text-center text-[var(--muted-text)]">No attendance records for this date.</p>:null}</div>
        </form>
      </section>
    </div>
  </HrPage>;
}
