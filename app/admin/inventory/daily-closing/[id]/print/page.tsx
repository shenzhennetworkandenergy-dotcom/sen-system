import { connection } from "next/server";
import { redirect } from "next/navigation";
import { DailyClosingReport } from "@/components/inventory/DailyClosingReport";
import { DailyClosingSystemPrintButton } from "@/components/inventory/DailyClosingPrintButton";
import { requirePermission } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canAccessDailyClosingSheet } from "@/lib/inventory/daily-closing";
import { getEmployeeDailyClosingAssignment } from "@/lib/inventory/daily-closing-access";

export const dynamic = "force-dynamic";

export default async function DailyClosingPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { profile } = await requirePermission("inventory.daily_closing_print");
  const { id } = await params;
  const db = createSupabaseAdminClient();
  const isEmployee = profile.role === "employee";
  const employeeAssignment = isEmployee ? await getEmployeeDailyClosingAssignment(profile.id) : null;
  if (isEmployee && !employeeAssignment) redirect(`/admin/inventory/daily-closing?error=${encodeURIComponent("An administrator must assign your active primary warehouse before you can print a daily closing sheet.")}`);
  let sheetQuery = db.from("inventory_daily_closing_sheets").select("id,reference,inventory_date,warehouse_id,status,closing_status,prepared_by,checked_by,prepared_at,finalized_at,closing_time,physical_count,variance,remarks,revision,include_serial_details").eq("id", id);
  if (isEmployee && employeeAssignment) sheetQuery = sheetQuery.eq("inventory_date", employeeAssignment.inventoryDate).eq("warehouse_id", employeeAssignment.warehouseId);
  const { data: sheet, error: sheetError } = await sheetQuery.maybeSingle();
  if (sheetError || !sheet) {
    if (isEmployee) redirect(`/admin/inventory/daily-closing?error=${encodeURIComponent("Employees can only print today's daily closing sheet for their assigned warehouse.")}`);
    throw new Error("Daily closing sheet not found.");
  }
  if (!canAccessDailyClosingSheet(profile.role, { inventoryDate: sheet.inventory_date, warehouseId: sheet.warehouse_id }, employeeAssignment)) redirect(`/admin/inventory/daily-closing?error=${encodeURIComponent("Employees can only print today's daily closing sheet for their assigned warehouse.")}`);
  let linesQuery = db.from("inventory_daily_closing_lines").select("id,product_name,sku,model,opening_qty,stock_in,stock_out,closing_qty,unit,remarks,reconciliation_needed").eq("sheet_id", sheet.id).order("product_name");
  if (isEmployee) linesQuery = linesQuery.or("stock_in.gt.0,stock_out.gt.0");
  const movementsQuery = isEmployee
    ? db.from("inventory_daily_closing_movement_details").select("reference,movement_type,quantity_delta,transaction_at,product_name,sku,source_warehouse_id,destination_warehouse_id").eq("sheet_id", sheet.id).eq("warehouse_id", employeeAssignment!.warehouseId).order("transaction_at", { ascending: true })
    : db.from("inventory_daily_closing_movement_details").select("reference,movement_type,quantity_delta,transaction_at,product_name,sku,sen_serial,manufacturer_serial,source_warehouse_id,destination_warehouse_id").eq("sheet_id", sheet.id).order("transaction_at", { ascending: true });
  const [linesResult, movementsResult, warehouseResult, preparedResult, checkedResult] = await Promise.all([
    linesQuery,
    movementsQuery,
    sheet.warehouse_id ? db.from("warehouses").select("name,code").eq("id", sheet.warehouse_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    db.from("profiles").select("full_name,email").eq("id", sheet.prepared_by).maybeSingle(),
    sheet.checked_by ? db.from("profiles").select("full_name,email").eq("id", sheet.checked_by).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (linesResult.error || movementsResult.error || warehouseResult.error || preparedResult.error || checkedResult.error) throw new Error("Unable to load the print snapshot.");
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "inventory.daily_closing.printed", module: "inventory", entityType: "daily_closing_sheet", entityId: sheet.id, description: `Daily inventory closing sheet ${sheet.reference} opened for printing.`, metadata: { reference: sheet.reference, inventory_date: sheet.inventory_date, warehouse_id: sheet.warehouse_id } });
  const preparedBy = preparedResult.data?.full_name ?? preparedResult.data?.email ?? "Not provided";
  const checkedBy = checkedResult.data?.full_name ?? checkedResult.data?.email ?? "Not provided";
  return <main className="daily-closing-print-page min-h-screen bg-white p-3 text-slate-900 sm:p-6"><div className="mb-4 flex justify-end print:hidden"><DailyClosingSystemPrintButton /></div><DailyClosingReport sheet={sheet} lines={linesResult.data ?? []} movements={movementsResult.data ?? []} warehouseName={warehouseResult.data ? `${warehouseResult.data.name} (${warehouseResult.data.code})` : "All warehouses"} preparedBy={preparedBy} checkedBy={checkedBy} showSerialDetails={!isEmployee && sheet.include_serial_details} /></main>;
}

