import { DAILY_CLOSING_PRINT_STYLES } from "@/lib/inventory/daily-closing-print";

type Sheet = {
  id: string;
  reference: string;
  inventory_date: string;
  warehouse_id: string | null;
  status: string;
  closing_status: string;
  prepared_at: string;
  finalized_at: string | null;
  closing_time: string | null;
  physical_count: number | null;
  variance: number | null;
  remarks: string | null;
  revision: number;
  include_serial_details: boolean;
};

type Line = {
  id: string;
  product_name: string;
  sku: string;
  model: string | null;
  opening_qty: number;
  stock_in: number;
  stock_out: number;
  closing_qty: number;
  unit: string;
  remarks: string | null;
  reconciliation_needed: boolean;
};

type Movement = {
  reference: string | null;
  movement_type: string | null;
  quantity_delta: number;
  transaction_at: string | null;
  product_name: string | null;
  sku: string | null;
  sen_serial?: string | null;
  manufacturer_serial?: string | null;
  source_warehouse_id: string | null;
  destination_warehouse_id: string | null;
};

function amount(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }) : "Not provided";
}

export function DailyClosingReport({ sheet, lines, movements, warehouseName, preparedBy, checkedBy, companyName = "Shenzhen Energy & Networks", showSerialDetails = false }: { sheet: Sheet; lines: Line[]; movements: Movement[]; warehouseName: string; preparedBy: string; checkedBy: string; companyName?: string; showSerialDetails?: boolean }) {
  const totalOpening = lines.reduce((sum, line) => sum + Number(line.opening_qty ?? 0), 0);
  const totalIn = lines.reduce((sum, line) => sum + Number(line.stock_in ?? 0), 0);
  const totalOut = lines.reduce((sum, line) => sum + Number(line.stock_out ?? 0), 0);
  const totalClosing = lines.reduce((sum, line) => sum + Number(line.closing_qty ?? 0), 0);
  const serializedReceived = movements.filter((movement) => Number(movement.quantity_delta) > 0 && (movement.sen_serial || movement.manufacturer_serial)).length;
  const serializedDispatched = movements.filter((movement) => Number(movement.quantity_delta) < 0 && (movement.sen_serial || movement.manufacturer_serial)).length;
  return <div className="daily-closing-print-root rounded-xl border bg-[var(--surface)] p-4 shadow-sm sm:p-6">
    <style>{DAILY_CLOSING_PRINT_STYLES}</style>
    <div className="screen-only mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
      <span><strong>{sheet.reference}</strong> · {statusLabel(sheet.status)} · {statusLabel(sheet.closing_status)}</span>
      {sheet.revision > 1 ? <span>Revision {sheet.revision}</span> : null}
    </div>
    <header className="daily-closing-header border border-slate-300">
      <div className="daily-closing-title bg-[#1e4261] px-4 py-3 text-center text-xl font-bold tracking-wide text-white sm:text-2xl">DAILY INVENTORY UPDATE &amp; CLOSING SHEET</div>
      <div className="daily-closing-subtitle bg-[#dceaf5] px-4 py-1.5 text-center text-sm italic text-slate-700">Daily Stock Movement &amp; Closing Record – Hard Copy / Archive</div>
      <div className="daily-closing-info-grid grid grid-cols-1 text-sm sm:grid-cols-2">
        <div className="grid grid-cols-[9rem_1fr] border-t border-slate-300"><b className="bg-slate-100 p-2">Company / Business</b><span className="p-2">{companyName}</span><b className="border-t border-slate-300 bg-slate-100 p-2">Warehouse / Location</b><span className="border-t border-slate-300 p-2">{warehouseName}</span><b className="border-t border-slate-300 bg-slate-100 p-2">Inventory Date</b><span className="border-t border-slate-300 p-2">{sheet.inventory_date}</span><b className="border-t border-slate-300 bg-slate-100 p-2">Sheet / Reference No.</b><span className="border-t border-slate-300 p-2">{sheet.reference}</span></div>
        <div className="grid grid-cols-[9rem_1fr] border-t border-slate-300 sm:border-l"><b className="bg-slate-100 p-2">Prepared By</b><span className="p-2">{preparedBy}</span><b className="border-t border-slate-300 bg-slate-100 p-2">Checked By</b><span className="border-t border-slate-300 p-2">{checkedBy}</span><b className="border-t border-slate-300 bg-slate-100 p-2">Closing Time</b><span className="border-t border-slate-300 p-2">{dateLabel(sheet.closing_time)}</span><b className="border-t border-slate-300 bg-slate-100 p-2">Page</b><span className="border-t border-slate-300 p-2">Page 1</span></div>
      </div>
    </header>

    <section className="daily-closing-items mt-4 overflow-x-auto"><table className="daily-closing-items-table w-full min-w-[900px] border border-slate-300 text-xs"><thead><tr className="bg-[#1e4261] text-left text-white"><th className="border border-slate-300 p-2">SL</th><th className="border border-slate-300 p-2">Product / Item Description</th><th className="border border-slate-300 p-2">SKU / Code</th><th className="border border-slate-300 p-2">Serial / Model</th><th className="border border-slate-300 p-2 text-right">Opening Qty</th><th className="border border-slate-300 p-2 text-right">Stock In</th><th className="border border-slate-300 p-2 text-right">Stock Out</th><th className="border border-slate-300 p-2 text-right">Closing Qty</th><th className="border border-slate-300 p-2">Unit</th><th className="border border-slate-300 p-2">Remarks</th></tr></thead><tbody>{lines.length ? lines.map((line, index) => <tr key={line.id} className={line.reconciliation_needed ? "bg-amber-50" : ""}><td className="border border-slate-300 p-2">{index + 1}</td><td className="border border-slate-300 p-2 font-semibold">{line.product_name}</td><td className="border border-slate-300 p-2">{line.sku}</td><td className="border border-slate-300 p-2">{line.model ?? "Not provided"}</td><td className="border border-slate-300 p-2 text-right">{amount(line.opening_qty)}</td><td className="border border-slate-300 p-2 text-right">{amount(line.stock_in)}</td><td className="border border-slate-300 p-2 text-right">{amount(line.stock_out)}</td><td className="border border-slate-300 p-2 text-right font-bold">{amount(line.closing_qty)}{line.reconciliation_needed ? " *" : ""}</td><td className="border border-slate-300 p-2">{line.unit}</td><td className="border border-slate-300 p-2">{line.remarks ?? (line.reconciliation_needed ? "Inventory reconciliation required" : "")}</td></tr>) : <tr><td colSpan={10} className="border border-slate-300 p-6 text-center">No inventory activity for this date.</td></tr>}</tbody></table></section>

    <section className="daily-closing-summary mt-4"><h2 className="bg-[#397db7] px-3 py-2 font-bold text-white">DAILY INVENTORY SUMMARY</h2><div className="daily-closing-summary-grid grid grid-cols-1 border-x border-b border-slate-300 text-sm sm:grid-cols-2"><div className="grid grid-cols-[1fr_auto]">{[["Total Product Lines Updated", lines.length], ["Total Opening Quantity", amount(totalOpening)], ["Total Stock In", amount(totalIn)], ["Total Stock Out", amount(totalOut)]].map(([label, value]) => <div key={String(label)} className="contents"><b className="border-b border-slate-300 bg-slate-50 p-2">{label}</b><span className="border-b border-slate-300 p-2 text-right">{value}</span></div>)}</div><div className="grid grid-cols-[1fr_auto] sm:border-l sm:border-slate-300">{[["Total Closing Quantity", amount(totalClosing)], ["Physical Count Verified", sheet.physical_count === null ? "Not Verified" : amount(sheet.physical_count)], ["Variance / Difference", sheet.variance === null ? "—" : amount(sheet.variance)], ["Closing Status", statusLabel(sheet.closing_status)]].map(([label, value]) => <div key={String(label)} className="contents"><b className="border-b border-slate-300 bg-slate-50 p-2">{label}</b><span className="border-b border-slate-300 p-2 text-right">{value}</span></div>)}</div></div><div className="daily-closing-summary-stats grid grid-cols-1 gap-2 border-x border-b border-slate-300 p-3 text-sm sm:grid-cols-2"><span>Stock-in transactions: <strong>{movements.filter((movement) => Number(movement.quantity_delta) > 0).length}</strong></span><span>Stock-out transactions: <strong>{movements.filter((movement) => Number(movement.quantity_delta) < 0).length}</strong></span><span>Serialized units received: <strong>{serializedReceived}</strong></span><span>Serialized units dispatched: <strong>{serializedDispatched}</strong></span></div></section>

    {showSerialDetails && movements.some((movement) => movement.sen_serial || movement.manufacturer_serial) ? <section className="daily-closing-serial-details mt-5"><h2 className="bg-[#1e4261] px-3 py-2 font-bold text-white">SERIALIZED MOVEMENT DETAILS</h2><div className="overflow-x-auto"><table className="w-full min-w-[850px] border border-slate-300 text-xs"><thead><tr className="bg-slate-100"><th className="border border-slate-300 p-2">Product</th><th className="border border-slate-300 p-2">SKU</th><th className="border border-slate-300 p-2">SEN / Manufacturer Serial</th><th className="border border-slate-300 p-2">Movement</th><th className="border border-slate-300 p-2">Reference</th><th className="border border-slate-300 p-2">Transaction Time</th></tr></thead><tbody>{movements.filter((movement) => movement.sen_serial || movement.manufacturer_serial).map((movement, index) => <tr key={`${movement.reference}-${movement.sen_serial}-${index}`}><td className="border border-slate-300 p-2">{movement.product_name ?? "Not provided"}</td><td className="border border-slate-300 p-2">{movement.sku ?? "Not provided"}</td><td className="border border-slate-300 p-2">{movement.sen_serial ?? movement.manufacturer_serial ?? "Not provided"}</td><td className="border border-slate-300 p-2">{statusLabel(movement.movement_type ?? "movement")}</td><td className="border border-slate-300 p-2">{movement.reference ?? "Not provided"}</td><td className="border border-slate-300 p-2">{dateLabel(movement.transaction_at)}</td></tr>)}</tbody></table></div></section> : null}

    <section className="daily-closing-remarks mt-5"><h2 className="bg-[#1e4261] px-3 py-2 font-bold text-white">GENERAL REMARKS / EXCEPTIONS</h2><div className="min-h-24 border-x border-b border-slate-300 p-3 text-sm">{sheet.remarks ?? "No remarks recorded."}</div></section>
    <footer className="daily-closing-signatures mt-10 grid grid-cols-2 gap-16 text-center text-sm"><div className="border-t border-dashed border-slate-500 pt-2">Prepared By Signature<br /><strong>{preparedBy}</strong></div><div className="border-t border-dashed border-slate-500 pt-2">Checked By Signature<br /><strong>{checkedBy}</strong></div></footer>
    <p className="daily-closing-footnote mt-5 text-right text-xs text-slate-500">* Inventory reconciliation required · Generated {dateLabel(sheet.prepared_at)}</p>
  </div>;
}

