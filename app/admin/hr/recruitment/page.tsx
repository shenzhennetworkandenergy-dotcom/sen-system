import { connection } from "next/server";
import { HrPage, hrCard, hrField, hrPrimary } from "@/components/hr/HrPage";
import { getSubmittedRecruitmentApplications } from "@/lib/hr/admin-recruitment";

export const dynamic = "force-dynamic";

type Params = { q?: string; position?: string; from?: string; to?: string; page?: string };

function queryString(params: Params, page: number) {
  const next = new URLSearchParams();
  if (params.q) next.set("q", params.q);
  if (params.position) next.set("position", params.position);
  if (params.from) next.set("from", params.from);
  if (params.to) next.set("to", params.to);
  next.set("page", String(page));
  return next.toString();
}

export default async function AdminRecruitmentPage({ searchParams }: { searchParams: Promise<Params> }) {
  await connection();
  const params = await searchParams;
  const data = await getSubmittedRecruitmentApplications({ ...params, query: params.q, page: Number(params.page) || 1 });
  const pages = Math.max(1, Math.ceil(data.count / data.pageSize));
  return <HrPage title="Recruitment" subtitle="Read-only access to submitted Recruitment applications.">
    <section className={hrCard}>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Applications</p><h2 className="text-xl font-bold">Submitted Recruitment Applications</h2></div><strong>{data.count} submitted</strong></div>
      <form className="mt-4 grid gap-3 md:grid-cols-5">
        <label className="text-sm font-semibold md:col-span-2">Search<input className={hrField} name="q" defaultValue={params.q} placeholder="Application no., applicant, phone or position" /></label>
        <label className="text-sm font-semibold">Position<input className={hrField} name="position" defaultValue={params.position} /></label>
        <label className="text-sm font-semibold">Submitted from<input className={hrField} type="date" name="from" defaultValue={params.from} /></label>
        <label className="text-sm font-semibold">Submitted to<input className={hrField} type="date" name="to" defaultValue={params.to} /></label>
        <div className="flex gap-2 md:col-span-5"><button className={hrPrimary}>Apply</button><a className="rounded-lg border px-4 py-2.5 font-semibold" href="/admin/hr/recruitment">Clear</a></div>
      </form>
    </section>
    <section className="mt-5 overflow-x-auto rounded-2xl border bg-[var(--surface)] shadow-sm">
      <table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3">Application No.</th><th className="px-4 py-3">Applicant Name</th><th className="px-4 py-3">Position Applied For</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Submitted On</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
        <tbody>{data.rows.map((row) => <tr key={row.id} className="border-t"><td className="px-4 py-3 font-bold"><a className="text-blue-700 hover:underline" href={`/admin/hr/recruitment/applications/${row.id}`}>{row.application_number}</a></td><td className="px-4 py-3">{row.full_name}</td><td className="px-4 py-3">{row.position_applied_for}</td><td className="px-4 py-3">{row.phone}</td><td className="px-4 py-3">{row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "—"}</td><td className="px-4 py-3"><span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-800">SUBMITTED</span></td><td className="px-4 py-3"><a className="font-bold text-blue-700" href={`/admin/hr/recruitment/applications/${row.id}`}>View</a></td></tr>)}{!data.rows.length ? <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--muted-text)]">No submitted applications found.</td></tr> : null}</tbody>
      </table>
    </section>
    <nav aria-label="Recruitment applications pagination" className="mt-4 flex items-center justify-between"><span className="text-sm text-[var(--muted-text)]">Page {data.page} of {pages}</span><div className="flex gap-2">{data.page > 1 ? <a className="rounded-lg border px-3 py-2 font-semibold" href={`?${queryString(params, data.page - 1)}`}>Previous</a> : null}{data.page < pages ? <a className="rounded-lg border px-3 py-2 font-semibold" href={`?${queryString(params, data.page + 1)}`}>Next</a> : null}</div></nav>
  </HrPage>;
}
