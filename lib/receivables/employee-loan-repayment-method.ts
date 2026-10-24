import { RECEIVABLE_REPAYMENT_METHODS } from "./domain.ts";
import { assertUuid } from "./employee-loans.ts";

export type RepaymentMethodState = { status: "idle" | "error" | "success"; message: string };
export const REPAYMENT_METHOD_LABELS = { salary_deduction: "Salary Deduction", cash: "Cash", bank: "Bank", mfs: "MFS", other: "Other" };
export function repaymentMethodLabel(method: string | null) {
  return method ? REPAYMENT_METHOD_LABELS[method as keyof typeof REPAYMENT_METHOD_LABELS] ?? method : "Not set";
}
export function normalizeRepaymentMethodEdit(input: Record<string, unknown>) {
  const accountId = assertUuid(input.accountId, "Loan");
  const operationId = assertUuid(input.operationId, "Operation");
  const method = String(input.method ?? "").trim() || null;
  if (method !== null && !(RECEIVABLE_REPAYMENT_METHODS as readonly string[]).includes(method)) throw new Error("Choose a supported repayment method.");
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 10 || reason.length > 2000) throw new Error("A reason between 10 and 2000 characters is required.");
  const effectiveDate = String(input.effectiveDate ?? "").trim();
  const parsed = new Date(`${effectiveDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || effectiveDate < "1900-01-01" || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== effectiveDate) throw new Error("Confirm a valid effective date.");
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error("Refresh the loan before saving its version.");
  if (input.confirmed !== "on") throw new Error("Confirm the effective date and agreement compatibility before saving.");
  return { accountId, operationId, method, reason, effectiveDate, expectedVersion };
}
