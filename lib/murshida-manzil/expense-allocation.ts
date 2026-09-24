import { allocateByOwnership } from "./calculations.ts";

export type ExpenseInput = {
  expenseDate: string;
  description: string;
  amount: number;
  category?: string;
  paidTo?: string;
  paymentMethod?: string;
  notes?: string;
  voucherNumber?: string;
};

export function buildExpense(input: ExpenseInput) {
  if (!input.expenseDate) throw new Error("Expense date is required.");
  if (!input.description.trim()) throw new Error("Expense description is required.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Expense amount must be greater than zero.");
  return {
    expense_date: input.expenseDate,
    description: input.description.trim(),
    amount: input.amount,
    ...(input.category?.trim() ? { category: input.category.trim() } : {}),
    ...(input.paidTo?.trim() ? { paid_to: input.paidTo.trim() } : {}),
    ...(input.paymentMethod?.trim() ? { payment_method: input.paymentMethod.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(input.voucherNumber?.trim() ? { voucher_number: input.voucherNumber.trim() } : {}),
  };
}

export function buildOwnerAllocationRows(
  sourceType: "rent_income" | "expense",
  sourceId: string,
  amount: number,
  owners: { id: string; percentage: number }[],
) {
  if (!sourceId.trim()) throw new Error("Allocation source is required.");
  return allocateByOwnership(amount, owners).map((allocation) => ({
    owner_id: allocation.ownerId,
    source_type: sourceType,
    source_id: sourceId,
    ownership_percentage_snapshot: allocation.percentage,
    allocated_amount: allocation.amount,
  }));
}

export function buildRentAllocationRows(sourceId: string, eligibleRentIncome: number, owners: { id: string; ownership_percentage: number }[]) {
  return buildOwnerAllocationRows("rent_income", sourceId, eligibleRentIncome, owners.map((owner) => ({ id: owner.id, percentage: Number(owner.ownership_percentage) })));
}
