export const RECEIVABLE_LIFECYCLE_ACTIONS = [
  "submit_review",
  "approve",
  "reject",
  "cancel",
] as const;

export const MANUAL_OPERATIONAL_METHODS = ["cash", "bank", "mfs", "other"] as const;

type LifecycleAction = (typeof RECEIVABLE_LIFECYCLE_ACTIONS)[number];
type ManualOperationalMethod = (typeof MANUAL_OPERATIONAL_METHODS)[number];

type Draft = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function clean(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function uuid(value: unknown, label: string) {
  const normalized = clean(value, 80).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} must be a valid UUID.`);
  return normalized;
}

function date(value: unknown, label: string) {
  const normalized = clean(value, 10);
  if (!DATE_PATTERN.test(normalized)) throw new Error(`${label} is required and must be valid.`);
  const [year, month, day] = normalized.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function money(value: unknown, label: string) {
  const parsed = Number(clean(value, 80));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return Math.round((parsed + Number.EPSILON) * 10_000) / 10_000;
}

function reason(value: unknown) {
  const normalized = clean(value, 2000);
  if (normalized.length < 2) throw new Error("Reason is required.");
  return normalized;
}

function optionalNote(value: unknown) {
  return clean(value, 2000) || null;
}

function lifecycleAction(value: unknown): LifecycleAction {
  const normalized = clean(value, 40);
  if (!RECEIVABLE_LIFECYCLE_ACTIONS.includes(normalized as LifecycleAction)) {
    throw new Error("Invalid lifecycle action.");
  }
  return normalized as LifecycleAction;
}

function operationalMethod(value: unknown): ManualOperationalMethod {
  const normalized = clean(value, 40);
  if (normalized === "salary_deduction") {
    throw new Error("Salary deduction is reserved for the approved Phase 4 Payroll integration.");
  }
  if (!MANUAL_OPERATIONAL_METHODS.includes(normalized as ManualOperationalMethod)) {
    throw new Error("Invalid operational payment method.");
  }
  return normalized as ManualOperationalMethod;
}

export function normalizeLifecycleInput(input: Draft) {
  const action = lifecycleAction(input.action);
  const approvedAmount = action === "approve" ? money(input.approvedAmount, "Approved amount") : null;
  const normalizedReason =
    action === "reject" || action === "cancel"
      ? reason(input.reason)
      : optionalNote(input.reason);
  return {
    accountId: uuid(input.accountId, "Receivable account"),
    operationId: uuid(input.operationId, "Operation ID"),
    action,
    approvedAmount,
    reason: normalizedReason,
  };
}

export function normalizeDisbursementInput(input: Draft) {
  return {
    accountId: uuid(input.accountId, "Receivable account"),
    operationId: uuid(input.operationId, "Operation ID"),
    amount: money(input.amount, "Disbursement amount"),
    effectiveDate: date(input.effectiveDate, "Effective date"),
    paymentMethod: operationalMethod(input.paymentMethod),
    note: optionalNote(input.note),
  };
}

export function normalizeRepaymentInput(input: Draft) {
  return {
    accountId: uuid(input.accountId, "Receivable account"),
    operationId: uuid(input.operationId, "Operation ID"),
    amount: money(input.amount, "Repayment amount"),
    effectiveDate: date(input.effectiveDate, "Effective date"),
    paymentMethod: operationalMethod(input.paymentMethod),
    note: optionalNote(input.note),
  };
}

export function normalizeAdjustmentInput(input: Draft) {
  const direction = clean(input.direction, 20);
  if (direction !== "increase" && direction !== "decrease") {
    throw new Error("Invalid adjustment direction.");
  }
  if (direction === "increase" && input.hasApprovedSchedule === true) {
    throw new Error("An increase cannot change an approved installment schedule.");
  }
  return {
    accountId: uuid(input.accountId, "Receivable account"),
    operationId: uuid(input.operationId, "Operation ID"),
    direction,
    amount: money(input.amount, "Adjustment amount"),
    effectiveDate: date(input.effectiveDate, "Effective date"),
    reason: reason(input.reason),
  };
}

export function normalizeReversalInput(input: Draft) {
  return {
    accountId: uuid(input.accountId, "Receivable account"),
    transactionId: uuid(input.transactionId, "Receivable transaction"),
    operationId: uuid(input.operationId, "Operation ID"),
    effectiveDate: date(input.effectiveDate, "Effective date"),
    reason: reason(input.reason),
  };
}

export type InstallmentScheduleInput = {
  approvedAmount: number;
  installmentCount: number;
  installmentAmount?: number | null;
  firstDueDate: string;
};

export type InstallmentScheduleRow = {
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
};

function addMonthsClamped(value: string, offset: number) {
  const [year, month, day] = value.split("-").map(Number);
  const targetMonth = month - 1 + offset;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear.toString().padStart(4, "0")}-${(normalizedMonth + 1)
    .toString()
    .padStart(2, "0")}-${Math.min(day, lastDay).toString().padStart(2, "0")}`;
}

export function buildInstallmentSchedule(input: InstallmentScheduleInput): InstallmentScheduleRow[] {
  const approvedAmount = money(input.approvedAmount, "Approved amount");
  if (!Number.isSafeInteger(input.installmentCount) || input.installmentCount <= 0) {
    throw new Error("Installment count must be a positive whole number.");
  }
  const firstDueDate = date(input.firstDueDate, "First due date");
  const regularAmount = input.installmentAmount
    ? money(input.installmentAmount, "Installment amount")
    : Math.floor((approvedAmount / input.installmentCount) * 10_000) / 10_000;
  if (regularAmount * (input.installmentCount - 1) >= approvedAmount) {
    throw new Error("Installment amounts exceed approved amount before the final installment.");
  }
  let allocated = 0;
  return Array.from({ length: input.installmentCount }, (_, index) => {
    const isLast = index === input.installmentCount - 1;
    const amountDue = isLast
      ? Math.round((approvedAmount - allocated + Number.EPSILON) * 10_000) / 10_000
      : regularAmount;
    allocated = Math.round((allocated + amountDue + Number.EPSILON) * 10_000) / 10_000;
    return {
      installmentNumber: index + 1,
      dueDate: addMonthsClamped(firstDueDate, index),
      amountDue,
    };
  });
}

export type InstallmentState = InstallmentScheduleRow & {
  paidAmount: number;
  remainingAmount: number;
  status: "paid" | "overdue" | "partial" | "unpaid";
};

export function deriveInstallmentStates(
  installments: InstallmentScheduleRow[],
  recoveredAmount: number,
  businessDate: string,
): InstallmentState[] {
  let available = Math.max(0, recoveredAmount);
  return [...installments]
    .sort((a, b) => a.installmentNumber - b.installmentNumber)
    .map((installment) => {
      const paidAmount = Math.min(installment.amountDue, available);
      available = Math.max(0, available - paidAmount);
      const roundedPaid = Math.round((paidAmount + Number.EPSILON) * 10_000) / 10_000;
      const remainingAmount =
        Math.round((installment.amountDue - roundedPaid + Number.EPSILON) * 10_000) / 10_000;
      const status =
        remainingAmount === 0
          ? "paid"
          : installment.dueDate < businessDate
            ? "overdue"
            : roundedPaid > 0
              ? "partial"
              : "unpaid";
      return { ...installment, paidAmount: roundedPaid, remainingAmount, status };
    });
}

export function deriveOperationalOutstanding(
  movements: { direction: "increase" | "decrease"; amount: number }[],
) {
  const outstanding = movements.reduce((total, movement) => {
    if (!Number.isFinite(movement.amount) || movement.amount <= 0) {
      throw new Error("Movement amount must be greater than zero.");
    }
    return total + (movement.direction === "increase" ? movement.amount : -movement.amount);
  }, 0);
  return Math.round((outstanding + Number.EPSILON) * 10_000) / 10_000;
}
