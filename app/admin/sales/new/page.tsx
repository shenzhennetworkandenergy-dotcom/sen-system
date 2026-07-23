import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { SaleBuilder } from "@/components/sales/SaleBuilder";
import { requirePermission } from "@/lib/auth/permissions";
import { getOrderCreationOptions } from "@/lib/orders/data";
import { createBasicCustomerAction } from "../actions";
export const dynamic="force-dynamic";
export default async function NewSalePage({searchParams}:{searchParams:Promise<{success?:string;error?:string}>}) {
  await connection(); const {profile,permissions}=await requirePermission("sales.create"),notice=await searchParams,options=await getOrderCreationOptions();
  return <DashboardShell admin={profile.role==="admin"} employeePermissions={profile.role==="employee"?permissions:undefined} title="Create Sale" subtitle="Build a BDT sale from existing customers, products, warehouse stock and delivery addresses.">
    {notice.success?<p className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{notice.success}</p>:null}{notice.error?<p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{notice.error}</p>:null}
    <details className="mb-4 rounded-xl border bg-[var(--surface)] p-4"><summary className="cursor-pointer font-bold">Add a basic new customer</summary><form action={createBasicCustomerAction} className="mt-3 grid gap-3 md:grid-cols-4"><input name="full_name" required placeholder="Full name" className="rounded-lg border px-3 py-2"/><input name="email" type="email" required placeholder="Email" className="rounded-lg border px-3 py-2"/><input name="phone" placeholder="Phone" className="rounded-lg border px-3 py-2"/><button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">Add customer</button><p className="text-xs text-[var(--muted-text)] md:col-span-4">The customer is added securely and can set a password through password recovery.</p></form></details>
    <SaleBuilder {...options}/>
  </DashboardShell>;
}
