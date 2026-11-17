"use client";

import { useState } from "react";

type Warehouse = { id: string; name: string; code: string };
type Reason = { id: string; name: string };

export function SerializedStockForm({
  action, warehouses, reasons, warehouseFixed = false, disabled = false,
}: {
  action: (form: FormData) => void | Promise<void>;
  warehouses: Warehouse[];
  reasons: Reason[];
  warehouseFixed?: boolean;
  disabled?: boolean;
}) {
  const [serials, setSerials] = useState([""]);
  const quantity = serials.length;

  function resize(next: number) {
    const safe = Math.max(1, Math.min(200, Math.trunc(next) || 1));
    setSerials((old) => Array.from({ length: safe }, (_, index) => old[index] ?? ""));
  }

  function pasteSerials() {
    const lines = (prompt("Paste manufacturer serials, one per line") ?? "").split(/\r?\n/);
    setSerials(Array.from({ length: quantity }, (_, index) => lines[index]?.trim() ?? ""));
  }

  return (
    <form action={action} className="space-y-6">
      <section className="grid gap-4 rounded-xl border bg-[var(--surface)] p-5 md:grid-cols-2">
        {!warehouseFixed ? (
          <label>Destination warehouse
            <select name="warehouse_id" required className="mt-1 w-full rounded border p-3">
              <option value="">Choose warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>
              ))}
            </select>
          </label>
        ) : null}
        <label>Quantity to add
          <input name="quantity" type="number" inputMode="numeric" min="1" max="200" step="1"
            value={quantity} onChange={(event) => resize(Number(event.target.value))} className="mt-1 w-full rounded border p-3" />
        </label>
        <label>Stock receipt reason
          <select name="reason_id" className="mt-1 w-full rounded border p-3">
            <option value="">Purchase receipt</option>
            {reasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
          </select>
        </label>
        <label>Unit condition<input name="condition" defaultValue="new" className="mt-1 w-full rounded border p-3" /></label>
        <label>Receipt date<input name="receipt_date" type="date" defaultValue={new Date().toISOString().slice(0,10)} className="mt-1 w-full rounded border p-3" /></label>
        <label>Purchase / supplier / freight reference<input name="reference" className="mt-1 w-full rounded border p-3" /></label>
        <label className="md:col-span-2">Internal notes<textarea name="notes" className="mt-1 min-h-24 w-full rounded border p-3" /></label>
      </section>
      <section className="rounded-xl border bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Physical unit serials</h2>
            <p className="text-sm text-[var(--muted-text)]">Exactly {quantity} unique SEN serials will be generated atomically. Manufacturer serials are optional.</p>
          </div>
          <button type="button" onClick={pasteSerials} className="rounded border px-3 py-2">Paste manufacturer serials</button>
        </div>
        <input type="hidden" name="manufacturer_serials" value={serials.join("\n")} />
        <div className="mt-4 grid gap-3">
          {serials.map((value, index) => (
            <div key={index} className="grid items-center gap-3 rounded-lg border p-3 sm:grid-cols-[90px_1fr_auto]">
              <strong>Unit {index + 1}</strong>
              <input aria-label={"Manufacturer serial for unit " + (index + 1)} value={value}
                onChange={(event) => setSerials((old) => old.map((serial, i) => i === index ? event.target.value : serial))}
                placeholder="Optional manufacturer serial" className="rounded border p-2 font-mono" />
              <span className="text-xs text-[var(--muted-text)]">SEN serial generated on receipt · barcode + QR ready</span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button disabled={disabled} className="min-h-12 rounded bg-[var(--primary)] px-5 py-3 font-semibold text-white disabled:opacity-50">Confirm stock receipt</button>
          <button type="button" onClick={() => window.print()} className="rounded border px-5 py-3 font-semibold">Print preview</button>
        </div>
      </section>
    </form>
  );
}
