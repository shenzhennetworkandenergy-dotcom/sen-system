import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAttributeAction, createAttributeValueAction } from "../catalog-actions";

export default async function AttributesPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const { profile, permissions } = await requirePermission("products.view"), db = createSupabaseAdminClient();
  const [{ data: attributes }, { data: values }, message] = await Promise.all([db.from("attributes").select("id,name,slug,description,is_active").order("sort_order"), db.from("attribute_values").select("id,attribute_id,value,slug").order("sort_order"), searchParams]);
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Attributes" subtitle="Reusable variation attributes such as color, capacity, voltage, and model.">
    {message.success || message.error ? <p className="mb-4 rounded border p-3">{message.error ?? message.success}</p> : null}
    <form action={createAttributeAction} className="grid gap-3 rounded-xl border bg-[var(--surface)] p-5 md:grid-cols-3"><label>Name<input name="name" required className="mt-1 w-full rounded border p-2" /></label><label>Slug<input name="slug" className="mt-1 w-full rounded border p-2" /></label><label>Description<input name="description" className="mt-1 w-full rounded border p-2" /></label><button className="rounded border px-4 py-2 font-semibold">Add attribute</button></form>
    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(attributes ?? []).map((attribute) => <article key={attribute.id} className="rounded border bg-[var(--surface)] p-4"><h2 className="font-semibold">{attribute.name}</h2><p className="text-sm text-[var(--muted-text)]">{attribute.description ?? attribute.slug}</p><div className="mt-3 flex flex-wrap gap-2">{(values ?? []).filter((item) => item.attribute_id === attribute.id).map((item) => <span key={item.id} className="rounded-full bg-[var(--muted-surface)] px-3 py-1 text-sm">{item.value}</span>)}</div><form action={createAttributeValueAction.bind(null, attribute.id)} className="mt-4 flex gap-2"><input name="value" required placeholder="New value" className="min-w-0 flex-1 rounded border p-2" /><button className="rounded border px-3 font-semibold">Add</button></form></article>)}</div>
  </DashboardShell>;
}
