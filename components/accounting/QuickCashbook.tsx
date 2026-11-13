"use client";

import { useActionState, useMemo, useState, type SubmitEvent } from "react";
import {
  closeCashbookDayAction,
  createCashbookDescriptionAction,
  createCashbookEntryAction,
  resubmitCashbookCorrectionAction,
  setCashbookOpeningBalanceAction,
} from "@/app/admin/accounting/actions";
import { getBusinessDateTimeLocal, normalizeCashbookEntryInput, summarizeCashbookEntries, toCashbookTimestamp } from "@/lib/accounting/cashbook";
import { formatReceiptMethodForAccounting } from "@/lib/sales/payment-accounting";

type TransactionType = "income" | "expense";
type PaymentMethod = "cash" | "bank" | "mfs";
type Description = { id: string; name: string; transactionType: TransactionType };
type Entry = {
  id: string;
  descriptionId?: string;
  canCorrect?: boolean;
  transactionType: TransactionType;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionAt: string;
  description: string;
  remark: string;
  sourcePaymentMethod: string | null;
  salePaymentId: string | null;
  journalEntryNumber: string | null;
};
type CorrectionChange = (
  { operation: "save"; entryId: string | null } & ReturnType<typeof normalizeCashbookEntryInput>
) | { operation: "remove"; entryId: string };

const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const paymentMethods: PaymentMethod[] = ["cash", "bank", "mfs"];
const paymentLabels: Record<PaymentMethod, string> = { cash: "Cash (ক্যাশ)", bank: "Bank (ব্যাংক)", mfs: "MFS (বিকাশ/নগদ)" };
const typeLabels: Record<TransactionType, string> = { income: "Income (আয়)", expense: "Expense (ব্যয়)" };
const money = (value: number) => {
  const [whole, decimal] = Number(value || 0).toFixed(2).split(".");
  return `৳ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimal}`;
};
const dhakaTime = (value: string) => {
  const date = new Date(new Date(value).getTime() + 6 * 60 * 60 * 1000);
  const hour = date.getUTCHours();
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${String(hour % 12 || 12).padStart(2, "0")}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
};

export function QuickCashbook({
  selectedDate,
  defaultOccurredAt,
  statementGeneratedAt,
  descriptions,
  entries,
  summary,
  day,
  canCreate,
  canCreateDescription,
  showReference = false,
  readOnly = false,
}: {
  selectedDate: string;
  defaultOccurredAt: string;
  statementGeneratedAt: string;
  descriptions: Description[];
  entries: Entry[];
  summary: { opening: number; income: number; expense: number; net: number; closing: number };
  day: {
    id?: string | null;
    updatedAt?: string | null;
    openingBalance: number;
    closingBalance: number;
    isClosed: boolean;
    closedAt: string | null;
    businessDate?: string;
    auditStatus?: string;
    correctionReason?: string | null;
    reviewedAt?: string | null;
    reviewedBy?: string | null;
    reviewedByName?: string | null;
  };
  canCreate: boolean;
  canCreateDescription: boolean;
  showReference?: boolean;
  readOnly?: boolean;
}) {
  const [transactionType, setTransactionType] = useState<TransactionType>("income");
  const [changes, setChanges] = useState<CorrectionChange[]>([]);
  const [openingBalance, setOpeningBalance] = useState(day.openingBalance.toFixed(2));
  const [editing, setEditing] = useState<Entry | null>(null);
  const [entryFormVersion, setEntryFormVersion] = useState(0);
  const [entryError, setEntryError] = useState("");
  const [entryDirty, setEntryDirty] = useState(false);
  const [submission, submitCorrection, submitting] = useActionState(resubmitCashbookCorrectionAction, { error: "" });
  const correcting = !readOnly && canCreate && day.auditStatus === "CORRECTION_REQUIRED" && Boolean(day.id && day.updatedAt);
  const filteredDescriptions = useMemo(
    () => descriptions.filter((description) => description.transactionType === transactionType),
    [descriptions, transactionType],
  );
  const correctionEntries = new Map(entries.map((entry) => [entry.id, entry]));
  if (correcting) {
    for (const [index, change] of changes.entries()) {
      if (change.operation === "remove") {
        correctionEntries.delete(change.entryId);
        continue;
      }
      const description = descriptions.find((item) => item.id === change.descriptionId);
      if (!description || !change.occurredAt) continue;
      const id = change.entryId ?? `new-${index}`;
      correctionEntries.set(id, {
        id,
        descriptionId: description.id,
        canCorrect: true,
        description: description.name,
        transactionType: description.transactionType,
        amount: change.amount,
        paymentMethod: change.paymentMethod,
        transactionAt: toCashbookTimestamp(change.occurredAt, selectedDate),
        remark: change.remark,
        sourcePaymentMethod: null,
        salePaymentId: null,
        journalEntryNumber: null,
      });
    }
  }
  const correctionSummary = correcting
    ? summarizeCashbookEntries([...correctionEntries.values()], Number(openingBalance))
    : null;
  const incomeEntries = entries.filter((entry) => entry.transactionType === "income");
  const expenseEntries = entries.filter((entry) => entry.transactionType === "expense");

  function startEditing(entry: Entry | null) {
    setEditing(entry);
    setTransactionType(entry?.transactionType ?? "income");
    setEntryError("");
    setEntryDirty(false);
    setEntryFormVersion((version) => version + 1);
  }

  function stageCorrectionEntry(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const input = normalizeCashbookEntryInput({
        descriptionId: form.get("description_id"),
        remark: form.get("remark"),
        amount: form.get("amount"),
        paymentMethod: form.get("payment_method"),
        occurredAt: form.get("occurred_at"),
      });
      if (!input.occurredAt || input.amount <= 0) throw new Error("Enter the time and an amount of at least ৳0.01.");
      toCashbookTimestamp(input.occurredAt, selectedDate);
      const existingId = editing?.id ?? null;
      const newIndex = existingId?.startsWith("new-") ? Number(existingId.slice(4)) : null;
      const entryId = newIndex === null ? existingId : null;
      const change: CorrectionChange = { operation: "save", entryId, ...input };
      setChanges((current) => newIndex !== null
        ? current.map((item, index) => index === newIndex ? change : item)
        : [...current.filter((item) => !entryId || item.entryId !== entryId), change]);
      startEditing(null);
    } catch (error) {
      setEntryError(error instanceof Error ? error.message : "Check the correction entry.");
    }
  }

  function removeCorrectionEntry(entry: Entry) {
    if (entry.id.startsWith("new-")) {
      const index = Number(entry.id.slice(4));
      setChanges((current) => current.filter((_, currentIndex) => currentIndex !== index));
    } else {
      setChanges((current) => [...current.filter((item) => item.entryId !== entry.id), { operation: "remove", entryId: entry.id }]);
    }
    startEditing(null);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-6">
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          .cashbook-print-sheet, .cashbook-print-sheet * { visibility: visible !important; }
          .cashbook-print-sheet {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 8mm !important;
            box-sizing: border-box !important;
            overflow: visible !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .cashbook-company-header { display: block !important; }
          .cashbook-print-sheet tr { break-inside: avoid; page-break-inside: avoid; }
          .cashbook-signatures { margin-top: 12mm !important; padding-top: 0 !important; break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Accounting · Daily cash</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">কুইক ক্যাশবুক ও ক্যাশ ক্লোজিং সিস্টেম</h2>
        </div>
        {!readOnly ? <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-blue-200 bg-blue-50 p-2">
          <label className="text-xs font-bold text-slate-700">Specific day
            <input name="cashbook_date" type="date" defaultValue={selectedDate} required className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <button className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800">View daily balance</button>
        </form> : null}
      </div>

      {!readOnly && !correcting ? <form action={setCashbookOpeningBalanceAction} className="mb-4 grid items-end gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:grid-cols-[1fr_12rem_auto] print:hidden">
        <input type="hidden" name="cashbook_date" value={selectedDate} />
        <label htmlFor="cashbook-opening-balance" className="text-sm font-bold text-blue-800 sm:col-span-1">পূর্বের ক্যাশ ব্যালেন্স (Opening Cash / Previous Balance)</label>
        <input id="cashbook-opening-balance" name="opening_balance" type="number" min="0" step="0.01" defaultValue={day.openingBalance.toFixed(2)} disabled={day.isClosed || !canCreate} className={field} required />
        <button disabled={day.isClosed || !canCreate} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Save balance</button>
      </form> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl bg-slate-700 p-4 text-center text-white">
          <p className="text-xs font-bold">Previous Cash</p><strong className="mt-2 block text-xl">{money(summary.opening)}</strong>
        </article>
        <article className="rounded-xl bg-emerald-500 p-4 text-center text-white">
          <p className="text-xs font-bold">Total Income</p><strong className="mt-2 block text-xl">{money(summary.income)}</strong>
        </article>
        <article className="rounded-xl bg-red-600 p-4 text-center text-white">
          <p className="text-xs font-bold">Total Expense</p><strong className="mt-2 block text-xl">{money(summary.expense)}</strong>
        </article>
        <article className="rounded-xl bg-sky-600 p-4 text-center text-white">
          <p className="text-xs font-bold">Closing Balance</p><strong className="mt-2 block text-xl">{money(day.isClosed ? day.closingBalance : summary.closing)}</strong>
        </article>
      </div>

      <AuditStatusMessage day={day} />

      {!readOnly && !day.isClosed && entries.length > 0 ? (
        <p role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-center font-bold text-amber-900">
          Entries are saved in your personal cashbook. Close this day when finished to send it to Admin Cashbook Audit.
        </p>
      ) : null}

      {canCreate && !readOnly ? (
        <div className="print:hidden">
          {canCreateDescription ? <div className="mt-5 flex justify-end">
            <details className="group w-full rounded-xl border bg-white p-3 sm:w-auto sm:min-w-[30rem]">
              <summary className="cursor-pointer list-none rounded-lg bg-slate-800 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-slate-900">+ Create খাত/বিবরণ</summary>
              <form action={createCashbookDescriptionAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
                <input type="hidden" name="cashbook_date" value={selectedDate} />
                <label className="text-xs font-bold">Type
                  <select name="transaction_type" className={field} required>
                    <option value="income">{typeLabels.income}</option>
                    <option value="expense">{typeLabels.expense}</option>
                  </select>
                </label>
                <label className="text-xs font-bold">খাত/বিবরণ
                  <input name="name" minLength={2} maxLength={160} placeholder="e.g. Sales, Office rent" className={field} required />
                </label>
                <button className="self-end rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white">Create</button>
              </form>
            </details>
          </div> : null}

          {correcting ? (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <h3 className="font-bold text-amber-950">Correct Cashbook · {selectedDate}</h3>
              <label className="mt-3 block max-w-xs text-sm font-bold">পূর্বের ক্যাশ ব্যালেন্স (Opening Cash / Previous Balance)
                <input form="cashbook-correction-submit" name="opening_balance" type="number" min="0" step="0.01" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} className={field} required />
              </label>
              <ul className="mt-3 divide-y divide-amber-200">
                {[...correctionEntries.values()].map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-semibold">{entry.description} · {money(entry.amount)} · {typeLabels[entry.transactionType]}</p>
                    {entry.remark ? <p>{entry.remark}</p> : null}
                  </div>
                  {entry.canCorrect ? <div className="flex gap-2">
                    <button type="button" disabled={submitting} onClick={() => startEditing(entry)} className="rounded-md border border-slate-400 bg-white px-3 py-1.5 font-semibold">Edit</button>
                    <button type="button" disabled={submitting} onClick={() => removeCorrectionEntry(entry)} className="rounded-md border border-red-300 bg-white px-3 py-1.5 font-semibold text-red-800">Remove</button>
                  </div> : <span className="text-xs text-slate-600">Linked transaction</span>}
                </li>)}
              </ul>
              <p className="mt-2 text-sm font-semibold">Corrected closing balance {money(correctionSummary?.closing ?? 0)}</p>
              {changes.length ? <button type="button" disabled={submitting} onClick={() => { setChanges([]); startEditing(null); }} className="mt-2 text-sm font-semibold underline">Reset entry changes</button> : null}
            </div>
          ) : null}

          {!day.isClosed || correcting ? (
            <form key={entryFormVersion} action={correcting ? undefined : createCashbookEntryAction} onSubmit={correcting ? stageCorrectionEntry : undefined} onChange={correcting ? () => setEntryDirty(true) : undefined} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-[1.1fr_1.4fr_1fr_1.2fr_1.2fr_auto]">
              <input type="hidden" name="cashbook_date" value={selectedDate} />
              <label className="text-xs font-bold">Transaction type
                <select value={transactionType} onChange={(event) => setTransactionType(event.target.value as TransactionType)} className={field}>
                  <option value="income">{typeLabels.income}</option>
                  <option value="expense">{typeLabels.expense}</option>
                </select>
              </label>
              <label className="text-xs font-bold">খাত/বিবরণ
                <select name="description_id" key={transactionType} defaultValue={editing?.descriptionId} className={field} required disabled={!filteredDescriptions.length}>
                  {filteredDescriptions.map((description) => <option key={description.id} value={description.id}>{description.name}</option>)}
                </select>
                <span className="mt-2 block">Short remark</span>
                <textarea name="remark" defaultValue={editing?.remark} maxLength={240} rows={2} placeholder="Write a short remark (optional)" className={`${field} resize-y`} />
              </label>
              <label className="text-xs font-bold">Amount (৳)
                <input name="amount" defaultValue={editing?.amount} type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" className={field} required />
              </label>
              <label className="text-xs font-bold">Method
                <select name="payment_method" defaultValue={editing?.paymentMethod} className={field} required>
                  {paymentMethods.map((method) => <option key={method} value={method}>{paymentLabels[method]}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold">Date and time
                <input name="occurred_at" type="datetime-local" min={correcting ? `${selectedDate}T00:00` : undefined} max={correcting ? `${selectedDate}T23:59` : undefined} defaultValue={editing ? getBusinessDateTimeLocal(new Date(editing.transactionAt)) : defaultOccurredAt} className={field} required />
              </label>
              <button disabled={!filteredDescriptions.length || submitting} className="self-end rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{correcting ? editing ? "Save Entry Correction" : "Add Entry to Correction" : "এন্ট্রি যোগ করুন"}</button>
              {correcting && (editing || entryDirty) ? <button type="button" onClick={() => startEditing(null)} className="justify-self-start text-sm font-semibold underline">{editing ? "Cancel entry edit" : "Clear entry form"}</button> : null}
              {entryError ? <p role="alert" className="text-sm text-red-800 md:col-span-2 xl:col-span-6">{entryError}</p> : null}
            </form>
          ) : null}

          {correcting ? (
            <form id="cashbook-correction-submit" action={submitCorrection} className="mt-4 flex flex-wrap items-center justify-end gap-3">
              <input type="hidden" name="cashbook_date" value={selectedDate} />
              <input type="hidden" name="cashbook_day_id" value={day.id ?? ""} />
              <input type="hidden" name="statement_version" value={day.updatedAt ?? ""} />
              <input type="hidden" name="changes" value={JSON.stringify(changes)} />
              {submission.error ? <p role="alert" className="w-full rounded-lg bg-red-50 p-3 text-sm text-red-900">{submission.error}</p> : null}
              {editing || entryDirty ? <p className="text-sm text-amber-900">Save or clear the entry form before resubmitting.</p> : null}
              <button disabled={submitting || Boolean(editing) || entryDirty} className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-600 disabled:opacity-50">{submitting ? "Submitting…" : "Resubmit for Audit"}</button>
            </form>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-end gap-3">
            {!day.isClosed ? (
              <form action={closeCashbookDayAction}>
                <input type="hidden" name="cashbook_date" value={selectedDate} />
                <button className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-600">দিনের হিসাব ক্লোজ করুন (Close Today)</button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex justify-end print:hidden">
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-700">স্টেটমেন্ট প্রিন্ট করুন (Print Sheet)</button>
      </div>

      <article className="cashbook-print-sheet mt-5 rounded-xl border border-slate-300 bg-white p-5 text-slate-950 sm:p-7">
        <header className="cashbook-company-header hidden border-b-2 border-slate-800 pb-4 text-center print:block">
          <h2 className="text-2xl font-black tracking-wide">Shenzhen Energy &amp; Networks</h2>
          <p className="mt-2 text-xs leading-5">House 67, Level 3, Laboratory Road, New Elephant Road</p>
          <p className="text-xs leading-5">Behind Multiplan Center, Dhaka 1205, Bangladesh</p>
        </header>

        <header className="border-b border-slate-700 py-3 text-center">
          <h3 className="text-xl font-black">DAILY CASH STATEMENT</h3>
          <p className="mt-1 text-xs">Date: {selectedDate} · Generated: {statementGeneratedAt.replace("T", " ")} · Asia/Dhaka {day.isClosed && day.closedAt ? `· Closed ${dhakaTime(day.closedAt)}` : ""}</p>
        </header>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <StatementTable title="INCOME (আয় সমূহ)" entries={incomeEntries} emptyLabel="No income" showReference={showReference} />
          <StatementTable title="EXPENSE (ব্যয় / খরচ সমূহ)" entries={expenseEntries} emptyLabel="No expense" showReference={showReference} />
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-300 text-sm">
          <StatementTotal label="Previous Cash Balance (পূর্বের ক্যাশ)" value={summary.opening} />
          <StatementTotal label="(+) Total Income (আজকের মোট আয়)" value={summary.income} />
          <StatementTotal label="(-) Total Expense (আজকের মোট খরচ)" value={summary.expense} />
          <StatementTotal label="Closing Cash Balance (আজকের সমাপনী ব্যালেন্স)" value={day.isClosed ? day.closingBalance : summary.closing} closing />
        </div>

        <div className="cashbook-signatures mt-12 grid grid-cols-2 gap-12 text-center text-xs">
          <div><div className="mx-auto mb-2 w-36 border-t border-dashed border-slate-700" />প্রস্তুতকারীর স্বাক্ষর</div>
          <div><div className="mx-auto mb-2 w-36 border-t border-dashed border-slate-700" />অনুমোদনকারীর স্বাক্ষর</div>
        </div>
      </article>
    </section>
  );
}

function StatementTable({ title, entries, emptyLabel, showReference }: { title: string; entries: Entry[]; emptyLabel: string; showReference: boolean }) {
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-300">
      <h4 className="bg-slate-100 p-2 text-center text-sm font-black">{title}</h4>
      <table className="w-full text-xs">
        <thead><tr className="border-t bg-slate-50"><th className="p-2 text-left">খাত / বিবরণ</th>{showReference ? <th className="text-left">Reference</th> : null}<th className="text-left">মেথড</th><th className="pr-2 text-right">পরিমাণ (৳)</th></tr></thead>
        <tbody>
          {entries.map((entry) => <tr key={entry.id} className="border-t"><td className="p-2"><strong>{entry.description}</strong><span className="ml-2 text-[10px] text-slate-500">{dhakaTime(entry.transactionAt)}</span>{entry.remark ? <p className="mt-1 text-[11px] text-slate-600">{entry.remark}</p> : null}{entry.salePaymentId ? <p className="mt-1 text-[10px] font-semibold text-emerald-700">Auto Sales · {entry.journalEntryNumber || "Posted journal"} · Payment {entry.salePaymentId.slice(0, 8)}</p> : null}</td>{showReference ? <td>{entry.journalEntryNumber || (entry.salePaymentId ? `Payment ${entry.salePaymentId.slice(0, 8)}` : "—")}</td> : null}<td>{formatReceiptMethodForAccounting(entry.sourcePaymentMethod, entry.paymentMethod)}</td><td className="pr-2 text-right font-bold">{money(entry.amount)}</td></tr>)}
          {!entries.length ? <tr className="border-t"><td colSpan={showReference ? 4 : 3} className="p-3 text-center text-slate-500">{emptyLabel}</td></tr> : null}
        </tbody>
        <tfoot><tr className="border-t bg-slate-50 font-black"><td colSpan={showReference ? 3 : 2} className="p-2">Total</td><td className="pr-2 text-right">{money(total)}</td></tr></tfoot>
      </table>
    </div>
  );
}

function AuditStatusMessage({ day }: { day: { isClosed: boolean; auditStatus?: string; correctionReason?: string | null; reviewedAt?: string | null; reviewedBy?: string | null; reviewedByName?: string | null } }) {
  if (!day.isClosed) return null;
  const status = String(day.auditStatus ?? "PENDING_AUDIT").trim().toUpperCase();
  if (status === "CORRECTION_REQUIRED") {
    return <div role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-center font-bold text-amber-900"><p>Returned for correction by Admin.</p>{day.correctionReason ? <p className="mt-1 text-sm font-medium">Correction reason: {day.correctionReason}</p> : null}</div>;
  }
  if (status === "APPROVED") {
    const reviewer = day.reviewedByName || day.reviewedBy;
    const reviewed = [reviewer ? `Reviewed by ${reviewer}` : null, day.reviewedAt ? `on ${formatDhakaDateTime(day.reviewedAt)}` : null].filter(Boolean).join(" ");
    return <div role="status" className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-center font-bold text-emerald-900"><p>Cashbook audited and approved.</p>{reviewed ? <p className="mt-1 text-sm font-medium">{reviewed}</p> : null}</div>;
  }
  return <p role="status" className="mt-4 rounded-xl border border-blue-300 bg-blue-50 p-4 text-center font-bold text-blue-900">Cashbook closed and waiting for Admin audit.</p>;
}

function formatDhakaDateTime(value: string) {
  return new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function StatementTotal({ label, value, closing = false }: { label: string; value: number; closing?: boolean }) {
  return <div className={`flex items-center justify-between border-b p-3 last:border-b-0 ${closing ? "bg-slate-800 font-black text-white" : "font-bold"}`}><span>{label}</span><span>{money(value)}</span></div>;
}
