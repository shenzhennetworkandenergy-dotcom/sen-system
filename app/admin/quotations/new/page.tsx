import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { createQuotationAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("quotations.create");
  const params = await searchParams;
  const db = createSupabaseAdminClient();
  const [{ data: customers }, { data: products }] = await Promise.all([
    db.from("profiles").select("id,full_name,email,company_name").eq("role", "customer").eq("status", "active").order("full_name").limit(500),
    db.from("products").select("id,name,sku,sale_price,regular_price,currency").eq("status", "active").order("name").limit(1000),
  ]);
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Create quotation" subtitle="Prepare a customer quotation from the live product catalogue.">
    {params.error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{params.error}</p> : null}
    <form action={createQuotationAction} className="grid gap-5 rounded-2xl border bg-[var(--surface)] p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="font-semibold">Customer<select name="customer_id" required className="mt-1 w-full rounded-xl border px-3 py-3"><option value="">Choose customer</option>{(customers ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name || customer.email} · {customer.email}</option>)}</select></label>
        <label className="font-semibold">Product<select name="product_id" required className="mt-1 w-full rounded-xl border px-3 py-3"><option value="">Choose product</option>{(products ?? []).map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
        <label className="font-semibold">Quantity<input name="quantity" type="number" min="1" step="1" defaultValue="1" required className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
        <label className="font-semibold">Additional product<select name="product_id" className="mt-1 w-full rounded-xl border px-3 py-3"><option value="">Optional product</option>{(products ?? []).map((product) => <option key={`additional-${product.id}`} value={product.id}>{product.name} - {product.sku}</option>)}</select></label>
        <label className="font-semibold">Additional quantity<input name="quantity" type="number" min="1" step="1" placeholder="Optional quantity" className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
        <label className="font-semibold">Required by<input name="required_by" type="date" className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
      </div>
      <label className="font-semibold">Quotation subject<input name="subject" placeholder="Quotation subject" className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
      <label className="font-semibold">Terms and notes<textarea name="message" rows={5} placeholder="Delivery terms, payment terms, warranty or customer notes" className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
      <div className="flex justify-end"><button className="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]">Generate quotation</button></div>
    </form>
  </DashboardShell>;
}
