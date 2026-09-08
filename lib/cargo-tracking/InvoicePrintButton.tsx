"use client";

export function PrintButton() { return <button type="button" onClick={() => window.print()} className="rounded-lg bg-[#07589a] px-4 py-2 font-bold text-white">Print / Save PDF</button>; }
