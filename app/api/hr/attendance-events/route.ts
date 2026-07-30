import { NextRequest, NextResponse } from "next/server";
import { hashDeviceKey, parseDeviceEvent } from "@/lib/hr/device-ingestion";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 64 * 1024) return NextResponse.json({ error:"Payload too large." },{ status:413 });
    const apiKey = request.headers.get("x-sen-device-key")?.trim();
    if (!apiKey) return NextResponse.json({ error:"Device key is required." },{ status:401 });
    const event = parseDeviceEvent(await request.json());
    const db = createSupabaseAdminClient();
    const [deviceResult,settingsResult] = await Promise.all([
      db.from("hr_attendance_devices").select("id").eq("api_key_hash",hashDeviceKey(apiKey)).eq("is_active",true).maybeSingle(),
      db.from("hr_settings").select("device_ingestion_enabled,workday_start,late_grace_minutes").eq("id",true).maybeSingle(),
    ]);
    if (deviceResult.error || !deviceResult.data) return NextResponse.json({ error:"Invalid device key." },{ status:401 });
    if (settingsResult.error || !settingsResult.data?.device_ingestion_enabled) {
      return NextResponse.json({ error:"Device ingestion is disabled." },{ status:503 });
    }
    const mapping = await db.from("hr_device_employee_mappings").select("employee_record_id")
      .eq("device_id",deviceResult.data.id).eq("external_employee_id",event.employeeExternalId).eq("is_active",true).maybeSingle();
    if (mapping.error || !mapping.data) return NextResponse.json({ error:"Employee mapping was not found." },{ status:422 });
    const inserted = await db.from("hr_attendance_events").insert({
      device_id:deviceResult.data.id,employee_record_id:mapping.data.employee_record_id,event_uid:event.eventUid,
      event_type:event.eventType,occurred_at:event.occurredAt,raw_metadata:{
        ...event.metadata,
        external_employee_id:event.employeeExternalId,
      },
    }).select("id").single();
    if (inserted.error?.code === "23505") return NextResponse.json({ ok:true,duplicate:true });
    if (inserted.error) throw inserted.error;
    const workDate = event.occurredAt.slice(0,10);
    const attendance = await db.from("hr_attendance").select("id,check_in,check_out,status")
      .eq("employee_record_id",mapping.data.employee_record_id).eq("work_date",workDate).maybeSingle();
    if (attendance.error) throw attendance.error;
    const start = String(settingsResult.data.workday_start ?? "09:00:00").slice(0,5);
    const lateBoundary = new Date(`${workDate}T${start}:00`);
    lateBoundary.setMinutes(lateBoundary.getMinutes() + Number(settingsResult.data.late_grace_minutes ?? 0));
    const current = attendance.data;
    const payload = event.eventType === "check_in"
      ? { check_in:!current?.check_in || event.occurredAt < current.check_in ? event.occurredAt:current.check_in,
          status:new Date(event.occurredAt) > lateBoundary ? "late":"present" }
      : { check_out:!current?.check_out || event.occurredAt > current.check_out ? event.occurredAt:current.check_out };
    const saved = current
      ? await db.from("hr_attendance").update({ ...payload,source:"device",updated_at:new Date().toISOString() }).eq("id",current.id)
      : await db.from("hr_attendance").insert({ employee_record_id:mapping.data.employee_record_id,work_date:workDate,
          status:event.eventType === "check_in" ? payload.status ?? "present":"present",
          check_in:event.eventType === "check_in" ? event.occurredAt:null,
          check_out:event.eventType === "check_out" ? event.occurredAt:null,source:"device" });
    if (saved.error) throw saved.error;
    await Promise.all([
      db.from("hr_attendance_events").update({ processed_at:new Date().toISOString() }).eq("id",inserted.data.id),
      db.from("hr_attendance_devices").update({ last_seen_at:new Date().toISOString() }).eq("id",deviceResult.data.id),
    ]);
    return NextResponse.json({ ok:true,duplicate:false });
  } catch (error) {
    console.error("HR device event ingestion failed", { message:error instanceof Error ? error.message:"Unknown error" });
    return NextResponse.json({ error:"Unable to process attendance event." },{ status:400 });
  }
}
