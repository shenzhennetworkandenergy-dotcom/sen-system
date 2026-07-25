import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const csv=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
export async function GET() {
  await requirePermission("purchasing.export");
  const {data,error}=await createSupabaseAdminClient().from("purchase_orders").select("order_number,status,order_date,expected_delivery_date,currency,subtotal,discount_amount,shipping_amount,tax_amount,other_amount,total_amount,payment_status,suppliers(code,name),warehouses:destination_warehouse_id(code,name)").order("created_at",{ascending:false}).limit(5000);
  if(error) return new Response("Unable to export purchasing.",{status:500});
  const header=["Order","Supplier code","Supplier","Warehouse","Status","Order date","Expected date","Currency","Subtotal","Discount","Shipping","Tax","Other","Total","Payment"];
  const rows=(data??[]).map((order)=>{const supplier=order.suppliers as unknown as {code:string;name:string}|null;const warehouse=order.warehouses as unknown as {code:string}|null;return [order.order_number,supplier?.code,supplier?.name,warehouse?.code,order.status,order.order_date,order.expected_delivery_date,order.currency,order.subtotal,order.discount_amount,order.shipping_amount,order.tax_amount,order.other_amount,order.total_amount,order.payment_status].map(csv).join(",");});
  return new Response([header.map(csv).join(","),...rows].join("\r\n"),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="sen-purchasing-${new Date().toISOString().slice(0,10)}.csv"`}});
}
