import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function getAccountingDashboard() {
  const db = createSupabaseAdminClient();
  const [accounts, entries, lines] = await Promise.all([
    db.from("accounting_accounts").select("id,code,name,account_type,currency,is_active").order("code"),
    db.from("journal_entries").select("id,entry_number,entry_date,description,status,currency,reference_type,posted_at,created_at").order("entry_date", { ascending: false }).limit(100),
    db.from("journal_lines").select("journal_entry_id,debit,credit"),
  ]);
  const error = accounts.error ?? entries.error ?? lines.error;
  if (error) throw new Error("Unable to load accounting data.");
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const line of lines.data ?? []) {
    const current = totals.get(line.journal_entry_id) ?? { debit: 0, credit: 0 };
    current.debit += Number(line.debit);
    current.credit += Number(line.credit);
    totals.set(line.journal_entry_id, current);
  }
  return {
    accounts: accounts.data ?? [],
    entries: (entries.data ?? []).map((entry) => ({ ...entry, ...(totals.get(entry.id) ?? { debit: 0, credit: 0 }) })),
  };
}
