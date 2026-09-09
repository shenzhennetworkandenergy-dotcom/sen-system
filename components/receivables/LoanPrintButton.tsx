"use client";

export function LoanPrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-lg bg-blue-800 px-5 py-2.5 font-semibold text-white print:hidden">Print / Save as PDF</button>;
}
