import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildEmployeeOptions } from "./form-options";
import { parsePagination } from "./validation";

const checked = <T>(message: string, result: { data: T; error: { code?: string; message?: string } | null }) => {
  if (result.error) {
    console.error(message, { code: result.error.code, message: result.error.message });
    throw new Error(message);
  }
  return result.data;
};

export async function getHrReferences() {
  const db = createSupabaseAdminClient();
  const results = await Promise.all([
    db.from("hr_departments").select("id,code,name,is_active,manager_profile_id").order("name"),
    db.from("hr_teams").select("id,code,name,department_id,is_active").order("name"),
    db.from("hr_designations").select("id,code,name,department_id,is_active").order("name"),
    db.from("profiles").select("id,full_name,email,role,status").in("role", ["employee","admin"]).eq("status","active").is("archived_at", null).order("full_name"),
    db.from("work_locations").select("id,name,code,timezone").eq("is_active", true).order("name"),
    db.from("hr_leave_types").select("id,code,name,default_days,is_paid,requires_document,is_active").order("name"),
    db.from("hr_attendance_devices").select("id,code,name,device_type,vendor,model,serial_number,is_active,last_seen_at,work_location_id").order("name"),
    db.from("hr_settings").select("workday_start,workday_end,late_grace_minutes").eq("id",true).maybeSingle(),
  ]);
  const error = results.find((result) => result.error)?.error ?? null;
  if (error) checked("Unable to load HR reference data.", { data: null, error });
  return {
    departments: results[0].data ?? [], teams: results[1].data ?? [], designations: results[2].data ?? [],
    profiles: results[3].data ?? [], locations: results[4].data ?? [], leaveTypes: results[5].data ?? [], devices: results[6].data ?? [],
    settings: results[7].data,
  };
}

export async function getHrEmployeeOptions() {
  const result = await createSupabaseAdminClient()
    .from("hr_employee_records")
    .select("id,employee_number,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email)")
    .is("archived_at", null)
    .order("employee_number")
    .limit(5001);
  const rows = checked("Unable to load HR employee choices.", result) ?? [];
  if (rows.length > 5000) {
    throw new Error("The employee selector limit was reached. Refine the workforce query.");
  }
  return buildEmployeeOptions(rows);
}

export async function getIntegratedHrDashboard() {
  const db = createSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const results = await Promise.all([
    db.from("hr_employee_records").select("id,employment_status,hire_date,department_id", { count:"exact" }).is("archived_at", null).limit(5000),
    db.from("hr_departments").select("id,name,is_active").order("name"),
    db.from("hr_attendance").select("id,status").eq("work_date", today).limit(5000),
    db.from("hr_leave_requests").select("id").eq("status","pending").limit(1000),
    db.from("hr_attendance_correction_requests").select("id").eq("status","pending").limit(1000),
    db.from("audit_logs").select("id,action,description,created_at").eq("module","hr").order("created_at",{ ascending:false }).limit(8),
  ]);
  const error = results.find((result) => result.error)?.error ?? null;
  if (error) checked("Unable to load the HR dashboard.", { data: null, error });
  return {
    employees: results[0].data ?? [], departments: results[1].data ?? [], attendance: results[2].data ?? [],
    pendingLeave: results[3].data?.length ?? 0, pendingCorrections: results[4].data?.length ?? 0, activity: results[5].data ?? [],
  };
}

export async function getHrEmployees(input: {
  page?: unknown; pageSize?: unknown; q?: string; status?: string;
  department?: string; designation?: string; location?: string;
} = {}) {
  const { page, pageSize } = parsePagination(input.page, input.pageSize);
  const from = (page - 1) * pageSize;
  const db = createSupabaseAdminClient();
  const search = input.q?.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ").slice(0, 100);
  let matchingProfileIds: string[] = [];
  if (search) {
    const profileResult = await db.from("profiles").select("id")
      .or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
      .is("archived_at", null).limit(500);
    matchingProfileIds = checked("Unable to search employee contact information.", profileResult)?.map((item) => item.id) ?? [];
  }
  let query = db.from("hr_employee_records")
    .select("id,profile_id,employee_number,job_title,employment_type,employment_status,hire_date,base_salary,salary_currency,department_id,team_id,designation_id,work_location_id,manager_profile_id,emergency_contact_name,emergency_contact_phone,archived_at,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email,phone,country,avatar_kind,avatar_emoji,avatar_path),hr_departments(name),hr_teams(name),hr_designations(name),work_locations(name)", { count:"exact" })
    .order("created_at",{ ascending:false }).range(from, from + pageSize - 1);
  query = input.status === "archived" ? query.not("archived_at","is",null) : query.is("archived_at",null);
  if (input.status && !["archived","all"].includes(input.status)) query = query.eq("employment_status",input.status);
  if (input.department) query = query.eq("department_id",input.department);
  if (input.designation) query = query.eq("designation_id",input.designation);
  if (input.location) query = query.eq("work_location_id",input.location);
  if (search) {
    const profileClause = matchingProfileIds.length ? `,profile_id.in.(${matchingProfileIds.join(",")})` : "";
    query = query.or(`employee_number.ilike.%${search}%,job_title.ilike.%${search}%${profileClause}`);
  }
  const result = await query;
  const rows = checked("Unable to load the employee directory.", result);
  return { rows: rows ?? [], count: result.count ?? 0, page, pageSize };
}

export async function getHrEmployee(id: string) {
  const db = createSupabaseAdminClient();
  const results = await Promise.all([
    db.from("hr_employee_records").select("*,profiles:profiles!hr_employee_records_profile_id_fkey(id,full_name,email,phone,country,status),hr_departments(name),hr_teams(name),hr_designations(name),work_locations(name)").eq("id",id).single(),
    db.from("hr_employee_profiles").select("*").eq("employee_record_id",id).maybeSingle(),
    db.from("hr_attendance").select("*").eq("employee_record_id",id).order("work_date",{ ascending:false }).limit(30),
    db.from("hr_leave_requests").select("*,hr_leave_types(name)").eq("employee_record_id",id).order("created_at",{ ascending:false }).limit(30),
    db.from("hr_payroll_records").select("*").eq("employee_record_id",id).order("period_start",{ ascending:false }).limit(24),
    db.from("hr_performance_reviews").select("*").eq("employee_record_id",id).order("review_period_end",{ ascending:false }).limit(20),
    db.from("hr_performance_goals").select("*").eq("employee_record_id",id).order("created_at",{ ascending:false }).limit(30),
    db.from("hr_employee_documents").select("*").eq("employee_record_id",id).is("archived_at",null).order("created_at",{ ascending:false }).limit(50),
    db.from("audit_logs").select("id,action,description,old_values,new_values,created_at").eq("module","hr").eq("entity_id",id).order("created_at",{ ascending:false }).limit(30),
    db.from("hr_employee_work_schedules").select("weekday,is_working,workday_start,workday_end,timezone").eq("employee_record_id",id).order("weekday"),
  ]);
  const error = results.find((result) => result.error)?.error ?? null;
  if (error) checked("Unable to load employee HR information.", { data: null, error });
  const profileId = results[0].data?.profile_id as string | undefined;
  const warehouseResult = profileId
    ? await db.from("profile_warehouse_assignments").select("warehouse_id,warehouses(name,code,address,country_code)").eq("profile_id", profileId).eq("is_primary", true).eq("is_active", true).maybeSingle()
    : { data: null, error: null };
  if (warehouseResult.error) checked("Unable to load the employee warehouse assignment.", warehouseResult);
  return {
    record: results[0].data,
    personal: results[1].data,
    attendance: results[2].data ?? [],
    leave: results[3].data ?? [],
    payroll: results[4].data ?? [],
    reviews: results[5].data ?? [],
    goals: results[6].data ?? [],
    documents: results[7].data ?? [],
    activity: results[8].data ?? [],
    schedule: (results[9].data ?? []).map((row) => ({
      weekday: Number(row.weekday),
      isWorking: Boolean(row.is_working),
      startTime: String(row.workday_start).slice(0,5),
      endTime: String(row.workday_end).slice(0,5),
      timezone: String(row.timezone),
    })),
    warehouseAssignment: warehouseResult.data,
  };
}

export async function getHrAttendance(date = new Date().toISOString().slice(0,10)) {
  const db = createSupabaseAdminClient();
  const [rows, corrections, settings] = await Promise.all([
    db.from("hr_attendance").select("*,hr_employee_records(employee_number,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email))").eq("work_date",date).order("created_at",{ ascending:false }).limit(5000),
    db.from("hr_attendance_correction_requests").select("*,hr_employee_records(employee_number,profile_id,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email))").order("created_at",{ ascending:false }).limit(100),
    db.from("hr_settings").select("late_grace_minutes").eq("id",true).maybeSingle(),
  ]);
  if (rows.error ?? corrections.error ?? settings.error) checked("Unable to load attendance.", { data:null, error:rows.error ?? corrections.error ?? settings.error });
  return { date, rows: rows.data ?? [], corrections: corrections.data ?? [], settings:settings.data };
}

export async function getHrLeave() {
  const db = createSupabaseAdminClient();
  const [requests, balances, types] = await Promise.all([
    db.from("hr_leave_requests").select("*,hr_leave_types(name),hr_employee_records(employee_number,profile_id,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email))").order("created_at",{ ascending:false }).limit(500),
    db.from("hr_leave_balances").select("*,hr_leave_types(name),hr_employee_records(employee_number,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email))").order("leave_year",{ ascending:false }).limit(1000),
    db.from("hr_leave_types").select("*").order("name"),
  ]);
  if (requests.error ?? balances.error ?? types.error) checked("Unable to load leave management.", { data:null, error:requests.error ?? balances.error ?? types.error });
  return { requests: requests.data ?? [], balances: balances.data ?? [], types: types.data ?? [] };
}

export async function getHrPayroll() {
  const result = await createSupabaseAdminClient().from("hr_payroll_records")
    .select("*,hr_employee_records(employee_number,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email)),hr_payroll_components(*)")
    .order("period_start",{ ascending:false }).limit(500);
  return checked("Unable to load payroll.",result) ?? [];
}

export async function getHrPerformance() {
  const db = createSupabaseAdminClient();
  const [reviews, goals] = await Promise.all([
    db.from("hr_performance_reviews").select("*,hr_employee_records(employee_number,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email))").order("review_period_end",{ ascending:false }).limit(500),
    db.from("hr_performance_goals").select("*,hr_employee_records(employee_number,profiles:profiles!hr_employee_records_profile_id_fkey(full_name,email))").order("created_at",{ ascending:false }).limit(500),
  ]);
  if (reviews.error ?? goals.error) checked("Unable to load performance records.", { data:null, error:reviews.error ?? goals.error });
  return { reviews: reviews.data ?? [], goals: goals.data ?? [] };
}
