import { assertUuid } from "./employee-loans.ts";

export type EmployeeLoanStartDateState = { status: "idle" | "error" | "success"; message: string };

export function normalizeEmployeeLoanStartDateEdit(input: Record<string, unknown>) {
  const accountId = assertUuid(input.accountId, "Loan");
  const startDate = String(input.startDate ?? "").trim();
  const date = new Date(`${startDate}T00:00:00Z`);
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== startDate) {
    throw new Error("Choose a valid preferred start date.");
  }
  const version = String(input.expectedVersion ?? "").trim();
  const expectedVersion = Number(version);
  if (!/^\d+$/.test(version) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("Loan version is invalid. Refresh the page before saving.");
  }
  if (input.confirmed !== "on") throw new Error("Confirm the deduction start date change before saving.");
  return { accountId, startDate, expectedVersion };
}
