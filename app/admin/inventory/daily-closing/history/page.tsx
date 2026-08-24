import { connection } from "next/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canUseDailyClosingAdminWorkflow } from "@/lib/inventory/daily-closing";

export const dynamic = "force-dynamic";

export default async function DailyClosingHistoryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; warehouse_id?: string; reference?: string; status?: string; prepared_by?: string }> }) {
  await connection();
  const { profile, permissions } = await requireAnyPermission(["inventory.daily_closing_view_history", "inventory.daily_closing_view"]);
  if (!canUseDailyClosingAdminWorkflow(profile.role)) redirect(`/admin/inventory/daily-closing?error=${encodeURIComponent("Daily Closing History is available to administrators only.")}`);
  const params = await searchParams;
  const db = createSupabaseAdminClient();
  let query = db.from("inventory_daily_closing_sheets").select("id,reference,inventory_date,warehouse_id,status,closing_status,prepared_by,revision,created_at").order("inventory_date", { ascending: false }).order("revision", { ascending: false }).limit(300);
  if (params.from) query = query.gte("inventory_date", params.from);
  if (params.to) query = query.lte("inventory_date", params.to);
  if (params.warehouse_id) query = query.eq("warehouse_id", params.warehouse_id);
  if (params.reference) query = query.ilike("reference", `%${params.reference.trim()}%`);
  if (params.status) query = query.eq("status", params.status);
  if (params.prepared_by) query = query.eq("prepared_by", params.prepared_by);
  const [sheetsResult, warehousesResult, preparedProfilesResult] = await Promise.all([query, db.from("warehouses").select("id,name,code").order("name"), db.from("profiles").select("id,full_name,email").in("role", ["admin", "employee"]).order("full_name").limit(1000)]);
  if (sheetsResult.error || warehousesResult.error || preparedProfilesResult.error) throw new Error("Unable to load daily closing history.");
  const sheets = sheetsResult.data ?? [];
  const profileIds = [...new Set(sheets.map((sheet) => sheet.prepared_by))];
  const profilesResult = profileIds.length ? await db.from("profiles").select("id,full_name,email").in("id", profileIds) : { data: [], error: null };
  if (profilesResult.error) throw new Error("Unable to load prepared-by details.");
  const warehouseMap = new Map((warehousesResult.data ?? []).map((warehouse) => [warehouse.id, warehouse]));
  const profileMap = new Map((profilesResult.data ?? []).map((item) => [item.id, item.full_name ?? item.email ?? "Not provided"]));
  const can = (permission: string) => profile.role === "admin" || permissions.has(permission);
  return <DashboardShell admin={profile.role === "admin"} title="Daily Inventory Closing History" subtitle="Search immutable daily inventory snapshots and revisions.">
    <form className="mb-5 grid gap-3 rounded-xl border bg-[var(--surface)] p-4 print:hidden sm:grid-cols-2 lg:grid-cols-6"><label className="text-sm font-semibold">From<input type="date" name="from" defaultValue={params.from} className="mt-1 w-full rounded border p-2 font-normal" /></label><label className="text-sm font-semibold">To<input type="date" name="to" defaultValue={params.to} className="mt-1 w-full rounded border p-2 font-normal" /></label><label className="text-sm font-semibold">Warehouse<select name="warehouse_id" defaultValue={params.warehouse_id} className="mt-1 w-full rounded border p-2 font-normal"><option value="">All warehouses</option>{(warehousesResult.data ?? []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}</select></label><label className="text-sm font-semibold">Prepared by<select name="prepared_by" defaultValue={params.prepared_by} className="mt-1 w-full rounded border p-2 font-normal"><option value="">Anyone</option>{(preparedProfilesResult.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.full_name ?? item.email ?? "Not provided"}</option>)}</select></label><label className="text-sm font-semibold">Reference<input name="reference" defaultValue={params.reference} className="mt-1 w-full rounded border p-2 font-normal" placeholder="INV-CLS" /></label><label className="text-sm font-semibold">Status<select name="status" defaultValue={params.status} className="mt-1 w-full rounded border p-2 font-normal"><option value="">All statuses</option><option value="draft">Draft</option><option value="finalized">Finalized</option><option value="verified">Verified</option></select></label><button className="rounded bg-[var(--primary)] px-4 py-2 font-semibold text-white sm:col-span-2 lg:col-span-6">Search history</button></form>
    {sheets.length ? <div className="overflow-x-auto rounded-xl border bg-[var(--surface)]"><table className="w-full min-w-[820px] text-left text-sm"><thead><tr className="bg-slate-100"><th className="p-3">Reference</th><th>Date</th><th>Warehouse</th><th>Status</th><th>Closing status</th><th>Prepared by</th><th>Revision</th><th>Actions</th></tr></thead><tbody>{sheets.map((sheet) => <tr key={sheet.id} className="border-t"><td className="p-3 font-semibold">{sheet.reference}</td><td>{sheet.inventory_date}</td><td>{sheet.warehouse_id ? `${warehouseMap.get(sheet.warehouse_id)?.name ?? "Not provided"}` : "All warehouses"}</td><td>{sheet.status}</td><td>{sheet.closing_status.replaceAll("_", " ")}</td><td>{profileMap.get(sheet.prepared_by) ?? "Not provided"}</td><td>{sheet.revision}</td><td className="space-x-2"><a className="font-semibold text-[var(--primary)]" href={`/admin/inventory/daily-closing?sheet_id=${sheet.id}`}>View</a>{can("inventory.daily_closing_print") ? <a className="font-semibold text-teal-700" href={`/admin/inventory/daily-closing/${sheet.id}/print`}>Print</a> : null}</td></tr>)}</tbody></table></div> : <p className="rounded-xl border bg-[var(--surface)] p-8 text-center text-[var(--muted-text)]">No daily closing sheets match the selected filters.</p>}
    <p className="mt-4 text-sm text-[var(--muted-text)]">{sheets.length} snapshot(s) found.</p>
  </DashboardShell>;
}

