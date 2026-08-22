"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  confirmPhysicalReturnReceiptAction,
  type PhysicalReturnActionState,
} from "@/app/employee/rma/[claimId]/receive/actions";
import type { PhysicalReturnReleaseItem } from "@/lib/inventory/rma-return-data";

const initialState: PhysicalReturnActionState = { ok: false, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button primary" type="submit" disabled={pending}>
      {pending ? "Receiving physical return…" : "Confirm Physical Return Receipt"}
    </button>
  );
}

export function PhysicalReturnReceiptForm({
  claimId,
  item,
  operationId,
}: {
  claimId: string;
  item: PhysicalReturnReleaseItem;
  operationId: string;
}) {
  const action = confirmPhysicalReturnReceiptAction.bind(
    null,
    claimId,
    item.id,
    operationId,
  );
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="rounded-xl border bg-[var(--surface)] p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-bold">{item.productName}</h2>
          <p className="text-sm text-[var(--muted-text)]">{item.sku} · {item.warehouseName}</p>
        </div>
        <p className="text-sm"><b>{item.quantityReturnable}</b> returnable · {item.quantityReturned}/{item.quantityReleased} already returned</p>
      </div>
      <label className="mt-3 block max-w-64 font-semibold">
        Physically received quantity
        <input name="quantity" type="number" min={1} max={item.quantityReturnable} step={1} defaultValue={item.serials.length ? item.serials.length : item.quantityReturnable} required />
      </label>
      {item.serials.length ? (
        <fieldset className="mt-3 rounded-lg bg-[var(--muted-surface)] p-3">
          <legend className="font-semibold">Verify exact returned SEN Serial Number(s)</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {item.serials.map((serial) => (
              <label key={serial.id} className="flex gap-2 rounded border bg-[var(--surface)] p-2 text-sm">
                <input type="checkbox" name="serial_id" value={serial.id} />
                <span><b>{serial.senSerial ?? serial.id}</b>{serial.manufacturerSerial ? <><br />Manufacturer: {serial.manufacturerSerial}</> : null}<br /><span className="text-xs">Original Stock Out serial · {serial.status}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <p className="mt-3 text-xs text-[var(--muted-text)]">Returned products enter physical inventory as unavailable pending the existing RMA inspection/resolution process.</p>
      {state.message ? <p role="status" className={`mt-3 rounded p-3 ${state.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{state.message}</p> : null}
      <div className="mt-3"><SubmitButton /></div>
    </form>
  );
}
