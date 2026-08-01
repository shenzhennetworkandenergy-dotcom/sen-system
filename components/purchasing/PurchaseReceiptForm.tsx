"use client";

import { useMemo, useState } from "react";

type ReceiptItem = {
  id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_rejected: number;
  products: { serial_tracking_required: boolean } | null;
};

type ReceiptWarehouse = { code: string; name: string; address?: string | null; country_code?: string | null; country_name?: string | null };

export function PurchaseReceiptForm({ action, items, defaultReceiptDate, warehouse }: { action: (form: FormData) => void | Promise<void>; items: ReceiptItem[]; defaultReceiptDate: string; warehouse: ReceiptWarehouse | null }) {
  const openItems = useMemo(() => items.map((item) => ({ ...item, remaining: Number(item.quantity_ordered) - Number(item.quantity_received) - Number(item.quantity_rejected) })).filter((item) => item.remaining > 0), [items]);
  const [received, setReceived] = useState<Record<string, { quantity: number; condition: string; serials: string }>>(
    Object.fromEntries(openItems.map((item) => [item.id, { quantity: 0, condition: "new", serials: "" }])),
  );
  const payload = openItems.flatMap((item) => {
    const value = received[item.id];
    if (!value || value.quantity <= 0) return [];
    return [{
      purchase_order_item_id: item.id,
      quantity: value.quantity,
      condition: value.condition,
      manufacturer_serials: value.serials.split(/\r?\n/).map((serial) => serial.trim()).filter(Boolean),
    }];
  });
  return <form action={action} className="space-y-4">
    <input type="hidden" name="items" value={JSON.stringify(payload)} />
    <section className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-cyan-950">
      <span className="text-xs font-bold uppercase tracking-wide">Receiving warehouse</span>
      <strong className="mt-1 block">{warehouse ? `${warehouse.name} (${warehouse.code})` : "Warehouse unavailable"}</strong>
      {warehouse ? <span className="text-sm">{[warehouse.address, warehouse.country_name ?? warehouse.country_code].filter(Boolean).join(" · ") || "Address not recorded"}</span> : null}
    </section>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm font-semibold">Receipt date<input name="receipt_date" type="date" required defaultValue={defaultReceiptDate} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
      <label className="text-sm font-semibold">Supplier delivery reference<input name="supplier_delivery_reference" maxLength={200} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
      <label className="text-sm font-semibold">Supplier invoice reference<input name="supplier_invoice_reference" maxLength={200} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
      <label className="text-sm font-semibold">Receipt notes<input name="notes" maxLength={1000} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
    </div>
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-[var(--muted-surface)]"><tr>{["Product","Ordered","Previously received","Remaining","Receive now","Condition / manufacturer serials"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
        <tbody>{openItems.map((item) => {
          const value = received[item.id];
          return <tr key={item.id} className="border-t align-top">
            <td className="p-3"><strong>{item.product_name_snapshot}</strong><span className="block font-mono text-xs text-[var(--muted-text)]">{item.sku_snapshot}</span></td>
            <td className="p-3">{Number(item.quantity_ordered)}</td><td className="p-3">{Number(item.quantity_received)}</td><td className="p-3 font-bold">{item.remaining}</td>
            <td className="p-3"><input aria-label={`Receive ${item.product_name_snapshot}`} type="number" inputMode="numeric" min="0" max={Math.trunc(item.remaining)} step="1" value={value?.quantity ?? 0} onChange={(event) => setReceived((current) => ({ ...current, [item.id]: { ...current[item.id], quantity: Math.max(0, Math.trunc(Number(event.target.value) || 0)) } }))} className="w-28 rounded-lg border px-2 py-1.5" /></td>
            <td className="p-3">{item.products?.serial_tracking_required ? <div className="grid gap-2 sm:grid-cols-[130px_1fr]"><select aria-label={`Condition for ${item.product_name_snapshot}`} value={value?.condition ?? "new"} onChange={(event) => setReceived((current) => ({ ...current, [item.id]: { ...current[item.id], condition: event.target.value } }))} className="rounded-lg border px-2 py-1.5"><option value="new">New</option><option value="refurbished">Refurbished</option><option value="used">Used</option></select><textarea aria-label={`Manufacturer serials for ${item.product_name_snapshot}`} value={value?.serials ?? ""} onChange={(event) => setReceived((current) => ({ ...current, [item.id]: { ...current[item.id], serials: event.target.value } }))} placeholder="Optional manufacturer serials, one per line" className="min-h-20 rounded-lg border px-2 py-1.5" /></div> : <span className="text-[var(--muted-text)]">Non-serialized stock</span>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {!openItems.length ? <p className="rounded-xl border bg-[var(--muted-surface)] p-5 text-center">All order quantities have been received.</p> : <button disabled={!payload.length} className="rounded-xl bg-[var(--primary)] px-6 py-3 font-bold text-[var(--primary-foreground)] disabled:opacity-40">Confirm stock receipt</button>}
  </form>;
}

