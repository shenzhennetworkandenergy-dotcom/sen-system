"use client";
export function PrintDocumentButton(){return <button type="button" onClick={()=>window.print()} className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white print:hidden">Print / Save PDF</button>}
