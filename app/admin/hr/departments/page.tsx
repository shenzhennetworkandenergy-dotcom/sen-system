import { connection } from "next/server";
import { HrPage, hrCard, hrField, hrPrimary } from "@/components/hr/HrPage";
import { getHrReferences } from "@/lib/hr/operational";
import { saveOrganizationAction, toggleOrganizationAction } from "../hr-actions";

export const dynamic = "force-dynamic";

export default async function OrganizationPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const [refs, params] = await Promise.all([getHrReferences(), searchParams]);
  const form = (type: "department"|"team"|"designation") => <form action={saveOrganizationAction} className={hrCard}>
    <input type="hidden" name="entity_type" value={type}/><input type="hidden" name="return_to" value="/admin/hr/departments"/>
    <h2 className="font-semibold capitalize">New {type}</h2>
    <label className="mt-3 block text-sm font-semibold">Code<input name="code" required className={hrField}/></label>
    <label className="mt-3 block text-sm font-semibold">Name<input name="name" required className={hrField}/></label>
    {type!=="department"?<label className="mt-3 block text-sm font-semibold">Department<select name="department_id" required className={hrField}><option value="">Select department</option>{refs.departments.map((d)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>:null}
    {type==="team"?<label className="mt-3 block text-sm font-semibold">Manager<select name="manager_profile_id" className={hrField}><option value="">No manager</option>{refs.profiles.map((p)=><option key={p.id} value={p.id}>{p.full_name||p.email}</option>)}</select></label>:null}
    {type==="designation"?<label className="mt-3 block text-sm font-semibold">Description<textarea name="description" className={hrField}/></label>:null}
    <label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="is_active" defaultChecked/> Active</label>
    <button className={`${hrPrimary} mt-4`}>Create {type}</button>
  </form>;
  const groups = [
    { title:"Departments", type:"department", rows:refs.departments },
    { title:"Teams", type:"team", rows:refs.teams },
    { title:"Designations", type:"designation", rows:refs.designations },
  ] as const;
  return <HrPage title="Organization" subtitle="Manage departments, teams and job designations." success={params.success} error={params.error}>
    <section className="grid gap-4 xl:grid-cols-3">{form("department")}{form("team")}{form("designation")}</section>
    <section className="mt-5 grid gap-4 lg:grid-cols-3">{groups.map((group)=><article key={group.title} className={hrCard}>
      <h2 className="font-semibold">{group.title}</h2>
      <div className="mt-2 divide-y">{group.rows.map((row)=><div key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
        <span><strong>{row.code}</strong> · {row.name}<small className="ml-2 text-[var(--muted-text)]">{row.is_active?"Active":"Inactive"}</small></span>
        <form action={toggleOrganizationAction}><input type="hidden" name="entity_type" value={group.type}/><input type="hidden" name="entity_id" value={row.id}/><input type="hidden" name="next_active" value={String(!row.is_active)}/><input type="hidden" name="return_to" value="/admin/hr/departments"/><button className="rounded border px-2 py-1 font-semibold">{row.is_active?"Deactivate":"Activate"}</button></form>
      </div>)}</div>
    </article>)}</section>
  </HrPage>;
}
