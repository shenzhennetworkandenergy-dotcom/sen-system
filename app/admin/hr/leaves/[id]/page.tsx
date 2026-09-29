import { connection } from "next/server";
import { notFound } from "next/navigation";
import { LeaveApplicationDocument, type LeaveApplicationView } from "@/components/hr/LeaveApplicationDocument";
import { requireHrAdmin } from "@/lib/hr/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminLeaveApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await requireHrAdmin();
  const {id} = await params;
  const result = await createSupabaseAdminClient().from("hr_leave_requests")
    .select("id,application_number,created_at,start_date,end_date,requested_days,reason,contact_number,leave_location,additional_note,status,signed_uploaded_at,hr_leave_types(name),hr_employee_records(employee_number,job_title,profiles:profiles!hr_employee_records_profile_id_fkey(full_name),hr_departments(name),hr_designations(name))")
    .eq("id",id).maybeSingle();
  if (result.error || !result.data) notFound();
  const row = result.data;
  const employee = relation(row.hr_employee_records);
  const profile = relation(employee?.profiles);
  const data: LeaveApplicationView = {
    id:row.id,applicationNumber:row.application_number,createdAt:row.created_at,
    leaveType:relationName(row.hr_leave_types)||"Leave",startDate:row.start_date,endDate:row.end_date,
    totalDays:Number(row.requested_days),reason:row.reason||"",contactNumber:row.contact_number||"",
    leaveLocation:row.leave_location,additionalNote:row.additional_note,status:row.status,signedUploadedAt:row.signed_uploaded_at,
    employee:{name:String(profile?.full_name||"Employee"),number:String(employee?.employee_number||"—"),
      designation:relationName(employee?.hr_designations)||String(employee?.job_title||"Not assigned"),
      department:relationName(employee?.hr_departments)||"Not assigned"},
  };
  return <LeaveApplicationDocument data={data} backHref="/admin/hr/leaves"/>;
}

function relation<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function relationName(value: unknown) {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object" && "name" in item ? String(item.name ?? "") : "";
}

