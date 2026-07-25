import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { PurchaseOrderBuilder } from "@/components/purchasing/PurchaseOrderBuilder";
import { requirePermission } from "@/lib/auth/permissions";
import { getPurchaseOptions } from "@/lib/purchasing/data";
import { createPurchaseOrderAction } from "../actions";

export const dynamic = "force-dynamic";
export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{error?:string}> }) {
  await connection(); const { profile, permissions } = await requirePermission("purchasing.create"); const options = await getPurchaseOptions(); const messages=await searchParams;
  return <DashboardShell admin={profile.role==="admin"} employeePermissions={profile.role==="employee"?permissions:undefined} title="New purchase order" subtitle="Create a supplier order with validated products, costs and destination warehouse.">
    {messages.error?<p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">{messages.error}</p>:null}
    {!options.suppliers.length?<p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">Create an active supplier before creating a purchase order.</p>:null}
    <PurchaseOrderBuilder action={createPurchaseOrderAction} {...options} submitLabel="Create draft purchase order" />
  </DashboardShell>;
}
