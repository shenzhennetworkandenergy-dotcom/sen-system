import {
  resolveSalesVisibilityScope,
  type SalesVisibilityScope,
} from "../sales/visibility.ts";

/**
 * Shared, side-effect-free contracts for Receivables reporting.
 *
 * This module deliberately contains no database access.  Keeping the policy
 * and DTO helpers pure makes it possible to exercise the security boundary in
 * unit tests before any service-role query is made.
 */

export const REPORT_TIME_ZONE = "Asia/Dhaka" as const;
export const REPORT_MAX_PAGE_SIZE = 100;
export const REPORT_DEFAULT_PAGE_SIZE = 25;
export const REPORT_MAX_SEARCH_LENGTH = 80;
export const REPORT_MAX_PAGE = 100_000;

export type ReportingProfile = {
  id: string;
  role: string;
  status: string;
  archived_at?: string | null;
  archivedAt?: string | null;
};

export type ReceivablesReportScope = {
  actorProfileId: string | null;
  isAdmin: boolean;
  canViewReceivables: boolean;
  canViewCustomer: boolean;
  canViewCustomerReceivables: boolean;
  canViewLoans: boolean;
  canViewAccountingDetails: boolean;
  canViewPayrollDetails: boolean;
  salesScope: SalesVisibilityScope;
};

type ScopeInput = {
  profile: ReportingProfile | null | undefined;
  permissions?: ReadonlySet<string> | Iterable<string>;
};

function permissionSet(permissions: ScopeInput["permissions"]): ReadonlySet<string> {
  if (!permissions) return new Set<string>();
  return permissions instanceof Set ? permissions : new Set(permissions);
}

function profileIsActive(profile: ReportingProfile | null | undefined) {
  const hasArchiveState = Boolean(
    profile
      && (Object.hasOwn(profile, "archived_at") || Object.hasOwn(profile, "archivedAt")),
  );
  const archivedAt = profile && Object.hasOwn(profile, "archived_at")
    ? profile.archived_at
    : profile?.archivedAt;
  return Boolean(
    profile
      && profile.status === "active"
      && hasArchiveState
      && archivedAt === null,
  );
}

/**
 * Resolve every reporting permission from one actor snapshot.
 *
 * Admin is a bypass only while the profile is active and not archived.  For
 * non-admin users, the Receivables module permission is the outer gate and
 * category permissions are intersected with the authoritative Sales scope.
 * Payroll detail is intentionally limited to the same active-admin boundary
 * used by the HR payroll/RLS implementation; `hr.view_payroll` alone is not a
 * substitute for that authority.
 */
export function normalizeReportingScope({ profile, permissions: rawPermissions }: ScopeInput): ReceivablesReportScope {
  const permissions = permissionSet(rawPermissions);
  const active = profileIsActive(profile);
  const isAdmin = active && profile?.role === "admin";
  const actorProfileId = profile?.id ?? null;

  if (!active || !profile) {
    return {
      actorProfileId,
      isAdmin: false,
      canViewReceivables: false,
      canViewCustomer: false,
      canViewCustomerReceivables: false,
      canViewLoans: false,
      canViewAccountingDetails: false,
      canViewPayrollDetails: false,
      salesScope: { kind: "none" },
    };
  }

  if (isAdmin) {
    return {
      actorProfileId,
      isAdmin: true,
      canViewReceivables: true,
      canViewCustomer: true,
      canViewCustomerReceivables: true,
      canViewLoans: true,
      canViewAccountingDetails: true,
      canViewPayrollDetails: true,
      salesScope: { kind: "all" },
    };
  }

  const canViewReceivables = profile.role === "employee" && permissions.has("receivables.view");
  // Delegate the actual own/all decision to the existing Sales visibility
  // resolver so every Receivables surface follows the same ownership rule.
  const salesScope: SalesVisibilityScope = resolveSalesVisibilityScope({
    role: profile.role,
    status: profile.status,
    profileId: profile.id,
    permissions,
  });
  const canViewCustomer = canViewReceivables && permissions.has("receivables.view_customer");
  const canViewCustomerReceivables = canViewCustomer && salesScope.kind !== "none";
  const canViewLoans = canViewReceivables && permissions.has("receivables.view_loans");

  return {
    actorProfileId,
    isAdmin: false,
    canViewReceivables,
    canViewCustomer,
    canViewCustomerReceivables,
    canViewLoans,
    canViewAccountingDetails: canViewLoans && permissions.has("accounting.view"),
    canViewPayrollDetails: false,
    salesScope: canViewCustomerReceivables ? salesScope : { kind: "none" },
  };
}

// The explicit name is used by route code and makes the policy boundary easy
// to find during review.
export const resolveReceivablesReportScope = normalizeReportingScope;

function parseDhakaDate(value: string): { date: string; startUtc: string } {
  const normalizedValue = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    throw new RangeError("Reporting date must be a valid YYYY-MM-DD date.");
  }
  const start = new Date(`${normalizedValue}T00:00:00+06:00`);
  if (Number.isNaN(start.getTime())) {
    throw new RangeError("Reporting date must be a valid calendar date.");
  }
  // Dhaka has a fixed UTC+06:00 offset.  Round-trip the local date to reject
  // JavaScript's silent normalisation of values such as 2026-02-31.
  const roundTrip = new Date(start.getTime() + 6 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  if (roundTrip !== normalizedValue) {
    throw new RangeError("Reporting date must be a valid calendar date.");
  }
  return { date: normalizedValue, startUtc: start.toISOString() };
}

export type DhakaDateRange = {
  fromDate: string | null;
  toDate: string | null;
  startUtc: string | null;
  endUtc: string | null;
};

/** Convert inclusive Dhaka calendar dates to a half-open UTC interval. */
export function normalizeDhakaDateRange(input: {
  from?: string | null;
  to?: string | null;
}): DhakaDateRange {
  const from = input.from ? parseDhakaDate(input.from) : null;
  const to = input.to ? parseDhakaDate(input.to) : null;
  if (from && to && from.date > to.date) {
    throw new RangeError("Reporting date range must start before or equal to its end.");
  }
  const endUtc = to
    ? new Date(new Date(to.startUtc).getTime() + 24 * 60 * 60 * 1000).toISOString()
    : null;
  return {
    fromDate: from?.date ?? null,
    toDate: to?.date ?? null,
    startUtc: from?.startUtc ?? null,
    endUtc,
  };
}

/** Remove PostgREST filter syntax and keep search bounded. */
export function normalizeReportingSearch(value: unknown): string {
  return String(value ?? "")
    .trim()
    .slice(0, REPORT_MAX_SEARCH_LENGTH)
    // Keep human-searchable letters/numbers and a few common identifier
    // characters; remove all PostgREST expression delimiters and wildcards.
    .replace(/[^\p{L}\p{N}\s@+:/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ReportingListParams = {
  page: number;
  pageSize: number;
  search: string;
  currency: string;
  dueFrom: string | null;
  dueTo: string | null;
  dateRange: DhakaDateRange;
};

export function normalizeReportingCurrency(value: unknown): string {
  const currency = String(value ?? "").trim().toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    throw new RangeError("Currency filters must use a three-letter ISO-style code.");
  }
  return currency;
}

/** Hide the Payroll-only repayment channel from viewers without Payroll detail authority. */
export function sanitizeReportingRepaymentMethod(
  value: unknown,
  visibility: { canViewPayrollDetails: boolean },
): string | null {
  if (value == null) return null;
  const method = String(value).trim();
  if (!method) return null;
  const normalized = method.toLowerCase().replace(/[\s-]+/g, "_");
  if (!visibility.canViewPayrollDetails && (
    normalized === "salary_deduction"
    || normalized.includes("payroll")
  )) {
    return "payroll-linked";
  }
  return method;
}

function boundedInteger(value: unknown, fallback: number, maximum: number) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(maximum, parsed);
}

export function normalizeReportingListParams(input: {
  q?: string | null;
  page?: string | number | null;
  pageSize?: string | number | null;
  currency?: string | null;
  dueFrom?: string | null;
  dueTo?: string | null;
}): ReportingListParams {
  const dateRange = normalizeDhakaDateRange({ from: input.dueFrom, to: input.dueTo });
  const currency = normalizeReportingCurrency(input.currency);
  return {
    page: boundedInteger(input.page, 1, REPORT_MAX_PAGE),
    pageSize: boundedInteger(input.pageSize, REPORT_DEFAULT_PAGE_SIZE, REPORT_MAX_PAGE_SIZE),
    search: normalizeReportingSearch(input.q),
    currency,
    dueFrom: dateRange.fromDate,
    dueTo: dateRange.toDate,
    dateRange,
  };
}

export type ReportingAmountRow = { currency: string; amount: number | string };
export type CurrencyAmountSummary = { currency: string; total: number; count: number };

/** Group money without an implicit currency or FX conversion. */
export function groupReportingAmountsByCurrency(rows: readonly ReportingAmountRow[]): CurrencyAmountSummary[] {
  const grouped = new Map<string, CurrencyAmountSummary>();
  for (const row of rows) {
    const currency = normalizeReportingCurrency(row.currency);
    if (!currency) throw new RangeError("A valid three-letter currency code is required.");
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) throw new RangeError("Reporting amount must be finite.");
    const current = grouped.get(currency) ?? { currency, total: 0, count: 0 };
    current.total += amount;
    current.count += 1;
    grouped.set(currency, current);
  }
  return [...grouped.values()].sort((left, right) => left.currency.localeCompare(right.currency));
}

const ACCOUNTING_KEY = /(?:^|_)(?:accounting|journal|cashbook|cash_book|posting)(?:_|$)/i;
const PAYROLL_KEY = /(?:^|_)(?:payroll|salary|gross|net|deduction)(?:_|$)/i;
const CONTROLLED_UNPOSTED_NOTICE = /^(?:opening\s*\/\s*existing\s+receivable\s+created\s+without\s+historical\s+accounting\s+posting\.?|receivable\s+(?:disbursement|repayment)\s+recorded(?:\s+operationally)?\s+without\s+accounting\s+posting\.?)$/i;

function normalizeSensitiveTokens(value: string) {
  return value
    // Split camelCase and acronym-to-word boundaries before lower-casing.  A
    // per-uppercase-character transform would turn PAYROLL into
    // p_a_y_r_o_l_l and let protected values bypass the token checks.
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");
}

function hasAccountingToken(value: string) {
  return ACCOUNTING_KEY.test(normalizeSensitiveTokens(value));
}

function hasPayrollToken(value: string) {
  return PAYROLL_KEY.test(normalizeSensitiveTokens(value));
}

function keyIsProtected(key: string, visibility: { canViewAccountingDetails: boolean; canViewPayrollDetails: boolean }) {
  const normalized = normalizeSensitiveTokens(key);
  return (!visibility.canViewAccountingDetails && ACCOUNTING_KEY.test(normalized))
    || (!visibility.canViewPayrollDetails && PAYROLL_KEY.test(normalized));
}

function valueIsProtected(value: unknown, visibility: { canViewAccountingDetails: boolean; canViewPayrollDetails: boolean }) {
  if (typeof value !== "string") return false;
  return (!visibility.canViewAccountingDetails && hasAccountingToken(value))
    || (!visibility.canViewPayrollDetails && hasPayrollToken(value));
}

const DROP_METADATA_VALUE = Symbol("drop-reporting-metadata-value");

function sanitizeMetadataNode(
  value: unknown,
  visibility: { canViewAccountingDetails: boolean; canViewPayrollDetails: boolean },
): unknown {
  if (valueIsProtected(value, visibility)) return DROP_METADATA_VALUE;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeMetadataNode(item, visibility))
      .filter((item) => item !== DROP_METADATA_VALUE);
  }
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (keyIsProtected(key, visibility)) continue;
    const sanitized = sanitizeMetadataNode(child, visibility);
    if (sanitized !== DROP_METADATA_VALUE) output[key] = sanitized;
  }
  return output;
}

/** Recursively retain only non-protected metadata for a reporting DTO. */
export function sanitizeReportingMetadata(
  value: unknown,
  visibility: { canViewAccountingDetails: boolean; canViewPayrollDetails: boolean },
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return sanitizeMetadataNode(value, visibility) as Record<string, unknown>;
}

export type ReportingTransaction = {
  id: string;
  transactionType: string;
  direction: string;
  amount: number;
  effectiveDate: string;
  paymentMethod: string | null;
  source: string;
  operationId: string;
  reversalOfTransactionId: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
};

/**
 * Keep free-text reporting fields from carrying protected linkage when the
 * corresponding detail authority is absent.  Structured operational fields
 * remain available to the viewer.
 */
export function sanitizeReportingText(
  value: unknown,
  visibility: { canViewAccountingDetails: boolean; canViewPayrollDetails: boolean },
): string | null {
  if (value == null) return null;
  const text = String(value);
  // Only retain the exact system-authored unposted notices.  A broad
  // "without Accounting" exception would let a user-entered note smuggle a
  // journal identifier to an accounting-hidden viewer.
  const explicitlyUnposted = CONTROLLED_UNPOSTED_NOTICE.test(text.trim());
  if (!visibility.canViewAccountingDetails && !explicitlyUnposted && hasAccountingToken(text)) return null;
  if (!visibility.canViewPayrollDetails && hasPayrollToken(text)) return null;
  return text;
}

/** Mask payroll-linked reconciliation labels for non-Payroll viewers. */
export function sanitizeReportingAccountingLink(
  raw: Record<string, unknown>,
  visibility: { canViewPayrollDetails: boolean },
) {
  const source = String(raw.source ?? "");
  const paymentMethod = raw.paymentMethod ?? raw.payment_method;
  const normalizedSource = source.toLowerCase();
  const normalizedPaymentMethod = paymentMethod == null ? "" : String(paymentMethod).toLowerCase();
  const payrollLinked = normalizedSource.includes("payroll")
    || /salary[\s_-]*deduction/.test(normalizedPaymentMethod)
    || normalizedPaymentMethod.includes("payroll");
  const hidden = payrollLinked && !visibility.canViewPayrollDetails;
  return {
    source: hidden ? "payroll-linked" : source,
    paymentMethod: hidden
      ? "payroll-linked"
      : paymentMethod == null ? null : String(paymentMethod),
    notes: hidden ? null : sanitizeReportingText(raw.notes, {
      canViewAccountingDetails: true,
      canViewPayrollDetails: visibility.canViewPayrollDetails,
    }),
  };
}

/** Map a raw transaction into an explicit, privacy-aware reporting DTO. */
export function sanitizeReportingTransaction(
  raw: Record<string, unknown>,
  visibility: { canViewAccountingDetails: boolean; canViewPayrollDetails: boolean },
): ReportingTransaction {
  const source = String(raw.source ?? "");
  const paymentMethod = raw.paymentMethod ?? raw.payment_method;
  const normalizedSource = source.toLowerCase();
  const normalizedPaymentMethod = paymentMethod == null ? "" : String(paymentMethod).toLowerCase();
  const isPayrollLinked = normalizedSource.includes("payroll")
    || /salary[\s_-]*deduction/.test(normalizedPaymentMethod)
    || normalizedPaymentMethod.includes("payroll");
  const isAccountingLinked = normalizedSource.includes("accounting");
  const hidePayroll = isPayrollLinked && !visibility.canViewPayrollDetails;
  const hideAccounting = isAccountingLinked && !visibility.canViewAccountingDetails;
  const rawNotes = raw.notes == null ? null : String(raw.notes);
  return {
    id: String(raw.id ?? ""),
    transactionType: String(raw.transactionType ?? raw.transaction_type ?? ""),
    direction: String(raw.direction ?? ""),
    amount: Number(raw.amount ?? 0),
    effectiveDate: String(raw.effectiveDate ?? raw.effective_date ?? ""),
    paymentMethod: hidePayroll
      ? "payroll-linked"
      : sanitizeReportingRepaymentMethod(paymentMethod, visibility),
    source: hidePayroll ? "payroll-linked" : hideAccounting ? "financial-linked" : source,
    operationId: hidePayroll
      ? "payroll-linked"
      : hideAccounting
        ? "financial-linked"
        : String(raw.operationId ?? raw.operation_id ?? ""),
    reversalOfTransactionId: raw.reversalOfTransactionId == null && raw.reversal_of_transaction_id == null
      ? null
      : String(raw.reversalOfTransactionId ?? raw.reversal_of_transaction_id),
    notes: sanitizeReportingText(rawNotes, visibility),
    metadata: sanitizeReportingMetadata(raw.metadata, visibility),
    createdBy: raw.createdBy == null && raw.created_by == null
      ? null
      : String(raw.createdBy ?? raw.created_by),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
  };
}

export type ReportingAuditEntry = {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  description: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

function sanitizeObjectOrNull(
  value: unknown,
  visibility: { canViewAccountingDetails: boolean; canViewPayrollDetails: boolean },
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return sanitizeReportingMetadata(value, visibility);
}

/** Sanitize audit rows and omit protected-detail entries when unauthorized. */
export function sanitizeReportingAuditEntry(
  raw: Record<string, unknown>,
  visibility: { canViewAccountingDetails: boolean; canViewPayrollDetails: boolean },
): ReportingAuditEntry | null {
  const action = String(raw.action ?? "");
  const description = raw.description == null ? null : String(raw.description);
  // Keep the original casing so normalizeSensitiveTokens can split camelCase
  // linkage names such as journalEntryId, payrollRecordId, and grossPay.
  const text = `${action} ${description ?? ""}`;
  const explicitlyUnposted = Boolean(
    description
      && CONTROLLED_UNPOSTED_NOTICE.test(description.trim())
      && !hasAccountingToken(action),
  );
  if (!visibility.canViewAccountingDetails && !explicitlyUnposted && hasAccountingToken(text)) return null;
  if (!visibility.canViewPayrollDetails && hasPayrollToken(text)) return null;
  return {
    id: String(raw.id ?? ""),
    actorId: raw.actor_id == null && raw.actorId == null ? null : String(raw.actor_id ?? raw.actorId),
    actorRole: raw.actor_role == null && raw.actorRole == null ? null : String(raw.actor_role ?? raw.actorRole),
    action,
    description,
    oldValues: sanitizeObjectOrNull(raw.old_values ?? raw.oldValues, visibility),
    newValues: sanitizeObjectOrNull(raw.new_values ?? raw.newValues, visibility),
    metadata: sanitizeReportingMetadata(raw.metadata, visibility),
    createdAt: String(raw.created_at ?? raw.createdAt ?? ""),
  };
}
