"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/permissions";
import type { AccountRole } from "@/lib/constants/routes";
import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getDailyClosingSourceData } from "@/lib/inventory/daily-closing-data";
import { getEmployeeDailyClosingAssignment } from "@/lib/inventory/daily-closing-access";
import { canUseDailyClosingAdminWorkflow, constrainDailyClosingGeneration } from "@/lib/inventory/daily-closing";

const path = "/admin/inventory/daily-closing";
const historyPath = `${path}/history`;

function text(form: FormData, key: string, max = 1000) {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

function optionalNumber(form: FormData, key: string) {
  const value = text(form, key, 40);
  if (!value) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${key.replaceAll("_", " ")} must be a non-negative number.`);
  return number;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Inventory date is invalid.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error("Inventory date is invalid.");
  return value;
}

function optionalUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function referenceFor(date: string) {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `INV-CLS-${date.replaceAll("-", "")}-${suffix}`;
}

async function persistSnapshot(profile: { id: string; role: AccountRole }, options: { date: string; warehouseId: string | null; includeAllProducts: boolean; includeSerialDetails: boolean; movementOnly?: boolean; rootSheetId?: string | null }) {
  const source = await getDailyClosingSourceData({ inventoryDate: options.date, warehouseId: options.warehouseId, includeAllProducts: options.includeAllProducts, includeSerialDetails: options.includeSerialDetails, movementOnly: options.movementOnly });
  const db = createSupabaseAdminClient();
  const rootSheetId = options.rootSheetId ?? null;
  let revision = 1;
  if (rootSheetId) {
    const { data: previous, error: previousError } = await db.from("inventory_daily_closing_sheets").select("revision").eq("root_sheet_id", rootSheetId).order("revision", { ascending: false }).limit(1).maybeSingle();
    if (previousError) throw previousError;
    revision = Number(previous?.revision ?? 1) + 1;
  }
  const aggregate = source.aggregate;
  const { data: sheet, error: sheetError } = await db.from("inventory_daily_closing_sheets").insert({
    root_sheet_id: rootSheetId,
    reference: referenceFor(options.date),
    inventory_date: options.date,
    warehouse_id: options.warehouseId,
    include_all_products: options.includeAllProducts,
    include_serial_details: options.includeSerialDetails,
    status: "draft",
    closing_status: aggregate.summary.reconciliationNeeded ? "reconciliation_required" : "pending_review",
    prepared_by: profile.id,
    revision,
  }).select("id,reference,revision").single();
  if (sheetError || !sheet) throw sheetError ?? new Error("Unable to create the daily closing sheet.");

  const linePayload = aggregate.rows.map((row) => ({
    sheet_id: sheet.id,
    product_id: row.productId,
    variation_id: row.variationId,
    product_name: row.productName,
    sku: row.sku,
    model: row.model,
    opening_qty: row.openingQty,
    stock_in: row.stockIn,
    stock_out: row.stockOut,
    closing_qty: row.closingQty,
    system_closing_qty: row.systemClosingQty,
    unit: row.unit,
    remarks: row.remarks,
    reconciliation_needed: row.reconciliationNeeded,
  }));
  const { data: lines, error: linesError } = linePayload.length ? await db.from("inventory_daily_closing_lines").insert(linePayload).select("id,product_id,variation_id") : { data: [], error: null };
  if (linesError) throw linesError;
  const lineMap = new Map((lines ?? []).map((line) => [`${line.product_id}:${line.variation_id ?? "base"}`, line.id]));
  const movementPayload = aggregate.movementDetails.flatMap((movement) => {
    const base = {
      sheet_id: sheet.id,
      line_id: lineMap.get(`${movement.productId}:${movement.variationId ?? "base"}`) ?? null,
      movement_id: movement.id,
      movement_item_id: movement.itemId,
      reference: movement.reference,
      movement_type: movement.movementType,
      quantity_delta: movement.quantityDelta,
      source_warehouse_id: movement.sourceWarehouseId ?? null,
      destination_warehouse_id: movement.destinationWarehouseId ?? null,
      warehouse_id: movement.warehouseId,
      transaction_at: movement.transactionAt,
      product_name: movement.productName,
      sku: movement.sku,
    };
    if (!options.includeSerialDetails || !movement.serialDetails?.length) return [base];
    return movement.serialDetails.map((serial) => ({ ...base, serial_number_id: serial.serialNumberId, sen_serial: serial.senSerial, manufacturer_serial: serial.manufacturerSerial, source_warehouse_id: serial.sourceWarehouseId ?? base.source_warehouse_id, destination_warehouse_id: serial.destinationWarehouseId ?? base.destination_warehouse_id }));
  });
  if (movementPayload.length) {
    const { error: movementError } = await db.from("inventory_daily_closing_movement_details").insert(movementPayload);
    if (movementError) throw movementError;
  }
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "inventory.daily_closing.generated", module: "inventory", entityType: "daily_closing_sheet", entityId: sheet.id, description: `Daily inventory closing sheet ${sheet.reference} generated.`, newValues: { reference: sheet.reference, inventory_date: options.date, warehouse_id: options.warehouseId, revision } });
  return sheet;
}

function formOptions(form: FormData) {
  const date = validDate(text(form, "inventory_date", 20));
  const warehouseId = optionalUuid(text(form, "warehouse_id", 80));
  return { date, warehouseId, includeAllProducts: form.get("include_all_products") === "on", includeSerialDetails: form.get("include_serial_details") === "on" };
}

export async function generateDailyClosingAction(form: FormData) {
  const { profile } = await requirePermission("inventory.daily_closing_generate");
  let sheet: { id: string };
  try {
    const options = profile.role === "employee"
      ? constrainDailyClosingGeneration(
        profile.role,
        { date: "", warehouseId: null, includeAllProducts: false, includeSerialDetails: false },
        await getEmployeeDailyClosingAssignment(profile.id),
      )
      : formOptions(form);
    sheet = await persistSnapshot(profile, options);
  } catch (error) {
    console.error("Daily closing generation failed", error);
    redirect(`${path}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to generate the daily closing sheet.")}`);
  }
  revalidatePath(path);
  redirect(`${path}?sheet_id=${encodeURIComponent(sheet.id)}&success=${encodeURIComponent("Daily inventory closing draft generated.")}`);
}

export async function createDailyClosingRevisionAction(form: FormData) {
  const { profile } = await requirePermission("inventory.daily_closing_generate");
  if (!canUseDailyClosingAdminWorkflow(profile.role)) redirect(`${path}?error=${encodeURIComponent("Employees can only generate, view, and print today's assigned-warehouse sheet.")}`);
  const sourceId = text(form, "sheet_id", 80);
  const db = createSupabaseAdminClient();
  const { data: source, error } = await db.from("inventory_daily_closing_sheets").select("id,inventory_date,warehouse_id,include_all_products,include_serial_details,status,root_sheet_id").eq("id", sourceId).maybeSingle();
  if (error || !source) redirect(`${path}?error=${encodeURIComponent("Daily closing sheet not found.")}`);
  try {
    const rootSheetId = source.root_sheet_id ?? source.id;
    const sheet = await persistSnapshot(profile, { date: source.inventory_date, warehouseId: source.warehouse_id, includeAllProducts: source.include_all_products, includeSerialDetails: source.include_serial_details, rootSheetId });
    revalidatePath(path); revalidatePath(historyPath);
    redirect(`${path}?sheet_id=${encodeURIComponent(sheet.id)}&success=${encodeURIComponent("A new daily closing revision was generated.")}`);
  } catch (revisionError) {
    console.error("Daily closing revision failed", revisionError);
    redirect(`${path}?sheet_id=${encodeURIComponent(source.id)}&error=${encodeURIComponent("Unable to generate a revision.")}`);
  }
}

export async function updateDailyClosingDraftAction(form: FormData) {
  const { profile } = await requirePermission("inventory.daily_closing_generate");
  if (!canUseDailyClosingAdminWorkflow(profile.role)) redirect(`${path}?error=${encodeURIComponent("Employees can only generate, view, and print today's assigned-warehouse sheet.")}`);
  const sheetId = text(form, "sheet_id", 80);
  let physicalCount: number | null;
  try { physicalCount = optionalNumber(form, "physical_count"); } catch (error) { redirect(`${path}?sheet_id=${encodeURIComponent(sheetId)}&error=${encodeURIComponent(error instanceof Error ? error.message : "Physical count is invalid.")}`); }
  const remarks = text(form, "remarks", 4000);
  const db = createSupabaseAdminClient();
  const { data: sheet, error: loadError } = await db.from("inventory_daily_closing_sheets").select("id,status,closing_status,reference").eq("id", sheetId).maybeSingle();
  if (loadError || !sheet) redirect(`${path}?error=${encodeURIComponent("Daily closing sheet not found.")}`);
  if (sheet.status !== "draft") redirect(`${path}?sheet_id=${encodeURIComponent(sheetId)}&error=${encodeURIComponent("Finalized sheets are immutable. Create a revision to change them.")}`);
  const { data: lines, error: linesError } = await db.from("inventory_daily_closing_lines").select("closing_qty").eq("sheet_id", sheetId);
  if (linesError) redirect(`${path}?sheet_id=${encodeURIComponent(sheetId)}&error=${encodeURIComponent("Unable to calculate the daily closing variance.")}`);
  const systemTotal = (lines ?? []).reduce((sum, line) => sum + Number(line.closing_qty ?? 0), 0);
  const variance = physicalCount === null ? null : physicalCount - systemTotal;
  const closingStatus = variance !== null && Math.abs(variance) > 0.0001 ? "discrepancy_found" : sheet.closing_status;
  const { error: updateError } = await db.from("inventory_daily_closing_sheets").update({ physical_count: physicalCount, variance, remarks: remarks || null, closing_status: closingStatus, updated_at: new Date().toISOString() }).eq("id", sheetId).eq("status", "draft");
  if (updateError) redirect(`${path}?sheet_id=${encodeURIComponent(sheetId)}&error=${encodeURIComponent("Unable to save the draft details.")}`);
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "inventory.daily_closing.draft_updated", module: "inventory", entityType: "daily_closing_sheet", entityId: sheetId, description: `Daily inventory closing draft ${sheet.reference} updated.`, newValues: { physical_count: physicalCount, variance, remarks } });
  revalidatePath(path); redirect(`${path}?sheet_id=${encodeURIComponent(sheetId)}&success=${encodeURIComponent("Draft details saved.")}`);
}

export async function finalizeDailyClosingAction(form: FormData) {
  const { profile } = await requirePermission("inventory.daily_closing_finalize");
  if (!canUseDailyClosingAdminWorkflow(profile.role)) redirect(`${path}?error=${encodeURIComponent("Employees can only generate, view, and print today's assigned-warehouse sheet.")}`);
  const sheetId = text(form, "sheet_id", 80);
  const db = createSupabaseAdminClient();
  const { data: sheet, error: loadError } = await db.from("inventory_daily_closing_sheets").select("id,status,reference,closing_status,physical_count,variance").eq("id", sheetId).maybeSingle();
  if (loadError || !sheet) redirect(`${path}?error=${encodeURIComponent("Daily closing sheet not found.")}`);
  if (sheet.status !== "draft") redirect(`${path}?sheet_id=${encodeURIComponent(sheetId)}&error=${encodeURIComponent("This sheet has already been finalized.")}`);
  const { error: updateError } = await db.from("inventory_daily_closing_sheets").update({ status: "finalized", finalized_at: new Date().toISOString(), closing_time: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sheetId).eq("status", "draft");
  if (updateError) redirect(`${path}?sheet_id=${encodeURIComponent(sheetId)}&error=${encodeURIComponent("Unable to finalize the daily closing sheet.")}`);
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "inventory.daily_closing.finalized", module: "inventory", entityType: "daily_closing_sheet", entityId: sheetId, description: `Daily inventory closing sheet ${sheet.reference} finalized.`, newValues: { status: "finalized", physical_count: sheet.physical_count, variance: sheet.variance } });
  revalidatePath(path); revalidatePath(historyPath); redirect(`${path}?sheet_id=${encodeURIComponent(sheetId)}&success=${encodeURIComponent("Daily inventory closing sheet finalized.")}`);
}

export async function verifyDailyClosingAction(form: FormData) {
  const { profile } = await requirePermission("inventory.daily_closing_verify");
  if (!canUseDailyClosingAdminWorkflow(profile.role)) redirect(`${path}?error=${encodeURIComponent("Employees can only generate, view, and print today's assigned-warehouse sheet.")}`);
  const sheetId = text(form, "sheet_id", 80);
  const db = createSupabaseAdminClient();
  const { data: sheet, error: loadError } = await db.from("inventory_daily_closing_sheets").select("id,status,reference,variance").eq("id", sheetId).maybeSingle();
  if (loadError || !sheet) redirect(`${path}?error=${encodeURIComponent("Daily closing sheet not found.")}`);
  if (sheet.status !== "finalized") redirect(`${path}?sheet_id=${encodeURIComponent(sheetId)}&error=${encodeURIComponent("Only finalized sheets can be verified.")}`);
  const closingStatus = sheet.variance !== null && Math.abs(Number(sheet.variance)) > 0.0001 ? "discrepancy_found" : "verified";
  const { error: updateError } = await db.from("inventory_daily_closing_sheets").update({ status: "verified", closing_status: closingStatus, checked_by: profile.id, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sheetId).eq("status", "finalized");
  if (updateError) redirect(`${path}?sheet_id=${encodeURIComponent(sheetId)}&error=${encodeURIComponent("Unable to verify the daily closing sheet.")}`);
  await writeAuditLog({ actorId: profile.id, actorRole: profile.role, action: "inventory.daily_closing.verified", module: "inventory", entityType: "daily_closing_sheet", entityId: sheetId, description: `Daily inventory closing sheet ${sheet.reference} verified.`, newValues: { status: "verified", closing_status: closingStatus } });
  revalidatePath(path); revalidatePath(historyPath); redirect(`${path}?sheet_id=${encodeURIComponent(sheetId)}&success=${encodeURIComponent("Daily inventory closing sheet verified.")}`);
}

