import "server-only";
import { summarizeCashbookEntries } from "@/lib/accounting/cashbook";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function getAccountingDashboard(selectedDate: string) {
  const db = createSupabaseAdminClient();
  const [accounts, entries, lines, cashbookDays, cashbookDescriptions, cashbookEntries] = await Promise.all([
    db.from("accounting_accounts").select("id,code,name,account_type,currency,is_active").order("code"),
    db.from("journal_entries").select("id,entry_number,entry_date,description,status,currency,reference_type,posted_at,created_at").order("entry_date", { ascending: false }).limit(100),
    db.from("journal_lines").select("journal_entry_id,debit,credit"),
    db.from("cashbook_days")
      .select("business_date,opening_balance,closing_balance,is_closed,closed_at")
      .lte("business_date", selectedDate)
      .or(`business_date.eq.${selectedDate},is_closed.eq.true`)
      .order("business_date", { ascending: false })
      .limit(1),
    db.from("cashbook_descriptions").select("id,name,transaction_type,is_active").eq("is_active", true).order("transaction_type").order("name"),
    db.from("cashbook_entries")
      .select("id,transaction_type,amount,payment_method,transaction_at,business_date,journal_entry_id,cashbook_descriptions(name)")
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
      businessDate: entry.business_date,
      journalEntryId: entry.journal_entry_id,
      description: Array.isArray(relatedDescription)
        ? relatedDescription[0]?.name ?? ""
        : relatedDescription?.name ?? "",
    };
  });

  const latestDay = cashbookDays.data?.[0];
  const selectedDay = latestDay?.business_date === selectedDate ? latestDay : null;
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
        openingBalance,
        closingBalance: selectedDay?.is_closed ? Number(selectedDay.closing_balance) : summary.closing,
        isClosed: selectedDay?.is_closed ?? false,
        closedAt: selectedDay?.closed_at ?? null,
      },
    },
  };
}
