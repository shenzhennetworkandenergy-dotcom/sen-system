import Link from "next/link";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getCargoOptions } from "@/lib/cargo-tracking/data";
import { createCargoCustomerAction, createCargoJobAction } from "../actions";

export const dynamic = "force-dynamic";
const field = "mt-1 w-full rounded-lg border bg-white px-3 py-2";

export default async function NewCargoJobPage({ searchParams }: { searchParams: Promise<{ customer?: string; success?: string; error?: string }> }) {
  await connection();
  await requireProfile(["admin"]);
  const params = await searchParams;
  const { customers, warehouses } = await getCargoOptions();
  return <DashboardShell admin title="Create Cargo Job" subtitle="Register a customer shipment without sales, inventory or accounting posting.">
    {params.success ? <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p> : null}
    {params.error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p> : null}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <form action={createCargoJobAction} className="space-y-5 rounded-xl border bg-[var(--surface)] p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="font-semibold">Customer<select name="customer_id" required defaultValue={params.customer ?? ""} className={field}><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name || customer.company_name || customer.email}</option>)}</select></label>
          <label className="font-semibold">China courier tracking no.<input name="courier_tracking_number" required maxLength={160} className={field} /></label>
          <label className="font-semibold md:col-span-2">Goods description<textarea name="goods_summary" required maxLength={2000} rows={2} className={field} /></label>
          <label className="font-semibold">Shipping method<select name="shipping_method" className={field}><option value="air">Air</option><option value="sea">Sea</option><option value="hand_carry">Hand Carry</option></select></label>
          <label className="font-semibold">Charge basis<select name="charge_basis" className={field}><option value="per_kg">Per kg</option><option value="per_piece">Per piece</option><option value="per_cbm">Per CBM</option><option value="per_ton">Per ton</option><option value="flat">Flat charge</option></select></label>
          <label className="font-semibold">Rate<input name="rate" type="number" min="0" step="0.01" defaultValue="0" className={field} /></label>
          <label className="font-semibold">China warehouse<select name="china_warehouse_id" className={field}><option value="">Not assigned</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}</select></label>
          <label className="font-semibold">Bangladesh warehouse<select name="bangladesh_warehouse_id" className={field}><option value="">Assign later</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}</select></label>
          <label className="font-semibold md:col-span-2">Internal note<textarea name="note" maxLength={3000} rows={2} className={field} /></label>
        </div>
        <section><h2 className="mb-2 text-lg font-bold">Packages</h2><p className="mb-3 text-sm text-[var(--muted-text)]">Complete one or more rows. The first package is required.</p><div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 md:grid-cols-6"><input name={`package_${index}_description`} required={index === 0} placeholder={`Package ${index + 1} description`} className="rounded border px-2 py-2 md:col-span-2" /><input name={`package_${index}_quantity`} required={index === 0} type="number" min="0.001" step="0.001" defaultValue={index === 0 ? "1" : ""} placeholder="Quantity" className="rounded border px-2 py-2" /><input name={`package_${index}_unit`} required={index === 0} defaultValue={index === 0 ? "piece" : ""} placeholder="Unit" className="rounded border px-2 py-2" /><input name={`package_${index}_weight`} type="number" min="0" step="0.001" placeholder="Weight kg" className="rounded border px-2 py-2" /><input name={`package_${index}_cbm`} type="number" min="0" step="0.0001" placeholder="CBM" className="rounded border px-2 py-2" /><input name={`package_${index}_dimensions`} placeholder="Dimensions" className="rounded border px-2 py-2 md:col-span-6" /></div>)}
        </div></section>
        <div className="flex gap-3"><button className="rounded-lg bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]">Create Cargo Job</button><Link href="/admin/cargo-tracking" className="rounded-lg border px-5 py-3 font-semibold">Cancel</Link></div>
      </form>
      <form action={createCargoCustomerAction} className="h-fit space-y-3 rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">Add shared customer</h2><p className="text-sm text-[var(--muted-text)]">This creates the same customer record used by Sales and Quotations.</p><input name="full_name" required placeholder="Full name" className={field} /><input name="company_name" placeholder="Company name (optional)" className={field} /><input name="email" type="email" required placeholder="Email" className={field} /><input name="phone" required placeholder="Phone" className={field} /><textarea name="address_line_1" required placeholder="Full address" rows={2} className={field} /><button className="w-full rounded-lg border px-4 py-2 font-bold">Add Customer</button></form>
    </div>
  </DashboardShell>;
}
