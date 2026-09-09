"use client";

import { useState } from "react";

const field = "mt-1 w-full rounded-lg border px-3 py-2";

export function WitnessFields() {
  const [count, setCount] = useState(2);

  return <section className="space-y-4 rounded-xl border bg-slate-50 p-5">
    <div>
      <h2 className="text-xl font-bold">সাক্ষীগণের তথ্য</h2>
      <p className="mt-1 text-sm text-slate-600">প্রত্যেক সাক্ষীর নাম, ঠিকানা ও ফোন নম্বর দিন।</p>
    </div>
    {Array.from({ length: count }, (_, index) => <div key={index} className="rounded-xl border bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-bold">সাক্ষী {index + 1}</h3>
        {index >= 2 && index === count - 1 ? <button type="button" onClick={() => setCount((value) => Math.max(2, value - 1))} className="text-sm font-semibold text-red-700">Remove</button> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label>নাম<input className={field} name="witness_name" required maxLength={160} /></label>
        <label>ঠিকানা<input className={field} name="witness_address" required maxLength={500} /></label>
        <label>ফোন নম্বর<input className={field} name="witness_phone" inputMode="tel" required maxLength={50} /></label>
      </div>
    </div>)}
    <button type="button" disabled={count >= 5} onClick={() => setCount((value) => Math.min(5, value + 1))} className="rounded-lg border border-blue-800 px-4 py-2 font-semibold text-blue-800 disabled:opacity-40">+ Add Witness</button>
  </section>;
}
