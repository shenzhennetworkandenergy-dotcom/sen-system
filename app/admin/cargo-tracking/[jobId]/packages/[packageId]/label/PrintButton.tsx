"use client";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-lg bg-[#102a56] px-5 py-2 font-bold text-white print:hidden">Print Label</button>;
}
