"use client";

import { useMemo, useState } from "react";
import { createJournalAction } from "@/app/admin/accounting/actions";

type Account = { id: string; code: string; name: string };
type Line = { key: number; account_id: string; description: string; debit: string; credit: string };
const field = "mt-1 w-full rounded-lg border p-3";

export function JournalForm({ accounts }: { accounts: Account[] }) {
  const [lines, setLines] = useState<Line[]>([
    { key: 1, account_id: accounts[0]?.id ?? "", description: "", debit: "", credit: "" },
    { key: 2, account_id: accounts[1]?.id ?? "", description: "", debit: "", credit: "" },
  ]);
  const update = (key: number, patch: Partial<Line>) => setLines((items) => items.map((item) => item.key === key ? { ...item, ...patch } : item));
  const debit = useMemo(() => lines.reduce((sum, line) => sum + Number(line.debit || 0), 0), [lines]);
  const credit = useMemo(() => lines.reduce((sum, line) => sum + Number(line.credit || 0), 0), [lines]);
  const payload = lines.map(({ account_id, description, debit, credit }) => ({ account_id, description, debit: Number(debit || 0), credit: Number(credit || 0) }));
  return <form action={createJournalAction} className="rounded-2xl border bg-[var(--surface)] p-5">
    <h2 className="text-lg font-semibold">New journal entry</h2>
    <div className="mt-4 grid gap-3 md:grid-cols-[12rem_8rem_1fr]">
      <label className="text-sm font-semibold">Entry date<input name="entry_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required className={field}/></label>
      <label className="text-sm font-semibold">Currency<input name="currency" defaultValue="BDT" maxLength={3} required className={field}/></label>
      <label className="text-sm font-semibold">Description<input name="description" minLength={2} maxLength={500} required className={field}/></label>
    </div>
    <input type="hidden" name="lines" value={JSON.stringify(payload)}/>
    <div className="mt-4 space-y-3">{lines.map((line) => <div key={line.key} className="grid gap-3 rounded-xl border p-3 md:grid-cols-[2fr_2fr_1fr_1fr_auto]">
      <label className="text-xs font-semibold">Account<select value={line.account_id} onChange={(event) => update(line.key, { account_id: event.target.value })} required className={field}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
      <label className="text-xs font-semibold">Line description<input value={line.description} onChange={(event) => update(line.key, { description: event.target.value })} className={field}/></label>
      <label className="text-xs font-semibold">Debit<input value={line.debit} onChange={(event) => update(line.key, { debit: event.target.value, credit: event.target.value ? "" : line.credit })} type="number" min="0" step="0.01" className={field}/></label>
      <label className="text-xs font-semibold">Credit<input value={line.credit} onChange={(event) => update(line.key, { credit: event.target.value, debit: event.target.value ? "" : line.debit })} type="number" min="0" step="0.01" className={field}/></label>
      <button type="button" onClick={() => setLines((items) => items.filter((item) => item.key !== line.key))} disabled={lines.length <= 2} className="self-end rounded-lg border px-3 py-3 text-sm">Remove</button>
    </div>)}</div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={() => setLines((items) => [...items, { key: Date.now(), account_id: accounts[0]?.id ?? "", description: "", debit: "", credit: "" }])} className="rounded-lg border px-4 py-2 font-semibold">Add line</button>
      <p className={`font-semibold ${debit === credit && debit > 0 ? "text-green-700" : "text-amber-800"}`}>Debit {debit.toFixed(2)} · Credit {credit.toFixed(2)}</p>
      <button disabled={!accounts.length || debit <= 0 || debit !== credit} className="rounded-lg bg-[var(--primary)] px-5 py-3 font-semibold text-[var(--primary-foreground)] disabled:opacity-50">Create draft</button>
    </div>
  </form>;
}
