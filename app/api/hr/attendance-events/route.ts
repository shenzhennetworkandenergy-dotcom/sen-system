import { NextRequest, NextResponse } from "next/server";
import { calculateAttendanceVariance, resolveAttendanceWorkDate } from "@/lib/hr/attendance";
import { hashDeviceKey, parseDeviceEvent } from "@/lib/hr/device-ingestion";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const relation = <T,>(value: T | T[] | null | undefined) =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

export async function POST(request: NextRequest) {
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 64 * 1024) return NextResponse.json({ error:"Payload too large." },{ status:413 });
    const apiKey = request.headers.get("x-sen-device-key")?.trim();
    if (!apiKey) return NextResponse.json({ error:"Device key is required." },{ status:401 });
    const event = parseDeviceEvent(await request.json());
    const db = createSupabaseAdminClient();
    const [deviceResult,settingsResult] = await Promise.all([
      db.from("hr_attendance_devices").select("id,work_locations(timezone)").eq("api_key_hash",hashDeviceKey(apiKey)).eq("is_active",true).maybeSingle(),
      db.from("hr_settings").select("device_ingestion_enabled,workday_start,workday_end,late_grace_minutes").eq("id",true).maybeSingle(),
    ]);
    if (deviceResult.error || !deviceResult.data) return NextResponse.json({ error:"Invalid device key." },{ status:401 });
    if (settingsResult.error || !settingsResult.data?.device_ingestion_enabled) {
      return NextResponse.json({ error:"Device ingestion is disabled." },{ status:503 });
    }
    const mapping = await db.from("hr_device_employee_mappings").select("employee_record_id")
      .eq("device_id",deviceResult.data.id).eq("external_employee_id",event.employeeExternalId).eq("is_active",true).maybeSingle();
    if (mapping.error || !mapping.data) return NextResponse.json({ error:"Employee mapping was not found." },{ status:422 });

    const schedules = await db.from("hr_employee_work_schedules")
      .select("weekday,is_working,workday_start,workday_end,timezone")
      .eq("employee_record_id",mapping.data.employee_record_id);
    if (schedules.error) throw schedules.error;
    const locationTimezone = relation(deviceResult.data.work_locations)?.timezone;
    let timezone = event.timezone || locationTimezone || schedules.data?.[0]?.timezone || "Asia/Dhaka";
    let workDate = resolveAttendanceWorkDate(event.occurredAt,timezone);
    let weekday = new Date(`${workDate}T00:00:00Z`).getUTCDay();
    let schedule = schedules.data?.find((row) => row.weekday === weekday);
    if (schedule?.timezone && schedule.timezone !== timezone) {
      timezone = schedule.timezone;
      workDate = resolveAttendanceWorkDate(event.occurredAt,timezone);
      weekday = new Date(`${workDate}T00:00:00Z`).getUTCDay();
      schedule = schedules.data?.find((row) => row.weekday === weekday);
    }
    const startTime = String(schedule?.workday_start ?? settingsResult.data.workday_start ?? "09:00").slice(0,5);
    const endTime = String(schedule?.workday_end ?? settingsResult.data.workday_end ?? "18:00").slice(0,5);

    const inserted = await db.from("hr_attendance_events").insert({
      device_id:deviceResult.data.id,employee_record_id:mapping.data.employee_record_id,event_uid:event.eventUid,
      event_type:event.eventType,occurred_at:event.occurredAt,raw_metadata:{
        ...event.metadata,
        external_employee_id:event.employeeExternalId,
        timezone,
      },
    }).select("id").single();
    if (inserted.error?.code === "23505") return NextResponse.json({ ok:true,duplicate:true });
    if (inserted.error) throw inserted.error;

    const attendance = await db.from("hr_attendance")
      .select("id,check_in,check_out,status")
      .eq("employee_record_id",mapping.data.employee_record_id).eq("work_date",workDate).maybeSingle();
    if (attendance.error) throw attendance.error;
    const current = attendance.data;
    const checkIn = event.eventType === "check_in"
      ? (!current?.check_in || event.occurredAt < current.check_in ? event.occurredAt : current.check_in)
      : current?.check_in ?? null;
    const checkOut = event.eventType === "check_out"
      ? (!current?.check_out || event.occurredAt > current.check_out ? event.occurredAt : current.check_out)
      : current?.check_out ?? null;
    const variance = calculateAttendanceVariance({ workDate,timezone,startTime,endTime,checkIn,checkOut });
    const manualOvertime = current?.status === "overtime" || current?.status === "holiday_overtime";
    const status = manualOvertime
      ? current.status
      : (variance.checkInVarianceMinutes ?? 0) > Number(settingsResult.data.late_grace_minutes ?? 0)
        ? "late"
        : "present";
    const payload = {
      employee_record_id:mapping.data.employee_record_id,
      work_date:workDate,
      status,
      check_in:checkIn,
      check_out:checkOut,
      source:"device",
      timezone,
      scheduled_start_at:variance.scheduledStartAt,
      scheduled_end_at:variance.scheduledEndAt,
      check_in_variance_minutes:variance.checkInVarianceMinutes,
      check_out_variance_minutes:variance.checkOutVarianceMinutes,
      minutes_late:Math.max(variance.checkInVarianceMinutes ?? 0,0),
      updated_at:new Date().toISOString(),
    };
    const saved = await db.from("hr_attendance").upsert(payload,{ onConflict:"employee_record_id,work_date" });
    if (saved.error) throw saved.error;
    await Promise.all([
      db.from("hr_attendance_events").update({ processed_at:new Date().toISOString() }).eq("id",inserted.data.id),
      db.from("hr_attendance_devices").update({ last_seen_at:new Date().toISOString() }).eq("id",deviceResult.data.id),
    ]);
    return NextResponse.json({ ok:true,duplicate:false,workDate,timezone });
  } catch (error) {
    console.error("HR device event ingestion failed", { message:error instanceof Error ? error.message:"Unknown error" });
    return NextResponse.json({ error:"Unable to process attendance event." },{ status:400 });
  }
}
