import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { SupplierForm } from "@/components/purchasing/SupplierForm";
import { requirePermission } from "@/lib/auth/permissions";
import { getSupplier } from "@/lib/purchasing/data";
import { getSupplierFormOptions } from "@/lib/purchasing/supplier-categories";
import { regenerateSupplierCodeAction, updateSupplierAction } from "../../purchasing/actions";

export const dynamic = "force-dynamic";

export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("suppliers.view");
  const [{ id }, messages] = await Promise.all([params, searchParams]);
  const [data, options] = await Promise.all([getSupplier(id), getSupplierFormOptions()]);
  if (!data) notFound();
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title={data.supplier.name} subtitle={`${data.supplier.code} · ${data.supplier.country_name}`}>
    {messages.success ? <p className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3 text-green-900">{messages.success}</p> : null}
    {messages.error ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">{messages.error}</p> : null}
    <div className="mb-3 flex flex-wrap gap-2"><Link href="/admin/supplier-categories" className="rounded-xl border bg-[var(--surface)] px-4 py-2.5 font-bold">Supplier categories</Link>{profile.role === "admin" ? <form action={regenerateSupplierCodeAction.bind(null, id)}><button className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 font-bold text-amber-900">Regenerate supplier code</button></form> : null}</div>
    <div className="grid gap-3 lg:grid-cols-[420px_minmax(0,1fr)]">
      <SupplierForm action={updateSupplierAction.bind(null, id)} categories={options.categories} brands={options.brands} defaults={data.supplier} submitLabel="Save supplier" />
      <section className="overflow-x-auto rounded-xl border bg-[var(--surface)]"><h2 className="p-4 text-lg font-bold">Purchase history</h2><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr>{["Order","Date","Expected","Status","Total"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{data.orders.map((order) => <tr key={order.id} className="border-t"><td className="p-3"><a href={`/admin/purchasing/${order.id}`} className="font-bold">{order.order_number}</a></td><td className="p-3">{order.order_date}</td><td className="p-3">{order.expected_delivery_date ?? "—"}</td><td className="p-3">{order.status.replaceAll("_", " ")}</td><td className="p-3 font-bold">{order.currency} {Number(order.total_amount).toLocaleString("en-BD")}</td></tr>)}</tbody></table>{!data.orders.length ? <p className="p-8 text-center text-[var(--muted-text)]">No purchase orders for this supplier yet.</p> : null}</section>
    </div>
  </DashboardShell>;
}
