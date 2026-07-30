import { requireHrAdmin } from "@/lib/hr/admin";
import { csvResponse } from "@/lib/hr/csv";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const validDate = (value: string | null, fallback: string) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;

export async function GET(request: Request) {
  await requireHrAdmin();
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = validDate(url.searchParams.get("from"), today);
  const to = validDate(url.searchParams.get("to"), from);
  const department = url.searchParams.get("department")?.trim() ?? "";
  const db = createSupabaseAdminClient();

  let employeeIds: string[] | null = null;
  if (department) {
    const employees = await db.from("hr_employee_records").select("id")
      .eq("department_id", department).is("archived_at", null).limit(5000);
    if (employees.error) {
      console.error("HR attendance department filter failed", {
        code: employees.error.code,
        message: employees.error.message,
      });
      return new Response("Unable to generate attendance report.", { status: 500 });
    }
    employeeIds = (employees.data ?? []).map((employee) => employee.id);
    if (!employeeIds.length) {
      return csvResponse(
        [["Employee", "Employee number", "Date", "Status", "Check in", "Check out", "Source", "Notes"]],
        `sen-attendance-${from}-to-${to}.csv`,
      );
    }
  }

  let query = db.from("hr_attendance")
    .select("work_date,status,check_in,check_out,source,notes,employee_record_id,hr_employee_records(employee_number,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email))")
    .gte("work_date", from).lte("work_date", to)
    .order("work_date", { ascending: false }).limit(5000);
  if (employeeIds) query = query.in("employee_record_id", employeeIds);
  const result = await query;
  if (result.error) {
    console.error("HR attendance export failed", {
      code: result.error.code,
      message: result.error.message,
    });
    return new Response("Unable to generate attendance report.", { status: 500 });
  }

  return csvResponse([
    ["Employee","Employee number","Date","Status","Check in","Check out","Source","Notes"],
    ...(result.data ?? []).map((row) => {
      const employee = Array.isArray(row.hr_employee_records) ? row.hr_employee_records[0] : row.hr_employee_records;
      const person = employee && (Array.isArray(employee.profiles) ? employee.profiles[0] : employee.profiles);
      return [person?.full_name,employee?.employee_number,row.work_date,row.status,row.check_in,row.check_out,row.source,row.notes];
    }),
  ],`sen-attendance-${from}-to-${to}.csv`);
}
