"use client";

import { useState } from "react";

type Category = { id: string; name: string };

export function InlineCategoryField({ categories, initialValue = "", businessCategory }: { categories: Category[]; initialValue?: string; businessCategory: string }) {
  const [items, setItems] = useState(categories), [value, setValue] = useState(initialValue), [open, setOpen] = useState(false), [name, setName] = useState(""), [error, setError] = useState("");
  async function create() {
    setError("");
    const response = await fetch("/api/admin/catalog/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, businessCategory }) });
    const body = await response.json();
    if (!response.ok) return setError(body.error ?? "Unable to create category.");
    setItems((current) => [...current, body].sort((a, b) => a.name.localeCompare(b.name))); setValue(body.id); setName(""); setOpen(false);
  }
  return <div className="md:col-span-1">
    <label className="font-medium">Product category <span className="text-red-600">*</span><select name="category_id" required value={value} onChange={(event) => setValue(event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-3"><option value="">Choose a category</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm font-semibold text-blue-700">+ Create category here</button>
    {open ? <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3"><label className="text-sm font-semibold">New category<input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border bg-white p-2"/></label>{error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}<div className="mt-2 flex gap-2"><button type="button" onClick={create} disabled={!name.trim()} className="rounded bg-[var(--primary)] px-3 py-2 font-semibold text-white">Create</button><button type="button" onClick={() => setOpen(false)} className="rounded border px-3 py-2">Cancel</button></div></div> : null}
  </div>;
}
