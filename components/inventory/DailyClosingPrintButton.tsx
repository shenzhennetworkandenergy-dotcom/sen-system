"use client";

export function DailyClosingPrintButton({ href }: { href: string }) {
  return <a href={href} className="rounded bg-teal-600 px-4 py-3 font-semibold text-white transition hover:bg-teal-700 print:hidden">Print Daily Inventory Sheet</a>;
}

export function DailyClosingSystemPrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded bg-teal-600 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-teal-700 print:hidden">Print</button>;
}

