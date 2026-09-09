export const EMPLOYEE_LOAN_CONSENT_VERSION = "employee-loan-terms-bn-v3";
export const EMPLOYEE_LOAN_DOCUMENT_BUCKET = "receivables-private";
export const EMPLOYEE_LOAN_MAX_FILE_SIZE = 10 * 1024 * 1024;

export const EMPLOYEE_LOAN_TERM_ITEMS = [
  "term_01", "term_02", "term_03", "term_04", "term_05", "term_06", "term_07",
  "term_08", "term_09", "term_10", "term_11", "term_12", "term_13", "term_14",
] as const;

export const EMPLOYEE_LOAN_FINAL_CONSENT_ITEMS = [
  "final_guidance", "final_repayment", "final_authoritative_terms",
  "final_salary_deduction", "final_accuracy", "final_no_guarantee", "final_witness",
] as const;

export const EMPLOYEE_LOAN_REQUIRED_CONSENT_ITEMS = [
  ...EMPLOYEE_LOAN_TERM_ITEMS,
  ...EMPLOYEE_LOAN_FINAL_CONSENT_ITEMS,
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, label: string, min: number, max: number) {
  const normalized = String(value ?? "").trim();
  if (normalized.length < min || normalized.length > max) {
    throw new Error(`${label} must be between ${min} and ${max} characters.`);
  }
  return normalized;
}

function money(value: unknown, label: string) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0 || normalized > 100_000_000) {
    throw new Error(`${label} must be greater than zero and within the allowed limit.`);
  }
  return Math.round((normalized + Number.EPSILON) * 10_000) / 10_000;
}

function positiveInteger(value: unknown, label: string, maximum = 600) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0 || normalized > maximum) {
    throw new Error(`${label} must be a positive whole number no greater than ${maximum}.`);
  }
  return normalized;
}

function integerText(value: unknown, label: string, minimum: number, maximum: number) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`${label} must contain digits only.`);
  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be a whole number between ${minimum} and ${maximum}.`);
  }
  return number;
}

function witnesses(value: unknown) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 5) {
    throw new Error("At least two and no more than five witnesses are required.");
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Witness ${index + 1} is invalid.`);
    const witness = entry as Record<string, unknown>;
    return {
      name: text(witness.name, `Witness ${index + 1} name`, 1, 160),
      address: text(witness.address, `Witness ${index + 1} address`, 1, 500),
      phone: text(witness.phone, `Witness ${index + 1} phone`, 1, 50),
    };
  });
}

function date(value: unknown, label: string) {
  const normalized = String(value ?? "").trim();
  if (!ISO_DATE.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw new Error(`${label} must be a valid date.`);
  }
  return normalized;
}

export function normalizeLoanConsent(input: Record<string, unknown>) {
  if (EMPLOYEE_LOAN_REQUIRED_CONSENT_ITEMS.some((key) => input[key] !== true && input[key] !== "on")) {
    throw new Error("Every required acknowledgement must be accepted before continuing.");
  }
  return { version: EMPLOYEE_LOAN_CONSENT_VERSION, items: [...EMPLOYEE_LOAN_REQUIRED_CONSENT_ITEMS] };
}

export function hasCompleteLoanConsent(input: { consent_version?: unknown; consent_items?: unknown }) {
  if (input.consent_version !== EMPLOYEE_LOAN_CONSENT_VERSION || !Array.isArray(input.consent_items)) return false;
  const accepted = new Set(input.consent_items.map(String));
  return EMPLOYEE_LOAN_REQUIRED_CONSENT_ITEMS.every((item) => accepted.has(item));
}

export function normalizeEmployeeLoanApplication(input: Record<string, unknown>) {
  const purpose = String(input.purpose ?? "").trim();
  if (purpose.length > 500) throw new Error("Loan purpose must not exceed 500 characters.");
  const repaymentMonths = integerText(input.repaymentMonths, "Repayment months", 0, 120);
  const repaymentDays = integerText(input.repaymentDays, "Repayment days", 0, 3650);
  if (repaymentMonths === 0 && repaymentDays === 0) throw new Error("Repayment months and days cannot both be zero.");
  const installmentFrequency = String(input.installmentFrequency ?? "").trim();
  if (!(["monthly", "weekly", "daily"] as const).includes(installmentFrequency as "monthly" | "weekly" | "daily")) {
    throw new Error("Installment frequency is invalid.");
  }
  return {
    requestedAmount: integerText(input.requestedAmount, "Requested loan amount", 1, 100_000_000),
    purpose: purpose || null,
    repaymentMonths,
    repaymentDays,
    installmentFrequency: installmentFrequency as "monthly" | "weekly" | "daily",
    proposedInstallment: integerText(input.proposedInstallment, "Proposed installment amount", 1, 100_000_000),
    preferredStartDate: date(input.preferredStartDate, "Preferred repayment start date"),
    detailedExplanation: text(input.detailedExplanation, "Detailed explanation", 10, 4000),
    employeeNote: String(input.employeeNote ?? "").trim().slice(0, 2000) || null,
    witnesses: witnesses(input.witnesses),
  };
}

export function normalizeApprovedEmployeeLoanTerms(input: Record<string, unknown>) {
  const approvedAmount = money(input.approvedAmount, "Approved loan amount");
  const approvedInstallments = positiveInteger(input.approvedInstallments, "Approved number of installments", 120);
  const approvedMonthlyInstallment = money(input.approvedMonthlyInstallment, "Approved monthly installment");
  if (approvedMonthlyInstallment * (approvedInstallments - 1) >= approvedAmount) {
    throw new Error("Approved installments would exhaust the loan before the final installment.");
  }
  return {
    approvedAmount,
    approvedPeriod: text(input.approvedPeriod, "Approved repayment period", 2, 120),
    approvedInstallments,
    approvedMonthlyInstallment,
    repaymentStartDate: date(input.repaymentStartDate, "Repayment start date"),
    purpose: text(input.purpose, "Approved loan purpose", 3, 500),
    specialTerms: text(input.specialTerms, "Special terms", 3, 4000),
    adminNote: String(input.adminNote ?? "").trim().slice(0, 2000) || null,
    agreementDate: date(input.agreementDate, "Agreement date"),
    agreementReference: text(input.agreementReference, "Agreement reference", 3, 100),
  };
}

export function validatePrivateLoanDocument(file: { name: string; type: string; size: number }) {
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error("Choose a non-empty document.");
  if (file.size > EMPLOYEE_LOAN_MAX_FILE_SIZE) throw new Error("Document size must not exceed 10 MB.");
  const extensions: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
  };
  const extension = extensions[file.type];
  if (!extension) throw new Error("Only PDF, JPEG, or PNG documents are accepted.");
  return { extension, mimeType: file.type, size: file.size, originalName: file.name.slice(0, 200) };
}

export function assertUuid(value: unknown, label: string) {
  const normalized = String(value ?? "").trim();
  if (!UUID.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

export function employeeLoanStageLabel(input: { accountStatus: string; workflowStage: string | null }) {
  if (input.accountStatus === "rejected") return "Rejected";
  if (input.accountStatus === "cancelled") return "Cancelled";
  if (input.accountStatus === "active" || input.workflowStage === "disbursed") return "Approved / Disbursed";
  const labels: Record<string, string> = {
    submitted: "Submitted",
    under_review: "Under Review",
    agreement_ready: "Agreement Ready",
    agreement_sent: "Agreement Sent",
    signed_submitted: "Signed Agreement Submitted",
    final_review: "Final Review",
    final_approved: "Final Approved",
  };
  return labels[input.workflowStage ?? ""] ?? "Submitted";
}

const small = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underThousand(value: number): string {
  if (value < 20) return small[value];
  if (value < 100) return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${small[value % 10]}` : ""}`;
  return `${small[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${underThousand(value % 100)}` : ""}`;
}

export function amountInWords(amount: number) {
  const rounded = Math.round(amount);
  if (!Number.isSafeInteger(rounded) || rounded < 0 || rounded > 999_999_999) return "Amount in words unavailable";
  if (rounded === 0) return "Zero Taka Only";
  const parts: string[] = [];
  const groups = [[10_000_000, "Crore"], [100_000, "Lakh"], [1_000, "Thousand"]] as const;
  let remainder = rounded;
  for (const [size, label] of groups) {
    const count = Math.floor(remainder / size);
    if (count) { parts.push(`${underThousand(count)} ${label}`); remainder %= size; }
  }
  if (remainder) parts.push(underThousand(remainder));
  return `${parts.join(" ")} Taka Only`;
}
