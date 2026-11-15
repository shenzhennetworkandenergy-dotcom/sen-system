import { calculateRentSettlement } from "./calculations.ts";

export type TenantInput = { name: string; phoneNumber?: string | null; unitId: string | null; unitCode: string; monthlyRent: number; unitDescription: string; isActive?: boolean };

export const rentPaymentMethods = ["cash", "bank", "mfs", "cheque", "other"] as const;

export function parseRentReceiptChange(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const money = (name: string) => {
    const value = text(name);
    // Postgres keeps the exact decimal string, including on older receipts.
    if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(value)) throw new Error("Enter valid rent amounts with up to two decimal places.");
    return value;
  };
  const year = Number(text("rent_year"));
  const month = Number(text("rent_month"));
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Enter a valid rent month and year.");
  }
  const paymentDate = text("payment_date");
  const utc = new Date(`${paymentDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== paymentDate) {
    throw new Error("Enter a valid received date.");
  }
  const method = text("payment_method");
  if (!rentPaymentMethods.some((value) => value === method)) throw new Error("Choose a valid payment method.");
  const notes = text("notes");
  const reference = text("reference_number");
  if (notes.length > 2000 || reference.length > 200) throw new Error("Notes or payment reference are too long.");
  return {
    rent_year: year,
    rent_month: month,
    monthly_rent: money("monthly_rent"),
    actual_money_received: money("actual_money_received"),
    advance_adjusted: money("advance_adjusted"),
    payment_date: paymentDate,
    payment_method: method,
    notes: notes || null,
    reference_number: reference || null,
  };
}

export function calculateAdvanceAdjustment(input: { configuredMonthlyDeduction: number; availableAdvanceBalance: number; monthlyRent: number }) {
  if (![input.configuredMonthlyDeduction, input.availableAdvanceBalance, input.monthlyRent].every(Number.isFinite)) throw new Error("Advance amounts must be finite.");
  if (input.configuredMonthlyDeduction < 0 || input.availableAdvanceBalance < 0 || input.monthlyRent < 0) throw new Error("Advance amounts cannot be negative.");
  return Math.min(input.configuredMonthlyDeduction, input.availableAdvanceBalance, input.monthlyRent);
}

export function validateAdvanceAdjustment(adjustment: number, availableAdvanceBalance: number, monthlyRent: number) {
  if (!Number.isFinite(adjustment) || adjustment < 0) throw new Error("Advance adjustment cannot be negative.");
  if (adjustment > availableAdvanceBalance) throw new Error("Advance adjustment exceeds the remaining tenant advance balance.");
  if (adjustment > monthlyRent) throw new Error("Advance adjustment cannot exceed monthly rent.");
  return adjustment;
}

export function validateTenantInput(input: TenantInput) {
  if (!input.name.trim()) throw new Error("Tenant name is required.");
  if (!input.unitId || !input.unitCode.trim()) throw new Error("An active unit is required.");
  if (!Number.isFinite(input.monthlyRent) || input.monthlyRent <= 0) throw new Error("Monthly rent must be greater than zero.");
  return input;
}

export function buildRentTransaction(input: {
  tenantId: string; unitId: string; unitCode: string; unitDescription: string; rentYear: number; rentMonth: number; monthlyRent: number; actualMoneyReceived: number; advanceAdjusted: number; advanceBalanceBefore?: number; paymentDate: string; paymentMethod: string; moneyReceiptNumber: string; rentReceiptNumber: string; notes?: string | null;
}) {
  const settlement = calculateRentSettlement({ monthlyRent: input.monthlyRent, actualMoneyReceived: input.actualMoneyReceived, advanceAdjusted: input.advanceAdjusted, advanceBalanceBefore: input.advanceBalanceBefore ?? input.advanceAdjusted });
  return {
    tenant_id: input.tenantId, unit_id: input.unitId, unit_code_snapshot: input.unitCode, unit_description_snapshot: input.unitDescription,
    rent_year: input.rentYear, rent_month: input.rentMonth, monthly_rent: input.monthlyRent, actual_money_received: input.actualMoneyReceived,
    advance_adjusted: input.advanceAdjusted, total_rent_settled: settlement.totalRentSettled,
    ...(input.advanceBalanceBefore === undefined ? {} : { advance_balance_before: input.advanceBalanceBefore, advance_balance_after: settlement.advanceBalanceAfter }),
    payment_date: input.paymentDate, payment_method: input.paymentMethod, money_receipt_number: input.moneyReceiptNumber, rent_receipt_number: input.rentReceiptNumber,
  };
}

export function buildAdvancePayment(input: { tenantId: string; unitId: string; unitCode: string; unitDescription: string; amount: number; defaultMonthlyAdjustment: number; paymentDate: string }) {
  if (!input.amount || input.amount <= 0) throw new Error("Advance amount must be greater than zero.");
  if (!Number.isFinite(input.defaultMonthlyAdjustment) || input.defaultMonthlyAdjustment < 0) throw new Error("Default monthly advance adjustment cannot be negative.");
  return { tenant_id: input.tenantId, unit_id: input.unitId, unit_code_snapshot: input.unitCode, unit_description_snapshot: input.unitDescription, amount: input.amount, default_monthly_advance_adjustment: input.defaultMonthlyAdjustment, payment_date: input.paymentDate };
}
