"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  closeCashbookDayAction,
  createCashbookDescriptionAction,
  createCashbookEntryAction,
  createCashbookTransactionTypeAction,
  setCashbookOpeningBalanceAction,
} from "@/app/admin/accounting/actions";

type BalanceEffect = "income" | "expense";
type PaymentMethod = "cash" | "bank" | "mfs";
type TransactionType = {
  id: string;
  nameEn: string;
  nameBn: string;
  balanceEffect: BalanceEffect;
};
type Description = {
  id: string;
  name: string;
  transactionTypeId: string;
  transactionType: BalanceEffect;
};
type Entry = {
  id: string;
  transactionType: BalanceEffect;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionAt: string;
  description: string;
  remark: string;
};

const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const paymentMethods: PaymentMethod[] = ["cash", "bank", "mfs"];
const paymentLabels: Record<PaymentMethod, string> = { cash: "Cash (ক্যাশ)", bank: "Bank (ব্যাংক)", mfs: "MFS (বিকাশ/নগদ)" };
const transactionTypeLabel = (transactionType: TransactionType) =>
  `${transactionType.nameEn} (${transactionType.nameBn})`;
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
  transactionTypes,
  descriptions,
  entries,
  summary,
  day,
  canCreate,
  canCreateDescription,
}: {
  selectedDate: string;
  defaultOccurredAt: string;
  statementGeneratedAt: string;
  transactionTypes: TransactionType[];
  descriptions: Description[];
  entries: Entry[];
  summary: { opening: number; income: number; expense: number; net: number; closing: number };
  day: { openingBalance: number; closingBalance: number; isClosed: boolean; closedAt: string | null };
  canCreate: boolean;
  canCreateDescription: boolean;
}) {
  const [availableTransactionTypes, setAvailableTransactionTypes] = useState(transactionTypes);
  const [transactionTypeId, setTransactionTypeId] = useState(transactionTypes[0]?.id ?? "");
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [typeMessage, setTypeMessage] = useState("");
  const [isCreatingType, startCreatingType] = useTransition();
  const filteredDescriptions = useMemo(
    () => descriptions.filter((description) => description.transactionTypeId === transactionTypeId),
    [descriptions, transactionTypeId],
  );
  const incomeEntries = entries.filter((entry) => entry.transactionType === "income");
  const expenseEntries = entries.filter((entry) => entry.transactionType === "expense");

  function handleTransactionTypeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setTypeMessage("");
    startCreatingType(async () => {
      const result = await createCashbookTransactionTypeAction(formData);
      setTypeMessage(result.message);
      if (!result.ok || !result.transactionType) return;
      setAvailableTransactionTypes((current) => [...current, result.transactionType!]);
      setTransactionTypeId(result.transactionType.id);
      form.reset();
      setIsTypeModalOpen(false);
    });
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
        <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-blue-200 bg-blue-50 p-2">
          <label className="text-xs font-bold text-slate-700">Specific day
            <input name="cashbook_date" type="date" defaultValue={selectedDate} required className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <button className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800">View daily balance</button>
        </form>
      </div>

      <form action={setCashbookOpeningBalanceAction} className="mb-4 grid items-end gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:grid-cols-[1fr_12rem_auto] print:hidden">
        <input type="hidden" name="cashbook_date" value={selectedDate} />
        <label htmlFor="cashbook-opening-balance" className="text-sm font-bold text-blue-800 sm:col-span-1">পূর্বের ক্যাশ ব্যালেন্স (Opening Cash / Previous Balance)</label>
        <input id="cashbook-opening-balance" name="opening_balance" type="number" min="0" step="0.01" defaultValue={day.openingBalance.toFixed(2)} disabled={day.isClosed || !canCreate} className={field} required />
        <button disabled={day.isClosed || !canCreate} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Save balance</button>
      </form>

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

      {canCreate ? (
        <div className="print:hidden">
          {canCreateDescription ? <>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <details className="group w-full rounded-xl border bg-white p-3 sm:w-auto sm:min-w-[30rem]">
                <summary className="cursor-pointer list-none rounded-lg bg-slate-800 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-slate-900">+ Create খাত/বিবরণ</summary>
                <form action={createCashbookDescriptionAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
                  <input type="hidden" name="cashbook_date" value={selectedDate} />
                  <label className="text-xs font-bold">Type
                    <select name="transaction_type_id" className={field} required>
                      {availableTransactionTypes.map((type) => <option key={type.id} value={type.id}>{transactionTypeLabel(type)}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold">খাত/বিবরণ
                    <input name="name" minLength={2} maxLength={160} placeholder="e.g. Sales, Office rent" className={field} required />
                  </label>
                  <button disabled={!availableTransactionTypes.length} className="self-end rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Create</button>
                </form>
              </details>
              <button
                type="button"
                onClick={() => { setTypeMessage(""); setIsTypeModalOpen(true); }}
                className="w-full self-start rounded-xl border bg-white p-3 text-sm font-bold sm:w-auto"
              >
                <span className="block rounded-lg bg-slate-800 px-4 py-2.5 text-white hover:bg-slate-900">+ Create Transaction Type</span>
              </button>
            </div>
            {typeMessage ? <p className="mt-2 text-right text-sm font-semibold text-slate-700" aria-live="polite">{typeMessage}</p> : null}
          </> : null}

          {day.isClosed ? (
            <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-center font-bold text-amber-900">This cashbook day is closed. Its statement is locked for audit.</p>
          ) : (
            <form action={createCashbookEntryAction} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-[1.1fr_1.4fr_1fr_1.2fr_1.2fr_auto]">
              <input type="hidden" name="cashbook_date" value={selectedDate} />
              <label className="text-xs font-bold">Transaction type
                <select value={transactionTypeId} onChange={(event) => setTransactionTypeId(event.target.value)} className={field}>
                  {availableTransactionTypes.map((type) => <option key={type.id} value={type.id}>{transactionTypeLabel(type)}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold">খাত/বিবরণ
                <select name="description_id" className={field} required disabled={!filteredDescriptions.length}>
                  {filteredDescriptions.map((description) => <option key={description.id} value={description.id}>{description.name}</option>)}
                </select>
                <span className="mt-2 block">Short remark</span>
                <textarea name="remark" maxLength={240} rows={2} placeholder="Write a short remark (optional)" className={`${field} resize-y`} />
              </label>
              <label className="text-xs font-bold">Amount (৳)
                <input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" className={field} required />
              </label>
              <label className="text-xs font-bold">Method
                <select name="payment_method" className={field} required>
                  {paymentMethods.map((method) => <option key={method} value={method}>{paymentLabels[method]}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold">Date and time
                <input name="occurred_at" type="datetime-local" defaultValue={defaultOccurredAt} className={field} required />
              </label>
              <button disabled={!filteredDescriptions.length} className="self-end rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">এন্ট্রি যোগ করুন</button>
            </form>
          )}

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

      {isTypeModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 print:hidden" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cashbook-transaction-type-title"
            className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl sm:p-6"
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <h3 id="cashbook-transaction-type-title" className="text-xl font-black">Create Transaction Type</h3>
                <p className="mt-1 text-sm text-slate-600">Add a reusable type to the Quick Cashbook dropdown.</p>
              </div>
              <button type="button" onClick={() => setIsTypeModalOpen(false)} aria-label="Close transaction type dialog" className="rounded-lg border px-3 py-1.5 text-lg font-bold">×</button>
            </header>
            <form onSubmit={handleTransactionTypeSubmit} className="mt-5 grid gap-4">
              <label className="text-sm font-bold">Transaction Type Name (English)
                <input name="name_en" minLength={2} maxLength={80} placeholder="e.g. Receivable" className={field} required autoFocus />
              </label>
              <label className="text-sm font-bold">Transaction Type Name (Bangla)
                <input name="name_bn" minLength={2} maxLength={80} placeholder="e.g. পাওনা" className={field} required />
              </label>
              <label className="text-sm font-bold">Cash Flow Effect
                <select name="balance_effect" className={field} required>
                  <option value="income">Income — adds to cash</option>
                  <option value="expense">Expense — subtracts from cash</option>
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-600">This preserves the existing income, expense, ledger, and closing-balance calculations.</span>
              </label>
              {typeMessage ? <p className="rounded-lg bg-slate-100 p-3 text-sm font-semibold" aria-live="polite">{typeMessage}</p> : null}
              <button disabled={isCreatingType} className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
                {isCreatingType ? "Saving…" : "Save Transaction Type"}
              </button>
            </form>
          </section>
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
          <StatementTable title="INCOME (আয় সমূহ)" entries={incomeEntries} emptyLabel="No income" />
          <StatementTable title="EXPENSE (ব্যয় / খরচ সমূহ)" entries={expenseEntries} emptyLabel="No expense" />
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

function StatementTable({ title, entries, emptyLabel }: { title: string; entries: Entry[]; emptyLabel: string }) {
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-300">
      <h4 className="bg-slate-100 p-2 text-center text-sm font-black">{title}</h4>
      <table className="w-full text-xs">
        <thead><tr className="border-t bg-slate-50"><th className="p-2 text-left">খাত / বিবরণ</th><th className="text-left">মেথড</th><th className="pr-2 text-right">পরিমাণ (৳)</th></tr></thead>
        <tbody>
          {entries.map((entry) => <tr key={entry.id} className="border-t"><td className="p-2"><strong>{entry.description}</strong><span className="ml-2 text-[10px] text-slate-500">{dhakaTime(entry.transactionAt)}</span>{entry.remark ? <p className="mt-1 text-[11px] text-slate-600">{entry.remark}</p> : null}</td><td>{paymentLabels[entry.paymentMethod]}</td><td className="pr-2 text-right font-bold">{money(entry.amount)}</td></tr>)}
          {!entries.length ? <tr className="border-t"><td colSpan={3} className="p-3 text-center text-slate-500">{emptyLabel}</td></tr> : null}
        </tbody>
        <tfoot><tr className="border-t bg-slate-50 font-black"><td colSpan={2} className="p-2">Total</td><td className="pr-2 text-right">{money(total)}</td></tr></tfoot>
      </table>
    </div>
  );
}

function StatementTotal({ label, value, closing = false }: { label: string; value: number; closing?: boolean }) {
  return <div className={`flex items-center justify-between border-b p-3 last:border-b-0 ${closing ? "bg-slate-800 font-black text-white" : "font-bold"}`}><span>{label}</span><span>{money(value)}</span></div>;
}
