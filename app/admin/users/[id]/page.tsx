import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard/Shell";
import { updateUserAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }){
  await connection();
  await requireProfile(["admin"]);
  const {id}=await params;
  const supabase=createSupabaseAdminClient();
  const {data:user,error}=await supabase.from("profiles").select("id,email,full_name,phone,country_code,country_name,customer_type,company_name,role,status").eq("id",id).maybeSingle();

  if(error){
    console.error("Admin user detail query failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    return <DashboardShell admin title="User detail" subtitle="Review profile details, role/status management, final-active-admin protection and audit logging."><div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900"><h2 className="text-lg font-semibold">Unable to load user details</h2><p className="mt-2 text-sm">Your admin session is still active, but this profile could not be loaded. Please try again or contact support if the problem continues.</p></div></DashboardShell>;
  }

  if(!user) notFound();
  const action=updateUserAction.bind(null,id);
  return <DashboardShell admin title={user.full_name ?? "User detail"} subtitle="Review profile details, role/status management, final-active-admin protection and audit logging."><section className="grid gap-6 lg:grid-cols-2"><div className="rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Profile</h2><dl className="mt-4 grid gap-2"><dt>Email</dt><dd>{user.email}</dd><dt>Phone</dt><dd>{user.phone ?? "—"}</dd><dt>Country</dt><dd>{user.country_name ?? user.country_code ?? "—"}</dd><dt>Customer type</dt><dd>{user.customer_type ?? "—"}</dd><dt>Company</dt><dd>{user.company_name ?? "—"}</dd></dl></div><form action={action} className="rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Role and status</h2><label className="mt-4 block">Role<select name="role" defaultValue={user.role} className="mt-1 w-full rounded border p-3"><option>customer</option><option>employee</option><option>admin</option></select></label><label className="mt-4 block">Status<select name="status" defaultValue={user.status} className="mt-1 w-full rounded border p-3"><option>active</option><option>suspended</option><option>disabled</option></select></label><button className="mt-4 rounded bg-[var(--primary)] px-4 py-3 text-[var(--primary-foreground)]">Save changes</button><p className="mt-3 text-sm text-[var(--muted-text)]">The final active admin cannot be downgraded or suspended.</p></form></section></DashboardShell>;
}
