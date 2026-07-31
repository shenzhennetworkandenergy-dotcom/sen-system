"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionOutcomeUrl, type ActionOutcome } from "@/lib/actions/outcome";
import { getDeletionMode } from "@/lib/deletion/settings";
import { requireHrAdmin } from "@/lib/hr/admin";
import { normalizeCurrencyCode } from "@/lib/currency/currencies";
import { isValidTimeZone, parseEmployeeSchedule, zonedLocalDateTimeToIso } from "@/lib/hr/attendance";
import { validateEmployeeDocuments } from "@/lib/hr/documents";
import { parsePermanentHrDeletion } from "@/lib/hr/permanent-deletion";
import { parseAttendanceInput, parseEmployeeInput, parseMoney } from "@/lib/hr/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const nullable = (form: FormData, key: string) => text(form,key) || null;
const checked = (form: FormData, key: string) => form.get(key) === "on";
const safeReturn = (form: FormData) => {
  const value = text(form,"return_to");
  return value.startsWith("/admin/hr") ? value : "/admin/hr";
};
const finish = (form: FormData, kind: "success"|"error", message: string) => {
  const path = safeReturn(form);
  revalidatePath("/admin/hr","layout");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message)}`);
};
const report = (label: string, error: { code?: string; message?: string } | null) => {
  if (error) console.error(label, { code:error.code, message:error.message });
  return error;
};
const audit = async (actorId: string, action: string, entityType: string, entityId: string, description: string) => {
  await createSupabaseAdminClient().from("audit_logs").insert({
    actor_id:actorId, actor_role:"admin", action, module:"hr", entity_type:entityType, entity_id:entityId, description,
  });
};

export async function saveEmployeeAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  let destination = safeReturn(form);
  let outcome: ActionOutcome;
  let employeePersisted = false;
  try {
    const input = parseEmployeeInput({
      profileId:text(form,"profile_id"), jobTitle:text(form,"job_title"), hireDate:text(form,"hire_date"),
      departmentId:nullable(form,"department_id"), teamId:nullable(form,"team_id"), designationId:nullable(form,"designation_id"),
      employmentType:text(form,"employment_type") as never, employmentStatus:text(form,"employment_status") as never,
      workLocationId:nullable(form,"work_location_id"), managerProfileId:nullable(form,"manager_profile_id"),
      baseSalary:nullable(form,"base_salary"), salaryCurrency:text(form,"salary_currency"),
      emergencyName:nullable(form,"emergency_name"), emergencyPhone:nullable(form,"emergency_phone"),
    });
    const schedule = parseEmployeeSchedule(
      Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        isWorking: checked(form,`schedule_${weekday}_working`),
        startTime:text(form,`schedule_${weekday}_start`),
        endTime:text(form,`schedule_${weekday}_end`),
        timezone:text(form,`schedule_${weekday}_timezone`),
      })),
    );
    const onboardingFiles = form.getAll("onboarding_documents")
      .filter((file): file is File => file instanceof File && file.size > 0);
    const validatedFiles = validateEmployeeDocuments(onboardingFiles);
    const employeeId = nullable(form,"employee_id");
    const db = createSupabaseAdminClient();
    const { data, error } = await db.rpc("hr_upsert_employee", {
      actor_profile_id:profile.id, requested_employee_id:employeeId, requested_profile_id:input.profileId,
      requested_department_id:input.departmentId, requested_team_id:input.teamId, requested_designation_id:input.designationId,
      requested_job_title:input.jobTitle, requested_employment_type:input.employmentType, requested_status:input.employmentStatus,
      requested_hire_date:input.hireDate, requested_work_location_id:input.workLocationId, requested_manager_profile_id:input.managerProfileId,
      requested_base_salary:input.baseSalary, requested_currency:input.salaryCurrency,
      requested_emergency_name:input.emergencyName, requested_emergency_phone:input.emergencyPhone,
    });
    if (report("Employee save failed",error)) throw new Error("Unable to save employee record.");
    const id = String(data);
    employeePersisted = true;
    destination = `/admin/hr/employees/${id}`;
    const personal = {
      employee_record_id:id, preferred_name:nullable(form,"preferred_name"), date_of_birth:nullable(form,"date_of_birth"),
      gender:nullable(form,"gender"), nationality:nullable(form,"nationality"), national_id:nullable(form,"national_id"),
      passport_number:nullable(form,"passport_number"), personal_email:nullable(form,"personal_email"),
      personal_phone:nullable(form,"personal_phone"), present_address:nullable(form,"present_address"),
      permanent_address:nullable(form,"permanent_address"), blood_group:nullable(form,"blood_group"),
      marital_status:nullable(form,"marital_status"), bank_name:nullable(form,"bank_name"),
      bank_account_name:nullable(form,"bank_account_name"), bank_account_number:nullable(form,"bank_account_number"),
      bank_routing_number:nullable(form,"bank_routing_number"), tax_identifier:nullable(form,"tax_identifier"),
      notes:nullable(form,"personal_notes"), updated_by:profile.id,
    };
    const personalResult = await db.from("hr_employee_profiles").upsert(personal,{ onConflict:"employee_record_id" });
    if (report("Employee personal information save failed",personalResult.error)) {
      throw new Error("Employment record saved, but personal information could not be saved.");
    }
    const scheduleResult = await db.rpc("hr_replace_employee_schedule", {
      actor_profile_id:profile.id,
      requested_employee_id:id,
      requested_schedule:schedule,
    });
    if (report("Employee schedule save failed",scheduleResult.error)) {
      throw new Error("Employee record saved, but the work schedule could not be saved.");
    }
    for (const validated of validatedFiles) {
      const { file, safeName } = validated;
      const path = `${id}/${randomUUID()}-${safeName}`;
      const upload = await db.storage.from("hr-documents").upload(path,file,{ contentType:file.type,upsert:false });
      if (report("Employee onboarding document upload failed",upload.error)) {
        throw new Error(`Employee record saved, but ${file.name} could not be uploaded.`);
      }
      const inserted = await db.from("hr_employee_documents").insert({
        employee_record_id:id,
        document_type:"onboarding",
        title:file.name.replace(/\.[^.]+$/,"").slice(0,160) || "Onboarding document",
        storage_path:path,
        mime_type:file.type,
        size_bytes:file.size,
        uploaded_by:profile.id,
      });
      if (inserted.error) {
        await db.storage.from("hr-documents").remove([path]);
        report("Employee onboarding document metadata save failed",inserted.error);
        throw new Error(`Employee record saved, but ${file.name} could not be registered.`);
      }
    }
    await audit(profile.id,"hr.employee_saved","employee_record",id,"Employee record, work schedule and onboarding documents saved.");
    outcome = { kind:"success", message:validatedFiles.length
      ? `Employee added successfully with ${validatedFiles.length} document(s).`
      : "Employee saved successfully." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save employee record.";
    outcome = {
      kind:employeePersisted ? "warning" : "error",
      message,
    };
  }
  revalidatePath("/admin/hr","layout");
  redirect(actionOutcomeUrl(destination,outcome));
}

export async function archiveEmployeeAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const restore = text(form,"operation") === "restore";
  const employeeId = text(form,"employee_id");
  const db = createSupabaseAdminClient();
  const { error } = await db.rpc("hr_archive_employee", {
    actor_profile_id:profile.id, requested_employee_id:employeeId, requested_restore:restore,
  });
  if (report("Employee lifecycle update failed",error)) return finish(form,"error","Unable to update employee lifecycle.");
  revalidatePath("/admin/settings/trash-bin");
  finish(form,"success",restore ? "Employee restored." : "Employee archived without deleting history.");
}

export async function saveOrganizationAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const type = text(form,"entity_type");
  const code = text(form,"code").toUpperCase();
  const name = text(form,"name");
  if (!/^[A-Z0-9-]{2,20}$/.test(code) || name.length < 2) return finish(form,"error","Enter a valid code and name.");
  const table = type === "team" ? "hr_teams" : type === "designation" ? "hr_designations" : "hr_departments";
  const payload: Record<string,unknown> = { code,name,is_active:checked(form,"is_active"),created_by:profile.id };
  if (type !== "department") payload.department_id = nullable(form,"department_id");
  if (type === "team") payload.manager_profile_id = nullable(form,"manager_profile_id");
  if (type === "designation") payload.description = nullable(form,"description");
  const { data, error } = await createSupabaseAdminClient().from(table).insert(payload).select("id").single();
  if (report("HR organization save failed",error)) return finish(form,"error",error?.code === "23505" ? "That code or name already exists." : "Unable to save organization record.");
  await audit(profile.id,`hr.${type}_created`,type,String(data?.id),`${name} created.`);
  finish(form,"success",`${type[0].toUpperCase()}${type.slice(1)} created.`);
}

export async function toggleOrganizationAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const type = text(form,"entity_type");
  const id = text(form,"entity_id");
  const table = type === "team" ? "hr_teams" : type === "designation" ? "hr_designations" : type === "department" ? "hr_departments" : null;
  if (!table || !id) return finish(form,"error","Invalid organization record.");
  const nextActive = text(form,"next_active") === "true";
  const { error } = await createSupabaseAdminClient().from(table).update({ is_active:nextActive,updated_at:new Date().toISOString() }).eq("id",id);
  if (report("HR organization status update failed",error)) return finish(form,"error","Unable to update organization status.");
  await audit(profile.id,`hr.${type}_${nextActive ? "activated":"deactivated"}`,type,id,`${type} ${nextActive ? "activated":"deactivated"}.`);
  finish(form,"success",`${type[0].toUpperCase()}${type.slice(1)} ${nextActive ? "activated":"deactivated"}.`);
}

export async function recordAttendanceAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  let kind: "success" | "error" = "success";
  let message = "Attendance saved.";
  try {
    const timezone = text(form,"attendance_timezone") || "Asia/Dhaka";
    if (!isValidTimeZone(timezone)) throw new Error("Attendance timezone is invalid.");
    const localInstant = (key: string) => {
      const local = nullable(form,key);
      return local ? zonedLocalDateTimeToIso(local.slice(0,10),local.slice(11,16),timezone) : null;
    };
    const input = parseAttendanceInput({
      employeeRecordId:text(form,"employee_record_id"), workDate:text(form,"work_date"), status:text(form,"status"),
      checkIn:localInstant("check_in"), checkOut:localInstant("check_out"), notes:nullable(form,"notes"),
    });
    const { error } = await createSupabaseAdminClient().rpc("hr_record_attendance", {
      actor_profile_id:profile.id, requested_employee_id:input.employeeRecordId, requested_work_date:input.workDate,
      requested_status:input.status, requested_check_in:input.checkIn, requested_check_out:input.checkOut,
      requested_notes:input.notes, requested_source:"manual", requested_timezone:timezone,
    });
    if (report("Attendance save failed",error)) throw new Error("Unable to save attendance.");
    await audit(profile.id,"hr.attendance_recorded","employee_record",input.employeeRecordId,`Attendance recorded for ${input.workDate}.`);
  } catch (error) {
    kind = "error";
    message = error instanceof Error ? error.message : "Unable to save attendance.";
  }
  finish(form,kind,message);
}

export async function deleteAttendanceAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  let kind: "success" | "error" = "success";
  let message = "Attendance permanently deleted.";
  try {
    const mode = await getDeletionMode();
    const ids = parsePermanentHrDeletion(
      mode.permanentEnabled,
      form.getAll("attendance_ids"),
      100,
    );
    const { data, error } = await createSupabaseAdminClient().rpc(
      "admin_delete_hr_attendance",
      {
        actor_profile_id: profile.id,
        requested_attendance_ids: ids,
      },
    );
    if (report("Attendance permanent deletion failed", error)) {
      throw new Error(error?.message || "Unable to delete attendance.");
    }
    message = `${Number(data) || ids.length} attendance record(s) permanently deleted.`;
  } catch (error) {
    kind = "error";
    message =
      error instanceof Error ? error.message : "Unable to delete attendance.";
  }
  finish(form, kind, message);
}

const parseCsvRow = (line: string) => {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else value += character;
  }
  values.push(value.trim());
  return values;
};

export async function importAttendanceCsvAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return finish(form,"error","Choose a CSV file.");
  if (file.size > 2 * 1024 * 1024) return finish(form,"error","Attendance CSV must be 2 MB or smaller.");
  const lines = (await file.text()).replace(/^\uFEFF/,"").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return finish(form,"error","The CSV must contain a header and at least one attendance row.");
  const headers = parseCsvRow(lines[0]).map((header) => header.toLowerCase());
  const required = ["employee_number","work_date","status"];
  if (required.some((header) => !headers.includes(header))) {
    return finish(form,"error","CSV headers must include employee_number, work_date and status.");
  }
  const employeeNumbers = lines.slice(1).map((line) => parseCsvRow(line)[headers.indexOf("employee_number")]).filter(Boolean);
  const db = createSupabaseAdminClient();
  const employeeResult = await db.from("hr_employee_records").select("id,employee_number").in("employee_number",[...new Set(employeeNumbers)]);
  if (report("Attendance CSV employee lookup failed",employeeResult.error)) return finish(form,"error","Unable to validate CSV employees.");
  const employees = new Map((employeeResult.data ?? []).map((row) => [row.employee_number,row.id]));
  let records: Array<{ input: ReturnType<typeof parseAttendanceInput>; timezone: string | null }>;
  try {
    records = lines.slice(1).map((line,index) => {
      const columns = parseCsvRow(line);
      const employeeNumber = columns[headers.indexOf("employee_number")] ?? "";
      const employeeRecordId = employees.get(employeeNumber);
      if (!employeeRecordId) throw new Error(`Row ${index + 2}: employee ${employeeNumber || "(blank)"} was not found.`);
      return {
        input:parseAttendanceInput({
          employeeRecordId,
          workDate:columns[headers.indexOf("work_date")],
          status:columns[headers.indexOf("status")],
          checkIn:headers.includes("check_in") ? columns[headers.indexOf("check_in")] || null : null,
          checkOut:headers.includes("check_out") ? columns[headers.indexOf("check_out")] || null : null,
          notes:headers.includes("notes") ? columns[headers.indexOf("notes")] || null : null,
        }),
        timezone:headers.includes("timezone") ? columns[headers.indexOf("timezone")] || null : null,
      };
    });
  } catch (error) {
    return finish(form,"error",error instanceof Error ? error.message : "Attendance CSV is invalid.");
  }
  let importKind: "success" | "error" = "success";
  let importMessage = `${records.length} attendance rows imported.`;
  try {
    for (const record of records) {
      const { input, timezone } = record;
      if (timezone && !isValidTimeZone(timezone)) throw new Error(`Timezone ${timezone} is invalid.`);
      const { error } = await db.rpc("hr_record_attendance", {
        actor_profile_id:profile.id, requested_employee_id:input.employeeRecordId,
        requested_work_date:input.workDate, requested_status:input.status,
        requested_check_in:input.checkIn, requested_check_out:input.checkOut,
        requested_notes:input.notes, requested_source:"csv",
        requested_timezone:timezone,
      });
      if (error) throw new Error(error.message);
    }
    await audit(profile.id,"hr.attendance_csv_imported","attendance_import",randomUUID(),`${records.length} attendance rows imported.`);
  } catch (error) {
    importKind = "error";
    importMessage = error instanceof Error ? error.message : "Unable to import attendance.";
  }
  finish(form,importKind,importMessage);
}

export async function reviewCorrectionAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const decision = text(form,"decision");
  if (!["approved","rejected"].includes(decision)) return finish(form,"error","Select a valid decision.");
  const { error } = await createSupabaseAdminClient().rpc("hr_review_attendance_correction", {
    actor_profile_id:profile.id, requested_correction_id:text(form,"correction_id"),
    requested_decision:decision, requested_note:text(form,"review_note"),
  });
  if (report("Correction review failed",error)) return finish(form,"error","Unable to review attendance correction.");
  finish(form,"success",`Attendance correction ${decision}.`);
}

export async function reviewLeaveAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const decision = text(form,"decision");
  if (!["approved","rejected"].includes(decision)) return finish(form,"error","Select a valid decision.");
  const { error } = await createSupabaseAdminClient().rpc("hr_review_leave", {
    actor_profile_id:profile.id, requested_leave_id:text(form,"leave_id"),
    requested_decision:decision, requested_note:text(form,"review_note"),
  });
  if (report("Leave review failed",error)) return finish(form,"error","Unable to review leave request.");
  finish(form,"success",`Leave request ${decision}.`);
}

export async function saveLeaveTypeAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const payload = { code:text(form,"code").toUpperCase(), name:text(form,"name"), default_days:Number(text(form,"default_days") || 0),
    is_paid:checked(form,"is_paid"), requires_document:checked(form,"requires_document"), is_active:checked(form,"is_active"), created_by:profile.id };
  const { data,error } = await createSupabaseAdminClient().from("hr_leave_types").insert(payload).select("id").single();
  if (report("Leave type save failed",error)) return finish(form,"error","Unable to create leave type.");
  await audit(profile.id,"hr.leave_type_created","leave_type",String(data?.id),`${payload.name} created.`);
  finish(form,"success","Leave type created.");
}

export async function saveLeaveBalanceAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const payload = { employee_record_id:text(form,"employee_record_id"),leave_type_id:text(form,"leave_type_id"),
    leave_year:Number(text(form,"leave_year")),allocated_days:Number(text(form,"allocated_days") || 0),
    adjusted_days:Number(text(form,"adjusted_days") || 0),updated_by:profile.id };
  const { error } = await createSupabaseAdminClient().from("hr_leave_balances").upsert(payload,{ onConflict:"employee_record_id,leave_type_id,leave_year" });
  if (report("Leave balance save failed",error)) return finish(form,"error","Unable to save leave balance.");
  finish(form,"success","Leave balance saved.");
}

export async function savePayrollAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  let payrollKind: "success" | "error" = "success";
  let payrollMessage = "Payroll record created.";
  try {
    const base = parseMoney(text(form,"base_salary")); const allowance = parseMoney(text(form,"allowance") || 0);
    const bonus = parseMoney(text(form,"bonus") || 0); const deduction = parseMoney(text(form,"deduction") || 0);
    const gross = base + allowance + bonus; const net = Math.max(0,gross-deduction);
    const db = createSupabaseAdminClient();
    const { data,error } = await db.from("hr_payroll_records").insert({
      employee_record_id:text(form,"employee_record_id"),period_start:text(form,"period_start"),period_end:text(form,"period_end"),
      base_salary:base,gross_pay:gross,deductions:deduction,net_pay:net,currency:normalizeCurrencyCode(text(form,"currency") || "BDT"),
      status:"draft",notes:nullable(form,"notes"),created_by:profile.id,
    }).select("id").single();
    if (report("Payroll save failed",error) || !data) throw new Error("Unable to create payroll record.");
    const components = [
      allowance ? { payroll_record_id:data.id,component_type:"earning",name:"Allowance",amount:allowance } : null,
      bonus ? { payroll_record_id:data.id,component_type:"earning",name:"Bonus",amount:bonus } : null,
      deduction ? { payroll_record_id:data.id,component_type:"deduction",name:"Deduction",amount:deduction } : null,
    ].filter((component): component is NonNullable<typeof component> => component !== null);
    if (components.length) await db.from("hr_payroll_components").insert(components);
    await audit(profile.id,"hr.payroll_created","payroll",String(data.id),"Payroll record created.");
  } catch (error) {
    payrollKind = "error";
    payrollMessage = error instanceof Error ? error.message : "Unable to create payroll.";
  }
  finish(form,payrollKind,payrollMessage);
}

export async function updatePayrollStatusAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const status = text(form,"status");
  if (!["approved","paid","cancelled"].includes(status)) return finish(form,"error","Invalid payroll status.");
  const payload: Record<string,unknown> = { status,approved_by:profile.id,updated_at:new Date().toISOString() };
  if (status === "paid") payload.paid_at = new Date().toISOString();
  const { error } = await createSupabaseAdminClient().from("hr_payroll_records").update(payload).eq("id",text(form,"payroll_id"));
  if (report("Payroll status update failed",error)) return finish(form,"error","Unable to update payroll.");
  finish(form,"success",`Payroll marked ${status}.`);
}

export async function savePerformanceAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const kind = text(form,"kind");
  const db = createSupabaseAdminClient();
  if (kind === "goal") {
    const { data,error } = await db.from("hr_performance_goals").insert({
      employee_record_id:text(form,"employee_record_id"),title:text(form,"title"),description:nullable(form,"description"),
      target_date:nullable(form,"target_date"),status:"not_started",progress_percent:0,created_by:profile.id,
    }).select("id").single();
    if (report("Performance goal save failed",error)) return finish(form,"error","Unable to create goal.");
    await audit(profile.id,"hr.goal_created","performance_goal",String(data?.id),"Performance goal created.");
  } else {
    const rating = Number(text(form,"rating"));
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) return finish(form,"error","Rating must be from 0 to 5.");
    const { data,error } = await db.from("hr_performance_reviews").insert({
      employee_record_id:text(form,"employee_record_id"),review_period_start:text(form,"period_start"),
      review_period_end:text(form,"period_end"),rating,strengths:nullable(form,"strengths"),improvements:nullable(form,"improvements"),
      summary:nullable(form,"summary"),status:checked(form,"finalized") ? "finalized":"draft",reviewer_profile_id:profile.id,
      finalized_at:checked(form,"finalized") ? new Date().toISOString():null,
    }).select("id").single();
    if (report("Performance review save failed",error)) return finish(form,"error","Unable to create review.");
    await audit(profile.id,"hr.review_created","performance_review",String(data?.id),"Performance review created.");
  }
  finish(form,"success",kind === "goal" ? "Performance goal created." : "Performance review created.");
}

export async function saveHrSettingsAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const { error } = await createSupabaseAdminClient().from("hr_settings").upsert({
    id:true,workday_start:text(form,"workday_start"),workday_end:text(form,"workday_end"),
    late_grace_minutes:Number(text(form,"late_grace_minutes")),leave_year_start_month:Number(text(form,"leave_year_start_month")),
    device_ingestion_enabled:checked(form,"device_ingestion_enabled"),updated_by:profile.id,updated_at:new Date().toISOString(),
  });
  if (report("HR settings save failed",error)) return finish(form,"error","Unable to save HR settings.");
  finish(form,"success","HR settings saved.");
}

export async function createAttendanceDeviceAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const apiKey = `sen_hr_${randomBytes(24).toString("hex")}`;
  const { hashDeviceKey } = await import("@/lib/hr/device-ingestion");
  const { error } = await createSupabaseAdminClient().from("hr_attendance_devices").insert({
    code:text(form,"code").toUpperCase(),name:text(form,"name"),device_type:text(form,"device_type"),
    vendor:nullable(form,"vendor"),model:nullable(form,"model"),serial_number:nullable(form,"serial_number"),
    work_location_id:nullable(form,"work_location_id"),api_key_hash:hashDeviceKey(apiKey),is_active:true,created_by:profile.id,
  });
  if (report("Attendance device registration failed",error)) return finish(form,"error","Unable to register attendance device.");
  finish(form,"success",`Device registered. Copy this key now: ${apiKey}`);
}

export async function saveDeviceMappingAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const payload = {
    device_id:text(form,"device_id"),
    employee_record_id:text(form,"employee_record_id"),
    external_employee_id:text(form,"external_employee_id"),
    is_active:checked(form,"is_active"),
  };
  if (!payload.device_id || !payload.employee_record_id || !payload.external_employee_id) {
    return finish(form,"error","Device, employee and external employee ID are required.");
  }
  const { data,error } = await createSupabaseAdminClient().from("hr_device_employee_mappings")
    .upsert(payload,{ onConflict:"device_id,external_employee_id" }).select("id").single();
  if (report("Attendance device mapping failed",error)) return finish(form,"error","Unable to save device mapping.");
  await audit(profile.id,"hr.device_mapping_saved","device_mapping",String(data?.id),"Attendance device employee mapping saved.");
  finish(form,"success","Device mapping saved.");
}

export async function uploadEmployeeDocumentAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  const employeeId = text(form,"employee_id");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return finish(form,"error","Choose a document to upload.");
  let safeName: string;
  try {
    safeName = validateEmployeeDocuments([file])[0].safeName;
  } catch (error) {
    return finish(form,"error",error instanceof Error ? error.message : "Document is invalid.");
  }
  const path = `${employeeId}/${randomUUID()}-${safeName}`;
  const db = createSupabaseAdminClient();
  const upload = await db.storage.from("hr-documents").upload(path,file,{ contentType:file.type,upsert:false });
  if (report("Employee document upload failed",upload.error)) return finish(form,"error","Unable to upload employee document.");
  const inserted = await db.from("hr_employee_documents").insert({
    employee_record_id:employeeId,document_type:text(form,"document_type"),title:text(form,"title"),
    storage_path:path,mime_type:file.type,size_bytes:file.size,expires_on:nullable(form,"expires_on"),uploaded_by:profile.id,
  }).select("id").single();
  if (inserted.error) {
    await db.storage.from("hr-documents").remove([path]);
    report("Employee document metadata save failed",inserted.error);
    return finish(form,"error","Unable to save employee document.");
  }
  await audit(profile.id,"hr.document_uploaded","employee_document",String(inserted.data.id),"Employee document uploaded.");
  finish(form,"success","Employee document uploaded.");
}

export async function deleteEmployeeDocumentsAction(form: FormData) {
  const { profile } = await requireHrAdmin();
  let kind: "success" | "error" = "success";
  let message = "Employee documents permanently deleted.";
  try {
    const mode = await getDeletionMode();
    const employeeId = parsePermanentHrDeletion(
      mode.permanentEnabled,
      [text(form, "employee_id")],
      1,
    )[0];
    const documentIds = parsePermanentHrDeletion(
      mode.permanentEnabled,
      form.getAll("document_ids"),
      50,
    );
    const db = createSupabaseAdminClient();
    const preparation = await db.rpc(
      "admin_prepare_hr_employee_document_deletion",
      {
        actor_profile_id: profile.id,
        requested_employee_id: employeeId,
        requested_document_ids: documentIds,
      },
    );
    if (report("Employee document deletion preparation failed", preparation.error)) {
      throw new Error(
        preparation.error?.message ||
          "Unable to prepare the selected employee documents for deletion.",
      );
    }
    const prepared =
      preparation.data && typeof preparation.data === "object"
        ? (preparation.data as {
            job_id?: unknown;
            storage_paths?: unknown;
          })
        : null;
    const jobId = parsePermanentHrDeletion(
      true,
      [prepared?.job_id],
      1,
    )[0];
    const storagePaths = Array.isArray(prepared?.storage_paths)
      ? prepared.storage_paths.filter(
          (path): path is string => typeof path === "string" && path.length > 0,
        )
      : [];
    if (storagePaths.length !== documentIds.length) {
      const failedJob = await db.rpc(
        "admin_fail_hr_employee_document_deletion",
        {
          actor_profile_id: profile.id,
          requested_job_id: jobId,
          requested_error_message:
            "Storage cleanup could not start because the file list was incomplete.",
        },
      );
      report("Employee document deletion job update failed", failedJob.error);
      throw new Error(
        "Document metadata was kept because the storage file list was incomplete.",
      );
    }
    const storageResult = await db.storage
      .from("hr-documents")
      .remove(storagePaths);
    if (report("Employee document storage deletion failed", storageResult.error)) {
      const failedJob = await db.rpc(
        "admin_fail_hr_employee_document_deletion",
        {
          actor_profile_id: profile.id,
          requested_job_id: jobId,
          requested_error_message:
            storageResult.error?.message || "Storage cleanup failed.",
        },
      );
      report("Employee document deletion job update failed", failedJob.error);
      throw new Error(
        "The files could not be removed from storage. Document metadata was not deleted.",
      );
    }
    const finalization = await db.rpc(
      "admin_finalize_hr_employee_document_deletion",
      {
      actor_profile_id: profile.id,
        requested_job_id: jobId,
      },
    );
    if (report("Employee document deletion finalization failed", finalization.error)) {
      throw new Error(
        "The files were removed, but database finalization is still pending. Select the same documents and delete them again to resume safely.",
      );
    }
    message = `${documentIds.length} employee document(s) permanently deleted.`;
  } catch (error) {
    kind = "error";
    message =
      error instanceof Error
        ? error.message
        : "Unable to delete employee documents.";
  }
  finish(form, kind, message);
}
