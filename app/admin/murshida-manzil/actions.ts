"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { validateOwnershipPercentages, validateOwnershipPercentagesForSetup } from "@/lib/murshida-manzil/calculations";
import { normalizeOwnerName, normalizeOwnerPhone, normalizeUnitCode } from "@/lib/murshida-manzil/master-data";
import { deleteOwner, deleteRentTransaction, deleteTenant, deleteUnit, getTenantAdvanceState, getTenantUnit, hasOwnerAllocationsForSource, insertAdvancePayment, insertOwner, insertOwnerAllocations, insertRentTransaction, insertTenant, insertUnit, listActiveOwners, listOwners, recordExpenseWithAllocations, setTenantActive, setUnitActive, updateOwner, updateTenant, updateTenantDefaultAdvanceAdjustment, updateTenantUnit, updateUnit } from "@/lib/murshida-manzil/repository";
import { buildAdvancePayment, buildRentTransaction, validateAdvanceAdjustment, validateTenantInput } from "@/lib/murshida-manzil/tenant-rent";
import { buildExpense, buildOwnerAllocationRows } from "@/lib/murshida-manzil/expense-allocation";
import { persistRentAndAllocations } from "@/lib/murshida-manzil/rent-allocation";

const path = "/admin/murshida-manzil";
const ownerValidationError = (error: unknown): never => {
  const message = error instanceof Error ? error.message : "Owner validation failed.";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
};
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const active = (form: FormData) => form.get("is_active") === "on";
const percentage = (form: FormData) => {
  const value = Number(text(form, "ownership_percentage"));
  if (!Number.isFinite(value) || value <= 0 || value > 100) throw new Error("Invalid ownership percentage.");
  return value;
};
async function validateFinalOwners(next: { id?: string; percentage: number; is_active: boolean }[]) {
  const current = await listOwners();
  const merged = current.filter((owner) => owner.id !== next[0]?.id).map((owner) => ({ id: owner.id, percentage: Number(owner.ownership_percentage), is_active: owner.is_active }));
  const all = [...merged, ...next].filter((owner) => owner.is_active).map((owner) => ({ id: owner.id ?? crypto.randomUUID(), percentage: owner.percentage }));
  validateOwnershipPercentagesForSetup(all);
}

export async function createOwnerAction(form: FormData) {
  await requireProfile(["admin"]);
  const input = { name: normalizeOwnerName(text(form, "name")), phone_number: normalizeOwnerPhone(text(form, "phone_number")), ownership_percentage: percentage(form), is_active: active(form) };
  try {
    await validateFinalOwners([{ percentage: input.ownership_percentage, is_active: input.is_active }]);
  } catch (error) {
    ownerValidationError(error);
  }
  await insertOwner(input);
  revalidatePath(path);
  redirect(path);
}

export async function updateOwnerAction(id: string, form: FormData) {
  await requireProfile(["admin"]);
  const input = { name: normalizeOwnerName(text(form, "name")), phone_number: normalizeOwnerPhone(text(form, "phone_number")), ownership_percentage: percentage(form), is_active: active(form) };
  try {
    await validateFinalOwners([{ id, percentage: input.ownership_percentage, is_active: input.is_active }]);
  } catch (error) {
    ownerValidationError(error);
  }
  await updateOwner(id, input);
  revalidatePath(path);
  redirect(path);
}

export async function deleteOwnerAction(id: string) {
  await requireProfile(["admin"]);
  const result = await deleteOwner(id);
  const message = result === "archived" ? "This owner has historical records and was archived instead of deleted." : "Owner deleted.";
  revalidatePath(path);
  redirect(`${path}?message=${encodeURIComponent(message)}`);
}

export async function createUnitAction(form: FormData) {
  await requireProfile(["admin"]);
  await insertUnit({ unit_code: normalizeUnitCode(text(form, "unit_code")), is_active: active(form) });
  revalidatePath(path);
  redirect(path);
}

export async function updateUnitAction(id: string, form: FormData) {
  await requireProfile(["admin"]);
  await updateUnit(id, { unit_code: normalizeUnitCode(text(form, "unit_code")), is_active: active(form) });
  revalidatePath(path);
  redirect(path);
}

export async function updateTenantUnitAction(tenantId: string, unitId: string | null) {
  await requireProfile(["admin"]);
  await updateTenantUnit(tenantId, unitId);
  revalidatePath(path);
  redirect(path);
}

export async function createTenantAction(form: FormData) {
  await requireProfile(["admin"]);
  const unitId = text(form, "unit_id") || null;
  const unit = unitId ? await getTenantUnitForAssignment(unitId) : null;
  const input = validateTenantInput({ name: text(form, "name"), phoneNumber: text(form, "phone_number") || null, unitId, unitCode: unit?.unitCode ?? "", monthlyRent: Number(text(form, "monthly_rent")), unitDescription: unit?.unitCode ?? "", isActive: active(form) });
  await insertTenant(input);
  revalidatePath(path); redirect(path);
}

export async function updateTenantAction(id: string, form: FormData) {
  await requireProfile(["admin"]);
  const unitId = text(form, "unit_id") || null;
  const unit = unitId ? await getTenantUnitForAssignment(unitId) : null;
  const input = validateTenantInput({ name: text(form, "name"), phoneNumber: text(form, "phone_number") || null, unitId, unitCode: unit?.unitCode ?? "", monthlyRent: Number(text(form, "monthly_rent")), unitDescription: unit?.unitCode ?? "", isActive: active(form) });
  await updateTenant(id, input);
  revalidatePath(path); redirect(path);
}

export async function deleteTenantAction(idOrForm: string | FormData) { await requireProfile(["admin"]); const id = typeof idOrForm === "string" ? idOrForm : text(idOrForm, "id"); const result = await deleteTenant(id); revalidatePath(path); redirect(`${path}?message=${encodeURIComponent(result === "archived" ? "Tenant has historical records and was archived instead of deleted." : "Tenant deleted.")}`); }
export async function setTenantActiveAction(id: string, isActive: boolean) { await requireProfile(["admin"]); try { await setTenantActive(id, isActive); } catch (error) { ownerValidationError(error); } revalidatePath(path); redirect(path); }

export async function deleteUnitAction(idOrForm: string | FormData) { await requireProfile(["admin"]); const id = typeof idOrForm === "string" ? idOrForm : text(idOrForm, "id"); const result = await deleteUnit(id); revalidatePath(path); redirect(`${path}?message=${encodeURIComponent(result === "archived" ? "Unit has historical records and was archived instead of deleted." : "Unit deleted.")}`); }
export async function setUnitActiveAction(id: string, isActive: boolean) { await requireProfile(["admin"]); await setUnitActive(id, isActive); revalidatePath(path); redirect(path); }

async function getTenantUnitForAssignment(unitId: string) {
  const { listUnits } = await import("@/lib/murshida-manzil/repository");
  const unit = (await listUnits()).find((candidate) => candidate.id === unitId && candidate.is_active);
  if (!unit) throw new Error("An active unit is required.");
  return { unitCode: unit.unit_code };
}

export async function createRentTransactionAction(form: FormData) {
  await requireProfile(["admin"]);
  const id = crypto.randomUUID();
  const activeOwners = await listActiveOwners();
  const tenant = await getTenantUnit(text(form, "tenant_id"));
  const advanceState = await getTenantAdvanceState(tenant.tenantId);
  const monthlyRent = Number(text(form, "monthly_rent")) || tenant.monthlyRent;
  const advanceAdjusted = validateAdvanceAdjustment(Number(text(form, "advance_adjusted")), advanceState.availableBalance, monthlyRent);
  const enteredAmount = text(form, "actual_money_received");
  const actualMoneyReceived = enteredAmount ? Number(enteredAmount) : monthlyRent - advanceAdjusted;
  const rentPayload = buildRentTransaction({ tenantId: tenant.tenantId, unitId: tenant.unitId, unitCode: tenant.unitCode, unitDescription: tenant.unitDescription, rentYear: Number(text(form, "rent_year")), rentMonth: Number(text(form, "rent_month")), monthlyRent, actualMoneyReceived, advanceAdjusted, advanceBalanceBefore: advanceState.availableBalance, paymentDate: text(form, "payment_date"), paymentMethod: text(form, "payment_method"), moneyReceiptNumber: `MM-MR-${id}`, rentReceiptNumber: `MM-RR-${id}` });
  const transactionId = await persistRentAndAllocations(rentPayload, activeOwners, { insertRentTransaction, hasOwnerAllocationsForSource, insertOwnerAllocations, deleteRentTransaction });
  revalidatePath(path); redirect(`${path}?message=${encodeURIComponent("Rent recorded.")}&rentReceipt=${transactionId}`);
}

export async function createAdvancePaymentAction(form: FormData) {
  await requireProfile(["admin"]);
  const tenant = await getTenantUnit(text(form, "tenant_id"));
  const defaultMonthlyAdjustment = Number(text(form, "default_monthly_advance_adjustment"));
  const id = await insertAdvancePayment(buildAdvancePayment({ tenantId: tenant.tenantId, unitId: tenant.unitId, unitCode: tenant.unitCode, unitDescription: tenant.unitDescription, amount: Number(text(form, "amount")), defaultMonthlyAdjustment, paymentDate: text(form, "payment_date") }));
  await updateTenantDefaultAdvanceAdjustment(tenant.tenantId, defaultMonthlyAdjustment);
  revalidatePath(path); redirect(`${path}?message=${encodeURIComponent("Advance recorded.")}&advanceReceipt=${id}`);
}

export async function createExpenseAction(form: FormData) {
  await requireProfile(["admin"]);
  const input = buildExpense({
    expenseDate: text(form, "expense_date"), description: text(form, "description"), amount: Number(text(form, "amount")),
    category: text(form, "category"), paidTo: text(form, "paid_to"), paymentMethod: text(form, "payment_method"), notes: text(form, "notes"), voucherNumber: text(form, "voucher_number"),
  });
  const mode = text(form, "owner_allocation_mode") === "DO_NOT_DISTRIBUTE" ? "DO_NOT_DISTRIBUTE" : "DISTRIBUTE_TO_OWNERS";
  const id = await recordExpenseWithAllocations(input, mode);
  revalidatePath(path); redirect(`${path}?message=${encodeURIComponent("Expense recorded.")}&expenseVoucher=${id}`);
}

export async function createOwnerAllocationAction(form: FormData) {
  await requireProfile(["admin"]);
  const owners = (await listActiveOwners()).map((owner) => ({ id: owner.id, percentage: Number(owner.ownership_percentage) }));
  try {
    validateOwnershipPercentages(owners);
  } catch {
    ownerValidationError(new Error("Active ownership percentages must total exactly 100% before allocation."));
  }
  const sourceType = text(form, "source_type");
  if (sourceType !== "rent_income" && sourceType !== "expense") throw new Error("Invalid allocation source.");
  if (sourceType === "rent_income" && await hasOwnerAllocationsForSource(sourceType, text(form, "source_id"))) throw new Error("This rent transaction already has owner allocations.");
  const rows = buildOwnerAllocationRows(sourceType, text(form, "source_id"), Number(text(form, "amount")), owners);
  await insertOwnerAllocations(rows);
  revalidatePath(path); redirect(path);
}
