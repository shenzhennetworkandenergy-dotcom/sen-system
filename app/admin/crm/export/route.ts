import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const csv=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
export async function GET(){
  await requirePermission("crm.export");
  const {data,error}=await createSupabaseAdminClient().from("crm_leads").select("lead_number,title,status,priority,source,estimated_value,currency,expected_close_date,created_at").order("created_at",{ascending:false}).limit(5000);
  if(error)return new Response("Unable to export CRM leads.",{status:500});
  const headers=["Lead number","Title","Status","Priority","Source","Estimated value","Currency","Expected close","Created"];
  const body=[headers,...(data??[]).map(item=>[item.lead_number,item.title,item.status,item.priority,item.source,item.estimated_value,item.currency,item.expected_close_date,item.created_at])].map(row=>row.map(csv).join(",")).join("\r\n");
  return new Response(body,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="sen-crm-leads.csv"`}});
}
