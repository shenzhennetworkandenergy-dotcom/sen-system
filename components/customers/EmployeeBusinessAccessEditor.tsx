import { saveEmployeeBusinessAccessAction } from "@/app/admin/users/employee-business-access-actions";

export function EmployeeBusinessAccessEditor({
  employeeId,
  categories,
  selectedCategorySlugs,
  error,
  success,
}: {
  employeeId: string;
  categories: ReadonlyArray<{ id: string; name: string; slug: string }>;
  selectedCategorySlugs: string[];
  error?: string;
  success?: string;
}) {
  return (
    <section className="mt-6 rounded-2xl border bg-[var(--surface)] p-6">
      <h2 className="text-xl font-semibold">Employee business access</h2>
      <p className="mt-2 text-sm text-[var(--muted-text)]">
        Admin-managed metadata only. This does not restrict customer, sales, CRM, inventory, or Work Scheduler visibility in Phase 2.
      </p>
      {error ? <p className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-red-900">{error}</p> : null}
      {success ? <p className="mt-3 rounded border border-green-200 bg-green-50 p-3 text-green-900">{success}</p> : null}
      <form action={saveEmployeeBusinessAccessAction.bind(null, employeeId)} className="mt-4">
        <fieldset>
          <legend className="text-sm font-semibold">Business Categories</legend>
          <p className="mt-1 text-sm text-[var(--muted-text)]">Leave all unchecked to keep this employee unchanged/unassigned.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <label key={category.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                <input
                  type="checkbox"
                  name="category_slugs"
                  value={category.slug}
                  defaultChecked={selectedCategorySlugs.includes(category.slug)}
                />
                {category.name}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="mt-5 rounded bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)]">
          Save employee business access
        </button>
      </form>
    </section>
  );
}
