import "server-only";

import { normalizeCashbookDate } from "@/lib/accounting/cashbook";
import { getAccountingDashboard } from "@/lib/accounting/data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const CASHBOOK_AUDIT_STATUSES = [
  "OPEN",
  "PENDING_AUDIT",
  "CORRECTION_REQUIRED",
  "APPROVED",
] as const;

export type CashbookAuditStatus = (typeof CASHBOOK_AUDIT_STATUSES)[number];
export type CashbookAuditActor = { id: string | null; name: string };
export type CashbookAuditDay = {
  businessDate: string;
  openingBalance: number;
  income: number;
  expense: number;
  closingBalance: number;
  isClosed: boolean;
  auditStatus: CashbookAuditStatus;
  correctionReason: string | null;
  closedAt: string | null;
  closedBy: CashbookAuditActor;
  reviewedAt: string | null;
  reviewedBy: CashbookAuditActor;
  reviewComment: string | null;
  correctionRequestedAt: string | null;
  correctionRequestedBy: CashbookAuditActor;
};

export type CashbookAuditStatement = Awaited<ReturnType<typeof getAccountingDashboard>>["cashbook"];

type CashbookDayRow = {
  business_date: string;
  opening_balance: number | string;
  closing_balance: number | string | null;
  is_closed: boolean;
  audit_status: string | null;
  closed_at: string | null;
  closed_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_comment: string | null;
  correction_reason: string | null;
  correction_requested_at: string | null;
  correction_requested_by: string | null;
};

type CashbookAmountRow = {
  business_date: string;
  transaction_type: string;
  amount: number | string;
};

type PersonRow = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
};

const DAY_FIELDS = [
  "business_date",
  "opening_balance",
  "closing_balance",
  "is_closed",
  "audit_status",
  "closed_at",
  "closed_by",
  "reviewed_at",
  "reviewed_by",
  "review_comment",
  "correction_reason",
  "correction_requested_at",
  "correction_requested_by",
].join(",");

/** Return null for malformed dates so callers never silently audit today's date. */
export function parseCashbookAuditDate(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  return normalizeCashbookDate(candidate, "") === candidate ? candidate : null;
}

export function normalizeCashbookAuditStatus(value: unknown, isClosed: boolean): CashbookAuditStatus {
  const status = String(value ?? "").trim().toUpperCase();
  if (!isClosed) return "OPEN";
  if (status === "PENDING_AUDIT" || status === "CORRECTION_REQUIRED" || status === "APPROVED") return status;
  // Legacy closed rows have no audit result and are pending by definition.
  return "PENDING_AUDIT";
}

function summarize(entries: CashbookAmountRow[]) {
  const totals = new Map<string, { income: number; expense: number }>();
  for (const entry of entries) {
    const total = totals.get(entry.business_date) ?? { income: 0, expense: 0 };
    if (String(entry.transaction_type).toLowerCase() === "income") total.income += Number(entry.amount) || 0;
    else total.expense += Number(entry.amount) || 0;
    totals.set(entry.business_date, total);
  }
  return totals;
}

async function peopleFor(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, PersonRow>();
  const { data, error } = await createSupabaseAdminClient()
    .from("profiles")
    .select("id,full_name,company_name,email")
    .in("id", unique);
  if (error) throw new Error("Unable to load cashbook audit actors.");
  return new Map(((data ?? []) as PersonRow[]).map((person) => [person.id, person]));
}

function actor(id: string | null | undefined, people: Map<string, PersonRow>): CashbookAuditActor {
  const person = id ? people.get(id) : undefined;
  return {
    id: id ?? null,
    name: person?.full_name?.trim() || person?.company_name?.trim() || person?.email?.trim() || "—",
  };
}

function toAuditDay(
  row: CashbookDayRow,
  totals: { income: number; expense: number },
  people: Map<string, PersonRow>,
): CashbookAuditDay {
  return {
    businessDate: row.business_date,
    openingBalance: Number(row.opening_balance) || 0,
    income: Number(totals.income) || 0,
    expense: Number(totals.expense) || 0,
    closingBalance: Number(row.closing_balance) || 0,
    isClosed: Boolean(row.is_closed),
    auditStatus: normalizeCashbookAuditStatus(row.audit_status, Boolean(row.is_closed)),
    correctionReason: row.correction_reason ?? null,
    closedAt: row.closed_at ?? null,
    closedBy: actor(row.closed_by, people),
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: actor(row.reviewed_by, people),
    reviewComment: row.review_comment ?? null,
    correctionRequestedAt: row.correction_requested_at ?? null,
    correctionRequestedBy: actor(row.correction_requested_by, people),
  };
}

export async function getCashbookAuditDays(): Promise<CashbookAuditDay[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("cashbook_days")
    .select(DAY_FIELDS)
    .eq("is_closed", true)
    .order("business_date", { ascending: false });
  if (error) throw new Error("Unable to load cashbook audit days.");

  const days = (data ?? []) as unknown as CashbookDayRow[];
  const dates = days.map((day) => day.business_date);
  let entries: CashbookAmountRow[] = [];
  if (dates.length) {
    const result = await db
      .from("cashbook_entries")
      .select("business_date,transaction_type,amount")
      .in("business_date", dates);
    if (result.error) throw new Error("Unable to load cashbook audit days.");
    entries = (result.data ?? []) as unknown as CashbookAmountRow[];
  }

  const totals = summarize(entries);
  const people = await peopleFor(days.flatMap((day) => [day.closed_by, day.reviewed_by, day.correction_requested_by]));
  return days.map((day) => toAuditDay(day, totals.get(day.business_date) ?? { income: 0, expense: 0 }, people));
}

export async function getCashbookAuditDay(value: unknown): Promise<{ day: CashbookAuditDay; statement: CashbookAuditStatement } | null> {
  const date = parseCashbookAuditDate(value);
  if (!date) return null;

  const db = createSupabaseAdminClient();
  const [{ data, error }, dashboard] = await Promise.all([
    db.from("cashbook_days").select(DAY_FIELDS).eq("business_date", date).maybeSingle(),
    getAccountingDashboard(date, { includeLedger: false }),
  ]);
  if (error || !data || !(data as unknown as CashbookDayRow).is_closed) return null;

  const row = data as unknown as CashbookDayRow;
  const people = await peopleFor([row.closed_by, row.reviewed_by, row.correction_requested_by]);
  const day = toAuditDay(row, {
    income: dashboard.cashbook.summary.income,
    expense: dashboard.cashbook.summary.expense,
  }, people);
  const statement: CashbookAuditStatement = {
    ...dashboard.cashbook,
    selectedDate: date,
    day: {
      ...dashboard.cashbook.day,
      businessDate: date,
      openingBalance: day.openingBalance,
      closingBalance: day.closingBalance,
      isClosed: true,
      closedAt: day.closedAt,
      closedBy: day.closedBy.id,
      closedByName: day.closedBy.name,
      auditStatus: day.auditStatus,
      correctionReason: day.correctionReason,
      correctionRequestedAt: day.correctionRequestedAt,
      correctionRequestedBy: day.correctionRequestedBy.id,
      correctionRequestedByName: day.correctionRequestedBy.name,
      reviewedAt: day.reviewedAt,
      reviewedBy: day.reviewedBy.id,
      reviewedByName: day.reviewedBy.name,
      reviewComment: day.reviewComment,
    },
  };
  return { day, statement };
}
