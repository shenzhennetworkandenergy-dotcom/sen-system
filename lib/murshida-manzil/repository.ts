import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OwnerRecord, UnitRecord } from "@/lib/murshida-manzil/master-data";
import type { TenantInput } from "@/lib/murshida-manzil/tenant-rent";

type Db = ReturnType<typeof createSupabaseAdminClient> & { schema?: (name: string) => Db };

function db() {
  const client = createSupabaseAdminClient() as Db;
  return typeof client.schema === "function" ? client.schema("murshida_manzil") : client;
}

export async function listOwners() {
  const { data, error } = await db().from("owners").select("id,name,phone_number,ownership_percentage,is_active").order("created_at");
  if (error) throw new Error("Unable to load Murshida Manzil owners.");
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    phone_number: row.phone_number ? String(row.phone_number) : null,
    ownership_percentage: Number(row.ownership_percentage),
    is_active: Boolean(row.is_active),
  })) as OwnerRecord[];
}

export async function listUnits() {
  const { data, error } = await db().from("units").select("id,unit_code,is_active").order("unit_code");
  if (error) throw new Error("Unable to load Murshida Manzil units.");
  return (data ?? []) as UnitRecord[];
}

export async function insertOwner(input: { name: string; phone_number: string | null; ownership_percentage: number; is_active: boolean }) {
  const { data, error } = await db().from("owners").insert(input).select("id").single();
  if (error || !data) throw new Error(error?.message || "Unable to create owner.");
  return data.id as string;
}

export async function updateOwner(id: string, input: { name: string; phone_number: string | null; ownership_percentage: number; is_active: boolean }) {
  const { error } = await db().from("owners").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message || "Unable to update owner.");
}

export async function deleteOwner(id: string) {
  const { data: references, error: referenceError } = await db().from("owner_allocations").select("id").eq("owner_id", id).limit(1);
  if (referenceError) throw new Error(referenceError.message || "Unable to check owner history.");
  if ((references ?? []).length > 0) {
    const { error } = await db().from("owners").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message || "Unable to archive owner.");
    return "archived" as const;
  }
  const { error } = await db().from("owners").delete().eq("id", id);
  if (error) throw new Error(error.message || "Unable to delete owner.");
  return "deleted" as const;
}

export async function insertUnit(input: { unit_code: string; is_active: boolean }) {
  const { data, error } = await db().from("units").insert(input).select("id").single();
  if (error || !data) throw new Error(error?.message || "Unable to create unit.");
  return data.id as string;
}

export async function updateUnit(id: string, input: { unit_code: string; is_active: boolean }) {
  const { error } = await db().from("units").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message || "Unable to update unit.");
}

export async function deleteUnit(id: string) {
  const checks = await Promise.all([db().from("tenants").select("id").eq("unit_id", id).limit(1), db().from("rent_transactions").select("id").eq("unit_id", id).limit(1), db().from("advance_payments").select("id").eq("unit_id", id).limit(1)]);
  if (checks.some((result) => result.error)) throw new Error("Unable to check unit history.");
  if (checks.some((result) => (result.data ?? []).length > 0)) { const { error } = await db().from("units").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id); if (error) throw new Error("Unable to archive unit."); return "archived" as const; }
  const { error } = await db().from("units").delete().eq("id", id); if (error) throw new Error("Unable to delete unit."); return "deleted" as const;
}

export async function setUnitActive(id: string, isActive: boolean) { const { error } = await db().from("units").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id); if (error) throw new Error("Unable to update unit status."); }

export async function updateTenantUnit(tenantId: string, unitId: string | null) {
  const { error } = await db().from("tenants").update({ unit_id: unitId }).eq("id", tenantId);
  if (error) throw new Error(error.message || "Unable to update tenant unit.");
}

export async function listTenants() {
  const { data, error } = await db().from("tenants").select("id,name,phone_number,unit_id,unit_description,monthly_rent,initial_advance_balance,default_monthly_advance_adjustment,is_active,units:unit_id(unit_code,is_active)").order("name");
  if (error) throw new Error("Unable to load Murshida Manzil tenants.");
  return data ?? [];
}

export async function insertTenant(input: TenantInput) {
  const { data, error } = await db().from("tenants").insert({ name: input.name, phone_number: input.phoneNumber ?? null, unit_id: input.unitId, unit_description: input.unitDescription, monthly_rent: input.monthlyRent, is_active: input.isActive ?? true }).select("id").single();
  if (error || !data) throw new Error(error?.message || "Unable to create tenant.");
  return data.id as string;
}

export async function updateTenant(id: string, input: TenantInput) {
  const { error } = await db().from("tenants").update({ name: input.name, phone_number: input.phoneNumber ?? null, unit_id: input.unitId, unit_description: input.unitDescription, monthly_rent: input.monthlyRent, is_active: input.isActive ?? true, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message || "Unable to update tenant.");
}

export async function insertRentTransaction(input: Record<string, unknown>) {
  const { data, error } = await db().from("rent_transactions").insert(input).select("id").single();
  if (error || !data) throw new Error(error?.message || "Unable to create rent transaction.");
  return data.id as string;
}

export async function insertAdvancePayment(input: Record<string, unknown>) {
  const { data, error } = await db().from("advance_payments").insert(input).select("id").single();
  if (error || !data) throw new Error(error?.message || "Unable to create advance payment.");
  return data.id as string;
}

export async function getTenantUnit(tenantId: string) {
  const { data, error } = await db().from("tenants").select("id,name,phone_number,unit_id,unit_description,monthly_rent,default_monthly_advance_adjustment,is_active,units:unit_id(unit_code,is_active)").eq("id", tenantId).maybeSingle();
  if (error || !data) throw new Error("Tenant was not found.");
  const unit = data.units as { unit_code?: string; is_active?: boolean } | null;
  if (!data.is_active || !data.unit_id || !unit?.is_active || !unit.unit_code) throw new Error("Tenant must have an active linked unit.");
  return { tenantId: data.id as string, tenantName: String(data.name ?? ""), phoneNumber: data.phone_number ? String(data.phone_number) : null, unitId: data.unit_id as string, unitCode: unit.unit_code, unitDescription: String(data.unit_description ?? unit.unit_code), monthlyRent: Number(data.monthly_rent), defaultMonthlyAdvanceAdjustment: Number(data.default_monthly_advance_adjustment ?? 0) };
}

export async function deleteRentTransaction(id: string) {
  const { error } = await db().from("rent_transactions").delete().eq("id", id);
  if (error) throw new Error(error.message || "Unable to roll back rent transaction.");
}

export async function updateTenantDefaultAdvanceAdjustment(id: string, value: number) {
  const { error } = await db().from("tenants").update({ default_monthly_advance_adjustment: value, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message || "Unable to save the default monthly advance adjustment.");
}

export async function getTenantAdvanceState(tenantId: string) {
  const [tenantResult, advanceResult, rentResult] = await Promise.all([
    db().from("tenants").select("default_monthly_advance_adjustment").eq("id", tenantId).maybeSingle(),
    db().from("advance_payments").select("amount").eq("tenant_id", tenantId),
    db().from("rent_transactions").select("advance_adjusted").eq("tenant_id", tenantId),
  ]);
  if (tenantResult.error || advanceResult.error || rentResult.error || !tenantResult.data) throw new Error("Unable to load tenant advance balance.");
  const totalReceived = (advanceResult.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const totalAdjusted = (rentResult.data ?? []).reduce((sum, row) => sum + Number(row.advance_adjusted ?? 0), 0);
  return { totalReceived, totalAdjusted, availableBalance: Math.max(0, totalReceived - totalAdjusted), defaultMonthlyAdvanceAdjustment: Number(tenantResult.data?.default_monthly_advance_adjustment ?? 0) };
}

export async function deleteTenant(id: string) {
  const checks = await Promise.all([db().from("rent_transactions").select("id").eq("tenant_id", id).limit(1), db().from("advance_payments").select("id").eq("tenant_id", id).limit(1)]);
  if (checks.some((result) => result.error)) throw new Error("Unable to check tenant history.");
  if (checks.some((result) => (result.data ?? []).length > 0)) { const { error } = await db().from("tenants").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id); if (error) throw new Error("Unable to archive tenant."); return "archived" as const; }
  const { error } = await db().from("tenants").delete().eq("id", id); if (error) throw new Error("Unable to delete tenant."); return "deleted" as const;
}

export async function setTenantActive(id: string, isActive: boolean) {
  if (isActive) {
    const { data: tenant } = await db().from("tenants").select("unit_id,units:unit_id(is_active)").eq("id", id).maybeSingle();
    if (tenant?.unit_id) {
      const unit = Array.isArray(tenant.units) ? tenant.units[0] : tenant.units;
      if (!unit?.is_active) throw new Error("Tenant cannot be restored while the previous unit is inactive. Restore or select an active unit first.");
      const { data: conflict } = await db().from("tenants").select("id").eq("unit_id", tenant.unit_id).eq("is_active", true).neq("id", id).limit(1);
      if ((conflict ?? []).length) throw new Error("Tenant cannot be restored while the previous unit is occupied by another active tenant.");
    }
  }
  const { error } = await db().from("tenants").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id); if (error) throw new Error("Unable to update tenant status.");
}

export async function listActiveOwners() {
  const { data, error } = await db().from("owners").select("id,ownership_percentage").eq("is_active", true).order("created_at");
  if (error) throw new Error("Unable to load active Murshida Manzil owners.");
  return (data ?? []) as { id: string; ownership_percentage: number }[];
}

export async function insertExpense(input: Record<string, unknown>) {
  const { data, error } = await db().from("expenses").insert(input).select("id").single();
  if (error || !data) throw new Error(error?.message || "Unable to create expense.");
  return data.id as string;
}

export async function listExpenses() {
  const { data, error } = await db().from("expenses").select("id,expense_date,description,amount,category,paid_to,payment_method,notes,voucher_number,owner_allocation_mode").order("expense_date", { ascending: false });
  if (error) throw new Error("Unable to load Murshida Manzil expenses.");
  return data ?? [];
}

/** A single bulk INSERT is atomic in Postgres: no partial owner rows survive a failure. */
export async function insertOwnerAllocations(rows: Record<string, unknown>[]) {
  if (!rows.length) throw new Error("At least one owner allocation is required.");
  const { error } = await db().from("owner_allocations").insert(rows);
  if (error) throw new Error(error.message || "Unable to persist owner allocations.");
}

export async function listOwnerAllocations() {
  const { data, error } = await db().from("owner_allocations").select("id,owner_id,source_type,source_id,ownership_percentage_snapshot,allocated_amount").order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load owner allocations.");
  return data ?? [];
}

export async function getRentTransaction(id: string) {
  const { data, error } = await db().from("rent_transactions").select("id,money_receipt_number,rent_receipt_number,rent_month,rent_year,monthly_rent,actual_money_received,advance_adjusted,total_rent_settled,advance_balance_before,advance_balance_after,payment_date,payment_method,notes,tenant_id,unit_code_snapshot,unit_description_snapshot,tenants:tenant_id(name,phone_number)").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("Rent transaction was not found.");
  const tenant = data.tenants as { name?: string; phone_number?: string | null } | null;
  return { ...data, tenantName: tenant?.name ?? "", tenantPhone: tenant?.phone_number ?? null, receiptNumber: data.money_receipt_number, rentReceiptNumber: data.rent_receipt_number };
}

export async function getAdvancePayment(id: string) {
  const { data, error } = await db().from("advance_payments").select("id,amount,default_monthly_advance_adjustment,payment_date,tenant_id,unit_code_snapshot,unit_description_snapshot,tenants:tenant_id(name,phone_number)").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("Advance payment was not found.");
  const tenant = data.tenants as { name?: string; phone_number?: string | null } | null;
  return { ...data, tenantName: tenant?.name ?? "", tenantPhone: tenant?.phone_number ?? null };
}

export async function recordExpenseWithAllocations(input: Record<string, unknown>, ownerAllocationMode: "DISTRIBUTE_TO_OWNERS" | "DO_NOT_DISTRIBUTE") {
  const { data, error } = await db().rpc("record_expense_with_allocations", {
    requested_expense: input,
    requested_owner_allocation_mode: ownerAllocationMode,
  });
  if (error || !data) throw new Error(error?.message || "Unable to record Murshida Manzil expense.");
  return String(data);
}

export async function hasOwnerAllocationsForSource(sourceType: "rent_income" | "expense", sourceId: string) {
  const { data, error } = await db().from("owner_allocations").select("id").eq("source_type", sourceType).eq("source_id", sourceId).limit(1);
  if (error) throw new Error(error.message || "Unable to check existing owner allocations.");
  return (data ?? []).length > 0;
}

export async function listOwnerRentAccountOwners() {
  const [ownersResult, allocationsResult] = await Promise.all([
    db().from("owners").select("id,name,phone_number,ownership_percentage,is_active").order("name"),
    db().from("owner_allocations").select("owner_id").eq("source_type", "rent_income"),
  ]);
  if (ownersResult.error || allocationsResult.error) throw new Error("Unable to load owner rent account owners.");
  const historicalIds = new Set((allocationsResult.data ?? []).map((row) => String(row.owner_id)));
  return (ownersResult.data ?? []).filter((row) => Boolean(row.is_active) || historicalIds.has(String(row.id))).map((row) => ({
    id: String(row.id), name: String(row.name), phone_number: row.phone_number ? String(row.phone_number) : null,
    ownership_percentage: Number(row.ownership_percentage), is_active: Boolean(row.is_active),
  }));
}

export async function getExpense(id: string) {
  const { data, error } = await db().from("expenses").select("id,expense_date,description,amount,category,paid_to,payment_method,notes,voucher_number,owner_allocation_mode").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("Expense was not found.");
  return data;
}

export async function getOwnerIncomeReport(from?: string, to?: string) {
  let allocationQuery = db().from("owner_allocations").select("id,owner_id,source_type,source_id,ownership_percentage_snapshot,allocated_amount,created_at,owners:owner_id(name)").eq("source_type", "rent_income").order("created_at");
  if (from) allocationQuery = allocationQuery.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) allocationQuery = allocationQuery.lte("created_at", `${to}T23:59:59.999Z`);
  const { data: allocations, error } = await allocationQuery;
  if (error) throw new Error("Unable to load owner income report.");
  let rentQuery = db().from("rent_transactions").select("payment_date,total_rent_settled");
  if (from) rentQuery = rentQuery.gte("payment_date", from);
  if (to) rentQuery = rentQuery.lte("payment_date", to);
  const { data: rents, error: rentError } = await rentQuery;
  if (rentError) throw new Error("Unable to load rent income report.");
  const rows = (allocations ?? []).map((row) => ({ ...row, owner_name: (row.owners as { name?: string } | null)?.name ?? "" }));
  let expenseQuery = db().from("expenses").select("expense_date,amount");
  if (from) expenseQuery = expenseQuery.gte("expense_date", from);
  if (to) expenseQuery = expenseQuery.lte("expense_date", to);
  const { data: expenses, error: expenseError } = await expenseQuery;
  if (expenseError) throw new Error("Unable to load owner income expenses.");
  return { allocations: rows, rents: rents ?? [], expenses: expenses ?? [], eligibleRentIncome: (rents ?? []).reduce((sum, row) => sum + Number(row.total_rent_settled ?? 0), 0) };
}

export async function getOwnerRentAccountData(ownerId: string) {
  const [ownerResult, allocationResult] = await Promise.all([
    db().from("owners").select("id,name,phone_number,ownership_percentage,is_active").eq("id", ownerId).maybeSingle(),
    db().from("owner_allocations").select("owner_id,source_type,source_id,ownership_percentage_snapshot,allocated_amount,created_at").eq("owner_id", ownerId).in("source_type", ["rent_income", "expense"]).order("created_at"),
  ]);
  if (ownerResult.error || !ownerResult.data || allocationResult.error) throw new Error("Unable to load owner rent account.");
  const allocationRows = allocationResult.data ?? [];
  const rentIds = allocationRows.filter((row) => row.source_type === "rent_income").map((row) => String(row.source_id));
  const expenseIds = allocationRows.filter((row) => row.source_type === "expense").map((row) => String(row.source_id));
  const rentResult = rentIds.length ? await db().from("rent_transactions").select("id,payment_date,rent_month,rent_year,total_rent_settled,unit_code_snapshot,unit_description_snapshot,tenants:tenant_id(name,phone_number)").in("id", rentIds) : { data: [], error: null };
  if (rentResult.error) throw new Error("Unable to load owner rent transactions.");
  const expenseResult = expenseIds.length ? await db().from("expenses").select("id,expense_date,description,amount,category,paid_to,voucher_number").in("id", expenseIds) : { data: [], error: null };
  if (expenseResult.error) throw new Error("Unable to load owner expense allocations.");
  const rents = (rentResult.data ?? []).map((row) => ({ ...row, tenant_name: (row.tenants as { name?: string } | null)?.name ?? "", tenant_phone: (row.tenants as { phone_number?: string | null } | null)?.phone_number ?? null }));
  return { owner: { id: String(ownerResult.data.id), name: String(ownerResult.data.name), phone_number: ownerResult.data.phone_number ? String(ownerResult.data.phone_number) : null, ownership_percentage: Number(ownerResult.data.ownership_percentage), is_active: Boolean(ownerResult.data.is_active) }, allocations: allocationRows, rents, expenses: expenseResult.data ?? [] };
}

export async function listRentReportRows() {
  const { data, error } = await db().from("rent_transactions").select("id,rent_receipt_number,payment_date,payment_method,monthly_rent,tenant_id,unit_id,unit_code_snapshot,unit_description_snapshot,rent_month,rent_year,total_rent_settled,actual_money_received,advance_adjusted,advance_balance_before,advance_balance_after,tenants:tenant_id(name,phone_number)").order("payment_date", { ascending: false });
  if (error) throw new Error("Unable to load rent report.");
  return (data ?? []).map((row) => ({ ...row, tenant_name: (row.tenants as { name?: string } | null)?.name ?? "", tenant_phone: (row.tenants as { phone_number?: string | null } | null)?.phone_number ?? null }));
}

export async function listAdvanceReportRows() {
  const { data, error } = await db().from("advance_payments").select("id,payment_date,tenant_id,unit_id,unit_code_snapshot,unit_description_snapshot,amount,default_monthly_advance_adjustment,tenants:tenant_id(name,phone_number)").order("payment_date", { ascending: false });
  if (error) throw new Error("Unable to load advance report.");
  return (data ?? []).map((row) => ({ ...row, tenant_name: (row.tenants as { name?: string } | null)?.name ?? "", tenant_phone: (row.tenants as { phone_number?: string | null } | null)?.phone_number ?? null }));
}

export async function listExpenseReportRows() {
  const { data, error } = await db().from("expenses").select("id,expense_date,description,amount,category,paid_to,payment_method,notes,voucher_number,owner_allocation_mode").order("expense_date", { ascending: false });
  if (error) throw new Error("Unable to load expense report.");
  return data ?? [];
}

export async function listAllocationReportRows() {
  const { data, error } = await db().from("owner_allocations").select("id,owner_id,source_type,source_id,ownership_percentage_snapshot,allocated_amount,created_at,owners:owner_id(name)").order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load allocation report.");
  return (data ?? []).map((row) => ({ ...row, owner_name: (row.owners as { name?: string } | null)?.name ?? "" }));
}

export async function listRentHistory() { return listRentReportRows(); }
export async function listAdvanceHistory() { return listAdvanceReportRows(); }
export async function listExpenseHistory() { return listExpenseReportRows(); }
