/* eslint-disable @next/next/no-html-link-for-pages */
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { getPurchaseDashboard } from "@/lib/purchasing/data";
import { purchaseStatuses } from "@/lib/purchasing/types";

export const dynamic = "force-dynamic";
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (value: number | string, currency: string) => `${currency} ${Number(value).toLocaleString("en-BD", { minimumFractionDigits: 2 })}`;

export default async function PurchasingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  const { profile, permissions } = await requirePermission("purchasing.view");
  const params = await searchParams;
  const data = await getPurchaseDashboard(params);
  const metrics = [
    ["Drafts", data.metrics.draft], ["Awaiting approval", data.metrics.awaitingApproval], ["Open orders", data.metrics.open],
    ["Overdue", data.metrics.overdue], ["Received / closed", data.metrics.received], ["Open value (BDT)", data.metrics.openValue.toLocaleString("en-BD")],
  ];
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Purchasing" subtitle="Manage suppliers, purchase orders, approvals, incoming stock and receipts.">
    {params.success ? <p className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p> : null}
    {params.error ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p> : null}
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">{metrics.map(([name,value])=><article key={name} className="rounded-xl border bg-[var(--surface)] p-3 shadow-sm"><p className="text-xs text-[var(--muted-text)]">{name}</p><p className="mt-1 text-2xl font-bold">{value}</p></article>)}</div>
    <div className="my-3 flex flex-wrap gap-2"><a href="/admin/purchasing/new" className="rounded-xl bg-[var(--primary)] px-4 py-2.5 font-bold text-[var(--primary-foreground)]">New purchase order</a><a href="/admin/suppliers" className="rounded-xl border bg-[var(--surface)] px-4 py-2.5 font-bold">Suppliers</a><a href="/admin/purchasing/export" className="rounded-xl border bg-[var(--surface)] px-4 py-2.5 font-bold">Export CSV</a></div>
    <form className="grid gap-2 rounded-xl border bg-[var(--surface)] p-3 md:grid-cols-5">
      <input name="q" defaultValue={params.q} placeholder="Order number" className="rounded-lg border px-3 py-2" />
      <select name="supplier" defaultValue={params.supplier} className="rounded-lg border px-3 py-2"><option value="">All suppliers</option>{data.suppliers.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select name="warehouse" defaultValue={params.warehouse} className="rounded-lg border px-3 py-2"><option value="">All warehouses</option>{data.warehouses.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select name="status" defaultValue={params.status} className="rounded-lg border px-3 py-2"><option value="">All statuses</option>{purchaseStatuses.map((status)=><option key={status} value={status}>{label(status)}</option>)}</select>
      <button className="rounded-lg border px-3 py-2 font-bold">Apply filters</button>
    </form>
    <div className="mt-3 overflow-x-auto rounded-xl border bg-[var(--surface)]"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr>{["Order","Supplier","Destination","Status","Progress","Expected","Total",""].map((head)=><th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{data.orders.map((order)=>{
      const supplier=order.suppliers as unknown as {name:string}|null; const warehouse=order.warehouses as unknown as {code:string;name:string}|null;
      const items=order.purchase_order_items as unknown as {quantity_ordered:number;quantity_received:number}[];
      const ordered=items.reduce((sum,item)=>sum+Number(item.quantity_ordered),0), received=items.reduce((sum,item)=>sum+Number(item.quantity_received),0);
      return <tr key={order.id} className="border-t"><td className="p-3 font-bold">{order.order_number}</td><td className="p-3">{supplier?.name}</td><td className="p-3">{warehouse?.code}</td><td className="p-3">{label(order.status)}</td><td className="p-3">{received} / {ordered}</td><td className="p-3">{order.expected_delivery_date ?? "—"}</td><td className="p-3 font-semibold">{money(order.total_amount,order.currency)}</td><td className="p-3"><a href={`/admin/purchasing/${order.id}`} className="rounded-lg border px-3 py-2 font-bold">Open</a></td></tr>;
    })}</tbody></table>{!data.orders.length?<p className="p-8 text-center text-[var(--muted-text)]">No purchase orders match these filters.</p>:null}</div>
    <div className="mt-3 flex justify-between text-sm"><span>{data.count} purchase order(s)</span><div className="flex gap-2">{data.page>1?<a href={`?page=${data.page-1}`} className="rounded border px-3 py-1">Previous</a>:null}{data.page*data.size<data.count?<a href={`?page=${data.page+1}`} className="rounded border px-3 py-1">Next</a>:null}</div></div>
  </DashboardShell>;
}
