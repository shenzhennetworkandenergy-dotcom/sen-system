/* eslint-disable @next/next/no-html-link-for-pages */
import { connection } from "next/server";

import { reactivateOrderAction } from "@/app/admin/orders/actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { getOrders } from "@/lib/orders/data";
import { dateTime, label, money } from "@/lib/orders/types";

export const dynamic="force-dynamic";
const statuses=["draft","confirmed","processing","partially_allocated","allocated","packing","partially_shipped","shipped","delivered","cancelled"];

export default async function OrdersPage({searchParams}:{searchParams:Promise<{q?:string;status?:string;page?:string;success?:string;error?:string}>}){
  await connection();const {profile,permissions}=await requirePermission("orders.view");
  const params=await searchParams,{orders,count,page,size}=await getOrders(params);
  return <DashboardShell admin={profile.role==="admin"} employeePermissions={profile.role==="employee"?permissions:undefined} title="Orders" subtitle="Create, reserve, allocate, pack and ship customer orders.">
    {params.success?<p className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-900">{params.success}</p>:null}
    {params.error?<p className="mb-4 rounded-xl bg-red-50 p-4 text-red-900">{params.error}</p>:null}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <form className="flex flex-1 flex-wrap gap-2"><input name="q" defaultValue={params.q} placeholder="Search order number" className="min-w-56 flex-1 rounded-xl border px-4 py-2.5"/><select name="status" defaultValue={params.status} className="rounded-xl border px-4 py-2.5"><option value="">All statuses</option>{statuses.map((status)=><option key={status} value={status}>{label(status)}</option>)}</select><button className="rounded-xl border px-4 py-2.5 font-semibold">Filter</button></form>
      {profile.role==="admin"||permissions.has("orders.create")?<a href="/admin/orders/new" className="rounded-xl bg-[var(--primary)] px-5 py-2.5 font-semibold text-[var(--primary-foreground)]">Create order</a>:null}
    </div>
    <div className="overflow-x-auto rounded-2xl border bg-[var(--surface)]"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr><th className="p-4">Order</th><th className="p-4">Customer</th><th className="p-4">Status</th><th className="p-4">Total</th><th className="p-4">Created</th><th className="p-4">Actions</th></tr></thead><tbody>
      {orders.map((order)=>{const customer=order.profiles as unknown as {full_name:string|null;email:string}|null;return <tr key={order.id} className="border-t"><td className="p-4 font-semibold">{order.order_number}</td><td className="p-4"><strong>{customer?.full_name||"Customer"}</strong><br/><span className="text-[var(--muted-text)]">{customer?.email}</span></td><td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${order.status==="cancelled"?"bg-red-50 text-red-800":"bg-blue-50 text-blue-800"}`}>{label(order.status)}</span></td><td className="p-4 font-semibold">{money(order.total_amount,order.currency)}</td><td className="p-4">{dateTime(order.created_at)}</td><td className="p-4"><div className="flex items-center gap-2"><a href={`/admin/orders/${order.id}`} className="rounded-lg border px-3 py-2 font-semibold">Open</a>{order.status==="cancelled"&&(profile.role==="admin"||permissions.has("orders.confirm"))?<form action={reactivateOrderAction.bind(null,order.id)}><input type="hidden" name="note" value="Reactivated from order list"/><button className="rounded-lg bg-amber-400 px-3 py-2 font-semibold text-slate-950">Reactivate</button></form>:null}</div></td></tr>})}
    </tbody></table>{!orders.length?<p className="p-10 text-center text-[var(--muted-text)]">No orders match these filters.</p>:null}</div>
    <div className="mt-4 flex justify-between text-sm"><span>{count} order(s)</span><div className="flex gap-2">{page>1?<a className="rounded border px-3 py-1" href={`?page=${page-1}&status=${params.status??""}&q=${params.q??""}`}>Previous</a>:null}{page*size<count?<a className="rounded border px-3 py-1" href={`?page=${page+1}&status=${params.status??""}&q=${params.q??""}`}>Next</a>:null}</div></div>
  </DashboardShell>
}
