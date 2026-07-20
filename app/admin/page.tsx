import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard/Shell";
import { routes } from "@/lib/constants/routes";
import { activityLabel, formatActivityTime } from "@/lib/audit/format";

const plannedModules = ["CRM", "Sales", "Inventory", "Purchasing", "Accounting", "HR", "Manufacturing", "Projects", "Support", "Reports", "AI Assistant", "Settings"];

export default async function AdminPage(){
  await requireProfile(["admin"]);
  const supabase=createSupabaseAdminClient();
  const [stats,{data:employees},{data:assignments},{data:permissionChanges},{data:recentActivity}]=await Promise.all([
    Promise.all(["profiles","profiles","profiles","profiles","profiles","profiles"].map((table,i)=>supabase.from(table).select("id",{count:"exact",head:true}).match(i===1?{role:"customer"}:i===2?{role:"employee"}:i===3?{role:"admin"}:i===4?{status:"active"}:i===5?{status:"suspended"}:{}))),
    supabase.from("profiles").select("id").eq("role","employee").eq("status","active"),
    supabase.from("profile_permission_templates").select("profile_id").eq("is_active",true),
    supabase.from("audit_logs").select("id,action,description,created_at").like("action","permissions.%").order("created_at",{ascending:false}).limit(4),
    supabase.from("audit_logs").select("id,action,description,created_at").order("created_at",{ascending:false}).limit(4),
  ]);
  const labels=["Total Accounts","Customer count","Employee count","Admin count","Active Accounts count","Suspended Accounts count"];
  const assigned=new Set((assignments??[]).map((item)=>item.profile_id));
  const withoutTemplate=(employees??[]).filter((employee)=>!assigned.has(employee.id)).length;
  return <DashboardShell admin title="Admin Overview" subtitle="Manage SEN operations, customers, employees, permissions and account governance."><section className="grid gap-4 md:grid-cols-3">{labels.map((label,i)=><div key={label} className="rounded-xl border bg-[var(--surface)] p-6"><p className="text-sm text-[var(--muted-text)]">{label}</p><p className="mt-2 text-3xl font-bold">{stats[i].count??0}</p></div>)}</section><section className="mt-6 grid gap-4 md:grid-cols-2"><article className="rounded-xl border bg-[var(--surface)] p-6"><p className="text-sm text-[var(--muted-text)]">Active employees</p><p className="mt-2 text-3xl font-bold">{employees?.length??0}</p></article><article className="rounded-xl border bg-[var(--surface)] p-6"><p className="text-sm text-[var(--muted-text)]">Employees without active templates</p><p className="mt-2 text-3xl font-bold">{withoutTemplate}</p></article></section><div className="mt-6 flex flex-wrap gap-3"><a href={routes.adminUsers} className="rounded-lg border px-4 py-3 font-semibold">Users</a><a href={routes.adminPermissions} className="rounded-lg border px-4 py-3 font-semibold">Permissions</a><a href={routes.adminActivity} className="rounded-lg border px-4 py-3 font-semibold">Team Activity</a></div><section className="mt-6 grid gap-4 lg:grid-cols-2"><article className="rounded-xl border bg-[var(--surface)] p-6"><h2 className="font-semibold">Recent permission changes</h2>{permissionChanges?.length?<ul className="mt-3 space-y-3">{permissionChanges.map((item)=><li key={item.id}><span className="font-medium">{activityLabel(item.action)}</span><span className="block text-sm text-[var(--muted-text)]">{item.description??"Permission administration updated"} · {formatActivityTime(item.created_at)}</span></li>)}</ul>:<p className="mt-3 text-sm text-[var(--muted-text)]">No permission changes recorded yet.</p>}</article><article className="rounded-xl border bg-[var(--surface)] p-6"><h2 className="font-semibold">Recent team activity</h2>{recentActivity?.length?<ul className="mt-3 space-y-3">{recentActivity.map((item)=><li key={item.id}><span className="font-medium">{activityLabel(item.action)}</span><span className="block text-sm text-[var(--muted-text)]">{item.description??"Activity recorded"} · {formatActivityTime(item.created_at)}</span></li>)}</ul>:<p className="mt-3 text-sm text-[var(--muted-text)]">No activity recorded yet.</p>}</article></section><section className="mt-6 grid gap-4 md:grid-cols-3">{plannedModules.map((module)=><div key={module} className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="font-semibold">{module}</h2><p className="mt-2 text-sm text-[var(--muted-text)]">Planned module. No operational data is implemented in Phase 3B.</p></div>)}</section></DashboardShell>;
}
