import { validateOwnershipPercentages } from "./calculations.ts";
import { buildRentAllocationRows } from "./expense-allocation.ts";

type RentPayload = { total_rent_settled: number } & Record<string, unknown>;
type Owner = { id: string; ownership_percentage: number };

export async function persistRentAndAllocations(
  rentPayload: RentPayload,
  activeOwners: Owner[],
  dependencies: {
    insertRentTransaction: (payload: RentPayload) => Promise<string>;
    hasOwnerAllocationsForSource: (sourceType: "rent_income", sourceId: string) => Promise<boolean>;
    insertOwnerAllocations: (rows: Record<string, unknown>[]) => Promise<void>;
    deleteRentTransaction: (id: string) => Promise<void>;
  },
) {
  validateOwnershipPercentages(activeOwners.map((owner) => ({ id: owner.id, percentage: Number(owner.ownership_percentage) })));
  const transactionId = await dependencies.insertRentTransaction(rentPayload);
  try {
    if (await dependencies.hasOwnerAllocationsForSource("rent_income", transactionId)) throw new Error("This rent transaction already has owner allocations.");
    const allocationRows = buildRentAllocationRows(transactionId, Number(rentPayload.total_rent_settled), activeOwners);
    if (allocationRows.reduce((sum, row) => sum + Number(row.allocated_amount), 0) !== Number(rentPayload.total_rent_settled)) throw new Error("Owner allocations do not reconcile to eligible rent income.");
    await dependencies.insertOwnerAllocations(allocationRows);
  } catch (error) {
    await dependencies.deleteRentTransaction(transactionId);
    throw error;
  }
  return transactionId;
}
