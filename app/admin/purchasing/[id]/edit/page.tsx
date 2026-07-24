import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { PurchaseOrderBuilder } from "@/components/purchasing/PurchaseOrderBuilder";
import { requirePermission } from "@/lib/auth/permissions";
import { getPurchaseOptions, getPurchaseOrder } from "@/lib/purchasing/data";
import { updatePurchaseOrderAction } from "../../actions";

export const dynamic="force-dynamic";
export default async function EditPurchaseOrderPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string}>}) {
  await connection(); const {profile,permissions}=await requirePermission("purchasing.edit"); const {id}=await params; const [data,options,messages]=await Promise.all([getPurchaseOrder(id),getPurchaseOptions(),searchParams]); if(!data) notFound(); if(data.order.status!=="draft") redirect(`/admin/purchasing/${id}?error=Only%20draft%20orders%20can%20be%20edited.`);
  const initialItems=data.items.map((item)=>({product_id:item.product_id,variation_id:item.variation_id,name:item.product_name_snapshot,sku:item.sku_snapshot,serial_tracking_required:Boolean((item.products as {serial_tracking_required:boolean}|null)?.serial_tracking_required),quantity:Number(item.quantity_ordered),unit_cost:Number(item.unit_cost),discount_amount:Number(item.discount_amount),tax_amount:Number(item.tax_amount),description:item.description??""}));
  return <DashboardShell admin={profile.role==="admin"} employeePermissions={profile.role==="employee"?permissions:undefined} title={`Edit ${data.order.order_number}`} subtitle="Update the draft without changing approval or receipt history.">{messages.error?<p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">{messages.error}</p>:null}<PurchaseOrderBuilder action={updatePurchaseOrderAction.bind(null,id)} {...options} initialItems={initialItems} defaults={{supplier_id:data.order.supplier_id,warehouse_id:data.order.destination_warehouse_id,currency:data.order.currency,order_date:data.order.order_date,expected_delivery_date:data.order.expected_delivery_date,supplier_reference:data.order.supplier_reference,payment_terms_days:data.order.payment_terms_days,discount_amount:Number(data.order.discount_amount),shipping_amount:Number(data.order.shipping_amount),tax_amount:Number(data.order.tax_amount),other_amount:Number(data.order.other_amount),internal_notes:data.order.internal_notes,supplier_notes:data.order.supplier_notes}} submitLabel="Save purchase order" /></DashboardShell>;
}
