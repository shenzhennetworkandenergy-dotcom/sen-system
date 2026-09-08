import Link from "next/link";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { createCargoCustomerRequestAction } from "@/app/admin/cargo-tracking/actions";

export const dynamic = "force-dynamic";

export default async function NewCustomerCargoPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection(); await requireProfile(["customer"]); const params = await searchParams;
  return <DashboardShell title="Create Cargo Request" subtitle="Submit a Cargo request to SEN.">
    <Link href="/account/cargo" className="font-bold text-[var(--primary)]">← My Cargo</Link>
    {params.error ? <p className="mt-4 rounded-xl bg-red-50 p-4 text-red-900">{params.error}</p> : null}
    <form action={createCargoCustomerRequestAction} className="mt-5 grid gap-4 rounded-2xl border bg-[var(--surface)] p-6 md:grid-cols-2">
      <label className="font-semibold">Tracking Number if known<input name="tracking_number" className="mt-1 w-full rounded-xl border p-3" /></label>
      <label className="font-semibold">Shipping Method<select name="shipping_method" defaultValue="air" className="mt-1 w-full rounded-xl border p-3"><option value="air">Air</option><option value="sea">Sea</option><option value="hand_carry">Hand carry</option></select></label>
      <label className="font-semibold md:col-span-2">Goods / equipment description<textarea name="goods_summary" required rows={3} className="mt-1 w-full rounded-xl border p-3" /></label>
      <label className="font-semibold">Customer reference<input name="customer_reference" className="mt-1 w-full rounded-xl border p-3" /></label>
      <label className="font-semibold">Contact person<input name="contact_person" className="mt-1 w-full rounded-xl border p-3" /></label>
      <label className="font-semibold">Contact phone<input name="contact_phone" className="mt-1 w-full rounded-xl border p-3" /></label>
      <label className="font-semibold">Service / delivery location<input name="service_location" className="mt-1 w-full rounded-xl border p-3" /></label>
      <label className="font-semibold">Preferred date<input name="preferred_date" type="date" className="mt-1 w-full rounded-xl border p-3" /></label>
      <label className="font-semibold md:col-span-2">Customer instruction<textarea name="customer_instruction" rows={3} className="mt-1 w-full rounded-xl border p-3" /></label>
      <fieldset className="md:col-span-2 rounded-xl border p-4"><legend className="font-bold">Package</legend><div className="grid gap-3 md:grid-cols-4"><input name="package_description" required placeholder="Description" className="rounded-xl border p-3" /><input name="package_quantity" type="number" min="1" defaultValue="1" placeholder="Quantity" className="rounded-xl border p-3" /><select name="package_unit" defaultValue="Piece" className="rounded-xl border p-3"><option>Piece</option><option>Carton</option><option>Box</option><option>Bag/Sack</option></select><input name="package_weight" type="number" min="0" step="0.001" placeholder="Weight kg (optional)" className="rounded-xl border p-3" /></div></fieldset>
      <div className="md:col-span-2"><button className="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]">Submit Cargo Request</button></div>
    </form>
  </DashboardShell>;
}
