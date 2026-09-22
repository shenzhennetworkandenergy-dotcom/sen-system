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

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" strokeLinecap="round" />
    </svg>
  );
}

function ReleaseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
      <path d="M4 7h11v10H4z" strokeLinejoin="round" />
      <path d="M15 12h5m-2-2 2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 px-5 py-3 text-base font-bold text-white shadow-lg shadow-blue-900/15 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      type="submit"
      disabled={pending}
    >
      <ReleaseIcon />
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
    <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
      <summary className="cursor-pointer font-semibold text-blue-800">Change/Replace Serial</summary>
      <form action={formAction} className="mt-2 grid gap-2">
        <label className="grid gap-1 font-medium">
          Replacement SEN Serial ID
          <input className="rounded-lg border border-slate-300 bg-white px-3 py-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100" name="replacement_serial_id" required placeholder="Select an eligible serial from search results" />
        </label>
        <label className="grid gap-1 font-medium">
          Replacement reason
          <input className="rounded-lg border border-slate-300 bg-white px-3 py-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100" name="replacement_reason" required minLength={3} placeholder="Why the assigned physical unit is changing" />
        </label>
        <button className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-200 bg-white px-3 font-semibold text-blue-800 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:opacity-60" type="submit" disabled={pending}>
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
  requiredQuantity,
}: {
  item: StockOutReleaseItem;
  selected: string[];
  onSelected: (ids: string[]) => void;
  requiredQuantity: number;
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
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <b className="text-slate-900">Scan / Search / Select Available Serial</b>
          <p className="mt-0.5 text-xs text-[var(--muted-text)]">Choose the exact eligible physical unit leaving the warehouse.</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${selected.length === requiredQuantity && requiredQuantity > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          Selected: {selected.length} / Required: {requiredQuantity}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
          aria-label={`Search serial for ${item.productName}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Scan or enter SEN / manufacturer serial"
        />
        <button className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200" type="button" onClick={search}>
          <SearchIcon /> Search SEN Serial
        </button>
      </div>
      {status ? <p role="status" className="mt-2 text-sm text-[var(--muted-text)]">{status}</p> : null}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {results.map((serial) => {
          const isSelected = selected.includes(serial.id);
          return (
          <div key={serial.id} className={`rounded-xl border p-3 shadow-sm transition ${isSelected ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white hover:border-blue-300"}`}>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus-visible:ring-4 focus-visible:ring-emerald-100"
                type="checkbox"
                checked={isSelected}
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
                <br /><span className={`text-xs font-medium ${isSelected ? "text-emerald-700" : "text-blue-700"}`}>
                  {isSelected ? "Eligible and selected" : "Eligible to release"}{serial.preselected ? " · Invoice assigned" : ""} · {serial.status}
                </span>
              </span>
            </label>
          </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[var(--muted-text)]">The selected count must exactly match this product&apos;s release quantity.</p>
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
    <section className="mt-5 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-lg shadow-blue-900/5">
      <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 via-white to-indigo-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-700 text-white shadow-sm"><ReleaseIcon /></span>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Confirm physical Stock Out</h2>
            <p className="mt-1 text-sm text-[var(--muted-text)]">Verify the exact quantities and physical SEN Serials. This is the only action that deducts warehouse stock.</p>
          </div>
        </div>
        <ol aria-label="Stock Out workflow" className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {["Set release quantity", "Scan / select serials", "Review release", "Confirm Stock Out"].map((step, index) => (
            <li key={step} className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white/90 px-3 py-2 font-semibold text-slate-700 shadow-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-700 text-xs font-bold text-white">{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
      <div className="p-4 sm:p-5">
      {items.some((item) => item.preassignedSerials.length) ? (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 sm:p-4">
          <h3 className="font-bold text-indigo-950">Invoice-assigned SEN Serials</h3>
          <p className="text-sm">Assigned units stay selected. Use the explicit audited action below only when the physical serial must change.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {items.flatMap((item) => item.preassignedSerials.map((serial) => (
              <div key={`${item.requestItemId}-${serial.id}`} className="rounded-lg border border-emerald-200 bg-white p-3 text-sm shadow-sm">
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
          <article key={item.requestItemId} className="rounded-2xl border border-slate-200 border-l-4 border-l-blue-600 bg-slate-50/50 p-3 shadow-sm sm:p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <b className="break-words text-slate-900">{item.productName}</b>
                <p className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">SKU: {item.sku}</p>
              </div>
              <label className="grid w-full gap-1 rounded-xl border border-blue-200 bg-blue-50 p-3 lg:max-w-64">
                <span className="font-bold text-blue-950">Release Quantity</span>
                <input
                  aria-label={`Release quantity for ${item.productName}`}
                  className="min-h-12 w-full rounded-lg border-2 border-blue-400 bg-white px-3 text-lg font-bold text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
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
                <span className="text-xs font-semibold text-blue-900">Maximum releasable: {item.remainingQuantity}</span>
                <span className="text-xs text-[var(--muted-text)]">{item.remainingQuantity} remaining · {item.packedRemainingQuantity} packed and unreleased</span>
              </label>
            </div>
            {item.serialTrackingRequired ? (
              <SerialSelector
                item={item}
                selected={selectedSerials[item.requestItemId] ?? []}
                requiredQuantity={Number(quantities[item.requestItemId] ?? 0)}
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
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-100 font-bold text-amber-800">!</span>
          <p><b>Final warehouse action.</b> This action will physically release the selected products from warehouse inventory.</p>
        </div>
        <SubmitButton />
      </form>
      </div>
    </section>
  );
}
