import { requireHrAdmin } from "@/lib/hr/admin";
import { csvResponse } from "@/lib/hr/csv";
import { getHrPayroll } from "@/lib/hr/operational";

export async function GET() {
  await requireHrAdmin();
  const data = await getHrPayroll();
  return csvResponse([
    ["Employee","Employee number","Period start","Period end","Base salary","Gross pay","Deductions","Net pay","Currency","Status","Paid at"],
    ...data.map((row) => {
      const employee = Array.isArray(row.hr_employee_records) ? row.hr_employee_records[0] : row.hr_employee_records;
      const person = employee && (Array.isArray(employee.profiles) ? employee.profiles[0] : employee.profiles);
      return [person?.full_name,employee?.employee_number,row.period_start,row.period_end,row.base_salary,row.gross_pay,row.deductions,row.net_pay,row.currency,row.status,row.paid_at];
    }),
  ],"sen-payroll.csv");
}
