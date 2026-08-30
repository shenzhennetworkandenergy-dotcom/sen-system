import "server-only";

import { resolveAttendanceWorkDate } from "@/lib/hr/attendance";
import {
  buildMonthlyAttendance,
  resolveAttendanceMonth,
  type MonthlyAttendanceRow,
  type MonthlyLeaveRow,
  type MonthlyScheduleRow,
} from "@/lib/hr/attendance-monthly";
import { requireEmployeeHrRecord } from "@/lib/hr/self-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function getEmployeeMonthlyAttendance(requestedMonth: unknown) {
  const context = await requireEmployeeHrRecord();
  const fallbackWorkDate = resolveAttendanceWorkDate(new Date().toISOString(), "Asia/Dhaka");
  if (!context.employee) {
    const month = resolveAttendanceMonth(requestedMonth, fallbackWorkDate);
    return { month, timeZone: "Asia/Dhaka", ...buildMonthlyAttendance({ month, currentWorkDate: fallbackWorkDate, hireDate: null, attendance: [], approvedLeave: [], schedules: [] }) };
  }

  const db = createSupabaseAdminClient();
  const employeeId = context.employee.id;
  const scheduleResult = await db
    .from("hr_employee_work_schedules")
    .select("weekday,is_working,timezone")
    .eq("employee_record_id", employeeId)
    .order("weekday");
  if (scheduleResult.error) throw new Error("Unable to load your attendance schedule.");
  const schedules = (scheduleResult.data ?? []) as MonthlyScheduleRow[];
  const timeZone = schedules[0]?.timezone ?? "Asia/Dhaka";
  const currentWorkDate = resolveAttendanceWorkDate(new Date().toISOString(), timeZone);
  const month = resolveAttendanceMonth(requestedMonth, currentWorkDate);
  const startDate = `${month}-01`;
  const monthDate = new Date(`${startDate}T00:00:00.000Z`);
  monthDate.setUTCMonth(monthDate.getUTCMonth() + 1);
  monthDate.setUTCDate(0);
  const endDate = monthDate.toISOString().slice(0, 10);

  const [attendanceResult, leaveResult] = await Promise.all([
    db.from("hr_attendance")
      .select("id,work_date,status,check_in,check_out,timezone,check_in_variance_minutes")
      .eq("employee_record_id", employeeId)
      .gte("work_date", startDate)
      .lte("work_date", endDate)
      .order("work_date"),
    db.from("hr_leave_requests")
      .select("id,start_date,end_date,status,hr_leave_types(name,code,is_paid)")
      .eq("employee_record_id", employeeId)
      .eq("status", "approved")
      .lte("start_date", endDate)
      .gte("end_date", startDate)
      .order("start_date"),
  ]);
  if (attendanceResult.error || leaveResult.error) throw new Error("Unable to load your monthly attendance.");

  return {
    month,
    timeZone,
    ...buildMonthlyAttendance({
      month,
      currentWorkDate,
      hireDate: context.employee.hire_date ?? null,
      attendance: (attendanceResult.data ?? []) as MonthlyAttendanceRow[],
      approvedLeave: (leaveResult.data ?? []) as MonthlyLeaveRow[],
      schedules,
    }),
  };
}
