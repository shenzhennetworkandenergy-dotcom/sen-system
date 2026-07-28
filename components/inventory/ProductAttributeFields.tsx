"use client";

import { useState } from "react";

type Row = { name: string; values: string; universal: boolean; variation: boolean };

export function ProductAttributeFields({ productType }: { productType: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const update = (index: number, patch: Partial<Row>) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  if (productType !== "variable") return null;
  return <section className="rounded-xl border bg-[var(--surface)] p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">Variable product attributes</h2><p className="text-sm text-[var(--muted-text)]">Add values such as Size: 8 GB, 16 GB. Universal attributes can be reused by every product.</p></div>
      <button type="button" onClick={() => setRows((current) => [...current, { name: "", values: "", universal: false, variation: true }])} className="rounded-lg border px-4 py-2 font-semibold">+ Add attribute</button>
    </div>
    <input type="hidden" name="product_attributes_json" value={JSON.stringify(rows)}/>
    <div className="mt-4 space-y-3">
      {rows.map((row, index) => <div key={index} className="grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-[1fr_2fr_auto]">
        <label className="font-medium">Attribute name<input value={row.name} onChange={(event) => update(index, { name: event.target.value })} placeholder="Example: RAM" className="mt-1 w-full rounded-lg border bg-white p-3"/></label>
        <label className="font-medium">Values (comma separated)<input value={row.values} onChange={(event) => update(index, { values: event.target.value })} placeholder="8 GB, 16 GB, 32 GB" className="mt-1 w-full rounded-lg border bg-white p-3"/></label>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={row.universal} onChange={(event) => update(index, { universal: event.target.checked })}/>Universal attribute</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={row.variation} onChange={(event) => update(index, { variation: event.target.checked })}/>Used for variations</label>
          <button type="button" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="text-left font-semibold text-red-700">Remove</button>
        </div>
      </div>)}
      {!rows.length ? <p className="rounded-lg border border-dashed p-5 text-center text-sm text-[var(--muted-text)]">No attributes added yet.</p> : null}
    </div>
  </section>;
}
