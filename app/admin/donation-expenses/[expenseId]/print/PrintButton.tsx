"use client";

export function PrintButton() {
  return <button onClick={() => window.print()} className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white print:hidden">Print Voucher</button>;
}
