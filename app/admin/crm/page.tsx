/* eslint-disable @next/next/no-html-link-for-pages */
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { getCrmDashboard } from "@/lib/crm/data";
import { crmLeadStatuses } from "@/lib/crm/types";

export const dynamic = "force-dynamic";
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const relation = <T,>(value: unknown) => value as T | null;

export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  await connection();
  const { profile, permissions } = await requirePermission("crm.view");
  const params = await searchParams;
  const data = await getCrmDashboard(params);
  const metrics = [
    ["Companies", data.metrics.companies], ["Contacts", data.metrics.contacts], ["Open leads", data.metrics.open],
    ["Won leads", data.metrics.won], ["Pipeline value", `BDT ${data.metrics.pipeline.toLocaleString("en-BD")}`],
  ];
  return <DashboardShell admin={profile.role==="admin"} employeePermissions={profile.role==="employee"?permissions:undefined} title="CRM" subtitle="Manage companies, contacts, sales leads, ownership and follow-up activity.">
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">{metrics.map(([name,value])=><article key={name} className="rounded-2xl border bg-[var(--surface)] p-4 shadow-sm"><p className="text-xs text-[var(--muted-text)]">{name}</p><strong className="mt-1 block text-2xl">{value}</strong></article>)}</div>
    <div className="my-3 flex flex-wrap gap-2">
      <a href="/admin/crm/leads/new" className="rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)]">New lead</a>
      <a href="/admin/crm/companies" className="rounded-lg border bg-[var(--surface)] px-4 py-2 font-bold">Companies</a>
      <a href="/admin/crm/contacts" className="rounded-lg border bg-[var(--surface)] px-4 py-2 font-bold">Contacts</a>
      <a href="/admin/crm/chatbot" className="rounded-lg border bg-[var(--surface)] px-4 py-2 font-bold">Product Assistant inquiries</a>
      <a href="/admin/crm/export" className="rounded-lg border bg-[var(--surface)] px-4 py-2 font-bold">Export CSV</a>
    </div>
    <form className="grid gap-2 rounded-2xl border bg-[var(--surface)] p-3 md:grid-cols-3">
      <input className="rounded-lg border px-3 py-2" name="q" defaultValue={params.q} placeholder="Lead number or title"/>
      <select className="rounded-lg border px-3 py-2" name="status" defaultValue={params.status}><option value="">All statuses</option>{crmLeadStatuses.map((item)=><option key={item} value={item}>{title(item)}</option>)}</select>
      <button className="rounded-lg border px-3 py-2 font-bold">Apply filters</button>
    </form>
    <div className="mt-3 overflow-x-auto rounded-2xl border bg-[var(--surface)]">
      <table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr>{["Lead","Company / contact","Status","Priority","Assigned to","Expected","Value",""].map((head)=><th key={head} className="p-3">{head}</th>)}</tr></thead>
        <tbody>{data.leads.map((lead)=>{
          const company=relation<{name:string}>(lead.crm_companies); const contact=relation<{full_name:string}>(lead.crm_contacts); const assignee=relation<{full_name:string|null;email:string}>(lead.profiles);
          return <tr key={lead.id} className="border-t transition-colors hover:bg-[var(--muted-surface)]"><td className="p-3"><strong>{lead.title}</strong><small className="block text-[var(--muted-text)]">{lead.lead_number}</small></td><td className="p-3">{company?.name ?? contact?.full_name ?? "—"}</td><td className="p-3">{title(lead.status)}</td><td className="p-3">{title(lead.priority)}</td><td className="p-3">{assignee?.full_name ?? assignee?.email ?? "Unassigned"}</td><td className="p-3">{lead.expected_close_date ?? "—"}</td><td className="p-3 font-semibold">{lead.currency} {Number(lead.estimated_value).toLocaleString("en-BD")}</td><td className="p-3"><a className="rounded-lg border px-3 py-2 font-bold" href={`/admin/crm/leads/${lead.id}`}>Open</a></td></tr>;
        })}</tbody>
      </table>
      {!data.leads.length?<p className="p-8 text-center text-[var(--muted-text)]">No CRM leads match these filters.</p>:null}
    </div>
    <div className="mt-3 flex justify-between text-sm"><span>{data.count} lead(s)</span><div className="flex gap-2">{data.page>1?<a href={`?page=${data.page-1}`} className="rounded border px-3 py-1">Previous</a>:null}{data.page*data.size<data.count?<a href={`?page=${data.page+1}`} className="rounded border px-3 py-1">Next</a>:null}</div></div>
  </DashboardShell>;
}
