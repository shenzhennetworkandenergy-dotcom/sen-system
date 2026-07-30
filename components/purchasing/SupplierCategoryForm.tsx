type CategoryOption = { id: string; pathLabel: string; category_level: number };
type CategoryDefaults = {
  name?: string | null;
  category_type?: string | null;
  parent_id?: string | null;
  description?: string | null;
  image_url?: string | null;
  icon?: string | null;
  is_active?: boolean | null;
  display_order?: number | null;
};

export function SupplierCategoryForm({
  action,
  categories,
  blockedParentIds = [],
  defaults = {},
  submitLabel,
}: {
  action: (form: FormData) => void | Promise<void>;
  categories: CategoryOption[];
  blockedParentIds?: string[];
  defaults?: CategoryDefaults;
  submitLabel: string;
}) {
  const blocked = new Set(blockedParentIds);
  return <form action={action} className="grid gap-3 rounded-2xl border bg-[var(--surface)] p-4 shadow-sm sm:grid-cols-2">
    <label className="text-sm font-semibold">Category name *<input name="name" required maxLength={160} defaultValue={defaults.name ?? ""} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Category type<select name="category_type" defaultValue={defaults.category_type ?? "normal"} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="normal">Normal category</option></select></label>
    <label className="text-sm font-semibold sm:col-span-2">Parent category<select name="parent_id" defaultValue={defaults.parent_id ?? ""} className="mt-1 w-full rounded-xl border px-3 py-2.5"><option value="">No parent — create a Level 1 category</option>{categories.filter((item) => !blocked.has(item.id)).map((item) => <option key={item.id} value={item.id}>{item.pathLabel} (Level {item.category_level})</option>)}</select><span className="mt-1 block text-xs text-[var(--muted-text)]">Selecting any category creates the next level. There is no fixed depth limit.</span></label>
    <label className="text-sm font-semibold sm:col-span-2">Description<textarea name="description" maxLength={1000} defaultValue={defaults.description ?? ""} className="mt-1 min-h-20 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Image URL<input name="image_url" type="url" maxLength={500} defaultValue={defaults.image_url ?? ""} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Icon<input name="icon" maxLength={80} defaultValue={defaults.icon ?? ""} placeholder="Icon name or emoji" className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="text-sm font-semibold">Display order<input name="display_order" type="number" min="0" step="1" defaultValue={defaults.display_order ?? 0} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    <label className="flex items-center gap-2 self-end rounded-xl border px-3 py-2.5 text-sm font-semibold"><input name="is_active" type="checkbox" defaultChecked={defaults.is_active ?? true} />Active</label>
    <button className="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)] sm:col-span-2">{submitLabel}</button>
  </form>;
}
