"use client";

import { useActionState, useEffect, useState } from "react";
import { SerializedStockForm } from "@/components/inventory/SerializedStockForm";
import { QUOTATION_STOCK_SAVED, type QuotationStockResult } from "@/lib/inventory/quotation-stock";

type Reason = { id: string; name: string; direction: string };
type StockAction = (state: QuotationStockResult, form: FormData) => Promise<QuotationStockResult>;
const initialState: QuotationStockResult = { status: "idle", message: "" };
const field = "mt-1 w-full rounded-lg border bg-[var(--surface)] p-3";

export function QuotationStockPopup({
  reasons, adjustAction, receiveAction,
}: {
  reasons: Reason[];
  adjustAction: StockAction;
  receiveAction?: StockAction;
}) {
  const [adjustment, submitAdjustment, adjusting] = useActionState(adjustAction, initialState);
  const [receipt, submitReceipt, receiving] = useActionState(receiveAction ?? adjustAction, initialState);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [serials, setSerials] = useState("");
  const [notes, setNotes] = useState("");
  const success = adjustment.status === "success" ? adjustment : receipt.status === "success" ? receipt : null;
  const pending = adjusting || receiving;

  useEffect(() => {
    if (!success || !window.opener || window.opener.closed) return;
    window.opener.postMessage(QUOTATION_STOCK_SAVED, window.location.origin);
    window.close();
  }, [success]);

  if (success) return (
    <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">
      <p>{success.message}</p>
      {success.detailsHref ? <a href={success.detailsHref} className="mt-2 inline-block font-semibold underline">View stock operation</a> : null}
    </div>
  );

  const adjustmentForm = (
    <form action={submitAdjustment} className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <label className="block font-semibold">
        {receiveAction ? "Quantity change (negative)" : "Quantity change"}
        <input name="quantity_change" type="number" step="1" max={receiveAction ? -1 : undefined}
          inputMode="numeric" required placeholder="Use a negative number to remove units" className={field}
          value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      </label>
      <label className="block font-semibold">Reason
        <select name="reason_id" required className={field} value={reason} onChange={(event) => setReason(event.target.value)}>
          <option value="">Select reason</option>
          {reasons.filter((item) => !receiveAction || item.direction !== "increase").map((item) =>
            <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {receiveAction ? <label className="block font-semibold">Serial numbers
        <textarea name="serials" required placeholder="One SEN or manufacturer serial per line" className={field}
          value={serials} onChange={(event) => setSerials(event.target.value)} />
      </label> : null}
      <label className="block font-semibold">Notes
        <textarea name="notes" className={field} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      {adjustment.status === "error" ? <p role="alert" className="rounded bg-red-50 p-3 text-red-900">{adjustment.message}</p> : null}
      <button type="submit" disabled={pending}
        className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)] disabled:opacity-50">
        {adjusting ? "Saving…" : "Confirm adjustment"}
      </button>
    </form>
  );

  if (!receiveAction) return adjustmentForm;

  return (
    <div className="space-y-4">
      {receipt.status === "error" ? <p role="alert" className="rounded bg-red-50 p-3 text-red-900">{receipt.message}</p> : null}
      <SerializedStockForm action={submitReceipt} reasons={reasons.filter((item) => item.direction !== "decrease")}
        warehouses={[]} warehouseFixed disabled={pending} />
      <details className="rounded-xl border bg-[var(--surface)] p-4">
        <summary className="cursor-pointer font-semibold">Remove serialized stock</summary>
        <div className="mt-3">{adjustmentForm}</div>
      </details>
    </div>
  );
}
