import { requireHrAdmin } from "@/lib/hr/admin";
import { csvResponse } from "@/lib/hr/csv";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  await requireHrAdmin();
  const db = createSupabaseAdminClient();
  const [departments,employees] = await Promise.all([
    db.from("hr_departments").select("id,code,name,is_active").order("name"),
    db.from("hr_employee_records").select("department_id,employment_status").is("archived_at",null).limit(5000),
  ]);
  const error = departments.error ?? employees.error;
  if (error) {
    console.error("HR department export failed", { code:error.code,message:error.message });
    return new Response("Unable to generate department report.",{ status:500 });
  }
  return csvResponse([
    ["Code","Department","Status","Employees","Active","Probation","On leave","Terminated"],
    ...(departments.data ?? []).map((department) => {
      const rows = (employees.data ?? []).filter((employee) => employee.department_id === department.id);
      const count = (status:string) => rows.filter((employee) => employee.employment_status === status).length;
      return [department.code,department.name,department.is_active ? "Active":"Inactive",rows.length,count("active"),count("probation"),count("on_leave"),count("terminated")];
    }),
  ],"sen-departments.csv");
}
