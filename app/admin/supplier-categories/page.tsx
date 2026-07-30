import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { SupplierCategoryForm } from "@/components/purchasing/SupplierCategoryForm";
import { requirePermission } from "@/lib/auth/permissions";
import { getSupplierCategoryOptions } from "@/lib/purchasing/supplier-categories";
import { createSupplierCategoryAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SupplierCategoriesPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("suppliers.view");
  const [categories, messages] = await Promise.all([getSupplierCategoryOptions(true), searchParams]);
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Supplier categories" subtitle="Organize suppliers with a flexible parent-and-child hierarchy.">
    {messages.success ? <p className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3 text-green-900">{messages.success}</p> : null}
    {messages.error ? <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">{messages.error}</p> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
      <section className="overflow-hidden rounded-2xl border bg-[var(--surface)] shadow-sm">
        <div className="border-b p-4"><h2 className="text-lg font-bold">Category hierarchy</h2><p className="text-sm text-[var(--muted-text)]">A child may be added beneath any existing category. Cycles are blocked by the database.</p></div>
        <div className="divide-y">
          {categories.map((category) => <a key={category.id} href={`/admin/supplier-categories/${category.id}`} className="flex items-center justify-between gap-3 p-4 transition hover:bg-[var(--muted-surface)]">
            <span><strong>{category.icon ? `${category.icon} ` : ""}{category.pathLabel}</strong><span className="mt-1 block text-xs text-[var(--muted-text)]">Level {category.category_level} · {category.category_type} · order {category.display_order}</span></span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${category.is_active ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-600"}`}>{category.is_active ? "Active" : "Inactive"}</span>
          </a>)}
          {!categories.length ? <p className="p-8 text-center text-[var(--muted-text)]">No supplier categories yet. Create the first Level 1 category.</p> : null}
        </div>
      </section>
      <aside><h2 className="mb-2 text-lg font-bold">Create category</h2><SupplierCategoryForm action={createSupplierCategoryAction} categories={categories} submitLabel="Create supplier category" /></aside>
    </div>
  </DashboardShell>;
}
