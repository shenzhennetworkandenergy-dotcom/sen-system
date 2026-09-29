"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { routes } from "@/lib/constants/routes";
import { isValidTimeZone } from "@/lib/hr/attendance";
import { calculateLeaveDays, leaveApplicationTypeCodes } from "@/lib/hr/leave";
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
      "non-working day",
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
  let message = "Leave application generated.";
  let fallback: string = routes.employeeHrLeaves;
  try {
    const input = parseLeaveInput({ leaveTypeId: value(form, "leave_type_id"), startDate: value(form, "start_date"), endDate: value(form, "end_date"), reason: value(form, "reason") });
    const days = calculateLeaveDays(input.startDate,input.endDate);
    const contactNumber = value(form,"contact_number");
    const leaveLocation = optional(form,"leave_location");
    const additionalNote = optional(form,"additional_note");
    if (contactNumber.length < 3 || contactNumber.length > 50) throw new Error("Contact number must be between 3 and 50 characters.");
    if (leaveLocation && leaveLocation.length > 500) throw new Error("Location must not exceed 500 characters.");
    if (additionalNote && additionalNote.length > 1000) throw new Error("Additional note must not exceed 1000 characters.");
    const db = createSupabaseAdminClient();
    const [typeResult, overlapResult] = await Promise.all([
      db.from("hr_leave_types").select("id,code,is_active").eq("id", input.leaveTypeId).eq("is_active", true).maybeSingle(),
      db.from("hr_leave_requests").select("id").eq("employee_record_id", context.employee.id).in("status", ["pending", "approved"]).lte("start_date", input.endDate).gte("end_date", input.startDate).limit(1),
    ]);
    if (typeResult.error ?? overlapResult.error) throw new Error("Unable to validate the leave application.");
    if (!typeResult.data || !leaveApplicationTypeCodes.includes(typeResult.data.code as (typeof leaveApplicationTypeCodes)[number])) throw new Error("Select an available leave type.");
    if ((overlapResult.data ?? []).length) throw new Error("This request overlaps another pending or approved leave.");
    const insert = await db.from("hr_leave_requests").insert({
      employee_record_id: context.employee.id, leave_type: String(typeResult.data.code).toLowerCase(),
      leave_type_id: input.leaveTypeId, start_date: input.startDate, end_date: input.endDate,
      requested_days: days, reason: input.reason, contact_number:contactNumber, leave_location:leaveLocation,
      additional_note:additionalNote, submitted_by: context.profile.id, status: "pending",
    }).select("id").single();
    if (insert.error) {
      console.error("Employee leave request insert failed", { code: insert.error.code, message: insert.error.message });
      throw new Error("Unable to submit the leave request.");
    }
    fallback = `/employee/hr/leaves/${insert.data.id}`;
  } catch (error) {
    kind = "error";
    fallback = routes.employeeHrNewLeave;
    message = error instanceof Error ? error.message : "Unable to submit leave.";
  }
  finish(form, fallback, kind, message);
}

export async function uploadSignedLeaveApplicationAction(form: FormData) {
  const context = await requireEmployeeHrRecord();
  if (!context.employee) return finish(form,routes.employeeHrLeaves,"error","Your employee HR record has not been configured.");
  const leaveId = value(form,"leave_id");
  const destination = `/employee/hr/leaves/${leaveId}`;
  const file = form.get("signed_application");
  if (!(file instanceof File) || file.size < 1) return finish(form,destination,"error","Choose a signed application file.");
  const allowedTypes = new Set(["application/pdf","image/jpeg","image/png"]);
  if (!allowedTypes.has(file.type)) return finish(form,destination,"error","Upload a PDF, JPG, JPEG or PNG file.");
  if (file.size > 10 * 1024 * 1024) return finish(form,destination,"error","The signed application must not exceed 10 MB.");
  const db = createSupabaseAdminClient();
  const leave = await db.from("hr_leave_requests").select("id,status,signed_storage_path")
    .eq("id",leaveId).eq("employee_record_id",context.employee.id).maybeSingle();
  if (leave.error || !leave.data || leave.data.status !== "pending") return finish(form,routes.employeeHrLeaves,"error","Only your own undecided leave application can receive a signed copy.");
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120) || "signed-application";
  const path = `${context.employee.id}/leave-applications/${leaveId}/${randomUUID()}-${safeName}`;
  const upload = await db.storage.from("hr-documents").upload(path,file,{contentType:file.type,upsert:false});
  if (upload.error) return finish(form,destination,"error","Unable to upload the signed application.");
  const updated = await db.from("hr_leave_requests").update({
    signed_storage_path:path,signed_file_name:file.name.slice(0,255),signed_mime_type:file.type,
    signed_size_bytes:file.size,signed_uploaded_at:new Date().toISOString(),updated_at:new Date().toISOString(),
  }).eq("id",leaveId).eq("employee_record_id",context.employee.id).eq("status","pending").select("id").maybeSingle();
  if (updated.error || !updated.data) {
    await db.storage.from("hr-documents").remove([path]);
    return finish(form,destination,"error","Unable to associate the signed copy with this application.");
  }
  if (leave.data.signed_storage_path) await db.storage.from("hr-documents").remove([leave.data.signed_storage_path]);
  finish(form,destination,"success","Signed leave application uploaded securely.");
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
