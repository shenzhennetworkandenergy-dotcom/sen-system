import { NextRequest, NextResponse } from "next/server";
import { resolveAttendanceWorkDate } from "@/lib/hr/attendance";
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

    const saved = await db.rpc("hr_apply_device_attendance_event", {
      requested_employee_id: mapping.data.employee_record_id,
      requested_event_type: event.eventType,
      requested_occurred_at: event.occurredAt,
      requested_timezone: timezone,
      requested_start_time: startTime,
      requested_end_time: endTime,
      requested_late_grace: Number(settingsResult.data.late_grace_minutes ?? 0),
    });
    if (saved.error) throw saved.error;
    const applied = Array.isArray(saved.data) ? saved.data[0] : saved.data;
    workDate = String(applied?.applied_work_date ?? workDate);
    timezone = String(applied?.applied_timezone ?? timezone);
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
