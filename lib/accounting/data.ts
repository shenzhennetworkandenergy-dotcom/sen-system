import "server-only";
import { summarizeCashbookEntries } from "@/lib/accounting/cashbook";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const normalizeAuditStatus = (value: unknown, isClosed: boolean) => {
  const status = String(value ?? "").trim().toUpperCase();
  if (!isClosed) return "OPEN";
  if (["PENDING_AUDIT", "CORRECTION_REQUIRED", "APPROVED"].includes(status)) return status;
  return "PENDING_AUDIT";
};

type ActorNameRow = { id: string; full_name: string | null; company_name: string | null; email: string | null };

export async function getAccountingDashboard(selectedDate: string, options: { includeLedger?: boolean } = {}) {
  const db = createSupabaseAdminClient();
  const includeLedger = options.includeLedger ?? true;
  const emptyResult = Promise.resolve({ data: [], error: null });
  const [accounts, entries, lines, cashbookDays, cashbookDescriptions, cashbookEntries] = await Promise.all([
    includeLedger ? db.from("accounting_accounts").select("id,code,name,account_type,currency,is_active").order("code") : emptyResult,
    includeLedger ? db.from("journal_entries").select("id,entry_number,entry_date,description,status,currency,reference_type,posted_at,created_at").order("entry_date", { ascending: false }).limit(100) : emptyResult,
    includeLedger ? db.from("journal_lines").select("journal_entry_id,debit,credit") : emptyResult,
    db.from("cashbook_days")
      .select("business_date,opening_balance,closing_balance,is_closed,closed_at,closed_by,audit_status,reviewed_at,reviewed_by,review_comment,correction_reason,correction_requested_at,correction_requested_by")
      .lte("business_date", selectedDate)
      .or(`business_date.eq.${selectedDate},is_closed.eq.true`)
      .order("business_date", { ascending: false })
      .limit(1),
    db.from("cashbook_descriptions").select("id,name,transaction_type,is_active").eq("is_active", true).order("transaction_type").order("name"),
    db.from("cashbook_entries")
      .select("id,transaction_type,amount,payment_method,transaction_at,business_date,journal_entry_id,remark,cashbook_descriptions(name)")
      .eq("business_date", selectedDate)
      .order("transaction_at", { ascending: false }),
  ]);
  const error = accounts.error ?? entries.error ?? lines.error ?? cashbookDays.error ?? cashbookDescriptions.error ?? cashbookEntries.error;
  if (error) throw new Error("Unable to load accounting data.");
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const line of lines.data ?? []) {
    const current = totals.get(line.journal_entry_id) ?? { debit: 0, credit: 0 };
    current.debit += Number(line.debit);
    current.credit += Number(line.credit);
    totals.set(line.journal_entry_id, current);
  }
  const dailyEntries = (cashbookEntries.data ?? []).map((entry) => {
    const relatedDescription = entry.cashbook_descriptions as unknown as { name: string } | { name: string }[] | null;
    return {
      id: entry.id,
      transactionType: entry.transaction_type as "income" | "expense",
      amount: Number(entry.amount),
      paymentMethod: entry.payment_method as "cash" | "bank" | "mfs",
      transactionAt: entry.transaction_at,
      remark: entry.remark ?? "",
      businessDate: entry.business_date,
      journalEntryId: entry.journal_entry_id,
      description: Array.isArray(relatedDescription)
        ? relatedDescription[0]?.name ?? ""
        : relatedDescription?.name ?? "",
    };
  });

  const latestDay = cashbookDays.data?.[0];
  const selectedDay = latestDay?.business_date === selectedDate ? latestDay : null;
  let actorNames = new Map<string, ActorNameRow>();
  const actorIds = [selectedDay?.closed_by, selectedDay?.reviewed_by, selectedDay?.correction_requested_by]
    .filter((id): id is string => Boolean(id));
  if (actorIds.length) {
    const { data: people, error: peopleError } = await db
      .from("profiles")
      .select("id,full_name,company_name,email")
      .in("id", [...new Set(actorIds)]);
    if (peopleError) throw new Error("Unable to load accounting data.");
    actorNames = new Map(((people ?? []) as ActorNameRow[]).map((person) => [person.id, person]));
  }
  const actorName = (id: string | null | undefined) => {
    if (!id) return null;
    const person = actorNames.get(id);
    return person?.full_name?.trim() || person?.company_name?.trim() || person?.email?.trim() || null;
  };
  const openingBalance = selectedDay
    ? Number(selectedDay.opening_balance)
    : latestDay?.is_closed
      ? Number(latestDay.closing_balance ?? 0)
      : 0;
  const summary = summarizeCashbookEntries(dailyEntries, openingBalance);

  return {
    accounts: accounts.data ?? [],
    entries: (entries.data ?? []).map((entry) => ({ ...entry, ...(totals.get(entry.id) ?? { debit: 0, credit: 0 }) })),
    cashbook: {
      selectedDate,
      descriptions: (cashbookDescriptions.data ?? []).map((description) => ({
        id: description.id,
        name: description.name,
        transactionType: description.transaction_type as "income" | "expense",
      })),
      entries: dailyEntries,
      summary,
      day: {
        businessDate: selectedDay?.business_date ?? selectedDate,
        openingBalance,
        closingBalance: selectedDay?.is_closed ? Number(selectedDay.closing_balance) : summary.closing,
        isClosed: selectedDay?.is_closed ?? false,
        closedAt: selectedDay?.closed_at ?? null,
        closedBy: selectedDay?.closed_by ?? null,
        closedByName: actorName(selectedDay?.closed_by),
        auditStatus: normalizeAuditStatus(selectedDay?.audit_status, Boolean(selectedDay?.is_closed)),
        correctionReason: selectedDay?.correction_reason ?? null,
        correctionRequestedAt: selectedDay?.correction_requested_at ?? null,
        correctionRequestedBy: selectedDay?.correction_requested_by ?? null,
        correctionRequestedByName: actorName(selectedDay?.correction_requested_by),
        reviewedAt: selectedDay?.reviewed_at ?? null,
        reviewedBy: selectedDay?.reviewed_by ?? null,
        reviewedByName: actorName(selectedDay?.reviewed_by),
        reviewComment: selectedDay?.review_comment ?? null,
      },
    },
  };
}
