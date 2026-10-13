"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function text(form: FormData, name: string, max: number) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

function scheduleType(form: FormData) {
  const value = text(form, "schedule_type", 32);
  return ["ONE_TIME", "DAILY", "WEEKLY", "SELECTED_WEEKDAYS"].includes(value) ? value : null;
}

function errorRedirect(message: string): never {
  redirect(`/admin/work-scheduler?error=${encodeURIComponent(message)}`);
}

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export async function createWorkSchedulerTitleAction(form: FormData) {
  const { profile } = await requirePermission("work_scheduler.manage");
  const title = text(form, "title", 160);
  const normalizedTitle = normalizeTitle(title);
  if (!title) errorRedirect("Please enter a work title.");
  const { data, error } = await createSupabaseAdminClient().from("work_scheduler_titles").insert({ title, normalized_title: normalizedTitle, is_active: text(form, "is_active", 5) !== "false", created_by: profile.id }).select("id").single();
  if (error || !data) {
    if (error?.code === "23505") errorRedirect("That work title already exists.");
    console.error("Work Scheduler title insert failed", { code: error?.code, message: error?.message, details: error?.details, hint: error?.hint });
    errorRedirect("Unable to add this work title.");
  }
  revalidatePath("/admin/work-scheduler");
  redirect(`/admin/work-scheduler?success=${encodeURIComponent("Work title added")}&titleId=${encodeURIComponent(data.id)}`);
}

export async function createWorkScheduleAction(form: FormData) {
  const { profile } = await requirePermission("work_scheduler.manage");
  const titleId = text(form, "title_id", 80), type = scheduleType(form), workType = text(form, "work_type", 40) || "GENERAL", deliveryFor = text(form, "delivery_for", 20), customerId = text(form, "customer_id", 80), start = text(form, "start_date", 10), end = text(form, "end_date", 10) || start;
  const employeeIds = text(form, "employee_ids", 300).split(",").map((id) => id.trim()).filter(Boolean);
  const rotation = text(form, "rotation_enabled", 5) === "true";
  if (!titleId) errorRedirect("Please choose a Work title.");
  const isDelivery = workType === "PRODUCT_DELIVERY" || workType === "DELIVERY";
  if (isDelivery && !["CUSTOMER", "OTHER", "PROJECT_SITE"].includes(deliveryFor)) errorRedirect("Please choose Related To: Customer, Project / Site or Other.");
  if (!isDelivery && (deliveryFor || customerId)) errorRedirect("Delivery details are only available for Delivery work.");
  if (!type) errorRedirect("Please choose a valid schedule.");
  if (!start) errorRedirect("Please complete: Start date.");
  if (!end || end < start || (type === "ONE_TIME" && end !== start)) errorRedirect("Please complete a valid schedule date range.");
  if (!employeeIds.length) errorRedirect("Please choose an assigned employee.");
  if (type === "ONE_TIME" && rotation) errorRedirect("Employee rotation is only available for recurring schedules.");
  if (!rotation && employeeIds.length !== 1) errorRedirect("Choose exactly one Assigned Employee, or enable rotation.");
  const weekdays = [...new Set(text(form, "weekdays", 40).split(",").map((value) => value.trim()).filter(Boolean).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  if (type === "SELECTED_WEEKDAYS" && !weekdays.length) errorRedirect("Select at least one weekday.");
  const db = createSupabaseAdminClient();
  const { data: titleRecord, error: titleError } = await db.from("work_scheduler_titles").select("title").eq("id", titleId).eq("is_active", true).single();
  if (titleError || !titleRecord?.title) errorRedirect("Choose an active Work title.");
  const title = titleRecord.title;
  let customerSnapshot: { id: string; name: string; contact_name: string | null; phone: string | null; address: string | null } | null = null;
  if (isDelivery && deliveryFor === "CUSTOMER") {
    if (!customerId) errorRedirect("Please select an existing CRM customer.");
    const { data: customer, error: customerError } = await db.from("profiles").select("id,full_name,email,phone,company_name,status").eq("id", customerId).eq("role", "customer").eq("status", "active").maybeSingle();
    if (customerError || !customer) errorRedirect("Choose a valid existing SEN customer.");
    customerSnapshot = { id: customer.id, name: customer.company_name || customer.full_name || customer.email, contact_name: customer.full_name ?? null, phone: customer.phone ?? null, address: null };
  }
  const { data: item, error: itemError } = await db.from("work_scheduler_items").insert({ title, description: text(form, "description", 4000), work_type: workType, delivery_for: isDelivery ? deliveryFor : null, customer_id: customerSnapshot?.id ?? null, customer_name_snapshot: customerSnapshot?.name ?? null, customer_contact_snapshot: customerSnapshot?.contact_name ?? null, customer_phone_snapshot: customerSnapshot?.phone ?? null, customer_address_snapshot: customerSnapshot?.address ?? null, customer_label: (customerSnapshot?.name ?? text(form, "customer_label", 200)) || null, product_label: text(form, "product_label", 200) || null, site_label: text(form, "site_label", 200) || null, reference_label: text(form, "reference_label", 200) || null, created_by: profile.id }).select("id").single();
  if (itemError || !item) redirect("/admin/work-scheduler?error=Unable%20to%20create%20the%20work%20item");
  const { data: schedule, error: scheduleError } = await db.from("work_scheduler_schedules").insert({ work_item_id: item.id, schedule_type: type, start_date: start, end_date: end, weekdays, timezone: "Asia/Dhaka", created_by: profile.id }).select("id").single();
  if (scheduleError || !schedule) {
    console.error("Work Scheduler schedule insert failed", { code: scheduleError?.code, message: scheduleError?.message, details: scheduleError?.details, hint: scheduleError?.hint });
    errorRedirect("Unable to create the schedule. Check the dates and schedule options.");
  }
  const { error: memberError } = await db.from("work_scheduler_rotation_members").insert(employeeIds.map((profile_id, index) => ({ schedule_id: schedule.id, profile_id, position: index + 1 })));
  if (memberError) redirect("/admin/work-scheduler?error=Choose%20valid%20active%20employees");
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "work_scheduler.schedule_created", module: "work_scheduler", entityType: "work_scheduler_schedules", entityId: schedule.id, description: `${title} schedule created.` });
  revalidatePath("/admin/work-scheduler");
  redirect("/admin/work-scheduler?success=Work%20schedule%20created");
}

export async function reassignWorkAssignmentAction(form: FormData) {
  const { profile } = await requirePermission("work_scheduler.manage");
  const id = text(form, "assignment_id", 80), target = text(form, "target_profile_id", 80);
  if (!id || !target) redirect("/admin/work-scheduler?error=Choose%20an%20employee");
  const db = createSupabaseAdminClient();
  const { error } = await db.from("work_scheduler_assignments").update({ effective_profile_id: target, reassigned_by: profile.id, reassignment_note: text(form, "reassignment_note", 500) || null, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "PENDING");
  if (error) redirect("/admin/work-scheduler?error=Unable%20to%20reassign%20this%20pending%20assignment");
  revalidatePath("/admin/work-scheduler");
  redirect("/admin/work-scheduler?success=Assignment%20reassigned");
}

export async function deactivateWorkScheduleAction(form: FormData) {
  const { profile } = await requirePermission("work_scheduler.manage");
  const id = text(form, "schedule_id", 80);
  const { error } = await createSupabaseAdminClient().from("work_scheduler_schedules").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id).eq("is_active", true);
  if (error) redirect("/admin/work-scheduler?error=Unable%20to%20deactivate%20the%20schedule");
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "work_scheduler.schedule_deactivated", module: "work_scheduler", entityType: "work_scheduler_schedules", entityId: id, description: "Work schedule deactivated." });
  revalidatePath("/admin/work-scheduler");
  redirect("/admin/work-scheduler?success=Schedule%20deactivated");
}
