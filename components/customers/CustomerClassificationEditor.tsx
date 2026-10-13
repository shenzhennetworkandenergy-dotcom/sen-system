import { saveCustomerClassificationAction } from "@/app/admin/users/classification-actions";

export function CustomerClassificationEditor({
  customerId,
  categories,
  districts,
  selectedCategorySlugs,
  selectedDistrictCode,
  error,
  success,
}: {
  customerId: string;
  categories: ReadonlyArray<{ id: string; name: string; slug: string }>;
  districts: Array<{ code: string; name: string }>;
  selectedCategorySlugs: string[];
  selectedDistrictCode: string | null;
  error?: string;
  success?: string;
}) {
  return (
    <section className="mt-6 rounded-2xl border bg-[var(--surface)] p-6">
      <h2 className="text-xl font-semibold">Customer classification</h2>
      <p className="mt-2 text-sm text-[var(--muted-text)]">Admin-managed metadata only; it does not change customer visibility.</p>
      {error ? <p className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-red-900">{error}</p> : null}
      {success ? <p className="mt-3 rounded border border-green-200 bg-green-50 p-3 text-green-900">{success}</p> : null}
      <form action={saveCustomerClassificationAction.bind(null, customerId)} className="mt-4 grid gap-4 md:grid-cols-2">
        <fieldset>
          <legend className="text-sm font-semibold">Business Categories</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {categories.map((category) => <label key={category.id} className="flex items-center gap-2 rounded border p-2 text-sm"><input type="checkbox" name="category_slugs" value={category.slug} defaultChecked={selectedCategorySlugs.includes(category.slug)} />{category.name}</label>)}
          </div>
        </fieldset>
        <label className="text-sm font-semibold">Primary Bangladesh District<select name="district_code" defaultValue={selectedDistrictCode ?? ""} className="mt-1 w-full rounded border p-3"><option value="">Not Set</option>{districts.map((district) => <option key={district.code} value={district.code}>{district.name}</option>)}</select></label>
        <button className="rounded bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)] md:col-span-2">Save classification</button>
      </form>
    </section>
  );
}
