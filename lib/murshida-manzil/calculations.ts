export type OwnershipInput = { id?: string; ownerId?: string; percentage: number };
export type OwnerAllocation = { ownerId: string; percentage: number; amount: number };

function cents(value: number) {
  if (!Number.isFinite(value)) throw new Error("Amount must be a finite number.");
  return Math.round((value + Number.EPSILON) * 100);
}

function percentageBasisPoints(value: number) {
  if (!Number.isFinite(value)) throw new Error("Ownership percentage must be a finite number.");
  const basisPoints = Math.round((value + Number.EPSILON) * 100);
  if (basisPoints <= 0 || basisPoints > 10000 || Math.abs(value * 100 - basisPoints) > 1e-7) {
    throw new Error("Ownership percentage must be greater than 0 and use at most two decimal places.");
  }
  return basisPoints;
}

export function validateOwnershipPercentages(owners: OwnershipInput[]) {
  if (!owners.length) throw new Error("At least one active owner is required.");
  const total = owners.reduce((sum, owner) => sum + percentageBasisPoints(owner.percentage), 0);
  if (total !== 10000) throw new Error("Active ownership percentages must total exactly 100%.");
  return true;
}

export function validateOwnershipPercentagesForSetup(owners: OwnershipInput[]) {
  const total = owners.reduce((sum, owner) => sum + percentageBasisPoints(owner.percentage), 0);
  if (total > 10000) throw new Error("Active ownership percentages cannot exceed 100%.");
  return true;
}

export function allocateByOwnership(amount: number, owners: OwnershipInput[]): OwnerAllocation[] {
  validateOwnershipPercentages(owners);
  const amountCents = cents(amount);
  if (amountCents < 0) throw new Error("Allocation amount cannot be negative.");
  const allocations = owners.map((owner) => {
    const ownerId = owner.ownerId ?? owner.id;
    if (!ownerId) throw new Error("Each owner allocation requires an owner id.");
    const basisPoints = percentageBasisPoints(owner.percentage);
    return { ownerId, percentage: owner.percentage, amountCents: Math.floor(amountCents * basisPoints / 10000) };
  });
  let remainder = amountCents - allocations.reduce((sum, item) => sum + item.amountCents, 0);
  for (const allocation of allocations) {
    if (!remainder) break;
    allocation.amountCents += 1;
    remainder -= 1;
  }
  return allocations.map(({ ownerId, percentage, amountCents: value }) => ({ ownerId, percentage, amount: value / 100 }));
}

export function calculateRentSettlement(input: {
  monthlyRent: number;
  actualMoneyReceived: number;
  advanceAdjusted: number;
  advanceBalanceBefore: number;
}) {
  const monthlyRent = cents(input.monthlyRent);
  const actualMoneyReceived = cents(input.actualMoneyReceived);
  const advanceAdjusted = cents(input.advanceAdjusted);
  const advanceBalanceBefore = cents(input.advanceBalanceBefore);
  if (monthlyRent <= 0) throw new Error("Monthly rent must be greater than zero.");
  if (actualMoneyReceived < 0 || advanceAdjusted < 0 || advanceBalanceBefore < 0) throw new Error("Rent and advance amounts cannot be negative.");
  if (advanceAdjusted > advanceBalanceBefore) throw new Error("Advance adjustment exceeds the remaining tenant advance.");
  const totalRentSettled = actualMoneyReceived + advanceAdjusted;
  if (totalRentSettled !== monthlyRent) throw new Error("Actual money received plus advance adjusted must equal monthly rent.");
  return {
    totalRentSettled: totalRentSettled / 100,
    advanceBalanceAfter: (advanceBalanceBefore - advanceAdjusted) / 100,
    ownerIncomeBase: totalRentSettled / 100,
    moneyReceiptAmount: actualMoneyReceived / 100,
  };
}

/**
 * Calculates Murshida Manzil distributable income. Standalone advance receipts
 * are intentionally not an input: only rent cash and advance applied to rent
 * become income, while expenses reduce the result.
 */
export function calculateDistributableAmount(input: {
  actualRentPayments: number;
  advanceAppliedToRent: number;
  expenses: number;
}) {
  const actualRentPayments = cents(input.actualRentPayments);
  const advanceAppliedToRent = cents(input.advanceAppliedToRent);
  const expenses = cents(input.expenses);
  if (actualRentPayments < 0 || advanceAppliedToRent < 0 || expenses < 0) {
    throw new Error("Distributable amounts cannot be negative.");
  }
  return (actualRentPayments + advanceAppliedToRent - expenses) / 100;
}
