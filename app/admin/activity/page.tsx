import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { ActivityTable, type ActivityRow } from "@/components/activity/ActivityTable";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const pageSize = 25;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminActivityPage({ searchParams }: { searchParams: Promise<{ employee?: string; date?: string; module?: string; action?: string; q?: string; page?: string }> }) {
  await connection();
  await requireProfile(["admin"]);
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("audit_logs").select("id,actor_id,action,module,entity_type,entity_id,description,old_values,new_values,created_at", { count: "exact" }).order("created_at", { ascending: false }).range((page-1)*pageSize, page*pageSize-1);
  if (params.employee && uuidPattern.test(params.employee)) query=query.eq("actor_id",params.employee);
  if (params.date && datePattern.test(params.date)) query=query.gte("created_at",`${params.date}T00:00:00.000Z`).lt("created_at",`${params.date}T23:59:59.999Z`);
  if (params.module) query=query.eq("module",params.module.slice(0,60));
  if (params.action) query=query.eq("action",params.action.slice(0,100));
  if (params.q) query=query.ilike("description",`%${params.q.slice(0,100)}%`);
  const [{ data, error, count }, { data: employees }] = await Promise.all([query,supabase.from("profiles").select("id,full_name,email").in("role",["employee","admin"]).order("full_name")]);
  if(error) console.error("Admin activity query failed",{code:error.code,message:error.message,details:error.details,hint:error.hint});
  const people=Object.fromEntries((employees??[]).map((person)=>[person.id,{name:person.full_name??person.email??"Unnamed",email:person.email}]));
  const totalPages=Math.max(1,Math.ceil((count??0)/pageSize));
  return <DashboardShell admin title="Team Activity" subtitle="Review safe account and permission activity across SEN."><form className="mb-6 grid gap-3 rounded-xl border bg-[var(--surface)] p-4 md:grid-cols-3"><label>Employee<select name="employee" defaultValue={params.employee} className="mt-1 w-full rounded border p-2"><option value="">All users</option>{(employees??[]).map((person)=><option key={person.id} value={person.id}>{person.full_name??person.email??"Unnamed"}</option>)}</select></label><label>Date<input type="date" name="date" defaultValue={params.date} className="mt-1 w-full rounded border p-2"/></label><label>Module<input name="module" defaultValue={params.module} className="mt-1 w-full rounded border p-2"/></label><label>Action<input name="action" defaultValue={params.action} className="mt-1 w-full rounded border p-2"/></label><label>Search description<input name="q" defaultValue={params.q} className="mt-1 w-full rounded border p-2"/></label><button className="self-end rounded border px-4 py-2 font-semibold">Filter activity</button></form>{error?<p className="rounded border border-red-200 bg-red-50 p-4 text-red-900">Unable to load team activity.</p>:<ActivityTable rows={(data??[]) as ActivityRow[]} people={people}/>}<nav className="mt-5 flex items-center justify-between"><a aria-disabled={page<=1} href={`?page=${Math.max(1,page-1)}`} className="rounded border px-3 py-2 aria-disabled:pointer-events-none aria-disabled:opacity-50">Previous</a><span>Page {page} of {totalPages}</span><a aria-disabled={page>=totalPages} href={`?page=${Math.min(totalPages,page+1)}`} className="rounded border px-3 py-2 aria-disabled:pointer-events-none aria-disabled:opacity-50">Next</a></nav></DashboardShell>;
}
