import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard/Shell";
import { routes } from "@/lib/constants/routes";
import { activityLabel, formatActivityTime } from "@/lib/audit/format";

const plannedModules = ["CRM", "Sales", "Quotations", "Purchasing", "Suppliers", "Accounting", "HR", "Manufacturing", "Projects", "Support", "Reports", "AI Assistant", "Settings"];
const operationalModules = [
  ["Products", routes.adminProducts], ["Orders", routes.adminOrders], ["Inventory", routes.adminInventory],
  ["Warehouses", routes.adminWarehouses], ["Serials", routes.adminSerials], ["Shipments", routes.adminShipments],
] as const;

const statStyles = ["border-l-blue-500", "border-l-cyan-500", "border-l-violet-500", "border-l-indigo-500", "border-l-emerald-500", "border-l-amber-500", "border-l-teal-500", "border-l-orange-500"];

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
  const labels=["Total accounts","Customers","Employees","Administrators","Active accounts","Suspended accounts"];
  const assigned=new Set((assignments??[]).map((item)=>item.profile_id));
  const withoutTemplate=(employees??[]).filter((employee)=>!assigned.has(employee.id)).length;
  const metrics=[...labels.map((label,index)=>({label,value:stats[index].count??0})),{label:"Active employees",value:employees?.length??0},{label:"Employees without template",value:withoutTemplate}];
  const activityPanels=[
    {title:"Permission changes",items:permissionChanges??[],empty:"No permission changes recorded yet.",href:routes.adminPermissions},
    {title:"Recent team activity",items:recentActivity??[],empty:"No activity recorded yet.",href:routes.adminActivity},
  ];

  return <DashboardShell admin title="Admin Overview" subtitle="Accounts, permissions and operations at a glance.">
    <section aria-labelledby="account-summary-title">
      <div className="mb-2 flex items-center justify-between"><h2 id="account-summary-title" className="text-sm font-bold uppercase tracking-wide text-[var(--muted-text)]">Account summary</h2><a href={routes.adminUsers} className="text-xs font-semibold text-[var(--primary)]">Manage users →</a></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">{metrics.map((metric,index)=><article key={metric.label} className={`min-w-0 rounded-xl border border-l-4 bg-[var(--surface)] px-3 py-2.5 shadow-sm ${statStyles[index]}`}><p className="truncate text-[11px] font-medium text-[var(--muted-text)]" title={metric.label}>{metric.label}</p><p className="mt-0.5 text-2xl font-bold leading-none tabular-nums">{metric.value}</p></article>)}</div>
    </section>

    <section aria-label="Administrative actions" className="mt-3 flex flex-wrap gap-2 rounded-xl border bg-[var(--surface)] p-2 shadow-sm">
      <span className="self-center px-1 text-xs font-bold uppercase tracking-wide text-[var(--muted-text)]">Quick actions</span>
      <a href={routes.adminUsers} className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary-foreground)]">Users</a>
      <a href={routes.adminPermissions} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-[var(--muted-surface)]">Permissions</a>
      <a href={routes.adminActivity} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-[var(--muted-surface)]">Team activity</a>
      <a href={routes.adminProducts} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-[var(--muted-surface)]">Add or manage products</a>
      <a href={routes.adminInventory} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-[var(--muted-surface)]">Inventory</a>
    </section>

    <section className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
      <div className="grid gap-3 md:grid-cols-2">{activityPanels.map((panel)=><article key={panel.title} className="rounded-xl border bg-[var(--surface)] p-3 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold">{panel.title}</h2><a href={panel.href} className="text-xs font-semibold text-[var(--primary)]">View all</a></div>{panel.items.length?<ul className="mt-2 divide-y divide-[var(--border)]">{panel.items.map((item)=><li key={item.id} className="py-2 first:pt-1 last:pb-0"><div className="flex items-start justify-between gap-3"><span className="min-w-0 truncate text-xs font-semibold">{activityLabel(item.action)}</span><time className="shrink-0 text-[10px] text-[var(--muted-text)]">{formatActivityTime(item.created_at)}</time></div><p className="mt-0.5 truncate text-[11px] text-[var(--muted-text)]">{item.description??"Activity recorded"}</p></li>)}</ul>:<p className="mt-3 rounded-lg bg-[var(--muted-surface)] p-3 text-xs text-[var(--muted-text)]">{panel.empty}</p>}</article>)}</div>
      <article className="rounded-xl border bg-[var(--surface)] p-3 shadow-sm"><h2 className="text-sm font-bold">Operational modules</h2><p className="mt-0.5 text-[11px] text-[var(--muted-text)]">Open the areas currently available.</p><div className="mt-2 grid grid-cols-2 gap-1.5">{operationalModules.map(([label,href])=><a key={label} href={href} className="flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs font-semibold hover:border-[var(--primary)] hover:bg-[var(--muted-surface)]"><span>{label}</span><span aria-hidden="true">→</span></a>)}</div></article>
    </section>

    <section className="mt-3 rounded-xl border bg-[var(--surface)] p-3 shadow-sm"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h2 className="text-sm font-bold">Planned modules</h2><p className="text-[11px] text-[var(--muted-text)]">Visible for roadmap awareness; no operational data yet.</p></div><div className="mt-2 flex flex-wrap gap-1.5">{plannedModules.map((module)=><span key={module} className="rounded-full border bg-[var(--muted-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted-text)]">{module}</span>)}</div></section>
  </DashboardShell>;
}
