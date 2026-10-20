import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveCustomerAddressAction, saveCustomerProfileAction } from "./actions";

export const dynamic = "force-dynamic";

const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600";
const label = "block text-sm font-semibold text-slate-800";

export default async function EditCustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await connection();
  await requireProfile(["admin"]);
  const [{ id }, message] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = createSupabaseAdminClient();
  const { data: customer, error } = await db.from("profiles").select("id,role,email,full_name,company_name,customer_type,phone,alternate_phone,country,country_name,country_code,address_line,city,region,postal_code").eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load customer information.");
  if (!customer || customer.role !== "customer") notFound();
  const [{ data: addresses, error: addressError }, auth] = await Promise.all([
    db.from("customer_addresses").select("id,profile_id,recipient_name,phone,alternate_phone,address_line_1,address_line_2,area,city,region,postal_code,country_code,delivery_instructions,map_label,is_default_shipping").eq("profile_id", id).order("updated_at", { ascending: false }),
    db.auth.admin.getUserById(id),
  ]);
  if (addressError) throw new Error("Unable to load customer addresses.");
  const phoneIsAuthIdentity = !auth.error && Boolean(auth.data.user?.phone);
  const phoneEditUnavailable = Boolean(auth.error || !auth.data.user || phoneIsAuthIdentity);
  const saveProfile = saveCustomerProfileAction.bind(null, id);

  return <DashboardShell admin title="Edit Customer" subtitle="Correct current customer details without changing account identity or historical transactions.">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
      <p>Customer ID stays unchanged. Business Categories and District are managed separately on the customer detail page.</p>
      <a href={`/admin/users/${id}`} className="rounded-lg border border-blue-300 bg-white px-3 py-2 font-semibold hover:bg-blue-100">Cancel and return</a>
    </div>
    {message.error ? <p role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-950">{message.error}</p> : null}
    <form action={saveProfile} className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-bold">Customer profile</h2>
      <p className="mt-1 text-sm text-[var(--muted-text)]">Change only what needs correction. Unchanged fields are not written again.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className={label}>Full Name<input name="full_name" defaultValue={customer.full_name ?? ""} maxLength={160} className={field} /></label>
        <label className={label}>Company Name<input name="company_name" defaultValue={customer.company_name ?? ""} maxLength={200} className={field} /></label>
        <label className={label}>Customer Type<select name="customer_type" defaultValue={customer.customer_type ?? ""} className={field}><option value="">Not specified</option><option value="individual">Individual</option><option value="company">Company</option></select></label>
        <label className={label}>Phone Number<input name="phone" type="tel" defaultValue={customer.phone ?? ""} maxLength={60} required={Boolean(customer.phone)} disabled={phoneEditUnavailable} className={field} />{phoneEditUnavailable ? <span className="mt-1 block text-xs font-normal text-amber-800">This phone is tied to authentication or Auth status is unavailable; it cannot be changed here safely.</span> : null}</label>
        <label className={label}>Alternate Phone<input name="alternate_phone" type="tel" defaultValue={customer.alternate_phone ?? ""} maxLength={60} className={field} /></label>
        <div className={label}>Email Address<div className={`${field} bg-slate-50 text-slate-600`} aria-label="Email address, read only">{customer.email ?? "Not set"}</div><p className="mt-1 text-xs font-normal text-slate-600">Email editing is excluded from V1 to keep Supabase Auth and profile email synchronized.</p></div>
        <label className={label}>Country<input name="country" defaultValue={customer.country ?? customer.country_name ?? customer.country_code ?? ""} maxLength={100} className={field} /></label>
        <label className={`${label} sm:col-span-2`}>Address Line<input name="address_line" defaultValue={customer.address_line ?? ""} maxLength={300} className={field} /></label>
        <label className={label}>City<input name="city" defaultValue={customer.city ?? ""} maxLength={120} className={field} /></label>
        <label className={label}>Region / District<input name="region" defaultValue={customer.region ?? ""} maxLength={120} className={field} /><span className="mt-1 block text-xs font-normal text-slate-600">This is the existing profile region; structured Phase 1 District is edited separately.</span></label>
        <label className={label}>Postal Code<input name="postal_code" defaultValue={customer.postal_code ?? ""} maxLength={30} className={field} /></label>
      </div>
      <div className="mt-6 flex flex-wrap gap-3"><button type="submit" className="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]">Save Changes</button><a href={`/admin/users/${id}`} className="rounded-xl border px-5 py-3 font-semibold">Cancel</a></div>
    </form>

    <section className="mt-5 space-y-4" aria-labelledby="saved-addresses-heading">
      <div><h2 id="saved-addresses-heading" className="text-xl font-bold">Saved billing and delivery addresses</h2><p className="mt-1 text-sm text-[var(--muted-text)]">Edit an existing saved address below. Past invoice and order address snapshots are never rewritten.</p></div>
      {(addresses ?? []).map((address, index) => <form key={address.id} action={saveCustomerAddressAction.bind(null, id, address.id)} className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">Saved address {index + 1}</h3>{address.is_default_shipping ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">Default delivery</span> : null}</div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={label}>Recipient<input name="recipient_name" defaultValue={address.recipient_name ?? ""} maxLength={160} required className={field} /></label>
          <label className={label}>Phone<input name="phone" type="tel" defaultValue={address.phone ?? ""} maxLength={40} required className={field} /></label>
          <label className={label}>Alternate Phone<input name="alternate_phone" type="tel" defaultValue={address.alternate_phone ?? ""} maxLength={40} className={field} /></label>
          <label className={label}>Country Code<input name="country_code" defaultValue={address.country_code ?? "BD"} maxLength={2} required className={field} /></label>
          <label className={`${label} sm:col-span-2`}>Address Line 1<input name="address_line_1" defaultValue={address.address_line_1 ?? ""} maxLength={240} required className={field} /></label>
          <label className={`${label} sm:col-span-2`}>Address Line 2<input name="address_line_2" defaultValue={address.address_line_2 ?? ""} maxLength={240} className={field} /></label>
          <label className={label}>Area<input name="area" defaultValue={address.area ?? ""} maxLength={120} className={field} /></label>
          <label className={label}>City<input name="city" defaultValue={address.city ?? ""} maxLength={120} required className={field} /></label>
          <label className={label}>Region<input name="region" defaultValue={address.region ?? ""} maxLength={120} className={field} /></label>
          <label className={label}>Postal Code<input name="postal_code" defaultValue={address.postal_code ?? ""} maxLength={30} className={field} /></label>
          <label className={label}>Map Label<input name="map_label" defaultValue={address.map_label ?? ""} maxLength={160} className={field} /></label>
          <label className={`${label} sm:col-span-2`}>Delivery Instructions<textarea name="delivery_instructions" defaultValue={address.delivery_instructions ?? ""} maxLength={500} rows={2} className={field} /></label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3"><button type="submit" className="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]">Save Address</button><a href={`/admin/users/${id}`} className="rounded-xl border px-5 py-3 font-semibold">Cancel</a></div>
      </form>)}
      {!addresses?.length ? <p className="rounded-2xl border bg-[var(--surface)] p-5 text-sm text-[var(--muted-text)]">No saved billing or delivery address exists for this customer. The profile address above can still be corrected.</p> : null}
    </section>
  </DashboardShell>;
}
