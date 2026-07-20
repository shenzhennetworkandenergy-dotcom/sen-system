import { connection } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard/Shell";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string }> }){
  await connection();
  await requireProfile(["admin"]);
  const params=await searchParams;
  const supabase=createSupabaseAdminClient();
  let query=supabase.from("profiles").select("id,email,full_name,role,status,country,customer_type,updated_at").order("updated_at",{ascending:false}).limit(100);
  if(params.role) query=query.eq("role",params.role);
  if(params.status) query=query.eq("status",params.status);
  if(params.q) query=query.or(`email.ilike.%${params.q}%,full_name.ilike.%${params.q}%`);
  const {data,error}=await query;

  if(error){
    console.error("Admin users query failed", { code: error.code, message: error.message });
    return <DashboardShell admin title="Users" subtitle="Search, filter and manage account roles and statuses."><div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900"><h2 className="text-lg font-semibold">Unable to load users</h2><p className="mt-2 text-sm">Your admin session is still active, but the user list could not be loaded. Please try again or contact support if the problem continues.</p></div></DashboardShell>;
  }

  const users=data ?? [];
  return <DashboardShell admin title="Users" subtitle="Search, filter and manage account roles and statuses."><form className="mb-6 flex flex-wrap gap-3"><input name="q" placeholder="Search users" defaultValue={params.q} className="rounded border p-2"/><select name="role" defaultValue={params.role} className="rounded border p-2"><option value="">All roles</option><option>customer</option><option>employee</option><option>admin</option></select><select name="status" defaultValue={params.status} className="rounded border p-2"><option value="">All statuses</option><option>active</option><option>suspended</option><option>disabled</option></select><button className="rounded border px-4">Filter</button></form><div className="overflow-hidden rounded-xl border bg-[var(--surface)]"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Name</th><th>Email</th><th>Role</th><th>Status</th><th>Country</th></tr></thead><tbody>{users.map((u)=><tr key={u.id} className="border-b"><td className="p-3"><a href={`/admin/users/${u.id}`} className="font-semibold">{u.full_name ?? "Unnamed"}</a></td><td>{u.email}</td><td>{u.role}</td><td>{u.status}</td><td>{u.country}</td></tr>)}</tbody></table></div></DashboardShell>;
}
