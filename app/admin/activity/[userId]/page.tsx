import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { ActivityTable, type ActivityRow } from "@/components/activity/ActivityTable";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function UserActivityPage({ params }: { params: Promise<{ userId: string }> }) {
  await connection();
  await requireProfile(["admin"]);
  const { userId } = await params;
  const supabase=createSupabaseAdminClient();
  const [{data:user,error:userError},{data:activity,error:activityError}]=await Promise.all([supabase.from("profiles").select("id,full_name,email").eq("id",userId).maybeSingle(),supabase.from("audit_logs").select("id,actor_id,action,module,entity_type,entity_id,description,old_values,new_values,created_at").or(`actor_id.eq.${userId},target_profile_id.eq.${userId}`).order("created_at",{ascending:false}).limit(100)]);
  if(userError) console.error("Activity profile query failed",{code:userError.code,message:userError.message});
  if(activityError) console.error("User activity query failed",{code:activityError.code,message:activityError.message});
  if(!user&&!userError) notFound();
  const people=user?{[user.id]:{name:user.full_name??user.email??"Unnamed",email:user.email}}:{};
  return <DashboardShell admin title={`${user?.full_name??user?.email??"User"} activity`} subtitle="Safe activity performed by or affecting this account.">{userError||activityError?<p className="rounded border border-red-200 bg-red-50 p-4 text-red-900">Unable to load this timeline.</p>:<ActivityTable rows={(activity??[]) as ActivityRow[]} people={people}/>}</DashboardShell>;
}
