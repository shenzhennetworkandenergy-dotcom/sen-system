"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import {
  createRmbCurrencyAction,
  createRmbCustomerAction,
  createRmbPaymentAction,
  createRmbPaymentMethodAction,
  type RmbCurrencyActionState,
  type RmbCustomerActionState,
  type RmbMethodActionState,
  type RmbPaymentFormState,
  type RmbPaymentFormValues,
} from "@/app/admin/rmb-payments/actions";
import { customerOptionLabel, filterCustomerOptions, type CustomerSearchOption } from "@/lib/customers/search";
import type { RmbCurrencyOption, RmbPaymentMethodOption, RmbPaymentMethodType } from "@/lib/rmb-payments/data";

const blankValues: RmbPaymentFormValues = {
  customer_id: "",
  customer_query: "",
  foreign_currency: "RMB",
  foreign_amount: "",
  agreed_bdt_rate: "",
  customer_payment_date: "",
  customer_payment_method_id: "",
  customer_payment_reference: "",
  customer_payment_note: "",
  payee_organization: "",
  payee_name: "",
  payee_address: "",
  payee_phone: "",
  payee_account_details: "",
  china_payment_method_id: "",
  china_destination_type: "",
  china_bank_name: "",
  china_account_name: "",
  china_account_number: "",
  china_bank_branch: "",
  china_bank_code: "",
  china_wallet_id: "",
  china_cash_recipient_name: "",
  china_cash_recipient_contact: "",
  china_cash_instruction_note: "",
  note: "",
};

const initialFormState: RmbPaymentFormState = { error: "", values: blankValues };
const initialCustomerState: RmbCustomerActionState = { status: "idle", message: "", customer: null };
const initialCurrencyState: RmbCurrencyActionState = { status: "idle", message: "", currency: null };
const initialMethodState: RmbMethodActionState = { status: "idle", message: "", method: null };
const inputClass = "mt-1 w-full rounded-lg border px-3 py-2 font-normal";

function MethodMessage({ state }: { state: RmbMethodActionState }) {
  return state.message ? <p className={`mt-2 text-sm ${state.status === "error" ? "text-red-700" : "text-emerald-700"}`}>{state.message}</p> : null;
}

export function RmbPaymentForm({
  customers: initialCustomers,
  currencies: initialCurrencies,
  methods: initialMethods,
}: {
  customers: CustomerSearchOption[];
  currencies: RmbCurrencyOption[];
  methods: RmbPaymentMethodOption[];
}) {
  const defaultCurrency = initialCurrencies.find((item) => item.code === "RMB")?.code || initialCurrencies[0]?.code || "";
  const [values, setValues] = useState({ ...blankValues, foreign_currency: defaultCurrency });
  const [customers, setCustomers] = useState(initialCustomers);
  const [currencies, setCurrencies] = useState(initialCurrencies);
  const [methods, setMethods] = useState(initialMethods);
  const [formState, formAction, pending] = useActionState(createRmbPaymentAction, initialFormState);
  const [customerState, customerAction, customerPending] = useActionState(createRmbCustomerAction, initialCustomerState);
  const [currencyState, currencyAction, currencyPending] = useActionState(createRmbCurrencyAction, initialCurrencyState);
  const [customerMethodState, customerMethodAction, customerMethodPending] = useActionState(createRmbPaymentMethodAction, initialMethodState);
  const [chinaMethodState, chinaMethodAction, chinaMethodPending] = useActionState(createRmbPaymentMethodAction, initialMethodState);

  useEffect(() => {
    if (formState.error) setValues(formState.values);
  }, [formState]);
  useEffect(() => {
    if (!customerState.customer) return;
    const customer = customerState.customer;
    setCustomers((current) => [customer, ...current.filter((item) => item.id !== customer.id)]);
    setValues((current) => ({ ...current, customer_id: customer.id, customer_query: customerOptionLabel(customer) }));
  }, [customerState.customer]);
  useEffect(() => {
    if (!currencyState.currency) return;
    const currency = currencyState.currency;
    setCurrencies((current) => [...current.filter((item) => item.code !== currency.code), currency].sort((a, b) => a.code.localeCompare(b.code)));
    setValues((current) => ({ ...current, foreign_currency: currency.code }));
  }, [currencyState.currency]);
  useEffect(() => {
    if (!customerMethodState.method) return;
    const method = customerMethodState.method;
    setMethods((current) => [...current.filter((item) => item.id !== method.id), method]);
    setValues((current) => ({ ...current, customer_payment_method_id: method.id }));
  }, [customerMethodState.method]);
  useEffect(() => {
    if (!chinaMethodState.method) return;
    const method = chinaMethodState.method;
    setMethods((current) => [...current.filter((item) => item.id !== method.id), method]);
    setValues((current) => ({ ...current, china_payment_method_id: method.id, china_destination_type: method.method_type }));
  }, [chinaMethodState.method]);

  const suggestions = useMemo(() => filterCustomerOptions(customers, values.customer_query), [customers, values.customer_query]);
  const selectedCustomer = customers.find((customer) => customer.id === values.customer_id) ?? null;
  const customerMethods = methods.filter((method) => ["CUSTOMER_PAYMENT", "BOTH"].includes(method.context));
  const chinaMethods = methods.filter((method) => ["CHINA_PAYMENT", "BOTH"].includes(method.context));
  const chinaMethod = chinaMethods.find((method) => method.id === values.china_payment_method_id) ?? null;
  const foreignAmount = Number(values.foreign_amount);
  const agreedRate = Number(values.agreed_bdt_rate);
  const estimatedBdt = foreignAmount > 0 && agreedRate > 0 ? Math.round(foreignAmount * agreedRate * 100) / 100 : 0;

  function update<K extends keyof RmbPaymentFormValues>(key: K, value: RmbPaymentFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function chooseChinaMethod(methodId: string) {
    const selected = chinaMethods.find((method) => method.id === methodId);
    setValues((current) => ({
      ...current,
      china_payment_method_id: methodId,
      china_destination_type: selected?.method_type || "",
    }));
  }

  return <div className="space-y-5">
    <form action={formAction} className="space-y-5 rounded-xl border bg-[var(--surface)] p-5">
      {formState.error ? <p aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{formState.error}</p> : null}

      <section>
        <h2 className="mb-3 text-lg font-bold">Customer and amount</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="relative md:col-span-2">
            <label className="font-semibold">Search existing customer
              <input name="customer_query" className={inputClass} autoComplete="off" value={values.customer_query} onChange={(event) => {
                update("customer_query", event.target.value);
                update("customer_id", "");
              }} placeholder="Name, company, email or phone" required />
            </label>
            <input type="hidden" name="customer_id" value={values.customer_id} />
            {values.customer_query.trim() && !selectedCustomer && suggestions.length ? <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-white shadow-lg">
              {suggestions.map((customer) => <button key={customer.id} type="button" className="block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-slate-50" onClick={() => setValues((current) => ({ ...current, customer_id: customer.id, customer_query: customerOptionLabel(customer) }))}>
                <strong className="block">{customer.full_name || customer.email}</strong>
                <span className="text-sm text-[var(--muted)]">{customer.company_name || customer.email}</span>
              </button>)}
            </div> : null}
            {selectedCustomer ? <p className="mt-2 text-sm text-emerald-700">Selected: {customerOptionLabel(selectedCustomer)}</p> : null}
          </div>
          <label className="font-semibold">Currency
            <select name="foreign_currency" required className={inputClass} value={values.foreign_currency} onChange={(event) => update("foreign_currency", event.target.value)}>
              {currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.name} ({currency.symbol})</option>)}
            </select>
          </label>
          <label className="font-semibold">Foreign amount<input name="foreign_amount" type="number" min="0.0001" step="0.0001" required className={inputClass} value={values.foreign_amount} onChange={(event) => update("foreign_amount", event.target.value)} /></label>
          <label className="font-semibold">Agreed BDT rate<input name="agreed_bdt_rate" type="number" min="0.000001" step="0.000001" required className={inputClass} value={values.agreed_bdt_rate} onChange={(event) => update("agreed_bdt_rate", event.target.value)} /></label>
          <div className="rounded-lg bg-slate-900 p-4 text-white"><p className="text-xs uppercase tracking-wide text-slate-300">Calculated BDT payable</p><p className="mt-1 text-2xl font-bold">BDT {estimatedBdt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="mt-1 text-xs text-slate-300">Confirmed authoritatively by the database.</p></div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Customer payment information</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="font-semibold">Bangladesh payment method
            <select name="customer_payment_method_id" className={inputClass} value={values.customer_payment_method_id} onChange={(event) => update("customer_payment_method_id", event.target.value)}>
              <option value="">Select when known</option>
              {customerMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
            </select>
          </label>
          <label className="font-semibold">Payment date<input name="customer_payment_date" type="date" className={inputClass} value={values.customer_payment_date} onChange={(event) => update("customer_payment_date", event.target.value)} /></label>
          <label className="font-semibold">Payment reference<input name="customer_payment_reference" className={inputClass} value={values.customer_payment_reference} onChange={(event) => update("customer_payment_reference", event.target.value)} /></label>
          <label className="font-semibold">Payment note<textarea name="customer_payment_note" className={inputClass} value={values.customer_payment_note} onChange={(event) => update("customer_payment_note", event.target.value)} /></label>
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">Payment evidence is uploaded on the job detail before marking Customer Paid.</p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">China payee snapshot</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="font-semibold">Payee organization<input name="payee_organization" className={inputClass} value={values.payee_organization} onChange={(event) => update("payee_organization", event.target.value)} /></label>
          <label className="font-semibold">Payee name<input name="payee_name" className={inputClass} value={values.payee_name} onChange={(event) => update("payee_name", event.target.value)} /></label>
          <label className="font-semibold">Payee phone<input name="payee_phone" className={inputClass} value={values.payee_phone} onChange={(event) => update("payee_phone", event.target.value)} /></label>
          <label className="font-semibold">Payee address<textarea name="payee_address" className={inputClass} value={values.payee_address} onChange={(event) => update("payee_address", event.target.value)} /></label>
          <label className="font-semibold md:col-span-2">General account/instruction details<textarea name="payee_account_details" className={inputClass} value={values.payee_account_details} onChange={(event) => update("payee_account_details", event.target.value)} /></label>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">China payment destination</h2>
        <label className="block font-semibold">China payment method
          <select name="china_payment_method_id" required className={inputClass} value={values.china_payment_method_id} onChange={(event) => chooseChinaMethod(event.target.value)}>
            <option value="">Select China payment method</option>
            {chinaMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
          </select>
        </label>
        <input type="hidden" name="china_destination_type" value={values.china_destination_type} />
        {chinaMethod?.method_type === "BANK" ? <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="font-semibold">Bank name<input required name="china_bank_name" className={inputClass} value={values.china_bank_name} onChange={(event) => update("china_bank_name", event.target.value)} /></label>
          <label className="font-semibold">Account name<input required name="china_account_name" className={inputClass} value={values.china_account_name} onChange={(event) => update("china_account_name", event.target.value)} /></label>
          <label className="font-semibold">Account number<input required name="china_account_number" className={inputClass} value={values.china_account_number} onChange={(event) => update("china_account_number", event.target.value)} /></label>
          <label className="font-semibold">Branch<input required name="china_bank_branch" className={inputClass} value={values.china_bank_branch} onChange={(event) => update("china_bank_branch", event.target.value)} /></label>
          <label className="font-semibold">SWIFT / bank code<input required name="china_bank_code" className={inputClass} value={values.china_bank_code} onChange={(event) => update("china_bank_code", event.target.value)} /></label>
        </div> : null}
        {chinaMethod && ["WECHAT", "ALIPAY"].includes(chinaMethod.method_type) ? <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="font-semibold">{chinaMethod.method_type === "WECHAT" ? "WeChat" : "Alipay"} ID / phone<input required name="china_wallet_id" className={inputClass} value={values.china_wallet_id} onChange={(event) => update("china_wallet_id", event.target.value)} /></label>
          <label className="font-semibold">QR image<input required name="china_destination_qr" type="file" accept="image/*" className={inputClass} /></label>
        </div> : null}
        {chinaMethod?.method_type === "CASH" ? <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="font-semibold">Recipient name<input required name="china_cash_recipient_name" className={inputClass} value={values.china_cash_recipient_name} onChange={(event) => update("china_cash_recipient_name", event.target.value)} /></label>
          <label className="font-semibold">Recipient contact<input name="china_cash_recipient_contact" className={inputClass} value={values.china_cash_recipient_contact} onChange={(event) => update("china_cash_recipient_contact", event.target.value)} /></label>
          <label className="font-semibold md:col-span-2">Cash instruction note<textarea name="china_cash_instruction_note" className={inputClass} value={values.china_cash_instruction_note} onChange={(event) => update("china_cash_instruction_note", event.target.value)} /></label>
        </div> : null}
        <p className="mt-3 text-sm text-[var(--muted)]">Actual China payment date, reference and evidence are recorded later when the job reaches China Payment Pending.</p>
      </section>

      <label className="block font-semibold">Internal note<textarea name="note" className={inputClass} value={values.note} onChange={(event) => update("note", event.target.value)} /></label>
      <div className="flex gap-3"><button disabled={pending} className="rounded-lg bg-[var(--primary)] px-5 py-2 font-semibold text-white disabled:opacity-60">{pending ? "Creating…" : "Create RMB Job"}</button><a href="/admin/rmb-payments" className="rounded-lg border px-5 py-2 font-semibold">Cancel</a></div>
    </form>

    <div className="grid gap-5 lg:grid-cols-2">
      <form action={currencyAction} className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">Add currency</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><input name="code" required maxLength={5} className={inputClass} placeholder="Code" /><input name="name" required className={inputClass} placeholder="Name" /><input name="symbol" required className={inputClass} placeholder="Symbol" /></div>{currencyState.message ? <p className={`mt-2 text-sm ${currencyState.status === "error" ? "text-red-700" : "text-emerald-700"}`}>{currencyState.message}</p> : null}<button disabled={currencyPending} className="mt-3 rounded-lg border px-4 py-2 font-semibold">{currencyPending ? "Adding…" : "Add Currency"}</button></form>
      <form action={customerAction} className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">Add shared customer</h2><div className="mt-3 grid gap-3 md:grid-cols-2"><input name="full_name" required className={inputClass} placeholder="Full name" /><input name="company_name" className={inputClass} placeholder="Company name (optional)" /><input name="email" type="email" required className={inputClass} placeholder="Email" /><input name="phone" required className={inputClass} placeholder="Phone" /><input name="address_line_1" required className={`${inputClass} md:col-span-2`} placeholder="Full address" /></div>{customerState.message ? <p className={`mt-2 text-sm ${customerState.status === "error" ? "text-red-700" : "text-emerald-700"}`}>{customerState.message}</p> : null}<button disabled={customerPending} className="mt-3 rounded-lg border px-4 py-2 font-semibold">{customerPending ? "Adding…" : "Add Customer"}</button></form>
      <form action={customerMethodAction} className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">Add Bangladesh payment method</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><input name="name" required className={inputClass} placeholder="Method name" /><select name="context" className={inputClass}><option value="CUSTOMER_PAYMENT">Customer payment</option><option value="BOTH">Both</option></select><select name="method_type" className={inputClass}><option value="OTHER">Other</option><option value="BANK">Bank</option><option value="CASH">Cash</option></select></div><MethodMessage state={customerMethodState} /><button disabled={customerMethodPending} className="mt-3 rounded-lg border px-4 py-2 font-semibold">{customerMethodPending ? "Adding…" : "Add Method"}</button></form>
      <form action={chinaMethodAction} className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">Add China payment method</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><input name="name" required className={inputClass} placeholder="Method name" /><select name="context" className={inputClass}><option value="CHINA_PAYMENT">China payment</option><option value="BOTH">Both</option></select><select name="method_type" className={inputClass}>{(["BANK", "WECHAT", "ALIPAY", "CASH", "OTHER"] as RmbPaymentMethodType[]).map((type) => <option key={type} value={type}>{type}</option>)}</select></div><MethodMessage state={chinaMethodState} /><button disabled={chinaMethodPending} className="mt-3 rounded-lg border px-4 py-2 font-semibold">{chinaMethodPending ? "Adding…" : "Add Method"}</button></form>
    </div>
  </div>;
}
