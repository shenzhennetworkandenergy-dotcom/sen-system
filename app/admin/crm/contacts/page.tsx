import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { ContactForm } from "@/components/crm/CrmForms";
import { requirePermission } from "@/lib/auth/permissions";
import { getCrmDashboard } from "@/lib/crm/data";

export const dynamic="force-dynamic";
export default async function CrmContactsPage({searchParams}:{searchParams:Promise<{success?:string;error?:string}>}) {
  await connection(); const {profile,permissions}=await requirePermission("crm.view"); const params=await searchParams; const data=await getCrmDashboard({});
  const canCreate=profile.role==="admin"||permissions.has("crm.create");
  return <DashboardShell admin={profile.role==="admin"} employeePermissions={profile.role==="employee"?permissions:undefined} title="CRM contacts" subtitle="People connected to customers, prospects and sales opportunities.">
    {params.success?<p className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p>:null}{params.error?<p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p>:null}
    <a href="/admin/crm" className="mb-3 inline-block rounded-lg border px-3 py-2 font-bold">← CRM overview</a>
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]"><div className="overflow-x-auto rounded-2xl border bg-[var(--surface)]"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr>{["Contact","Company","Email","Phone","Status"].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{data.contacts.map(item=>{const company=item.crm_companies as unknown as {name:string}|null;return <tr className="border-t" key={item.id}><td className="p-3 font-bold">{item.full_name}</td><td>{company?.name??"—"}</td><td>{item.email??"—"}</td><td>{item.phone??"—"}</td><td>{item.status}</td></tr>})}</tbody></table>{!data.contacts.length?<p className="p-8 text-center">No contacts yet.</p>:null}</div>{canCreate?<ContactForm companies={data.companies}/>:null}</div>
  </DashboardShell>;
}
