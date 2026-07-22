"use client";
export function PrintButton(){return <button type="button" onClick={()=>window.print()} className="print:hidden rounded bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">Open print dialog</button>}
