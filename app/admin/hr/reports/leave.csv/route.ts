import { requireHrAdmin } from "@/lib/hr/admin";
import { csvResponse } from "@/lib/hr/csv";
import { getHrLeave } from "@/lib/hr/operational";

export async function GET() {
  await requireHrAdmin();
  const data = await getHrLeave();
  return csvResponse([
    ["Employee","Employee number","Leave type","Start","End","Days","Status","Reason","Created"],
    ...data.requests.map((row) => {
      const employee = Array.isArray(row.hr_employee_records) ? row.hr_employee_records[0] : row.hr_employee_records;
      const person = employee && (Array.isArray(employee.profiles) ? employee.profiles[0] : employee.profiles);
      const leaveType = Array.isArray(row.hr_leave_types) ? row.hr_leave_types[0] : row.hr_leave_types;
      return [person?.full_name,employee?.employee_number,leaveType?.name,row.start_date,row.end_date,row.total_days,row.status,row.reason,row.created_at];
    }),
  ],"sen-leave-requests.csv");
}
