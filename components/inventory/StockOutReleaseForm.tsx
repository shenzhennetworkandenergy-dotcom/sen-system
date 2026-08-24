"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  confirmStockOutAction,
  replaceStockOutSerialAction,
  type StockOutActionState,
} from "@/app/employee/inventory/stock-out/actions";

type EligibleSerial = {
  id: string;
  sen_serial: string | null;
  manufacturer_serial: string | null;
  status: string;
  preselected?: boolean;
};

export type StockOutReleaseItem = {
  requestItemId: string;
  productName: string;
  sku: string;
  remainingQuantity: number;
  packedRemainingQuantity: number;
  serialTrackingRequired: boolean;
  preassignedSerials: EligibleSerial[];
};

const initialState: StockOutActionState = { ok: false, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button primary" type="submit" disabled={pending}>
      {pending ? "Confirming physical release…" : "Confirm Stock Out / Release Products"}
    </button>
  );
}

function SerialReplacement({
  requestItemId,
  serial,
  operationId,
}: {
  requestItemId: string;
  serial: EligibleSerial;
  operationId: string;
}) {
  const action = replaceStockOutSerialAction.bind(
    null,
    requestItemId,
    serial.id,
    operationId,
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <details className="mt-2 rounded border p-2 text-sm">
      <summary className="cursor-pointer font-semibold">Change/Replace Serial</summary>
      <form action={formAction} className="mt-2 grid gap-2">
        <label>
          Replacement SEN Serial ID
          <input name="replacement_serial_id" required placeholder="Select an eligible serial from search results" />
        </label>
        <label>
          Replacement reason
          <input name="replacement_reason" required minLength={3} placeholder="Why the assigned physical unit is changing" />
        </label>
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Replacing…" : "Record serial replacement"}
        </button>
        {state.message ? <p className={state.ok ? "text-green-700" : "text-red-700"}>{state.message}</p> : null}
      </form>
    </details>
  );
}

function SerialSelector({
  item,
  selected,
  onSelected,
}: {
  item: StockOutReleaseItem;
  selected: string[];
  onSelected: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EligibleSerial[]>(item.preassignedSerials);
  const [status, setStatus] = useState("");

  async function search() {
    setStatus("Searching eligible physical units…");
    try {
      const response = await fetch(
        `/api/employee/inventory/stock-out/serials?requestItemId=${encodeURIComponent(item.requestItemId)}&q=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as { serials?: EligibleSerial[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Serial search failed.");
      setResults(body.serials ?? []);
      setStatus(body.serials?.length ? "" : "No eligible SEN Serials found.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to search SEN Serials.");
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-[var(--muted-surface)] p-3">
      <b>Scan / Search / Select Available Serial</b>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          aria-label={`Search serial for ${item.productName}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Scan or enter SEN / manufacturer serial"
        />
        <button className="button" type="button" onClick={search}>Search SEN Serial</button>
      </div>
      {status ? <p className="mt-2 text-sm text-[var(--muted-text)]">{status}</p> : null}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {results.map((serial) => (
          <div key={serial.id} className="rounded border bg-[var(--surface)] p-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(serial.id)}
                disabled={serial.preselected}
                onChange={(event) => onSelected(
                  event.target.checked
                    ? [...new Set([...selected, serial.id])]
                    : selected.filter((id) => id !== serial.id),
                )}
              />
              <span>
                <b>{serial.sen_serial ?? serial.id}</b>
                {serial.manufacturer_serial ? <><br />Manufacturer: {serial.manufacturer_serial}</> : null}
                <br /><span className="text-xs">{serial.preselected ? "Invoice assigned · " : ""}{serial.status}</span>
              </span>
            </label>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs">Selected: {selected.length}. The count must exactly match this product&apos;s release quantity.</p>
    </div>
  );
}

export function StockOutReleaseForm({
  requestId,
  requestVersion,
  operationId,
  items,
  replacementOperationIds,
}: {
  requestId: string;
  requestVersion: number;
  operationId: string;
  items: StockOutReleaseItem[];
  replacementOperationIds: Record<string, string>;
}) {
  const action = confirmStockOutAction.bind(null, requestId);
  const [state, formAction] = useActionState(action, initialState);
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((item) => [
      item.requestItemId,
      Math.max(0, item.remainingQuantity),
    ])),
  );
  const [selectedSerials, setSelectedSerials] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(items.map((item) => {
      const quantity = Math.max(0, item.remainingQuantity);
      return [item.requestItemId, item.preassignedSerials.slice(0, quantity).map((serial) => serial.id)];
    })),
  );
  const payload = useMemo(() => JSON.stringify({
    request_version: requestVersion,
    items: items
      .filter((item) => Number(quantities[item.requestItemId] ?? 0) > 0)
      .map((item) => ({
        request_item_id: item.requestItemId,
        quantity: Number(quantities[item.requestItemId]),
        serial_ids: selectedSerials[item.requestItemId] ?? [],
      })),
  }), [items, quantities, requestVersion, selectedSerials]);

  return (
    <section className="mt-4 rounded-xl border-2 border-[var(--primary)] bg-[var(--surface)] p-4">
      <h2 className="text-xl font-bold">Confirm physical Stock Out</h2>
      <p className="mt-1 text-sm text-[var(--muted-text)]">
        Verify the exact quantities and physical SEN Serials. This is the only action that deducts warehouse stock.
      </p>
      {items.some((item) => item.preassignedSerials.length) ? (
        <div className="mt-4 rounded-xl bg-[var(--muted-surface)] p-3">
          <h3 className="font-bold">Invoice-assigned SEN Serials</h3>
          <p className="text-sm">Assigned units stay selected. Use the explicit audited action below only when the physical serial must change.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {items.flatMap((item) => item.preassignedSerials.map((serial) => (
              <div key={`${item.requestItemId}-${serial.id}`} className="rounded border bg-[var(--surface)] p-2 text-sm">
                <b>{serial.sen_serial ?? serial.id}</b>
                {serial.manufacturer_serial ? <> · {serial.manufacturer_serial}</> : null}
                {replacementOperationIds[serial.id] ? (
                  <SerialReplacement
                    requestItemId={item.requestItemId}
                    serial={serial}
                    operationId={replacementOperationIds[serial.id]}
                  />
                ) : null}
              </div>
            )))}
          </div>
        </div>
      ) : null}
      <form action={formAction} className="mt-4 grid gap-4">
        <input type="hidden" name="operation_id" value={operationId} />
        <input type="hidden" name="release_payload" value={payload} />
        {items.map((item) => (
          <article key={item.requestItemId} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><b>{item.productName}</b><p className="text-sm text-[var(--muted-text)]">{item.sku}</p></div>
              <label className="max-w-48">
                Release quantity
                <input
                  type="number"
                  min={0}
                  max={item.remainingQuantity}
                  step={1}
                  value={quantities[item.requestItemId] ?? 0}
                  onChange={(event) => {
                    const quantity = Math.max(0, Math.trunc(Number(event.target.value) || 0));
                    setQuantities((current) => ({
                      ...current,
                      [item.requestItemId]: quantity,
                    }));
                    setSelectedSerials((current) => ({
                      ...current,
                      [item.requestItemId]: item.preassignedSerials.length
                        ? item.preassignedSerials.slice(0, quantity).map((serial) => serial.id)
                        : (current[item.requestItemId] ?? []).slice(0, quantity),
                    }));
                  }}
                />
                <span className="text-xs">{item.remainingQuantity} remaining · {item.packedRemainingQuantity} packed and unreleased</span>
              </label>
            </div>
            {item.serialTrackingRequired ? (
              <SerialSelector
                item={item}
                selected={selectedSerials[item.requestItemId] ?? []}
                onSelected={(ids) => setSelectedSerials((current) => ({ ...current, [item.requestItemId]: ids }))}
              />
            ) : null}
          </article>
        ))}
        {state.message ? (
          <p role="status" className={`rounded-lg p-3 font-semibold ${state.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            {state.message}
          </p>
        ) : null}
        <SubmitButton />
      </form>
    </section>
  );
}
