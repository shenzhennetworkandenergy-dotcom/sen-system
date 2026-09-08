"use client";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="print:hidden rounded-lg border px-4 py-2 font-bold">Print / Save PDF</button>;
}
