import { connection } from "next/server";
import { notFound } from "next/navigation";
import { LeaveApplicationDocument, type LeaveApplicationView } from "@/components/hr/LeaveApplicationDocument";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireEmployeeHrRecord } from "@/lib/hr/self-service";
import { uploadSignedLeaveApplicationAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EmployeeLeaveApplicationPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const [{id},messages,context] = await Promise.all([params,searchParams,requireEmployeeHrRecord()]);
  if (!context.employee) notFound();
  const result = await createSupabaseAdminClient().from("hr_leave_requests")
    .select("id,application_number,created_at,start_date,end_date,requested_days,reason,contact_number,leave_location,additional_note,status,signed_uploaded_at,hr_leave_types(name)")
    .eq("id",id).eq("employee_record_id",context.employee.id).maybeSingle();
  if (result.error || !result.data) notFound();
  const row = result.data;
  const data: LeaveApplicationView = {
    id:row.id,applicationNumber:row.application_number,createdAt:row.created_at,
    leaveType:relationName(row.hr_leave_types)||"Leave",startDate:row.start_date,endDate:row.end_date,
    totalDays:Number(row.requested_days),reason:row.reason||"",contactNumber:row.contact_number||"",
    leaveLocation:row.leave_location,additionalNote:row.additional_note,status:row.status,signedUploadedAt:row.signed_uploaded_at,
    employee:{name:context.profile.full_name||"Employee",number:context.employee.employee_number,
      designation:relationName(context.employee.hr_designations)||context.employee.job_title||"Not assigned",
      department:relationName(context.employee.hr_departments)||"Not assigned"},
  };
  return <LeaveApplicationDocument data={data} backHref="/employee/hr/leaves" uploadAction={uploadSignedLeaveApplicationAction} showUpload success={messages.success} error={messages.error}/>;
}

function relationName(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" && "name" in relation ? String(relation.name ?? "") : "";
}

