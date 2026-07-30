import { requireHrAdmin } from "@/lib/hr/admin";
import { csvResponse } from "@/lib/hr/csv";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  await requireHrAdmin();
  const result = await createSupabaseAdminClient().from("hr_employee_records")
    .select("employee_number,job_title,employment_type,employment_status,hire_date,base_salary,salary_currency,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email,phone,country),hr_departments(name),hr_teams(name),hr_designations(name),work_locations(name)")
    .is("archived_at",null).order("employee_number").limit(5000);
  if (result.error) {
    console.error("HR employee export failed", { code:result.error.code,message:result.error.message });
    return new Response("Unable to generate employee report.",{ status:500 });
  }
  return csvResponse([
    ["Employee number","Name","Email","Phone","Job title","Employment type","Status","Department","Team","Designation","Work location","Hire date","Base salary","Currency","Country"],
    ...(result.data ?? []).map((row) => {
      const one = <T,>(value:T|T[]|null) => Array.isArray(value) ? value[0] : value;
      const profile = one(row.profiles);
      return [row.employee_number,profile?.full_name,profile?.email,profile?.phone,row.job_title,row.employment_type,row.employment_status,one(row.hr_departments)?.name,one(row.hr_teams)?.name,one(row.hr_designations)?.name,one(row.work_locations)?.name,row.hire_date,row.base_salary,row.salary_currency,profile?.country];
    }),
  ],"sen-employees.csv");
}
