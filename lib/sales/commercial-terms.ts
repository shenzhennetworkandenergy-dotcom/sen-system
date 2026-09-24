export const PAYMENT_TERMS_TYPES = ["immediate", "partial", "credit"] as const;
export type PaymentTermsType = (typeof PAYMENT_TERMS_TYPES)[number];

export type CommercialTerms = {
  paymentTermsType: PaymentTermsType | null;
  creditPeriodDays: number | null;
  paymentDueDate: string | null;
};

export type CommercialTermsUpdate = CommercialTerms & { reason: string | null };
export type ReceivablePresentationStatus =
  | "paid"
  | "current"
  | "due_soon"
  | "overdue"
  | "no_due_date";
export type ReceivableAgingBucket =
  | "paid"
  | "no_due_date"
  | "not_yet_due"
  | "due_today"
  | "1_30_days_overdue"
  | "31_60_days_overdue"
  | "61_90_days_overdue"
  | "90_plus_days_overdue";

type CommercialTermsDraft = {
  paymentTermsType?: unknown;
  creditPeriodPreset?: unknown;
  customCreditPeriodDays?: unknown;
  paymentDueDate?: unknown;
  reason?: unknown;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DHAKA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function text(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function validDate(value: unknown, label: string) {
  const normalized = text(value, 10);
  if (!normalized) return null;
  if (!DATE_PATTERN.test(normalized)) throw new Error(`${label} is invalid.`);
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

function positivePeriod(value: unknown) {
  const parsed = Number(text(value, 20));
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Credit period must be a positive whole number.");
  }
  if (parsed > 3650) throw new Error("Credit period cannot exceed 3650 days.");
  return parsed;
}

export function normalizeCommercialTermsDraft(
  draft: CommercialTermsDraft,
): CommercialTermsUpdate {
  const paymentTermsType = text(draft.paymentTermsType, 20);
  if (!PAYMENT_TERMS_TYPES.includes(paymentTermsType as PaymentTermsType)) {
    throw new Error("Payment terms type is invalid.");
  }
  const preset = text(draft.creditPeriodPreset, 20);
  let creditPeriodDays: number | null = null;
  if (preset === "custom") {
    creditPeriodDays = positivePeriod(draft.customCreditPeriodDays);
  } else if (preset) {
    if (!["7", "15", "30", "45", "60"].includes(preset)) {
      throw new Error("Credit period selection is invalid.");
    }
    creditPeriodDays = positivePeriod(preset);
  }
  const paymentDueDate = validDate(draft.paymentDueDate, "Payment due date");
  const reason = text(draft.reason, 1000) || null;

  if (paymentTermsType === "immediate" && (creditPeriodDays || paymentDueDate)) {
    throw new Error("Immediate payment cannot include a credit period or due date.");
  }
  if (
    paymentTermsType !== "immediate" &&
    creditPeriodDays === null &&
    paymentDueDate === null
  ) {
    throw new Error("Partial or credit terms require a credit period or explicit due date.");
  }
  return {
    paymentTermsType: paymentTermsType as PaymentTermsType,
    creditPeriodDays,
    paymentDueDate,
    reason,
  };
}

export function normalizeDueDateCorrectionDraft(draft: {
  paymentDueDate?: unknown;
  reason?: unknown;
}) {
  const paymentDueDate = validDate(draft.paymentDueDate, "Payment due date");
  const reason = text(draft.reason, 1000) || null;
  if (!paymentDueDate) {
    throw new Error("An explicit payment due date is required after invoice finalization.");
  }
  if (!reason) {
    throw new Error("A correction reason is required after invoice finalization.");
  }
  return { paymentDueDate, reason };
}

export function validateCommercialTermsUpdate(input: {
  current: CommercialTerms;
  requested: CommercialTermsUpdate;
  hasNonVoidInvoice: boolean;
}) {
  if (!input.hasNonVoidInvoice) return;
  if (input.requested.paymentTermsType !== input.current.paymentTermsType) {
    throw new Error("Payment terms type cannot be changed after invoice finalization.");
  }
  if (input.requested.creditPeriodDays !== input.current.creditPeriodDays) {
    throw new Error("Credit period cannot be changed after invoice finalization.");
  }
  if (!input.requested.paymentDueDate) {
    throw new Error("An explicit due date is required after invoice finalization.");
  }
  if (!input.requested.reason) {
    throw new Error("A correction reason is required after invoice finalization.");
  }
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function daysBetween(earlier: string, later: string) {
  const left = Date.parse(`${earlier}T00:00:00.000Z`);
  const right = Date.parse(`${later}T00:00:00.000Z`);
  return Math.round((right - left) / 86_400_000);
}

export function toDhakaBusinessDate(value: string | Date) {
  if (typeof value === "string" && DATE_PATTERN.test(value)) return value;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invoice timestamp is invalid.");
  return DHAKA_DATE.format(parsed);
}

export function deriveEffectiveDueDate(input: {
  explicitDueDate: string | null;
  creditPeriodDays: number | null;
  invoiceTimestamps: Array<string | Date>;
}) {
  const invoiceDates = input.invoiceTimestamps.map(toDhakaBusinessDate).sort();
  const invoiceAnchorDate = invoiceDates[0] ?? null;
  if (input.explicitDueDate) {
    return {
      dueDate: validDate(input.explicitDueDate, "Payment due date"),
      invoiceAnchorDate,
      source: "explicit" as const,
    };
  }
  if (input.creditPeriodDays && invoiceAnchorDate) {
    return {
      dueDate: addDays(invoiceAnchorDate, input.creditPeriodDays),
      invoiceAnchorDate,
      source: "credit_period" as const,
    };
  }
  return { dueDate: null, invoiceAnchorDate, source: "none" as const };
}

export function deriveReceivableState(input: {
  outstandingAmount: number;
  dueDate: string | null;
  today: string;
}): {
  status: ReceivablePresentationStatus;
  agingBucket: ReceivableAgingBucket;
  daysOverdue: number | null;
} {
  if (input.outstandingAmount <= 0) {
    return { status: "paid", agingBucket: "paid", daysOverdue: null };
  }
  if (!input.dueDate) {
    return { status: "no_due_date", agingBucket: "no_due_date", daysOverdue: null };
  }
  const difference = daysBetween(input.dueDate, input.today);
  if (difference > 0) {
    const agingBucket = difference <= 30
      ? "1_30_days_overdue"
      : difference <= 60
        ? "31_60_days_overdue"
        : difference <= 90
          ? "61_90_days_overdue"
          : "90_plus_days_overdue";
    return { status: "overdue", agingBucket, daysOverdue: difference };
  }
  if (difference === 0) {
    return { status: "due_soon", agingBucket: "due_today", daysOverdue: 0 };
  }
  return {
    status: daysBetween(input.today, input.dueDate) <= 7 ? "due_soon" : "current",
    agingBucket: "not_yet_due",
    daysOverdue: null,
  };
}

export function formatCommercialTerms(terms: CommercialTerms) {
  if (!terms.paymentTermsType) return "Not set";
  const label = terms.paymentTermsType.replace(/^./, (letter) => letter.toUpperCase());
  return terms.creditPeriodDays ? `${label} · ${terms.creditPeriodDays} days` : label;
}
