import { connection } from "next/server";
import { HrPage, hrCard, hrField, hrPrimary, relation } from "@/components/hr/HrPage";
import { getHrAttendance, getHrEmployees } from "@/lib/hr/operational";
import { importAttendanceCsvAction, recordAttendanceAction } from "../hr-actions";

export const dynamic = "force-dynamic";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string; success?: string; error?: string }> }) {
  await connection();
  const params = await searchParams;
  const date = params.date || new Date().toISOString().slice(0,10);
  const [data, employees] = await Promise.all([getHrAttendance(date), getHrEmployees({pageSize:100,status:"all"})]);
  return <HrPage title="Attendance" subtitle="Record and review daily attendance from manual, CSV or future device sources." success={params.success} error={params.error}>
    <form action={importAttendanceCsvAction} className={`${hrCard} mb-4 flex flex-wrap items-end gap-3`}>
      <input type="hidden" name="return_to" value="/admin/hr/attendance"/>
      <label className="min-w-64 flex-1 text-sm font-semibold">Import attendance CSV
        <input type="file" name="file" accept=".csv,text/csv" required className={hrField}/>
      </label>
      <button className={hrPrimary}>Import CSV</button>
      <p className="w-full text-xs text-[var(--muted-text)]">Headers: employee_number, work_date, status, check_in, check_out, notes.</p>
    </form>
    <div className="grid gap-4 xl:grid-cols-[1fr_2fr]">
      <form action={recordAttendanceAction} className={hrCard}><input type="hidden" name="return_to" value="/admin/hr/attendance"/><h2 className="font-semibold">Record attendance</h2><label className="mt-3 block text-sm font-semibold">Employee<select name="employee_record_id" required className={hrField}><option value="">Select employee</option>{employees.rows.map((e)=><option key={e.id} value={e.id}>{relation(e.profiles)?.full_name || e.employee_number}</option>)}</select></label><label className="mt-3 block text-sm font-semibold">Date<input type="date" name="work_date" required defaultValue={date} className={hrField}/></label><label className="mt-3 block text-sm font-semibold">Status<select name="status" className={hrField}>{["present","late","absent","half_day","remote","leave","holiday"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></label><div className="mt-3 grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Check in<input type="datetime-local" name="check_in" className={hrField}/></label><label className="text-sm font-semibold">Check out<input type="datetime-local" name="check_out" className={hrField}/></label></div><label className="mt-3 block text-sm font-semibold">Notes<textarea name="notes" className={hrField}/></label><button className={`${hrPrimary} mt-4`}>Save attendance</button></form>
      <section className={hrCard}><form className="mb-3 flex items-end gap-3"><label className="text-sm font-semibold">Work date<input type="date" name="date" defaultValue={date} className={hrField}/></label><button className={hrPrimary}>View date</button></form><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr><th className="p-2">Employee</th><th>Status</th><th>Check in</th><th>Check out</th><th>Source</th></tr></thead><tbody>{data.rows.map((row)=>{const employee=relation(row.hr_employee_records);const person=employee?relation(employee.profiles):null;return <tr key={row.id} className="border-t"><td className="p-2">{person?.full_name||employee?.employee_number}</td><td className="capitalize">{row.status.replaceAll("_"," ")}</td><td>{row.check_in?new Date(row.check_in).toLocaleTimeString():"—"}</td><td>{row.check_out?new Date(row.check_out).toLocaleTimeString():"—"}</td><td>{row.source}</td></tr>})}</tbody></table>{!data.rows.length?<p className="p-8 text-center text-[var(--muted-text)]">No attendance records for this date.</p>:null}</div></section>
    </div>
  </HrPage>;
}
