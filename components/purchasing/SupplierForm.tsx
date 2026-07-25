type SupplierDefaults = Record<string, string | number | null>;

export function SupplierForm({ action, defaults = {}, submitLabel }: {
  action: (form: FormData) => void | Promise<void>;
  defaults?: SupplierDefaults;
  submitLabel: string;
}) {
  const field = (name: string) => defaults[name] == null ? "" : String(defaults[name]);
  return <form action={action} className="grid gap-3 rounded-2xl border bg-[var(--surface)] p-4 shadow-sm sm:grid-cols-2">
    <label className="text-sm font-semibold">Supplier code *<input name="code" required maxLength={40} defaultValue={field("code")} className="mt-1 w-full rounded-xl border px-3 py-2.5 uppercase" /></label>
    <label className="text-sm font-semibold">Supplier name *<input name="name" required maxLength={160} defaultValue={field("name")} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Type<select name="supplier_type" defaultValue={field("supplier_type") || "distributor"} className="mt-1 w-full rounded-xl border px-3 py-2.5">{["manufacturer","distributor","reseller","service_provider","logistics","other"].map((value)=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label>
    <label className="text-sm font-semibold">Status<select name="status" defaultValue={field("status") || "active"} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="active">Active</option><option value="on_hold">On hold</option><option value="archived">Archived</option></select></label>
    <label className="text-sm font-semibold">Contact person<input name="contact_person" maxLength={160} defaultValue={field("contact_person")} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Email<input name="email" type="email" maxLength={200} defaultValue={field("email")} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Phone<input name="phone" maxLength={50} defaultValue={field("phone")} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Website<input name="website_url" type="url" maxLength={300} defaultValue={field("website_url")} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Country ISO code *<input name="country_code" required minLength={2} maxLength={2} defaultValue={field("country_code")} className="mt-1 w-full rounded-xl border px-3 py-2.5 uppercase" /></label>
    <label className="text-sm font-semibold">Country *<input name="country_name" required maxLength={100} defaultValue={field("country_name")} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Default currency *<input name="default_currency" required minLength={3} maxLength={3} defaultValue={field("default_currency") || "BDT"} className="mt-1 w-full rounded-xl border px-3 py-2.5 uppercase" /></label>
    <label className="text-sm font-semibold">Payment terms (days)<input name="payment_terms_days" type="number" min="0" max="365" defaultValue={field("payment_terms_days") || "0"} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Lead time (days)<input name="lead_time_days" type="number" min="0" max="3650" defaultValue={field("lead_time_days") || "0"} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Tax / registration<input name="tax_registration" maxLength={120} defaultValue={field("tax_registration")} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold sm:col-span-2">Address<textarea name="address" maxLength={500} defaultValue={field("address")} className="mt-1 min-h-20 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold sm:col-span-2">Notes<textarea name="notes" maxLength={2000} defaultValue={field("notes")} className="mt-1 min-h-20 w-full rounded-xl border px-3 py-2.5" /></label>
    <button className="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)] sm:col-span-2">{submitLabel}</button>
  </form>;
}
