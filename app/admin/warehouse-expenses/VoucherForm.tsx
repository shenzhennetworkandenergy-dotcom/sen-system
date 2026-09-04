"use client";

import { useMemo, useState } from "react";
import type { WarehouseExpenseTemplate, WarehouseExpenseVoucher } from "@/lib/warehouse-expenses/data";

const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2";
const defaultMonth = "2026-08";

export function VoucherForm({ template, editing, previous }: {
  template: WarehouseExpenseTemplate;
  editing: WarehouseExpenseVoucher | null;
  previous: WarehouseExpenseVoucher | null;
}) {
  const [rent, setRent] = useState(Number(editing?.rent_amount ?? template.default_rent_amount));
  const [electricity, setElectricity] = useState(Number(editing?.electricity_amount ?? 0));
  const [food, setFood] = useState(Number(editing?.staff_food_amount ?? 0));
  const [other, setOther] = useState(Number(editing?.other_amount ?? 0));
  const total = useMemo(() => rent + electricity + food + other, [rent, electricity, food, other]);
  const prefillPrevious = () => {
    if (!previous) return;
    setRent(Number(previous.rent_amount)); setElectricity(Number(previous.electricity_amount));
    setFood(Number(previous.staff_food_amount)); setOther(Number(previous.other_amount));
  };
  return <div className="space-y-4">
    <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950">
      <strong>{template.warehouses?.name ?? "Dhaka warehouse"}</strong><br />
      {template.payee_organization} · {template.contact_person || "—"}<br />
      {template.payee_address || template.warehouses?.address || "—"} · {template.payee_phone || "Phone —"}
    </div>
    {previous && !editing ? <button type="button" onClick={prefillPrevious} className="rounded-lg border px-3 py-2 text-sm font-semibold">Use previous voucher amounts</button> : null}
    <input type="hidden" name="voucher_id" value={editing?.id ?? ""} />
    <input type="hidden" name="warehouse_id" value={template.warehouse_id} />
    <label className="block text-sm font-semibold">Voucher month<input type="month" name="voucher_month" required defaultValue={editing?.voucher_month.slice(0, 7) ?? defaultMonth} className={field} /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <MoneyField label="Office Rent + Mostofa Living" name="rent_amount" value={rent} setValue={setRent} />
      <MoneyField label="Electricity Bill" name="electricity_amount" value={electricity} setValue={setElectricity} />
      <MoneyField label="Mostofa Food / Meal Expense" name="staff_food_amount" value={food} setValue={setFood} />
      <MoneyField label="Other Expense" name="other_amount" value={other} setValue={setOther} />
    </div>
    <div className="rounded-lg bg-slate-950 px-4 py-3 text-white"><span className="text-sm font-semibold">Total payable</span><strong className="float-right text-lg">BDT {total.toLocaleString("en-BD", { minimumFractionDigits: 2 })}</strong></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">Status<select name="status" defaultValue={editing?.status ?? "draft"} className={field}><option value="draft">Draft</option><option value="paid">Paid</option></select></label>
      <label className="text-sm font-semibold">Payment date<input type="date" name="payment_date" defaultValue={editing?.payment_date ?? ""} className={field} /></label>
      <label className="text-sm font-semibold">Payment method<input name="payment_method" defaultValue={editing?.payment_method ?? ""} placeholder="Cash / Bank Transfer" className={field} /></label>
      <label className="text-sm font-semibold">Payment reference<input name="payment_reference" defaultValue={editing?.payment_reference ?? ""} className={field} /></label>
    </div>
    <label className="block text-sm font-semibold">Note<textarea name="note" defaultValue={editing?.note ?? ""} rows={3} className={field} /></label>
  </div>;
}

function MoneyField({ label, name, value, setValue }: { label: string; name: string; value: number; setValue: (value: number) => void }) {
  return <label className="text-sm font-semibold">{label}<input type="number" min="0" step="0.01" name={name} required value={value} onChange={(event) => setValue(Number(event.target.value) || 0)} className={field} /></label>;
}
