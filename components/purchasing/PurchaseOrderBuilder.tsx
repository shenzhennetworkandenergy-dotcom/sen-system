"use client";

import { useMemo, useState } from "react";
import type { PurchaseBuilderItem } from "@/lib/purchasing/types";

type Supplier = { id: string; code: string; name: string; default_currency: string; payment_terms_days: number };
type Warehouse = { id: string; code: string; name: string; country_name: string };
type Product = { id: string; name: string; sku: string; product_type: string; purchase_cost: number | null; serial_tracking_required: boolean };
type Variation = { id: string; product_id: string; sku: string; combination_key: string; purchase_cost: number | null };
type Defaults = {
  supplier_id?: string; warehouse_id?: string; currency?: string; order_date?: string; expected_delivery_date?: string;
  supplier_reference?: string | null; payment_terms_days?: number; discount_amount?: number; shipping_amount?: number;
  tax_amount?: number; other_amount?: number; internal_notes?: string | null; supplier_notes?: string | null;
};

export function PurchaseOrderBuilder({
  action, suppliers, warehouses, products, variations, defaults = {}, initialItems = [], submitLabel,
}: {
  action: (form: FormData) => void | Promise<void>;
  suppliers: Supplier[];
  warehouses: Warehouse[];
  products: Product[];
  variations: Variation[];
  defaults?: Defaults;
  initialItems?: PurchaseBuilderItem[];
  submitLabel: string;
}) {
  const [items, setItems] = useState<PurchaseBuilderItem[]>(initialItems);
  const [productId, setProductId] = useState("");
  const [variationId, setVariationId] = useState("");
  const product = products.find((item) => item.id === productId);
  const productVariations = variations.filter((item) => item.product_id === productId);
  const totals = useMemo(() => items.reduce((sum, item) => sum + Math.max(item.quantity * item.unit_cost - item.discount_amount + item.tax_amount, 0), 0), [items]);
  const supplier = suppliers.find((item) => item.id === defaults.supplier_id);
  const today = new Date().toISOString().slice(0, 10);

  function addItem() {
    if (!product) return;
    const variation = productVariations.find((item) => item.id === variationId);
    if (product.product_type === "variable" && !variation) return;
    const key = `${product.id}:${variation?.id ?? ""}`;
    if (items.some((item) => `${item.product_id}:${item.variation_id ?? ""}` === key)) return;
    setItems((current) => [...current, {
      product_id: product.id,
      variation_id: variation?.id ?? null,
      name: product.name,
      sku: variation?.sku ?? product.sku,
      serial_tracking_required: product.serial_tracking_required,
      quantity: 1,
      unit_cost: Number(variation?.purchase_cost ?? product.purchase_cost ?? 0),
      discount_amount: 0,
      tax_amount: 0,
      description: "",
    }]);
    setProductId("");
    setVariationId("");
  }

  function updateItem(index: number, patch: Partial<PurchaseBuilderItem>) {
    setItems((current) => current.map((item, position) => position === index ? { ...item, ...patch } : item));
  }

  return <form action={action} className="space-y-4">
    <section className="grid gap-3 rounded-2xl border bg-[var(--surface)] p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
      <label className="text-sm font-semibold">Supplier *
        <select name="supplier_id" required defaultValue={defaults.supplier_id ?? ""} className="mt-1 w-full rounded-xl border px-3 py-2.5">
          <option value="">Select supplier</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold">Destination warehouse *
        <select name="warehouse_id" required defaultValue={defaults.warehouse_id ?? ""} className="mt-1 w-full rounded-xl border px-3 py-2.5">
          <option value="">Select warehouse</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold">Order date *
        <input name="order_date" type="date" required defaultValue={defaults.order_date ?? today} className="mt-1 w-full rounded-xl border px-3 py-2.5" />
      </label>
      <label className="text-sm font-semibold">Expected delivery
        <input name="expected_delivery_date" type="date" defaultValue={defaults.expected_delivery_date ?? ""} className="mt-1 w-full rounded-xl border px-3 py-2.5" />
      </label>
      <label className="text-sm font-semibold">Currency *
        <input name="currency" required maxLength={3} defaultValue={defaults.currency ?? supplier?.default_currency ?? "BDT"} className="mt-1 w-full rounded-xl border px-3 py-2.5 uppercase" />
      </label>
      <label className="text-sm font-semibold">Payment terms (days)
        <input name="payment_terms_days" type="number" min="0" max="365" defaultValue={defaults.payment_terms_days ?? supplier?.payment_terms_days ?? 0} className="mt-1 w-full rounded-xl border px-3 py-2.5" />
      </label>
      <label className="text-sm font-semibold md:col-span-2">Supplier quotation / reference
        <input name="supplier_reference" maxLength={200} defaultValue={defaults.supplier_reference ?? ""} className="mt-1 w-full rounded-xl border px-3 py-2.5" />
      </label>
    </section>

    <section className="rounded-2xl border bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 text-sm font-semibold">Add product
          <select value={productId} onChange={(event) => { setProductId(event.target.value); setVariationId(""); }} className="mt-1 w-full rounded-xl border px-3 py-2.5">
            <option value="">Choose product</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}
          </select>
        </label>
        {product?.product_type === "variable" ? <label className="min-w-56 text-sm font-semibold">Variation *
          <select value={variationId} onChange={(event) => setVariationId(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5">
            <option value="">Choose variation</option>{productVariations.map((item) => <option key={item.id} value={item.id}>{item.combination_key} · {item.sku}</option>)}
          </select>
        </label> : null}
        <button type="button" onClick={addItem} disabled={!product || (product.product_type === "variable" && !variationId)} className="rounded-xl bg-slate-900 px-5 py-2.5 font-bold text-white disabled:opacity-40">Add line</button>
      </div>

      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-[var(--muted-surface)]"><tr>{["Product","SKU","Quantity","Unit cost","Discount","Tax","Line total",""].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
          <tbody>{items.map((item, index) => <tr key={`${item.product_id}:${item.variation_id ?? ""}`} className="border-t align-top">
            <td className="p-3"><strong>{item.name}</strong>{item.serial_tracking_required ? <span className="mt-1 block text-xs text-cyan-700">Serialized units</span> : null}<input aria-label={`Description for ${item.name}`} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} placeholder="Optional line note" className="mt-2 w-full rounded-lg border px-2 py-1.5" /></td>
            <td className="p-3 font-mono text-xs">{item.sku}</td>
            <td className="p-3"><input aria-label={`Quantity for ${item.name}`} type="number" min="0.0001" step={item.serial_tracking_required ? "1" : "0.0001"} required value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} className="w-28 rounded-lg border px-2 py-1.5" /></td>
            <td className="p-3"><input aria-label={`Unit cost for ${item.name}`} type="number" min="0" step="0.0001" required value={item.unit_cost} onChange={(event) => updateItem(index, { unit_cost: Number(event.target.value) })} className="w-32 rounded-lg border px-2 py-1.5" /></td>
            <td className="p-3"><input aria-label={`Discount for ${item.name}`} type="number" min="0" step="0.0001" value={item.discount_amount} onChange={(event) => updateItem(index, { discount_amount: Number(event.target.value) })} className="w-28 rounded-lg border px-2 py-1.5" /></td>
            <td className="p-3"><input aria-label={`Tax for ${item.name}`} type="number" min="0" step="0.0001" value={item.tax_amount} onChange={(event) => updateItem(index, { tax_amount: Number(event.target.value) })} className="w-28 rounded-lg border px-2 py-1.5" /></td>
            <td className="p-3 font-bold">{Math.max(item.quantity * item.unit_cost - item.discount_amount + item.tax_amount, 0).toFixed(2)}</td>
            <td className="p-3"><button type="button" onClick={() => setItems((current) => current.filter((_, position) => position !== index))} className="rounded-lg border border-red-300 px-3 py-1.5 font-semibold text-red-700">Remove</button></td>
          </tr>)}</tbody>
        </table>
        {!items.length ? <p className="p-8 text-center text-[var(--muted-text)]">Add at least one product to the purchase order.</p> : null}
      </div>
    </section>

    <section className="grid gap-3 rounded-2xl border bg-[var(--surface)] p-4 shadow-sm md:grid-cols-3">
      <label className="text-sm font-semibold">Order discount<input name="discount_amount" type="number" min="0" step="0.0001" defaultValue={defaults.discount_amount ?? 0} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
      <label className="text-sm font-semibold">Shipping / freight<input name="shipping_amount" type="number" min="0" step="0.0001" defaultValue={defaults.shipping_amount ?? 0} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
      <label className="text-sm font-semibold">Tax<input name="tax_amount" type="number" min="0" step="0.0001" defaultValue={defaults.tax_amount ?? 0} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
      <label className="text-sm font-semibold">Other cost<input name="other_amount" type="number" min="0" step="0.0001" defaultValue={defaults.other_amount ?? 0} className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
      <label className="text-sm font-semibold md:col-span-2">Internal notes<textarea name="internal_notes" maxLength={2000} defaultValue={defaults.internal_notes ?? ""} className="mt-1 min-h-24 w-full rounded-xl border px-3 py-2.5" /></label>
      <label className="text-sm font-semibold md:col-span-3">Supplier-facing notes<textarea name="supplier_notes" maxLength={2000} defaultValue={defaults.supplier_notes ?? ""} className="mt-1 min-h-20 w-full rounded-xl border px-3 py-2.5" /></label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 md:col-span-3">
        <p><span className="text-sm text-[var(--muted-text)]">Item subtotal</span><strong className="ml-3 text-2xl">{totals.toFixed(2)}</strong></p>
        <button disabled={!items.length} className="rounded-xl bg-[var(--primary)] px-6 py-3 font-bold text-[var(--primary-foreground)] disabled:opacity-40">{submitLabel}</button>
      </div>
    </section>
  </form>;
}

