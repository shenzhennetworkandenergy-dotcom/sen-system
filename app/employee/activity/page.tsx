import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { ActivityTable, type ActivityRow } from "@/components/activity/ActivityTable";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function EmployeeActivityPage() {
  await connection();
  const { profile } = await requirePermission("activity.view_own");
  const supabase=createSupabaseAdminClient();
  const {data,error}=await supabase.from("audit_logs").select("id,actor_id,action,module,entity_type,entity_id,description,old_values,new_values,created_at").eq("actor_id",profile.id).order("created_at",{ascending:false}).limit(100);
  if(error) console.error("Employee activity query failed",{code:error.code,message:error.message,details:error.details,hint:error.hint});
  const people={[profile.id]:{name:profile.full_name??profile.email??"You",email:profile.email}};
  return <DashboardShell title="My Activity" subtitle="Your recent safe SEN account activity.">{error?<p className="rounded border border-red-200 bg-red-50 p-4 text-red-900">Unable to load your activity.</p>:<ActivityTable rows={(data??[]) as ActivityRow[]} people={people}/>}</DashboardShell>;
}
