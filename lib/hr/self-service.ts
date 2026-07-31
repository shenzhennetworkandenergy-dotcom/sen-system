import "server-only";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function requireEmployeeHrRecord() {
  const context = await requireProfile(["employee"]);
  const { data, error } = await createSupabaseAdminClient()
    .from("hr_employee_records").select("id,profile_id,employee_number,job_title,employment_status,hire_date,department_id,work_location_id")
    .eq("profile_id", context.profile.id).is("archived_at", null).maybeSingle();
  if (error) throw new Error("Unable to load your HR record.");
  return { ...context, employee: data };
}

export async function getEmployeeHrWorkspace() {
  const context = await requireEmployeeHrRecord();
  if (!context.employee) {
    return {
      ...context, attendance: [], corrections: [], leaveRequests: [],
      leaveBalances: [], leaveTypes: [], goals: [], notifications: [],
    };
  }
  const db = createSupabaseAdminClient();
  const employeeId = context.employee.id;
  const results = await Promise.all([
    db.from("hr_attendance").select("id,work_date,status,check_in,check_out,source,notes,timezone,check_in_variance_minutes,check_out_variance_minutes").eq("employee_record_id", employeeId).order("work_date", { ascending: false }).limit(90),
    db.from("hr_attendance_correction_requests").select("id,attendance_id,work_date,requested_status,requested_check_in,requested_check_out,reason,status,review_note,created_at").eq("employee_record_id", employeeId).order("created_at", { ascending: false }).limit(50),
    db.from("hr_leave_requests").select("id,leave_type_id,start_date,end_date,requested_days,reason,status,review_note,created_at,hr_leave_types(name,code)").eq("employee_record_id", employeeId).order("created_at", { ascending: false }).limit(100),
    db.from("hr_leave_balances").select("id,leave_year,allocated_days,used_days,adjusted_days,hr_leave_types(id,name,code)").eq("employee_record_id", employeeId).order("leave_year", { ascending: false }).limit(100),
    db.from("hr_leave_types").select("id,code,name,default_days,is_paid,requires_document").eq("is_active", true).order("name"),
    db.from("hr_performance_goals").select("id,title,description,target_date,status,progress_percent").eq("employee_record_id", employeeId).order("created_at", { ascending: false }).limit(30),
    db.from("customer_notifications").select("id,title,message,is_read,created_at,entity_type,entity_id").eq("profile_id", context.profile.id).in("entity_type", ["hr_leave_request", "hr_attendance_correction"]).order("created_at", { ascending: false }).limit(20),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) {
    console.error("Employee HR workspace query failed", { code: error.code, message: error.message });
    throw new Error("Unable to load your HR workspace.");
  }
  return {
    ...context, attendance: results[0].data ?? [], corrections: results[1].data ?? [],
    leaveRequests: results[2].data ?? [], leaveBalances: results[3].data ?? [],
    leaveTypes: results[4].data ?? [], goals: results[5].data ?? [], notifications: results[6].data ?? [],
  };
}
