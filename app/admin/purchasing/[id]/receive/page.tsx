import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { PurchaseReceiptForm } from "@/components/purchasing/PurchaseReceiptForm";
import { requireAllPermissions } from "@/lib/auth/permissions";
import { getPurchaseOrder } from "@/lib/purchasing/data";
import { receivePurchaseOrderAction } from "../../actions";

export const dynamic="force-dynamic";
export default async function ReceivePurchaseOrderPage({params}:{params:Promise<{id:string}>}) {
  await connection(); const {profile,permissions}=await requireAllPermissions(["purchasing.receive","inventory.receive_new_stock"]); const {id}=await params; const data=await getPurchaseOrder(id); if(!data) notFound(); if(!["received","partially_received"].includes(data.order.status)) redirect(`/admin/purchasing/${id}?error=The%20supplier%20shipment%20must%20arrive%20before%20stock%20can%20be%20posted.`);
  return <DashboardShell admin={profile.role==="admin"} employeePermissions={profile.role==="employee"?permissions:undefined} title={`Receive ${data.order.order_number}`} subtitle="Post a partial or full receipt. Inventory, serials and movement history update atomically."><PurchaseReceiptForm action={receivePurchaseOrderAction.bind(null,id)} items={data.items as never} /></DashboardShell>;
}
