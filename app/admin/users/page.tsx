import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { BANGLADESH_DISTRICTS } from "@/lib/customers/classification";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const allowedRoles = new Set(["customer", "employee", "admin"]);
const allowedStatuses = new Set(["active", "suspended", "disabled"]);
const display = (value: string | null | undefined) => value?.trim() || "—";
const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string; category?: string; district?: string; classification?: string }> }) {
  await connection();
  await requireProfile(["admin"]);
  const params = await searchParams;
  const supabase = createSupabaseAdminClient();
  const categoryFilter = String(params.category ?? "").trim().toLowerCase();
  const districtFilter = String(params.district ?? "").trim().toLowerCase();
  const classificationFilter = params.classification === "classified" || params.classification === "unclassified" ? params.classification : "";
  const { data: categoryOptions } = await supabase.from("customer_business_categories").select("id,name,slug").eq("is_active", true).order("name");
  let classificationIds: string[] | null = null;
  if (categoryFilter) {
    const { data } = await supabase.from("customer_business_category_assignments").select("customer_profile_id,customer_business_categories!inner(slug)").eq("customer_business_categories.slug", categoryFilter);
    classificationIds = (data ?? []).map((item) => item.customer_profile_id);
  }
  if (districtFilter) {
    const { data } = await supabase.from("customer_classifications").select("customer_profile_id").eq("district_code", districtFilter);
    const ids = (data ?? []).map((item) => item.customer_profile_id);
    classificationIds = classificationIds === null ? ids : classificationIds.filter((id) => ids.includes(id));
  }
  if (classificationFilter) {
    const { data } = await supabase.from("customer_business_category_assignments").select("customer_profile_id");
    const classifiedIds = [...new Set((data ?? []).map((item) => item.customer_profile_id))];
    if (classificationFilter === "classified") classificationIds = classificationIds === null ? classifiedIds : classificationIds.filter((id) => classifiedIds.includes(id));
    else {
      const { data: customers } = await supabase.from("profiles").select("id").eq("role", "customer").is("archived_at", null);
      const unclassifiedIds = (customers ?? []).map((customer) => customer.id).filter((id) => !classifiedIds.includes(id));
      classificationIds = classificationIds === null ? unclassifiedIds : classificationIds.filter((id) => unclassifiedIds.includes(id));
    }
  }
  let query = supabase.from("profiles").select("*").is("archived_at", null).order("updated_at", { ascending: false }).limit(100);
  if (params.role && allowedRoles.has(params.role)) query = query.eq("role", params.role);
  if (params.status && allowedStatuses.has(params.status)) query = query.eq("status", params.status);
  if (params.q?.trim()) query = query.or(`email.ilike.%${params.q.slice(0, 80)}%,full_name.ilike.%${params.q.slice(0, 80)}%,phone.ilike.%${params.q.slice(0, 80)}%,company_name.ilike.%${params.q.slice(0, 80)}%`);
  if (classificationIds !== null) query = query.in("id", classificationIds);
  const { data, error } = await query;

  if (error) {
    console.error("Admin users query failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    return <DashboardShell admin title="Users" subtitle="Complete customer, employee and administrator profiles."><div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900"><h2 className="text-lg font-semibold">Unable to load users</h2><p className="mt-2 text-sm">Your admin session is active, but the complete profile list could not be loaded.</p></div></DashboardShell>;
  }

  const customerIds = (data ?? []).filter((user) => user.role === "customer").map((user) => user.id);
  const [{ data: classifications }, { data: assignments }] = await Promise.all([
    customerIds.length ? supabase.from("customer_classifications").select("customer_profile_id,district_code").in("customer_profile_id", customerIds) : Promise.resolve({ data: [] }),
    customerIds.length ? supabase.from("customer_business_category_assignments").select("customer_profile_id,customer_business_categories(name,slug)").in("customer_profile_id", customerIds) : Promise.resolve({ data: [] }),
  ]);
  const districtNames = new Map(BANGLADESH_DISTRICTS.map((district) => [district.code.toLowerCase(), district.name]));
  const districtByCustomer = new Map((classifications ?? []).map((item) => [item.customer_profile_id, item.district_code ? districtNames.get(item.district_code) ?? null : null]));
  const categoriesByCustomer = new Map<string, string[]>();
  for (const item of assignments ?? []) { const category = item.customer_business_categories as unknown as { name: string } | null; if (category) categoriesByCustomer.set(item.customer_profile_id, [...(categoriesByCustomer.get(item.customer_profile_id) ?? []), category.name]); }
  const users = (data ?? []).map((user) => ({
    ...user,
    country: user.country ?? user.country_name ?? user.country_code ?? null,
    classificationCategories: categoriesByCustomer.get(user.id) ?? [],
    classificationDistrict: districtByCustomer.get(user.id) ?? null,
  }));
  return <DashboardShell admin title="Users" subtitle="View complete account information and manage access from each profile.">
    <section className="mb-6 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted-text)]">Visible accounts</p><strong className="mt-2 block text-3xl">{users.length}</strong></div><div className="rounded-2xl border bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted-text)]">Active</p><strong className="mt-2 block text-3xl text-green-700">{users.filter((user) => user.status === "active").length}</strong></div><div className="rounded-2xl border bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted-text)]">Employees</p><strong className="mt-2 block text-3xl text-blue-700">{users.filter((user) => user.role === "employee").length}</strong></div></section>
    <form className="mb-6 grid gap-3 rounded-2xl border bg-[var(--surface)] p-4 sm:grid-cols-2 xl:grid-cols-6"><label className="text-sm font-semibold xl:col-span-2">Search all profile fields<input name="q" placeholder="Name, email, phone or company" defaultValue={params.q} className="mt-1 w-full rounded-lg border p-3 font-normal"/></label><label className="text-sm font-semibold">Role<select name="role" defaultValue={params.role} className="mt-1 w-full rounded-lg border p-3 font-normal"><option value="">All roles</option><option value="customer">Customer</option><option value="employee">Employee</option><option value="admin">Administrator</option></select></label><label className="text-sm font-semibold">Status<select name="status" defaultValue={params.status} className="mt-1 w-full rounded-lg border p-3 font-normal"><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="disabled">Disabled</option></select></label><label className="text-sm font-semibold">Business Category<select name="category" defaultValue={categoryFilter} className="mt-1 w-full rounded-lg border p-3 font-normal"><option value="">All</option>{(categoryOptions ?? []).map((category)=><option key={category.id} value={category.slug}>{category.name}</option>)}</select></label><label className="text-sm font-semibold">District<select name="district" defaultValue={districtFilter} className="mt-1 w-full rounded-lg border p-3 font-normal"><option value="">All Districts</option>{BANGLADESH_DISTRICTS.map((district)=><option key={district.code} value={district.code.toLowerCase()}>{district.name}</option>)}</select></label><label className="text-sm font-semibold">Classification<select name="classification" defaultValue={classificationFilter} className="mt-1 w-full rounded-lg border p-3 font-normal"><option value="">All</option><option value="classified">Classified</option><option value="unclassified">Unclassified</option></select></label><button className="self-end rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)] xl:col-span-6">Apply filters</button></form>
    {users.length ? <div className="grid gap-4 xl:grid-cols-2">{users.map((user) => <article key={user.id} className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-lg font-bold text-[var(--primary-foreground)]">{(user.full_name ?? user.email ?? "U").slice(0, 1).toUpperCase()}</span><div className="min-w-0"><a href={`/admin/users/${user.id}`} className="block truncate text-lg font-semibold hover:text-[var(--primary)]">{display(user.full_name)}</a><p className="truncate text-sm text-[var(--muted-text)]">{display(user.email)}</p></div></div><div className="flex gap-2"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-800">{user.role}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${user.status === "active" ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>{user.status}</span></div></div><dl className="mt-5 grid gap-x-5 gap-y-4 text-sm sm:grid-cols-2"><div><dt className="text-[var(--muted-text)]">Phone</dt><dd className="mt-1 font-medium">{display(user.phone)}</dd></div><div><dt className="text-[var(--muted-text)]">Country</dt><dd className="mt-1 font-medium">{display(user.country)}</dd></div><div><dt className="text-[var(--muted-text)]">Customer type</dt><dd className="mt-1 font-medium capitalize">{display(user.customer_type)}</dd></div><div><dt className="text-[var(--muted-text)]">Company</dt><dd className="mt-1 font-medium">{display(user.company_name)}</dd></div>{user.role === "customer" ? <><div><dt className="text-[var(--muted-text)]">Business Categories</dt><dd className="mt-1 font-medium">{user.classificationCategories.length ? user.classificationCategories.join(", ") : "Unclassified"}</dd></div><div><dt className="text-[var(--muted-text)]">District</dt><dd className="mt-1 font-medium">{user.classificationDistrict ?? "Not Set"}</dd></div></> : null}<div><dt className="text-[var(--muted-text)]">Created</dt><dd className="mt-1 font-medium">{date(user.created_at)}</dd></div><div><dt className="text-[var(--muted-text)]">Last updated</dt><dd className="mt-1 font-medium">{date(user.updated_at)}</dd></div></dl><div className="mt-5 flex items-center justify-between gap-3 border-t pt-4"><code className="max-w-[65%] truncate text-xs text-[var(--muted-text)]" title={user.id}>{user.id}</code><a href={`/admin/users/${user.id}`} className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-[var(--muted-surface)]">Open profile →</a></div></article>)}</div> : <p className="rounded-2xl border bg-[var(--surface)] p-10 text-center text-[var(--muted-text)]">No accounts match these filters.</p>}
  </DashboardShell>;
}
