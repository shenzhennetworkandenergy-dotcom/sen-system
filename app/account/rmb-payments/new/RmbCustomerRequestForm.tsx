"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createRmbCustomerRequestAction, type RmbCustomerRequestState, type RmbCustomerRequestValues } from "../actions";
import type { RmbCurrencyOption, RmbPaymentMethodOption, RmbRateOption } from "@/lib/rmb-payments/data";

const blankValues: RmbCustomerRequestValues = {
  currency: "RMB", amount: "", expectedRateId: "", payeeOrganization: "", payeeName: "", payeePhone: "", payeeAddress: "", payeeAccountDetails: "", chinaPaymentMethodId: "", chinaDestinationType: "", chinaBankName: "", chinaAccountName: "", chinaBankAccountNumber: "", chinaBankBranch: "", chinaBankCode: "", chinaWalletId: "", chinaCashRecipientName: "", chinaCashRecipientContact: "", chinaCashInstructionNote: "", customerPaymentMethodId: "", customerPaymentReference: "", customerPaymentNote: "", customerInstruction: "",
};
const inputClass = "mt-1 w-full rounded-lg border px-3 py-2 font-normal";

type Props = { currencies: RmbCurrencyOption[]; rates: RmbRateOption[]; methods: RmbPaymentMethodOption[]; initialCurrency: string; initialRate: RmbRateOption | null };

function rateFor(rates: RmbRateOption[], currency: string) { return rates.find((rate) => rate.currency_code === currency) ?? null; }

export default function RmbCustomerRequestForm({ currencies, rates, methods, initialCurrency, initialRate }: Props) {
  const initialValues = { ...blankValues, currency: initialCurrency, expectedRateId: initialRate?.id ?? "" };
  const initialState: RmbCustomerRequestState = { error: "", values: initialValues, currentRate: initialRate };
  const [state, formAction, pending] = useActionState(createRmbCustomerRequestAction, initialState);
  const [values, setValues] = useState(initialValues);
  const [rate, setRate] = useState(initialRate);
  useEffect(() => {
    if (state.error) { setValues(state.values); setRate(state.currentRate ?? rateFor(rates, state.values.currency)); }
  }, [state, rates]);
  const update = (key: keyof RmbCustomerRequestValues, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const customerMethods = methods.filter((method) => ["CUSTOMER_PAYMENT", "BOTH"].includes(method.context));
  const chinaMethods = methods.filter((method) => ["CHINA_PAYMENT", "BOTH"].includes(method.context));
  const selectedChina = chinaMethods.find((method) => method.id === values.chinaPaymentMethodId) ?? null;
  const payable = Number(values.amount) > 0 && rate ? Math.round(Number(values.amount) * Number(rate.rate_bdt) * 100) / 100 : 0;
  const currencyOptions = useMemo(() => currencies.map((currency) => ({ ...currency, rate: rateFor(rates, currency.code) })), [currencies, rates]);
  return <form action={formAction} className="space-y-5">
    {state.error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{state.error}</p> : null}
    <section className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">Amount and current rate</h2><div className="mt-3 grid gap-4 md:grid-cols-3">
      <label className="font-semibold">Currency<select name="currency" value={values.currency} onChange={(event) => { const currency = event.target.value; const next = rateFor(rates, currency); setValues((current) => ({ ...current, currency, expectedRateId: next?.id ?? "" })); setRate(next); }} className={inputClass} required>{currencyOptions.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.name}</option>)}</select></label>
      <label className="font-semibold">Foreign amount<input name="amount" type="number" min="0.0001" step="0.0001" value={values.amount} onChange={(event) => update("amount", event.target.value)} className={inputClass} required /></label>
      <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">Current rate · read-only</p><p className="mt-1 text-xl font-bold">{rate ? `${Number(rate.rate_bdt).toFixed(6)} BDT / ${values.currency}` : "Not configured"}</p><p className="mt-3 text-xs font-semibold uppercase text-slate-500">Estimated BDT payable · read-only</p><p className="mt-1 text-xl font-bold">BDT {payable.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
    </div><input type="hidden" name="expected_rate_id" value={values.expectedRateId} /></section>
    <section className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">China payee and destination</h2><div className="mt-3 grid gap-4 md:grid-cols-2">
      <label className="font-semibold">Payee organization<input name="payee_organization" value={values.payeeOrganization} onChange={(event) => update("payeeOrganization", event.target.value)} className={inputClass} /></label>
      <label className="font-semibold">Payee name<input name="payee_name" value={values.payeeName} onChange={(event) => update("payeeName", event.target.value)} className={inputClass} required /></label>
      <label className="font-semibold">Payee phone<input name="payee_phone" value={values.payeePhone} onChange={(event) => update("payeePhone", event.target.value)} className={inputClass} /></label>
      <label className="font-semibold">Payee address<input name="payee_address" value={values.payeeAddress} onChange={(event) => update("payeeAddress", event.target.value)} className={inputClass} /></label>
      <label className="font-semibold md:col-span-2">Destination/payment details<textarea name="payee_account_details" value={values.payeeAccountDetails} onChange={(event) => update("payeeAccountDetails", event.target.value)} className={inputClass} placeholder="Account or payment instruction" /></label>
      <label className="font-semibold">China payment method<select name="china_payment_method_id" value={values.chinaPaymentMethodId} onChange={(event) => { const method = chinaMethods.find((item) => item.id === event.target.value); setValues((current) => ({ ...current, chinaPaymentMethodId: event.target.value, chinaDestinationType: method?.method_type ?? "" })); }} className={inputClass}><option value="">Select when known</option>{chinaMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
      <label className="font-semibold">Destination QR (optional)<input name="china_destination_qr" type="file" accept="image/*" className={inputClass} /></label>
    </div><input type="hidden" name="china_destination_type" value={values.chinaDestinationType} />
      {selectedChina?.method_type === "BANK" ? <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="font-semibold">Bank name<input name="china_bank_name" value={values.chinaBankName} onChange={(event) => update("chinaBankName", event.target.value)} className={inputClass} /></label><label className="font-semibold">Account name<input name="china_account_name" value={values.chinaAccountName} onChange={(event) => update("chinaAccountName", event.target.value)} className={inputClass} /></label><label className="font-semibold">Account number<input name="china_bank_account_number" value={values.chinaBankAccountNumber} onChange={(event) => update("chinaBankAccountNumber", event.target.value)} className={inputClass} /></label><label className="font-semibold">Branch<input name="china_bank_branch" value={values.chinaBankBranch} onChange={(event) => update("chinaBankBranch", event.target.value)} className={inputClass} /></label><label className="font-semibold">SWIFT / bank code<input name="china_bank_code" value={values.chinaBankCode} onChange={(event) => update("chinaBankCode", event.target.value)} className={inputClass} /></label></div> : null}
      {selectedChina && ["WECHAT", "ALIPAY"].includes(selectedChina.method_type) ? <label className="mt-4 block font-semibold">Wallet ID / phone<input name="china_wallet_id" value={values.chinaWalletId} onChange={(event) => update("chinaWalletId", event.target.value)} className={inputClass} /></label> : null}
      {selectedChina?.method_type === "CASH" ? <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="font-semibold">Cash recipient<input name="china_cash_recipient_name" value={values.chinaCashRecipientName} onChange={(event) => update("chinaCashRecipientName", event.target.value)} className={inputClass} /></label><label className="font-semibold">Contact<input name="china_cash_recipient_contact" value={values.chinaCashRecipientContact} onChange={(event) => update("chinaCashRecipientContact", event.target.value)} className={inputClass} /></label><label className="font-semibold md:col-span-2">Instruction<textarea name="china_cash_instruction_note" value={values.chinaCashInstructionNote} onChange={(event) => update("chinaCashInstructionNote", event.target.value)} className={inputClass} /></label></div> : null}
    </section>
    <section className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">Optional customer payment information</h2><div className="mt-3 grid gap-4 md:grid-cols-2"><label className="font-semibold">Payment method<select name="customer_payment_method_id" value={values.customerPaymentMethodId} onChange={(event) => update("customerPaymentMethodId", event.target.value)} className={inputClass}><option value="">Select when known</option>{customerMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label><label className="font-semibold">Payment reference<input name="customer_payment_reference" value={values.customerPaymentReference} onChange={(event) => update("customerPaymentReference", event.target.value)} className={inputClass} /></label><label className="font-semibold md:col-span-2">Payment proof (optional)<input name="customer_payment_proof" type="file" accept="image/*" className={inputClass} /></label><label className="font-semibold md:col-span-2">Payment note<textarea name="customer_payment_note" value={values.customerPaymentNote} onChange={(event) => update("customerPaymentNote", event.target.value)} className={inputClass} /></label></div></section>
    <section className="rounded-xl border bg-[var(--surface)] p-5"><label className="block font-semibold">Customer instruction<textarea name="customer_instruction" value={values.customerInstruction} onChange={(event) => update("customerInstruction", event.target.value)} className={inputClass} maxLength={2000} /></label><button disabled={pending || !rate} className="mt-4 rounded-lg bg-[var(--primary)] px-5 py-2 font-semibold text-white">{pending ? "Submitting…" : "Submit RMB request"}</button></section>
  </form>;
}
