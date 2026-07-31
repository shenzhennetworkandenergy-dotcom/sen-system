"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { routes } from "@/lib/constants/routes";
import { isValidTimeZone } from "@/lib/hr/attendance";
import { requireEmployeeHrRecord } from "@/lib/hr/self-service";
import { parseAttendanceInput, parseLeaveInput } from "@/lib/hr/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => value(form, key) || null;
const finish = (form: FormData, fallback: string, kind: "success" | "error", message: string) => {
  const requested = value(form, "return_to");
  const path = requested.startsWith("/employee/hr") ? requested : fallback;
  revalidatePath(routes.employeeHr, "layout");
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
};

export async function recordSelfAttendanceAction(form: FormData) {
  const context = await requireEmployeeHrRecord();
  if (!context.employee) {
    return finish(form, routes.employeeHrAttendance, "error", "Your employee HR record has not been configured.");
  }

  const eventType = value(form, "event_type");
  const timezone = value(form, "timezone");
  if (eventType !== "check_in" && eventType !== "check_out") {
    return finish(form, routes.employeeHrAttendance, "error", "Choose check in or check out.");
  }
  if (!isValidTimeZone(timezone)) {
    return finish(form, routes.employeeHrAttendance, "error", "Unable to detect a valid timezone. Refresh the page and try again.");
  }

  const result = await createSupabaseAdminClient().rpc("hr_record_self_attendance", {
    actor_profile_id: context.profile.id,
    requested_event: eventType,
    requested_timezone: timezone,
  });
  if (result.error) {
    console.error("Employee self-attendance failed", {
      code: result.error.code,
      message: result.error.message,
      employeeRecordId: context.employee.id,
      eventType,
    });
    const knownMessage = [
      "already checked in",
      "already checked out",
      "Check in before",
      "does not allow check in",
      "active employee HR record",
      "timezone is invalid",
    ].find((message) => result.error.message.includes(message));
    return finish(
      form,
      routes.employeeHrAttendance,
      "error",
      knownMessage ? result.error.message : "Unable to record attendance. Please try again or contact HR.",
    );
  }

  finish(
    form,
    routes.employeeHrAttendance,
    "success",
    eventType === "check_in"
      ? "Check-in recorded successfully."
      : "Check-out recorded successfully.",
  );
}

export async function requestAttendanceCorrectionAction(form: FormData) {
  const context = await requireEmployeeHrRecord();
  if (!context.employee) return finish(form, routes.employeeHrAttendance, "error", "Your employee HR record has not been configured.");
  let kind: "success" | "error" = "success";
  let message = "Attendance correction submitted for administrator approval.";
  let fallback: string = routes.employeeHrAttendance;
  try {
    const input = parseAttendanceInput({
      employeeRecordId: context.employee.id, workDate: value(form, "work_date"),
      status: value(form, "requested_status"), checkIn: optional(form, "requested_check_in"),
      checkOut: optional(form, "requested_check_out"), notes: value(form, "reason"),
    });
    const reason = value(form, "reason");
    if (reason.length < 3 || reason.length > 1000) throw new Error("Reason must be between 3 and 1000 characters.");
    const db = createSupabaseAdminClient();
    const duplicate = await db.from("hr_attendance_correction_requests").select("id")
      .eq("employee_record_id", context.employee.id).eq("work_date", input.workDate).eq("status", "pending").maybeSingle();
    if (duplicate.error) throw new Error("Unable to verify your correction request.");
    if (duplicate.data) throw new Error("A correction for this date is already waiting for review.");
    const result = await db.from("hr_attendance_correction_requests").insert({
      employee_record_id: context.employee.id, attendance_id: optional(form, "attendance_id"),
      work_date: input.workDate, requested_status: input.status, requested_check_in: input.checkIn,
      requested_check_out: input.checkOut, reason, status: "pending",
    });
    if (result.error) {
      console.error("Employee attendance correction insert failed", { code: result.error.code, message: result.error.message });
      throw new Error("Unable to submit the attendance correction.");
    }
  } catch (error) {
    kind = "error";
    fallback = routes.employeeHrAttendanceCorrection;
    message = error instanceof Error ? error.message : "Unable to submit the request.";
  }
  finish(form, fallback, kind, message);
}

export async function requestLeaveAction(form: FormData) {
  const context = await requireEmployeeHrRecord();
  if (!context.employee) return finish(form, routes.employeeHrLeaves, "error", "Your employee HR record has not been configured.");
  let kind: "success" | "error" = "success";
  let message = "Leave request submitted for administrator approval.";
  let fallback: string = routes.employeeHrLeaves;
  try {
    const input = parseLeaveInput({ leaveTypeId: value(form, "leave_type_id"), startDate: value(form, "start_date"), endDate: value(form, "end_date"), reason: value(form, "reason") });
    const days = Math.floor((Date.parse(`${input.endDate}T00:00:00Z`) - Date.parse(`${input.startDate}T00:00:00Z`)) / 86400000) + 1;
    const db = createSupabaseAdminClient();
    const [typeResult, overlapResult, balanceResult] = await Promise.all([
      db.from("hr_leave_types").select("id,code,is_active").eq("id", input.leaveTypeId).eq("is_active", true).maybeSingle(),
      db.from("hr_leave_requests").select("id").eq("employee_record_id", context.employee.id).in("status", ["pending", "approved"]).lte("start_date", input.endDate).gte("end_date", input.startDate).limit(1),
      db.from("hr_leave_balances").select("allocated_days,used_days,adjusted_days").eq("employee_record_id", context.employee.id).eq("leave_type_id", input.leaveTypeId).eq("leave_year", Number(input.startDate.slice(0, 4))).maybeSingle(),
    ]);
    if (typeResult.error ?? overlapResult.error ?? balanceResult.error) throw new Error("Unable to validate the leave request.");
    if (!typeResult.data) throw new Error("Select an active leave type.");
    if ((overlapResult.data ?? []).length) throw new Error("This request overlaps another pending or approved leave.");
    if (typeResult.data.code !== "UNPAID") {
      if (!balanceResult.data) throw new Error("No leave balance is configured for this type and year.");
      const available = Number(balanceResult.data.allocated_days) + Number(balanceResult.data.adjusted_days) - Number(balanceResult.data.used_days);
      if (days > available) throw new Error(`Only ${available} day(s) are available for this leave type.`);
    }
    const insert = await db.from("hr_leave_requests").insert({
      employee_record_id: context.employee.id, leave_type: String(typeResult.data.code).toLowerCase(),
      leave_type_id: input.leaveTypeId, start_date: input.startDate, end_date: input.endDate,
      requested_days: days, reason: input.reason, submitted_by: context.profile.id, status: "pending",
    });
    if (insert.error) {
      console.error("Employee leave request insert failed", { code: insert.error.code, message: insert.error.message });
      throw new Error("Unable to submit the leave request.");
    }
  } catch (error) {
    kind = "error";
    fallback = routes.employeeHrNewLeave;
    message = error instanceof Error ? error.message : "Unable to submit leave.";
  }
  finish(form, fallback, kind, message);
}

export async function cancelLeaveAction(form: FormData) {
  const context = await requireEmployeeHrRecord();
  if (!context.employee) return finish(form, routes.employeeHrLeaves, "error", "Your employee HR record has not been configured.");
  const result = await createSupabaseAdminClient().from("hr_leave_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", value(form, "leave_id")).eq("employee_record_id", context.employee.id).eq("status", "pending")
    .select("id").maybeSingle();
  if (result.error || !result.data) return finish(form, routes.employeeHrLeaves, "error", "Only your own pending leave request can be cancelled.");
  finish(form, routes.employeeHrLeaves, "success", "Leave request cancelled.");
}
