import { shiftAttendanceMonth, type MonthlyAttendanceDay, type MonthlyAttendanceSummary } from "@/lib/hr/attendance-monthly";

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const tones: Record<MonthlyAttendanceDay["status"], string> = {
  present: "border-emerald-200 bg-emerald-50 text-emerald-900",
  absent: "border-red-200 bg-red-50 text-red-900",
  paid_leave: "border-blue-200 bg-blue-50 text-blue-900",
  unpaid_leave: "border-violet-200 bg-violet-50 text-violet-900",
  leave: "border-indigo-200 bg-indigo-50 text-indigo-900",
  holiday: "border-amber-200 bg-amber-50 text-amber-900",
  weekend: "border-slate-200 bg-slate-100 text-slate-700",
  not_recorded: "border-slate-200 bg-white text-slate-500",
  recorded: "border-cyan-200 bg-cyan-50 text-cyan-900",
};

function SummaryRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

export function EmployeeAttendanceMonthlyCalendar({ month, days, summary }: {
  month: string;
  days: MonthlyAttendanceDay[];
  summary: MonthlyAttendanceSummary;
}) {
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00.000Z`));
  const firstWeekday = (new Date(`${month}-01T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const cells: Array<MonthlyAttendanceDay | null> = [...Array.from({ length: firstWeekday }, () => null), ...days];
  while (cells.length % 7) cells.push(null);
  const legend = [
    ["P", "Present"], ["+m", "Present + Late"], ["A", "Absent"], ["PL", "Paid Leave"],
    ["UL", "Unpaid Leave"], ["H", "Holiday"], ["W", "Weekend / Off"], ["—", "Not Recorded"],
  ];
  return <section className="mb-5 rounded-2xl border bg-[var(--surface)] p-3 shadow-sm sm:p-5" aria-labelledby="monthly-attendance-title">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Monthly attendance</p><h2 id="monthly-attendance-title" className="mt-1 text-xl font-bold">{monthLabel}</h2></div>
      <nav className="flex items-center gap-2" aria-label="Attendance month navigation">
        <a className="rounded-lg border px-3 py-2 font-semibold" href={`?month=${shiftAttendanceMonth(month, -1)}`} aria-label="Previous month">←</a>
        <a className="rounded-lg border px-3 py-2 font-semibold" href={`?month=${shiftAttendanceMonth(month, 1)}`} aria-label="Next month">→</a>
      </nav>
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
      <div className="overflow-x-auto">
        <div className="min-w-[680px] overflow-hidden rounded-xl border">
          <div className="grid grid-cols-7 bg-[var(--muted-surface)]">{weekDays.map((day)=><div key={day} className="border-r p-2 text-center text-xs font-bold uppercase tracking-wide last:border-r-0">{day}</div>)}</div>
          <div className="grid grid-cols-7">{cells.map((day,index)=>day ? <article key={day.date} className="min-h-24 border-r border-t p-1.5 last:border-r-0" aria-label={`${day.date}: ${day.statusLabel}`}>
            <time className="block px-1 text-xs font-semibold" dateTime={day.date}>{day.day}</time>
            <div className={`mt-1 min-h-16 rounded-lg border p-2 ${tones[day.status]} ${day.isFuture ? "opacity-70" : ""}`}>
              <strong className="block text-sm">{day.code}</strong><span className="mt-1 block text-[11px] leading-tight">{day.detail}</span>
            </div>
          </article> : <div key={`blank-${index}`} className="min-h-24 border-r border-t bg-slate-50/60" />)}</div>
        </div>
      </div>
      <aside className="rounded-xl border p-3" aria-label="Monthly summary">
        <h3 className="font-bold">Monthly summary</h3><div className="mt-3 space-y-2">
          <SummaryRow label="Present" value={summary.present} tone="bg-emerald-50 text-emerald-900" />
          <SummaryRow label="Late" value={summary.late} tone="bg-orange-50 text-orange-900" />
          <SummaryRow label="Absent" value={summary.absent} tone="bg-red-50 text-red-900" />
          <SummaryRow label="Paid leave" value={summary.paidLeave} tone="bg-blue-50 text-blue-900" />
          <SummaryRow label="Unpaid leave" value={summary.unpaidLeave} tone="bg-violet-50 text-violet-900" />
          {summary.leave ? <SummaryRow label="Leave" value={summary.leave} tone="bg-indigo-50 text-indigo-900" /> : null}
          <SummaryRow label="Holiday" value={summary.holiday} tone="bg-amber-50 text-amber-900" />
          <SummaryRow label="Weekend / off" value={summary.weekend} tone="bg-slate-100 text-slate-800" />
          <SummaryRow label="Not recorded" value={summary.notRecorded} tone="bg-slate-50 text-slate-700" />
        </div>
      </aside>
    </div>
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--muted-text)]" aria-label="Attendance status guide">{legend.map(([code,label])=><span key={label}><strong className="text-[var(--foreground)]">{code}</strong> {label}</span>)}</div>
  </section>;
}
