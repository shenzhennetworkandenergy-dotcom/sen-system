import { importProductsCsvAction } from "@/app/admin/products/actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";

export default async function ProductImportPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const [{ profile, permissions }, message] = await Promise.all([requirePermission("products.import"), searchParams]);
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Import products" subtitle="Create up to 500 catalogue products from one CSV and attach matching image files.">
    {message.success ? <p className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">{message.success}</p> : null}
    {message.error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{message.error}</p> : null}
    <section className="rounded-xl border bg-[var(--surface)] p-6">
      <h2 className="text-xl font-semibold">CSV format</h2>
      <p className="mt-2 text-sm text-[var(--muted-text)]">Required columns: name, model, brand, category. Optional columns include SKU, prices, status, product type, business category and image filename.</p>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">name,model,brand,category,sku,product_type,status,business_category,regular_price,sale_price,purchase_cost,stock_status,public_catalogue_visible,image_file</pre>
      <form action={importProductsCsvAction} className="mt-6 grid gap-5">
        <label className="font-semibold">Product CSV<input required type="file" name="csv" accept=".csv,text/csv" className="mt-2 block w-full rounded-lg border p-3"/></label>
        <label className="font-semibold">Product images (optional)<input type="file" name="images" multiple accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full rounded-lg border p-3"/><span className="mt-1 block text-xs font-normal text-[var(--muted-text)]">Set image_file in each CSV row to the exact uploaded filename.</span></label>
        <button className="w-fit rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-white">Validate and import products</button>
      </form>
    </section>
  </DashboardShell>;
}
