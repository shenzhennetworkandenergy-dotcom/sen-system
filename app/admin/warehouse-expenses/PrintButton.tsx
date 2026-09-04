"use client";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-lg bg-blue-950 px-5 py-2.5 font-bold text-white">Print / Save as PDF</button>;
}
