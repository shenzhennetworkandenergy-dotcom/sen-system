"use client";

import { createAdvancePaymentAction, createRentTransactionAction } from "@/app/admin/murshida-manzil/actions";
import { useMemo, useState } from "react";

type Tenant = { id: string; name: string; phone_number?: string | null; unit_id: string | null; monthly_rent: number; is_active: boolean; units?: unknown };
type AdvanceState = { availableBalance: number; defaultMonthlyAdvanceAdjustment: number };

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const money = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(value);

export function SmartRentAdvancePanel({ tenants, states }: { tenants: Tenant[]; states: Record<string, AdvanceState> }) {
  const activeTenants = tenants.filter((tenant) => tenant.is_active && tenant.unit_id);
  const today = new Date();
  const [tenantId, setTenantId] = useState("");
  const [advanceAdjustment, setAdvanceAdjustment] = useState(0);
  const [actualReceived, setActualReceived] = useState(0);
  const selectedTenant = activeTenants.find((tenant) => tenant.id === tenantId);
  const state = tenantId ? states[tenantId] ?? { availableBalance: 0, defaultMonthlyAdvanceAdjustment: 0 } : { availableBalance: 0, defaultMonthlyAdvanceAdjustment: 0 };
  const rent = Number(selectedTenant?.monthly_rent ?? 0);
  const unit = (selectedTenant?.units as { unit_code?: string } | null)?.unit_code ?? "—";
  const defaultAdjustment = useMemo(() => Math.min(state.defaultMonthlyAdvanceAdjustment, state.availableBalance, rent), [state, rent]);
  const selectTenant = (value: string) => {
    setTenantId(value);
    const nextTenant = activeTenants.find((tenant) => tenant.id === value);
    const nextState = states[value] ?? { availableBalance: 0, defaultMonthlyAdvanceAdjustment: 0 };
    const nextRent = Number(nextTenant?.monthly_rent ?? 0);
    const nextAdjustment = Math.min(nextState.defaultMonthlyAdvanceAdjustment, nextState.availableBalance, nextRent);
    setAdvanceAdjustment(nextAdjustment);
    setActualReceived(Math.max(0, nextRent - nextAdjustment));
  };
  const updateAdjustment = (value: string) => {
    const next = Number(value || 0);
    setAdvanceAdjustment(next);
    setActualReceived(Math.max(0, rent - next));
  };
  return <div className="mb-4 grid gap-4 xl:grid-cols-2">
    <section className="rounded-xl border bg-[var(--surface)] p-5 shadow-sm xl:col-span-2">
      <h2 className="text-lg font-bold">Rent Entry</h2>
      <form action={createRentTransactionAction} className="mt-3 grid gap-2 md:grid-cols-4">
        <select name="tenant_id" required value={tenantId} onChange={(event) => selectTenant(event.target.value)} className="rounded-lg border px-3 py-2 md:col-span-2"><option value="">Select active tenant</option>{activeTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.phone_number ?? "no mobile"} · {(tenant.units as { unit_code?: string } | null)?.unit_code ?? "—"}</option>)}</select>
        <select name="rent_year" required defaultValue={String(today.getFullYear())} className="rounded-lg border px-3 py-2">{Array.from({ length: 8 }, (_, index) => today.getFullYear() - 5 + index).map((year) => <option key={year} value={year}>{year}</option>)}</select>
        <select name="rent_month" required defaultValue={String(today.getMonth() + 1)} className="rounded-lg border px-3 py-2">{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select>
        <input name="monthly_rent" required type="number" min="0.01" step="0.01" value={rent || ""} onChange={() => undefined} readOnly className="rounded-lg border bg-slate-50 px-3 py-2" aria-label="Monthly rent" />
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">Advance balance: {money(state.availableBalance)}</div>
        <input name="advance_adjusted" required type="number" min="0" max={Math.min(state.availableBalance, rent)} step="0.01" value={advanceAdjustment} onChange={(event) => updateAdjustment(event.target.value)} placeholder="Advance adjustment" className="rounded-lg border px-3 py-2" />
        <input name="actual_money_received" required type="number" min="0" step="0.01" value={actualReceived} onChange={(event) => setActualReceived(Number(event.target.value || 0))} placeholder="Amount to receive" className="rounded-lg border px-3 py-2" />
        <input name="payment_date" required type="date" defaultValue={today.toISOString().slice(0, 10)} className="rounded-lg border px-3 py-2" />
        <select name="payment_method" required defaultValue="cash" className="rounded-lg border px-3 py-2"><option value="cash">Cash</option><option value="bank">Bank</option><option value="mfs">MFS</option><option value="cheque">Cheque</option><option value="other">Other</option></select>
        <p className="text-sm text-[var(--muted-text)] md:col-span-2">{selectedTenant ? `Mobile: ${selectedTenant.phone_number ?? "—"} · Unit: ${unit} · Default adjustment: ${money(defaultAdjustment)} · Expected amount: ${money(Math.max(0, rent - defaultAdjustment))}` : "Select a tenant to load rent and advance details."}</p>
        <button className="rounded-lg bg-[var(--primary)] px-3 py-2 font-semibold text-[var(--primary-foreground)] md:col-span-4">Record Rent</button>
      </form>
    </section>
    <section className="rounded-xl border bg-[var(--surface)] p-5 shadow-sm xl:col-span-2">
      <h2 className="text-lg font-bold">Advance Entry</h2>
      <form action={createAdvancePaymentAction} className="mt-3 grid gap-2 md:grid-cols-4">
        <select name="tenant_id" required value={tenantId} onChange={(event) => selectTenant(event.target.value)} className="rounded-lg border px-3 py-2 md:col-span-2"><option value="">Select active tenant</option>{activeTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.phone_number ?? "no mobile"} · {(tenant.units as { unit_code?: string } | null)?.unit_code ?? "—"}</option>)}</select>
        <input name="amount" required type="number" min="0.01" step="0.01" placeholder="Advance amount" className="rounded-lg border px-3 py-2" />
        <input name="default_monthly_advance_adjustment" required type="number" min="0" step="0.01" defaultValue="0" placeholder="Default monthly deduction" className="rounded-lg border px-3 py-2" />
        <input name="payment_date" required type="date" defaultValue={today.toISOString().slice(0, 10)} className="rounded-lg border px-3 py-2" />
        <p className="text-sm text-[var(--muted-text)] md:col-span-2">{selectedTenant ? `Mobile: ${selectedTenant.phone_number ?? "—"} · Unit: ${unit}` : "Select a tenant to load tenant details."}</p>
        <button className="rounded-lg bg-[var(--primary)] px-3 py-2 font-semibold text-[var(--primary-foreground)] md:col-span-4">Record Advance</button>
      </form>
    </section>
  </div>;
}
