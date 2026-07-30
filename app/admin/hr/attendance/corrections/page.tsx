import { connection } from "next/server";
import { HrPage, hrCard, hrField, hrPrimary, hrSecondary, relation } from "@/components/hr/HrPage";
import { getHrAttendance } from "@/lib/hr/operational";
import { reviewCorrectionAction } from "../../hr-actions";

export const dynamic = "force-dynamic";

export default async function CorrectionsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const [data, params] = await Promise.all([getHrAttendance(), searchParams]);
  return <HrPage title="Attendance corrections" subtitle="Approve or reject employee corrections with a complete audit trail." success={params.success} error={params.error}><div className="space-y-3">{data.corrections.map((item)=>{const employee=relation(item.hr_employee_records);const person=employee?relation(employee.profiles):null;return <article key={item.id} className={hrCard}><div className="flex flex-wrap justify-between gap-3"><div><strong>{person?.full_name||employee?.employee_number}</strong><p className="text-sm text-[var(--muted-text)]">{item.work_date} · requested {item.requested_status.replaceAll("_"," ")}</p></div><span className="capitalize">{item.status}</span></div><p className="mt-2 text-sm">{item.reason}</p>{item.status==="pending"?<form action={reviewCorrectionAction} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="correction_id" value={item.id}/><input type="hidden" name="return_to" value="/admin/hr/attendance/corrections"/><input name="review_note" placeholder="Review note" className={`${hrField} min-w-60 flex-1`}/><button name="decision" value="approved" className={hrPrimary}>Approve</button><button name="decision" value="rejected" className={hrSecondary}>Reject</button></form>:null}</article>})}{!data.corrections.length?<p className={hrCard}>No correction requests yet.</p>:null}</div></HrPage>;
}
