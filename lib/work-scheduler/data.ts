import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildOccurrenceDates, rotationEmployeeForOccurrence, WORK_SCHEDULER_TIMEZONE, type WorkSchedulerScheduleType } from "@/lib/work-scheduler/domain";

export type WorkSchedulerAssignment = {
  id: string;
  occurrence_date: string;
  scheduled_profile_id: string;
  effective_profile_id: string;
  status: "PENDING" | "COMPLETED" | "UNABLE_TO_COMPLETE";
  report_note: string | null;
  reported_at: string | null;
  reassignment_note: string | null;
  work_item_id: string;
  title: string;
  description: string;
  work_type: string;
  customer_label: string | null;
  product_label: string | null;
  site_label: string | null;
  reference_label: string | null;
  delivery_for: "CUSTOMER" | "OTHER" | null;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  customer_contact_snapshot: string | null;
  customer_phone_snapshot: string | null;
  customer_address_snapshot: string | null;
};

export type WorkSchedulerCustomer = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  company_name: string | null;
};

function errorMessage(error: { code?: string; message?: string; details?: string; hint?: string } | null, fallback: string) {
  if (error) console.error(fallback, { code: error?.code, message: error?.message, details: error?.details, hint: error?.hint });
  return error ? new Error(fallback) : null;
}

export function todayInWorkSchedulerTimezone(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: WORK_SCHEDULER_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function getSchedules() {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("work_scheduler_schedules").select("id,work_item_id,schedule_type,start_date,end_date,weekdays,is_active").eq("is_active", true);
  if (error) throw errorMessage(error, "Unable to load Work Scheduler schedules.");
  return (data ?? []) as Array<{ id: string; work_item_id: string; schedule_type: WorkSchedulerScheduleType; start_date: string; end_date: string; weekdays: number[]; is_active: boolean }>;
}

export async function materializeWorkSchedulerOccurrences(fromDate: string, toDate: string) {
  const db = createSupabaseAdminClient();
  const [schedules, membersResult] = await Promise.all([
    getSchedules(),
    db.from("work_scheduler_rotation_members").select("schedule_id,profile_id,position").order("position"),
  ]);
  if (membersResult.error) throw errorMessage(membersResult.error, "Unable to load Work Scheduler rotation members.");
  for (const schedule of schedules) {
    const start = schedule.start_date > fromDate ? schedule.start_date : fromDate;
    const end = schedule.end_date < toDate ? schedule.end_date : toDate;
    if (start > end) continue;
    const dates = buildOccurrenceDates({ type: schedule.schedule_type, start: schedule.start_date, end: schedule.end_date, weekdays: schedule.weekdays ?? [] }).filter((date) => date >= start && date <= end);
    const members = (membersResult.data ?? []).filter((member) => member.schedule_id === schedule.id).sort((a, b) => a.position - b.position).map((member) => member.profile_id);
    for (const date of dates) {
      const index = Math.max(0, Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${schedule.start_date}T00:00:00Z`)) / 86400000));
      const employeeId = rotationEmployeeForOccurrence(members, index);
      if (!employeeId) continue;
      const { error } = await db.from("work_scheduler_assignments").insert({ work_item_id: schedule.work_item_id, schedule_id: schedule.id, occurrence_date: date, scheduled_profile_id: employeeId, effective_profile_id: employeeId }).select("id").maybeSingle();
      if (error && error.code !== "23505") throw errorMessage(error, "Unable to materialize Work Scheduler occurrence.");
    }
  }
}

async function loadAssignments(filters: { profileId?: string; fromDate: string; toDate: string }) {
  const db = createSupabaseAdminClient();
  let query = db.from("work_scheduler_assignments").select("id,occurrence_date,scheduled_profile_id,effective_profile_id,status,report_note,reported_at,reassignment_note,work_item_id").gte("occurrence_date", filters.fromDate).lte("occurrence_date", filters.toDate).order("occurrence_date").order("created_at");
  if (filters.profileId) query = query.eq("effective_profile_id", filters.profileId);
  const { data, error } = await query;
  if (error) throw errorMessage(error, "Unable to load Work Scheduler assignments.");
  const rows = (data ?? []) as Array<Omit<WorkSchedulerAssignment, keyof Pick<WorkSchedulerAssignment, "title" | "description" | "work_type" | "customer_label" | "product_label" | "site_label" | "reference_label" | "delivery_for" | "customer_id" | "customer_name_snapshot" | "customer_contact_snapshot" | "customer_phone_snapshot" | "customer_address_snapshot">>>;
  const itemIds = [...new Set(rows.map((row) => row.work_item_id))];
  const items = itemIds.length ? await db.from("work_scheduler_items").select("id,title,description,work_type,customer_label,product_label,site_label,reference_label,delivery_for,customer_id,customer_name_snapshot,customer_contact_snapshot,customer_phone_snapshot,customer_address_snapshot").in("id", itemIds) : { data: [], error: null };
  if (items.error) throw errorMessage(items.error, "Unable to load Work Scheduler work items.");
  const byId = new Map((items.data ?? []).map((item) => [item.id, item]));
  return rows.map((row) => {
    const item = byId.get(row.work_item_id);
    return {
      ...row,
      title: item?.title ?? "Work item unavailable",
      description: item?.description ?? "",
      work_type: item?.work_type ?? "GENERAL",
      customer_label: item?.customer_label ?? null,
      product_label: item?.product_label ?? null,
      site_label: item?.site_label ?? null,
      reference_label: item?.reference_label ?? null,
      delivery_for: item?.delivery_for ?? null,
      customer_id: item?.customer_id ?? null,
      customer_name_snapshot: item?.customer_name_snapshot ?? null,
      customer_contact_snapshot: item?.customer_contact_snapshot ?? null,
      customer_phone_snapshot: item?.customer_phone_snapshot ?? null,
      customer_address_snapshot: item?.customer_address_snapshot ?? null,
    };
  }) as WorkSchedulerAssignment[];
}

export async function getEmployeeWorkDashboard(profileId: string) {
  const today = todayInWorkSchedulerTimezone();
  const tomorrow = addDays(today, 1);
  const upcomingEnd = addDays(today, 30);
  await materializeWorkSchedulerOccurrences(today, upcomingEnd);
  const assignments = await loadAssignments({ profileId, fromDate: today, toDate: upcomingEnd });
  return { today, tomorrow, assignments };
}

export async function getEmployeePendingWorkCount(profileId: string) {
  const today = todayInWorkSchedulerTimezone();
  const { count, error } = await createSupabaseAdminClient()
    .from("work_scheduler_assignments")
    .select("id", { count: "exact", head: true })
    .eq("effective_profile_id", profileId)
    .eq("occurrence_date", today)
    .eq("status", "PENDING");
  if (error) throw errorMessage(error, "Unable to load Work Scheduler pending count.");
  return count ?? 0;
}

export async function getAdminWorkDashboard() {
  const today = todayInWorkSchedulerTimezone();
  const upcomingEnd = addDays(today, 30);
  await materializeWorkSchedulerOccurrences(today, upcomingEnd);
  const [assignments, schedules, employees, titles, customersResult] = await Promise.all([
    loadAssignments({ fromDate: today, toDate: upcomingEnd }),
    createSupabaseAdminClient().from("work_scheduler_schedules").select("id,work_item_id,schedule_type,start_date,end_date,is_active").order("start_date", { ascending: false }),
    createSupabaseAdminClient().from("profiles").select("id,full_name,email").eq("role", "employee").eq("status", "active").order("full_name"),
    createSupabaseAdminClient().from("work_scheduler_titles").select("id,title,is_active").eq("is_active", true).order("title"),
    createSupabaseAdminClient().from("profiles").select("id,full_name,email,phone,company_name,status").eq("role", "customer").eq("status", "active").order("full_name").limit(500),
  ]);
  if (schedules.error || employees.error || titles.error || customersResult.error) throw errorMessage(schedules.error ?? employees.error ?? titles.error ?? customersResult.error, "Unable to load Work Scheduler management data.");
  const customers: WorkSchedulerCustomer[] = customersResult.data ?? [];
  return { today, assignments, schedules: schedules.data ?? [], employees: employees.data ?? [], titles: titles.data ?? [], customers };
}

