import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { LeadForm } from "@/components/crm/CrmForms";
import { requirePermission } from "@/lib/auth/permissions";
import { getCrmDashboard } from "@/lib/crm/data";

export const dynamic="force-dynamic";
export default async function NewCrmLeadPage({searchParams}:{searchParams:Promise<{error?:string}>}) {
  await connection(); const {profile,permissions}=await requirePermission("crm.create"); const params=await searchParams; const data=await getCrmDashboard({});
  return <DashboardShell admin={profile.role==="admin"} employeePermissions={profile.role==="employee"?permissions:undefined} title="New CRM lead" subtitle="Create a qualified sales opportunity and assign ownership.">
    {params.error?<p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p>:null}
    <a href="/admin/crm" className="mb-3 inline-block rounded-lg border px-3 py-2 font-bold">← CRM overview</a>
    <LeadForm companies={data.companies} contacts={data.contacts} staff={data.staff}/>
  </DashboardShell>;
}
