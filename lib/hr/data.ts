import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function getHrDashboard() {
  const db = createSupabaseAdminClient();
  const [employees, departments, profiles, locations, leave] = await Promise.all([
    db.from("hr_employee_records").select("id,profile_id,employee_number,job_title,employment_type,employment_status,hire_date,base_salary,salary_currency,hr_departments(name),profiles:profile_id(full_name,email),work_locations(name)").order("created_at", { ascending: false }),
    db.from("hr_departments").select("id,code,name,is_active").eq("is_active", true).order("name"),
    db.from("profiles").select("id,full_name,email,role,status").in("role", ["employee", "admin"]).eq("status", "active").order("full_name"),
    db.from("work_locations").select("id,name").eq("is_active", true).order("name"),
    db.from("hr_leave_requests").select("id,leave_type,start_date,end_date,status,reason,hr_employee_records(employee_number,profiles:profile_id(full_name,email))").order("created_at", { ascending: false }).limit(50),
  ]);
  const error = employees.error ?? departments.error ?? profiles.error ?? locations.error ?? leave.error;
  if (error) throw new Error("Unable to load HR data.");
  return { employees: employees.data ?? [], departments: departments.data ?? [], profiles: profiles.data ?? [], locations: locations.data ?? [], leave: leave.data ?? [] };
}
