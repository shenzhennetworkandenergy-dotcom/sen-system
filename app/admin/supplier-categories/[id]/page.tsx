import { connection } from "next/server";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { SupplierCategoryForm } from "@/components/purchasing/SupplierCategoryForm";
import { requirePermission } from "@/lib/auth/permissions";
import { getSupplierCategory, getSuppliersForCategory } from "@/lib/purchasing/supplier-categories";
import { updateSupplierCategoryAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SupplierCategoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("suppliers.view");
  const [{ id }, messages] = await Promise.all([params, searchParams]);
  const data = await getSupplierCategory(id);
  if (!data) notFound();
  const suppliers = await getSuppliersForCategory(id);
  const children = data.categories.filter((item) => item.parent_id === id);
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title={data.category.name} subtitle={`${data.category.pathLabel} · Level ${data.category.category_level}`}>
    {messages.success ? <p className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3 text-green-900">{messages.success}</p> : null}
    {messages.error ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">{messages.error}</p> : null}
    <div className="grid gap-4 lg:grid-cols-[430px_minmax(0,1fr)]">
      <SupplierCategoryForm action={updateSupplierCategoryAction.bind(null, id)} categories={data.categories} blockedParentIds={[id, ...data.descendantIds]} defaults={data.category} submitLabel="Save category" />
      <div className="grid content-start gap-4">
        <section className="rounded-2xl border bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="text-lg font-bold">Direct child categories</h2>
          <p className="mb-4 text-sm text-[var(--muted-text)]">Moving this category automatically recalculates the level of every descendant.</p>
          <div className="grid gap-2">{children.map((child) => <a key={child.id} href={`/admin/supplier-categories/${child.id}`} className="rounded-xl border p-3 font-semibold transition hover:bg-[var(--muted-surface)]">{child.name}<span className="block text-xs font-normal text-[var(--muted-text)]">Level {child.category_level}</span></a>)}</div>
          {!children.length ? <p className="rounded-xl bg-[var(--muted-surface)] p-4 text-sm text-[var(--muted-text)]">This category has no direct children.</p> : null}
        </section>
        <section className="overflow-hidden rounded-2xl border bg-[var(--surface)] shadow-sm">
          <div className="border-b p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-lg font-bold">Suppliers in this category</h2><p className="text-sm text-[var(--muted-text)]">Suppliers assigned directly to {data.category.name}.</p></div>
              <span className="rounded-full bg-[var(--muted-surface)] px-3 py-1 text-sm font-bold">{suppliers.length}</span>
            </div>
          </div>
          {suppliers.length ? <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[var(--muted-surface)]"><tr>{["Code", "Supplier", "Brand", "Contact", "Country", "Status", ""].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead>
              <tbody>{suppliers.map((supplier) => <tr key={supplier.id} className="border-t transition hover:bg-[var(--muted-surface)]">
                <td className="px-4 py-3 font-mono font-bold">{supplier.code}</td>
                <td className="px-4 py-3"><strong>{supplier.name}</strong><span className="block text-xs capitalize text-[var(--muted-text)]">{supplier.supplier_type.replaceAll("_", " ")}</span></td>
                <td className="px-4 py-3">{supplier.brand?.name ?? "—"}</td>
                <td className="px-4 py-3">{supplier.contact_person ?? "—"}<span className="block text-xs text-[var(--muted-text)]">{supplier.email ?? supplier.phone ?? ""}</span></td>
                <td className="px-4 py-3">{supplier.country_name}</td>
                <td className="px-4 py-3 capitalize">{supplier.status.replaceAll("_", " ")}</td>
                <td className="px-4 py-3"><a href={`/admin/suppliers/${supplier.id}`} className="inline-flex rounded-lg border px-3 py-2 font-bold transition hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)]">Open</a></td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="p-6 text-center text-sm text-[var(--muted-text)]">No suppliers are assigned directly to this category.</p>}
        </section>
      </div>
    </div>
  </DashboardShell>;
}
