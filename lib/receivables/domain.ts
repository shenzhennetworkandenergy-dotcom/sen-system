export const RECEIVABLE_CATEGORIES = [
  "employee_loan",
  "customer_loan",
  "company_loan",
  "individual_loan",
  "supplier_refundable_advance",
  "security_deposit",
  "recoverable_advance",
  "other",
] as const;

export const RECEIVABLE_BORROWER_TYPES = [
  "employee",
  "customer",
  "supplier",
  "crm_company",
  "crm_contact",
  "external_party",
] as const;

export const RECEIVABLE_REPAYMENT_METHODS = [
  "salary_deduction",
  "cash",
  "bank",
  "mfs",
  "other",
] as const;

export type ReceivableCategory = (typeof RECEIVABLE_CATEGORIES)[number];
export type BorrowerType = (typeof RECEIVABLE_BORROWER_TYPES)[number];
export type RepaymentMethod = (typeof RECEIVABLE_REPAYMENT_METHODS)[number];
export type ReceivableStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "disbursed"
  | "active"
  | "overdue"
  | "fully_repaid"
  | "rejected"
  | "cancelled";

export type CustomerReceivableStatus = "current" | "partially_paid" | "paid";

export interface ReceivableInputDraft {
  operationId?: unknown;
  category?: unknown;
  borrowerType?: unknown;
  borrowerId?: unknown;
  externalPartyType?: unknown;
  externalPartyDisplayName?: unknown;
  externalPartyCompanyName?: unknown;
  externalPartyPhone?: unknown;
  externalPartyEmail?: unknown;
  externalPartyReference?: unknown;
  externalPartyNotes?: unknown;
  originalAmount?: unknown;
  currency?: unknown;
  defaultRepaymentMethod?: unknown;
  installmentCount?: unknown;
  installmentAmount?: unknown;
  firstDueDate?: unknown;
  finalDueDate?: unknown;
  notes?: unknown;
}

export interface OpeningReceivableInputDraft extends ReceivableInputDraft {
  previouslyRepaidAmount?: unknown;
  openingOutstandingAmount?: unknown;
  asOfDate?: unknown;
}

export interface ExternalPartyInput {
  partyType: "individual" | "company" | "other";
  displayName: string;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  externalReference: string | null;
  notes: string | null;
}

export interface RequestedReceivableInput {
  operationId: string;
  category: ReceivableCategory;
  borrowerType: BorrowerType;
  borrowerId: string | null;
  externalParty: ExternalPartyInput | null;
  originalAmount: number;
  currency: string;
  defaultRepaymentMethod: RepaymentMethod | null;
  installmentCount: number | null;
  installmentAmount: number | null;
  firstDueDate: string | null;
  finalDueDate: string | null;
  notes: string | null;
  status: "requested";
  isOpeningBalance: false;
}

export interface OpeningReceivableInput
  extends Omit<RequestedReceivableInput, "status" | "isOpeningBalance"> {
  previouslyRepaidAmount: number;
  openingOutstandingAmount: number;
  asOfDate: string;
  status: "active";
  isOpeningBalance: true;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function nullableText(value: unknown, maxLength: number): string | null {
  return text(value, maxLength) || null;
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  const normalized = text(value, 80);
  if (!allowed.includes(normalized)) {
    throw new Error(`Invalid ${label}.`);
  }
  return normalized as T[number];
}

function uuid(value: unknown, label: string): string {
  const normalized = text(value, 80);
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a valid UUID.`);
  }
  return normalized.toLowerCase();
}

function roundMoney(value: unknown, label: string, allowZero = false): number {
  const normalized = typeof value === "number" ? value : Number(text(value, 80));
  if (!Number.isFinite(normalized) || (allowZero ? normalized < 0 : normalized <= 0)) {
    throw new Error(`${label} must be ${allowZero ? "zero or greater" : "greater than zero"}.`);
  }
  const rounded = Math.round((normalized + Number.EPSILON) * 10_000) / 10_000;
  if (!Number.isSafeInteger(Math.trunc(rounded)) || rounded > 99_999_999_999_999.9999) {
    throw new Error(`${label} is too large.`);
  }
  return rounded;
}

function optionalPositiveInteger(value: unknown, label: string): number | null {
  const normalized = text(value, 40);
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return parsed;
}

function optionalPositiveMoney(value: unknown, label: string): number | null {
  if (!text(value, 80)) return null;
  return roundMoney(value, label);
}

function validDate(value: unknown, label: string, required = false): string | null {
  const normalized = text(value, 10);
  if (!normalized) {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }
  if (!DATE_PATTERN.test(normalized)) throw new Error(`${label} is invalid.`);
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function normalizeExternalParty(input: ReceivableInputDraft): {
  borrowerId: string | null;
  externalParty: ExternalPartyInput | null;
} {
  const existingId = text(input.borrowerId, 80);
  const displayName = text(input.externalPartyDisplayName, 180);
  if (existingId && displayName) {
    throw new Error("Choose an existing external party or enter a new one, not both.");
  }
  if (existingId) {
    return { borrowerId: uuid(existingId, "Borrower"), externalParty: null };
  }
  if (!displayName) throw new Error("Borrower is required.");
  if (displayName.length < 2) throw new Error("External party name is too short.");
  const partyType = enumValue(
    input.externalPartyType ?? "other",
    ["individual", "company", "other"] as const,
    "external party type",
  );
  return {
    borrowerId: null,
    externalParty: {
      partyType,
      displayName,
      companyName: nullableText(input.externalPartyCompanyName, 180),
      phone: nullableText(input.externalPartyPhone, 80),
      email: nullableText(input.externalPartyEmail, 320),
      externalReference: nullableText(input.externalPartyReference, 180),
      notes: nullableText(input.externalPartyNotes, 2_000),
    },
  };
}

function normalizeBase(input: ReceivableInputDraft) {
  const operationId = uuid(input.operationId, "Operation ID");
  const category = enumValue(input.category, RECEIVABLE_CATEGORIES, "receivable category");
  const borrowerType = enumValue(
    input.borrowerType,
    RECEIVABLE_BORROWER_TYPES,
    "borrower type",
  );
  const borrower =
    borrowerType === "external_party"
      ? normalizeExternalParty(input)
      : {
          borrowerId: text(input.borrowerId, 80)
            ? uuid(input.borrowerId, "Borrower")
            : (() => {
                throw new Error("Borrower is required.");
              })(),
          externalParty: null,
        };
  const currency = String(input.currency || "BDT").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must use a three-letter code.");
  const defaultRepaymentMethod = text(input.defaultRepaymentMethod, 40)
    ? enumValue(
        input.defaultRepaymentMethod,
        RECEIVABLE_REPAYMENT_METHODS,
        "repayment method",
      )
    : null;
  const firstDueDate = validDate(input.firstDueDate, "First due date");
  const finalDueDate = validDate(input.finalDueDate, "Final due date");
  if (firstDueDate && finalDueDate && finalDueDate < firstDueDate) {
    throw new Error("Final due date cannot be before first due date.");
  }
  return {
    operationId,
    category,
    borrowerType,
    borrowerId: borrower.borrowerId,
    externalParty: borrower.externalParty,
    originalAmount: roundMoney(input.originalAmount, "Original amount"),
    currency,
    defaultRepaymentMethod,
    installmentCount: optionalPositiveInteger(input.installmentCount, "Installment count"),
    installmentAmount: optionalPositiveMoney(input.installmentAmount, "Installment amount"),
    firstDueDate,
    finalDueDate,
    notes: nullableText(input.notes, 4_000),
  };
}

export function normalizeRequestedReceivableInput(
  input: ReceivableInputDraft,
): RequestedReceivableInput {
  return {
    ...normalizeBase(input),
    status: "requested",
    isOpeningBalance: false,
  };
}

export function normalizeOpeningReceivableInput(
  input: OpeningReceivableInputDraft,
): OpeningReceivableInput {
  const base = normalizeBase(input);
  const previouslyRepaidAmount = roundMoney(
    input.previouslyRepaidAmount ?? 0,
    "Previously repaid amount",
    true,
  );
  const openingOutstandingAmount = roundMoney(
    input.openingOutstandingAmount,
    "Opening outstanding amount",
  );
  const expected = Math.round((base.originalAmount - previouslyRepaidAmount) * 10_000) / 10_000;
  if (expected !== openingOutstandingAmount) {
    throw new Error(
      "Opening outstanding amount must equal original amount minus previously repaid amount.",
    );
  }
  return {
    ...base,
    previouslyRepaidAmount,
    openingOutstandingAmount,
    asOfDate: validDate(input.asOfDate, "Opening as-of date", true)!,
    status: "active",
    isOpeningBalance: true,
  };
}

export function deriveReceivableStatus(
  totalAmount: number,
  paidAmount: number,
): CustomerReceivableStatus {
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    throw new Error("Total amount cannot be negative.");
  }
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    throw new Error("Paid amount cannot be negative.");
  }
  if (paidAmount >= totalAmount) return "paid";
  return paidAmount > 0 ? "partially_paid" : "current";
}

export function formatReceivableNumber(value: string): string {
  return value.trim().toUpperCase();
}
