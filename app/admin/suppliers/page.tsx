import { connection } from "next/server";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/Shell";
import { SupplierForm } from "@/components/purchasing/SupplierForm";
import { requirePermission } from "@/lib/auth/permissions";
import { getSuppliers } from "@/lib/purchasing/data";
import { getSupplierFormOptions } from "@/lib/purchasing/supplier-categories";
import { createSupplierAction } from "../purchasing/actions";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; success?: string; error?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("suppliers.view");
  const params = await searchParams;
  const [data, options] = await Promise.all([getSuppliers(params), getSupplierFormOptions()]);
  const can = (key: string) => profile.role === "admin" || permissions.has(key);
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Suppliers" subtitle="Maintain the approved supplier master used by purchase orders.">
    {params.success ? <p className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p> : null}
    {params.error ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p> : null}
    {can("suppliers.edit") ? <div className="mb-3 flex flex-wrap gap-2"><Link href="/admin/supplier-categories" className="rounded-xl bg-[var(--primary)] px-4 py-2.5 font-bold text-[var(--primary-foreground)]">Supplier categories</Link><Link href="/admin/brands" className="rounded-xl border bg-[var(--surface)] px-4 py-2.5 font-bold">Manage brands</Link></div> : null}
    <form className="mb-3 grid gap-2 rounded-xl border bg-[var(--surface)] p-3 sm:grid-cols-[1fr_220px_auto]"><input name="q" defaultValue={params.q} placeholder="Name, code or email" className="rounded-lg border px-3 py-2" /><select name="status" defaultValue={params.status} className="rounded-lg border px-3 py-2"><option value="">All statuses</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="archived">Archived</option></select><button className="rounded-lg border px-4 py-2 font-bold">Filter</button></form>
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="overflow-x-auto rounded-xl border bg-[var(--surface)]"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[var(--muted-surface)]"><tr>{["Code","Supplier","Category","Brand","Contact","Country","Status",""].map((head) => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{data.suppliers.map((supplier) => <tr key={supplier.id} className="border-t"><td className="p-3 font-mono font-bold">{supplier.code}</td><td className="p-3"><strong>{supplier.name}</strong><span className="block text-xs text-[var(--muted-text)]">{supplier.supplier_type.replaceAll("_", " ")}</span></td><td className="p-3">{supplier.supplier_categories?.name ?? "—"}</td><td className="p-3">{supplier.brands?.name ?? "—"}</td><td className="p-3">{supplier.contact_person ?? "—"}<span className="block text-xs">{supplier.email ?? supplier.phone ?? ""}</span></td><td className="p-3">{supplier.country_name}</td><td className="p-3">{supplier.status.replaceAll("_", " ")}</td><td className="p-3"><a href={`/admin/suppliers/${supplier.id}`} className="rounded-lg border px-3 py-2 font-bold">Open</a></td></tr>)}</tbody></table>{!data.suppliers.length ? <p className="p-8 text-center text-[var(--muted-text)]">No suppliers match these filters.</p> : null}</section>
      {can("suppliers.create") ? <aside><h2 className="mb-2 text-lg font-bold">Add supplier</h2>{options.categories.length ? <SupplierForm action={createSupplierAction} categories={options.categories} brands={options.brands} submitLabel="Create supplier" /> : <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">Create at least one active supplier category before adding a supplier.</p>}</aside> : null}
    </div>
  </DashboardShell>;
}
