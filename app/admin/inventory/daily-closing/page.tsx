import { connection } from "next/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { DailyClosingReport } from "@/components/inventory/DailyClosingReport";
import { DailyClosingPrintButton } from "@/components/inventory/DailyClosingPrintButton";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { canAccessDailyClosingSheet, canEmployeeAccessDailyClosingPage, canUseDailyClosingAdminWorkflow, DAILY_CLOSING_PERMISSION_KEYS, getBusinessDateInDhaka } from "@/lib/inventory/daily-closing";
import { getEmployeeDailyClosingAssignment } from "@/lib/inventory/daily-closing-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dashboardPathForRole } from "@/lib/constants/routes";
import { createDailyClosingRevisionAction, finalizeDailyClosingAction, generateDailyClosingAction, updateDailyClosingDraftAction, verifyDailyClosingAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ sheet_id?: string; success?: string; error?: string; inventory_date?: string; warehouse_id?: string; include_all_products?: string; include_serial_details?: string }>;

type DailyClosingSheetRow = {
  id: string;
  reference: string;
  inventory_date: string;
  warehouse_id: string | null;
  status: string;
  closing_status: string;
  prepared_by: string;
  checked_by: string | null;
  prepared_at: string;
  finalized_at: string | null;
  closing_time: string | null;
  physical_count: number | null;
  variance: number | null;
  remarks: string | null;
  revision: number;
  include_serial_details: boolean;
};

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function DailyClosingPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const { profile, permissions } = await requireAnyPermission([...DAILY_CLOSING_PERMISSION_KEYS]);
  const params = await searchParams;
  const db = createSupabaseAdminClient();
  const defaultDate = getBusinessDateInDhaka();
  const isEmployee = profile.role === "employee";
  const canUseAdminWorkflow = canUseDailyClosingAdminWorkflow(profile.role);
  if (isEmployee && !canEmployeeAccessDailyClosingPage(permissions)) redirect(dashboardPathForRole(profile.role));
  if (isEmployee && params.sheet_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.sheet_id)) {
    redirect(`/admin/inventory/daily-closing?error=${encodeURIComponent("The requested daily closing sheet is invalid.")}`);
  }
  const employeeAssignment = isEmployee ? await getEmployeeDailyClosingAssignment(profile.id) : null;
  if (isEmployee && params.sheet_id && !employeeAssignment) redirect(`/admin/inventory/daily-closing?error=${encodeURIComponent("An administrator must assign your active primary warehouse before you can view a daily closing sheet.")}`);
  let sheetResult: { data: DailyClosingSheetRow | null; error: unknown } = { data: null, error: null };
  if (params.sheet_id) {
    let query = db.from("inventory_daily_closing_sheets").select("id,reference,inventory_date,warehouse_id,status,closing_status,prepared_by,checked_by,prepared_at,finalized_at,closing_time,physical_count,variance,remarks,revision,include_serial_details").eq("id", params.sheet_id);
    if (isEmployee && employeeAssignment) query = query.eq("inventory_date", employeeAssignment.inventoryDate).eq("warehouse_id", employeeAssignment.warehouseId);
    sheetResult = await query.maybeSingle() as { data: DailyClosingSheetRow | null; error: unknown };
  }
  const warehousesResult = isEmployee
    ? { data: employeeAssignment ? [{ id: employeeAssignment.warehouseId, code: employeeAssignment.warehouseCode, name: employeeAssignment.warehouseName, country_name: employeeAssignment.countryName }] : [], error: null }
    : await db.from("warehouses").select("id,code,name,country_name").eq("is_active", true).order("name");
  if (warehousesResult.error || sheetResult.error) throw new Error("Unable to load daily inventory closing data.");
  const sheet = sheetResult.data;
  if (isEmployee && params.sheet_id && (!sheet || !canAccessDailyClosingSheet(profile.role, { inventoryDate: sheet.inventory_date, warehouseId: sheet.warehouse_id }, employeeAssignment))) {
    redirect(`/admin/inventory/daily-closing?error=${encodeURIComponent("Employees can only view today's daily closing sheet for their assigned warehouse.")}`);
  }
  let lines: Array<Record<string, unknown>> = [];
  let movements: Array<Record<string, unknown>> = [];
  let preparedBy = "Not provided";
  let checkedBy = "Not provided";
  if (sheet) {
    let linesQuery = db.from("inventory_daily_closing_lines").select("id,product_name,sku,model,opening_qty,stock_in,stock_out,closing_qty,unit,remarks,reconciliation_needed").eq("sheet_id", sheet.id).order("product_name");
    if (isEmployee) linesQuery = linesQuery.or("stock_in.gt.0,stock_out.gt.0");
    const movementsQuery = isEmployee
      ? db.from("inventory_daily_closing_movement_details").select("reference,movement_type,quantity_delta,transaction_at,product_name,sku,source_warehouse_id,destination_warehouse_id").eq("sheet_id", sheet.id).eq("warehouse_id", employeeAssignment!.warehouseId).order("transaction_at", { ascending: true })
      : db.from("inventory_daily_closing_movement_details").select("reference,movement_type,quantity_delta,transaction_at,product_name,sku,sen_serial,manufacturer_serial,source_warehouse_id,destination_warehouse_id").eq("sheet_id", sheet.id).order("transaction_at", { ascending: true });
    const [linesResult, movementsResult, preparedResult, checkedResult] = await Promise.all([
      linesQuery,
      movementsQuery,
      db.from("profiles").select("full_name,email").eq("id", sheet.prepared_by).maybeSingle(),
      sheet.checked_by ? db.from("profiles").select("full_name,email").eq("id", sheet.checked_by).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (linesResult.error || movementsResult.error || preparedResult.error || checkedResult.error) throw new Error("Unable to load the selected daily closing sheet.");
    lines = linesResult.data ?? [];
    movements = movementsResult.data ?? [];
    preparedBy = preparedResult.data?.full_name ?? preparedResult.data?.email ?? "Not provided";
    checkedBy = checkedResult.data?.full_name ?? checkedResult.data?.email ?? "Not provided";
  }
  const warehouseMap = new Map((warehousesResult.data ?? []).map((warehouse) => [warehouse.id, warehouse]));
  const can = (permission: string) => profile.role === "admin" || permissions.has(permission);
  const currentWarehouse = sheet?.warehouse_id ? warehouseMap.get(sheet.warehouse_id)?.name ?? "Selected warehouse" : "All warehouses";

  return <DashboardShell admin={profile.role === "admin"} employeePermissions={isEmployee ? permissions : undefined} title="Daily Inventory Update & Closing Sheet" subtitle={isEmployee ? "Generate, view and print today's inventory movements for your assigned warehouse." : "Generate, review, finalize and print an auditable daily inventory archive without changing stock."}>
    {params.success ? <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">{params.success}</p> : null}
    {params.error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{params.error}</p> : null}
    <section className="mb-6 rounded-xl border bg-[var(--surface)] p-5 print:hidden">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">Inventory archive</p><h2 className="mt-1 text-xl font-bold">Report configuration</h2><p className="mt-1 text-sm text-[var(--muted-text)]">{isEmployee ? "This report contains only today's confirmed Stock In and Stock Out movements for your assigned warehouse." : "The report reads confirmed inventory movements and current balances. Generating it never changes stock."}</p></div>
        {canUseAdminWorkflow ? <a href="/admin/inventory/daily-closing/history" className="rounded border px-4 py-2 font-semibold">Daily Closing History</a> : null}
      </div>
      {isEmployee && !employeeAssignment ? <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">An administrator must assign your active primary warehouse before you can generate or view today&apos;s inventory sheet.</p>
        : can("inventory.daily_closing_generate") ? isEmployee ? <form action={generateDailyClosingAction} className="mt-5 grid gap-4 rounded-lg border bg-slate-50 p-4 sm:grid-cols-2">
          <div className="text-sm font-semibold">Inventory date<div className="mt-1 w-full rounded border bg-white p-3 font-normal">{employeeAssignment?.inventoryDate}</div></div>
          <div className="text-sm font-semibold">Warehouse / location<div className="mt-1 w-full rounded border bg-white p-3 font-normal">{employeeAssignment ? `${employeeAssignment.warehouseName} (${employeeAssignment.warehouseCode})` : "Not assigned"}</div></div>
          <button className="rounded bg-[var(--primary)] px-4 py-3 font-semibold text-white sm:col-span-2">Print Inventory Sheet</button>
        </form> : <form action={generateDailyClosingAction} className="mt-5 grid gap-4 rounded-lg border bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-semibold">Inventory date<input type="date" name="inventory_date" defaultValue={params.inventory_date ?? defaultDate} required className="mt-1 w-full rounded border bg-white p-3 font-normal" /></label><label className="text-sm font-semibold">Warehouse / location<select name="warehouse_id" defaultValue={params.warehouse_id ?? ""} className="mt-1 w-full rounded border bg-white p-3 font-normal"><option value="">All warehouses</option>{(warehousesResult.data ?? []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}</select></label><label className="flex items-center gap-2 rounded border bg-white p-3 text-sm"><input type="checkbox" name="include_all_products" defaultChecked={params.include_all_products === "on"} /> Include all products with stock</label><label className="flex items-center gap-2 rounded border bg-white p-3 text-sm"><input type="checkbox" name="include_serial_details" defaultChecked={params.include_serial_details === "on"} /> Include serial details</label><button className="rounded bg-[var(--primary)] px-4 py-3 font-semibold text-white sm:col-span-2 lg:col-span-4">Print Inventory Sheet</button></form>
          : <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">You have view-only access. Ask an administrator for Generate permission to create a new sheet.</p>}
    </section>
    {sheet ? <>
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden"><div className="text-sm text-[var(--muted-text)]">Showing <strong>{sheet.reference}</strong> · {sheet.inventory_date} · {currentWarehouse} · {statusLabel(sheet.status)}</div><div className="flex flex-wrap gap-2">{can("inventory.daily_closing_print") ? <DailyClosingPrintButton href={`/admin/inventory/daily-closing/${sheet.id}/print`} /> : null}{canUseAdminWorkflow && can("inventory.daily_closing_generate") && sheet.status !== "draft" ? <form action={createDailyClosingRevisionAction}><input type="hidden" name="sheet_id" value={sheet.id} /><button className="rounded border px-4 py-3 font-semibold">Create revision</button></form> : null}</div></section>
      {canUseAdminWorkflow && sheet.status === "draft" && can("inventory.daily_closing_generate") ? <form action={updateDailyClosingDraftAction} className="mb-5 grid gap-4 rounded-xl border bg-[var(--surface)] p-5 print:hidden sm:grid-cols-2"><input type="hidden" name="sheet_id" value={sheet.id} /><label className="text-sm font-semibold">Physical count verified (optional)<input type="number" min="0" step="0.0001" name="physical_count" defaultValue={sheet.physical_count ?? ""} className="mt-1 w-full rounded border p-3 font-normal" placeholder="Not verified" /></label><label className="text-sm font-semibold sm:row-span-2">General remarks / exceptions<textarea name="remarks" defaultValue={sheet.remarks ?? ""} className="mt-1 min-h-28 w-full rounded border p-3 font-normal" placeholder="Mismatch, damage, missing serial, correction, or other note" /></label><div className="flex flex-wrap items-end gap-2"><button className="rounded border px-4 py-3 font-semibold">Save draft details</button>{can("inventory.daily_closing_finalize") ? <button formAction={finalizeDailyClosingAction} className="rounded bg-indigo-700 px-4 py-3 font-semibold text-white">Finalize sheet</button> : null}</div></form> : null}
      {canUseAdminWorkflow && sheet.status === "finalized" && can("inventory.daily_closing_verify") ? <form action={verifyDailyClosingAction} className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 print:hidden"><input type="hidden" name="sheet_id" value={sheet.id} /><span className="text-sm text-indigo-950">Finalized sheets are locked. Verify this snapshot when the physical count has been checked.</span><button className="rounded bg-indigo-700 px-4 py-3 font-semibold text-white">Verify sheet</button></form> : null}
      <DailyClosingReport sheet={sheet} lines={lines as never} movements={movements as never} warehouseName={currentWarehouse} preparedBy={preparedBy} checkedBy={checkedBy} showSerialDetails={!isEmployee && sheet.include_serial_details} />
    </> : <section className="rounded-xl border bg-[var(--surface)] p-10 text-center text-[var(--muted-text)]">{isEmployee ? "Generate today's sheet to preview confirmed Stock In and Stock Out movements for your assigned warehouse." : "Select a date and generate a draft to preview the Daily Inventory Update & Closing Sheet."}</section>}
  </DashboardShell>;
}

