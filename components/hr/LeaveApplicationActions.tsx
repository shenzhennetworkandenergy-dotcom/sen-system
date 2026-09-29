"use client";

export function LeaveApplicationActions({ backHref }: { backHref: string }) {
  return <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3 shadow-sm print:hidden">
    <a href={backHref} className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-800">← Back</a>
    <button type="button" onClick={()=>window.print()} className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white">Print Application</button>
  </div>;
}

