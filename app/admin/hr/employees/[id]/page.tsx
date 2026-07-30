import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EmployeeForm } from "@/components/hr/EmployeeForm";
import { HrPage, hrCard, hrPrimary, hrSecondary, relation } from "@/components/hr/HrPage";
import { getHrEmployee, getHrReferences } from "@/lib/hr/operational";
import { archiveEmployeeAction, uploadEmployeeDocumentAction } from "../../hr-actions";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const [{ id }, notices] = await Promise.all([params, searchParams]);
  const [data, refs] = await Promise.all([getHrEmployee(id), getHrReferences()]);
  if (!data.record) notFound();
  const person = relation(data.record.profiles);
  return (
    <HrPage title={person?.full_name || data.record.employee_number} subtitle={`${data.record.employee_number} · ${data.record.job_title}`} success={notices.success} error={notices.error}>
      <EmployeeForm refs={refs} record={data.record} personal={data.personal}/>
      <form action={archiveEmployeeAction} className={`${hrCard} mt-5 flex flex-wrap items-center justify-between gap-3`}>
        <input type="hidden" name="employee_id" value={id}/><input type="hidden" name="return_to" value={`/admin/hr/employees/${id}`}/><input type="hidden" name="operation" value={data.record.archived_at ? "restore":"archive"}/>
        <div><h2 className="font-semibold">Lifecycle control</h2><p className="text-sm text-[var(--muted-text)]">Archiving removes operational access while preserving attendance, payroll and audit history.</p></div>
        <button className={data.record.archived_at ? hrPrimary : hrSecondary}>{data.record.archived_at ? "Restore employee":"Archive employee"}</button>
      </form>
      <form action={uploadEmployeeDocumentAction} className={`${hrCard} mt-5`} encType="multipart/form-data">
        <input type="hidden" name="employee_id" value={id}/><input type="hidden" name="return_to" value={`/admin/hr/employees/${id}`}/>
        <h2 className="font-semibold">Employee documents</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4"><label className="text-sm font-semibold">Document type<input name="document_type" required className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-sm font-semibold">Title<input name="title" required className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-sm font-semibold">Expiry date<input type="date" name="expires_on" className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-sm font-semibold">File<input type="file" name="file" required accept=".pdf,image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm"/></label></div>
        <button className={`${hrPrimary} mt-3`}>Upload document</button>
        <div className="mt-3 divide-y">{data.documents.map((item: Record<string,unknown>)=><p key={String(item.id)} className="flex items-center justify-between gap-3 py-2 text-sm"><span><strong>{String(item.title)}</strong> · {String(item.document_type)} · {Math.ceil(Number(item.size_bytes)/1024)} KB</span><a href={`/admin/hr/documents/${String(item.id)}`} className="font-semibold text-blue-700">Download</a></p>)}{!data.documents.length?<p className="py-2 text-sm text-[var(--muted-text)]">No documents uploaded.</p>:null}</div>
      </form>
      <section className="mt-5 grid gap-4 xl:grid-cols-2">
        {[
          ["Recent attendance", data.attendance, (item: Record<string,unknown>) => `${item.work_date} · ${String(item.status).replaceAll("_"," ")}`],
          ["Leave history", data.leave, (item: Record<string,unknown>) => `${item.start_date} to ${item.end_date} · ${item.status}`],
          ["Payroll", data.payroll, (item: Record<string,unknown>) => `${item.period_start} to ${item.period_end} · ${item.currency} ${item.net_pay} · ${item.status}`],
          ["Performance", data.reviews, (item: Record<string,unknown>) => `${item.review_period_start} to ${item.review_period_end} · ${item.rating}/5`],
        ].map(([title, rows, format]) => <article key={title as string} className={hrCard}><h2 className="font-semibold">{title as string}</h2><div className="mt-2 divide-y">{(rows as unknown as Record<string,unknown>[]).slice(0,8).map((item) => <p key={String(item.id)} className="py-2 text-sm">{(format as (item:Record<string,unknown>)=>string)(item)}</p>)}{!(rows as unknown[]).length ? <p className="py-3 text-sm text-[var(--muted-text)]">No records yet.</p> : null}</div></article>)}
      </section>
    </HrPage>
  );
}
