"use client";

import { useActionState, useState } from "react";
import type { DonationOption } from "@/lib/donation-expenses/data";
import { createDonationBeneficiaryAction } from "../actions";

const BENEFICIARY_TYPES = ["INDIVIDUAL", "FAMILY", "INSTITUTION", "MADRASA_MOSQUE", "OTHER"] as const;
const RELATIONSHIP_GROUPS = [
  "Immediate Family", "Relative", "Friend", "Neighbor", "Known Person", "Referred Person",
  "Unknown / External", "Religious Institution", "Charity Organization", "Other",
] as const;

const emptyValues = {
  beneficiary_type: "",
  name: "",
  phone: "",
  alternate_phone: "",
  whatsapp: "",
  city_district: "",
  country: "",
  address: "",
  relationship_group: "",
  relationship_type_id: "",
  relationship_note: "",
  referred_by_name: "",
  referred_by_phone: "",
  referred_by_note: "",
  notes: "",
  monthly_support_enabled: false,
  default_monthly_amount: "",
  reminder_day_of_month: "",
  support_start_date: "",
  support_end_date: "",
  default_category_id: "",
  default_payment_method_id: "",
  default_purpose: "",
};

const initialState = { error: "", field: "", values: emptyValues, revision: 0 };
const input = "rounded-lg border bg-background px-3 py-2";

function BeneficiaryFields({
  action,
  pending,
  state,
  relationshipTypes,
  categories,
  paymentMethods,
}: {
  action: (payload: FormData) => void;
  pending: boolean;
  state: typeof initialState;
  relationshipTypes: DonationOption[];
  categories: DonationOption[];
  paymentMethods: DonationOption[];
}) {
  const [monthlySupport, setMonthlySupport] = useState(state.values.monthly_support_enabled);
  const fieldClass = (name: string) => `${input}${state.field === name ? " border-red-500 ring-2 ring-red-200" : ""}`;
  const invalid = (name: string) => state.field === name || undefined;
  const focus = (name: string) => state.field === name;

  return <form action={action} className="grid gap-4 rounded-xl border bg-[var(--surface)] p-5 md:grid-cols-2">
    <h2 className="text-xl font-semibold md:col-span-2">Create Beneficiary</h2>
    {state.error ? <p aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 md:col-span-2">{state.error}</p> : null}
    <label className="grid gap-1 text-sm font-medium">Type<select name="beneficiary_type" required defaultValue={state.values.beneficiary_type} aria-invalid={invalid("beneficiary_type")} autoFocus={focus("beneficiary_type")} className={fieldClass("beneficiary_type")}><option value="">Select type</option>{BENEFICIARY_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-medium">Name<input name="name" required defaultValue={state.values.name} aria-invalid={invalid("name")} autoFocus={focus("name")} className={fieldClass("name")} /></label>
    <label className="grid gap-1 text-sm font-medium">Phone<input name="phone" defaultValue={state.values.phone} className={input} /></label>
    <label className="grid gap-1 text-sm font-medium">Alternate Phone<input name="alternate_phone" defaultValue={state.values.alternate_phone} className={input} /></label>
    <label className="grid gap-1 text-sm font-medium">WhatsApp<input name="whatsapp" defaultValue={state.values.whatsapp} className={input} /></label>
    <label className="grid gap-1 text-sm font-medium">City / District<input name="city_district" defaultValue={state.values.city_district} className={input} /></label>
    <label className="grid gap-1 text-sm font-medium">Country<input name="country" defaultValue={state.values.country} className={input} /></label>
    <label className="grid gap-1 text-sm font-medium md:col-span-2">Address<textarea name="address" rows={2} defaultValue={state.values.address} className={input} /></label>
    <label className="grid gap-1 text-sm font-medium">Relationship Group<select name="relationship_group" defaultValue={state.values.relationship_group} aria-invalid={invalid("relationship_group")} autoFocus={focus("relationship_group")} className={fieldClass("relationship_group")}><option value="">Not specified</option>{RELATIONSHIP_GROUPS.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-medium">Relationship Type<select name="relationship_type_id" defaultValue={state.values.relationship_type_id} className={input}><option value="">Not specified</option>{relationshipTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-medium md:col-span-2">Relationship Note<input name="relationship_note" defaultValue={state.values.relationship_note} className={input} /></label>
    <label className="grid gap-1 text-sm font-medium">Referred By Name<input name="referred_by_name" defaultValue={state.values.referred_by_name} className={input} /></label>
    <label className="grid gap-1 text-sm font-medium">Referred By Phone<input name="referred_by_phone" defaultValue={state.values.referred_by_phone} className={input} /></label>
    <label className="grid gap-1 text-sm font-medium md:col-span-2">Referral Note<input name="referred_by_note" defaultValue={state.values.referred_by_note} className={input} /></label>
    <label className="grid gap-1 text-sm font-medium md:col-span-2">General Notes<textarea name="notes" rows={2} defaultValue={state.values.notes} className={input} /></label>
    <label className="flex items-center gap-2 font-medium md:col-span-2"><input type="checkbox" name="monthly_support_enabled" checked={monthlySupport} onChange={(event) => setMonthlySupport(event.target.checked)} /> Monthly Support</label>
    <p className="text-sm text-[var(--muted-text)] md:col-span-2">Enable this only for recurring monthly support. Amount, reminder day, and start date are required when enabled.</p>
    <label className="grid gap-1 text-sm font-medium">Default Monthly Amount {monthlySupport ? <span className="text-red-700">Required</span> : null}<input name="default_monthly_amount" type="number" min="0.01" step="0.01" disabled={!monthlySupport} defaultValue={state.values.default_monthly_amount} aria-invalid={invalid("default_monthly_amount")} autoFocus={focus("default_monthly_amount")} className={fieldClass("default_monthly_amount")} /></label>
    <label className="grid gap-1 text-sm font-medium">Reminder Day of Month (1–28) {monthlySupport ? <span className="text-red-700">Required</span> : null}<input name="reminder_day_of_month" type="number" min="1" max="28" disabled={!monthlySupport} defaultValue={state.values.reminder_day_of_month} aria-invalid={invalid("reminder_day_of_month")} autoFocus={focus("reminder_day_of_month")} className={fieldClass("reminder_day_of_month")} /></label>
    <label className="grid gap-1 text-sm font-medium">Start Date {monthlySupport ? <span className="text-red-700">Required</span> : null}<input name="support_start_date" type="date" disabled={!monthlySupport} defaultValue={state.values.support_start_date} aria-invalid={invalid("support_start_date")} autoFocus={focus("support_start_date")} className={fieldClass("support_start_date")} /><span className="font-normal text-[var(--muted-text)]">The date/month from which recurring support begins.</span></label>
    <label className="grid gap-1 text-sm font-medium">End Date (Optional)<input name="support_end_date" type="date" disabled={!monthlySupport} defaultValue={state.values.support_end_date} className={input} /><span className="font-normal text-[var(--muted-text)]">Leave blank when support continues indefinitely.</span></label>
    <label className="grid gap-1 text-sm font-medium">Default Category<select name="default_category_id" disabled={!monthlySupport} defaultValue={state.values.default_category_id} className={input}><option value="">Not specified</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-medium">Default Payment Method<select name="default_payment_method_id" disabled={!monthlySupport} defaultValue={state.values.default_payment_method_id} className={input}><option value="">Not specified</option>{paymentMethods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-medium md:col-span-2">Default Purpose<input name="default_purpose" disabled={!monthlySupport} defaultValue={state.values.default_purpose} className={input} /></label>
    <div className="md:col-span-2"><button disabled={pending} className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)] disabled:opacity-60">{pending ? "Creating…" : "Create Beneficiary"}</button></div>
  </form>;
}

export function BeneficiaryForm({ relationshipTypes, categories, paymentMethods }: {
  relationshipTypes: DonationOption[];
  categories: DonationOption[];
  paymentMethods: DonationOption[];
}) {
  const [state, action, pending] = useActionState(createDonationBeneficiaryAction, initialState);
  return <BeneficiaryFields key={state.revision} action={action} pending={pending} state={state} relationshipTypes={relationshipTypes} categories={categories} paymentMethods={paymentMethods} />;
}
