"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import {
  createPurchaseCarrierAction,
  deletePurchaseCarrierAction,
  togglePurchaseCarrierStatusAction,
  updatePurchaseCarrierAction,
  type PurchaseCarrierActionResult,
} from "@/app/admin/purchasing/actions";

export type PurchaseCarrierView = {
  id: string;
  name: string;
  phone_number: string | null;
  address: string | null;
  description: string | null;
  status: string;
};

const subscribeToHydration = () => () => undefined;

export function PurchaseCarrierManager({
  purchaseId,
  carriers,
}: {
  purchaseId: string;
  carriers: PurchaseCarrierView[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseCarrierView | null>(null);
  const [result, setResult] = useState<PurchaseCarrierActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const finish = (next: PurchaseCarrierActionResult) => {
    setResult(next);
    if (next.ok) {
      setEditing(null);
      formRef.current?.reset();
      router.refresh();
    }
  };

  const run = (action: () => Promise<PurchaseCarrierActionResult>) => {
    startTransition(async () => finish(await action()));
  };

  const close = () => {
    if (pending) return;
    setOpen(false);
    setEditing(null);
    setResult(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-950 hover:bg-cyan-100"
      >
        + Add Carrier
      </button>

      {mounted && open ? createPortal(
        <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center overflow-hidden p-4">
          <dialog
            open
            aria-labelledby="carrier-manager-title"
            className="pointer-events-auto relative m-0 flex max-h-full w-[min(94vw,820px)] flex-col overflow-hidden rounded-2xl border border-cyan-300 bg-[var(--surface)] p-0 text-[var(--foreground)] shadow-2xl"
          >
            <div className="z-10 flex shrink-0 items-center justify-between gap-3 border-b bg-[var(--surface)] p-4">
              <div>
                <h2 id="carrier-manager-title" className="text-lg font-bold">Carrier Management</h2>
                <p className="text-xs text-[var(--muted-text)]">Add or manage the carriers available for supplier shipments.</p>
              </div>
              <button type="button" onClick={close} className="rounded-lg border px-3 py-2 font-bold" aria-label="Close carrier management">×</button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain p-4 lg:grid-cols-[1fr_1.15fr]">
              <form
                ref={formRef}
                action={(formData) => run(() => editing
                  ? updatePurchaseCarrierAction(purchaseId, editing.id, formData)
                  : createPurchaseCarrierAction(purchaseId, formData))}
                className="rounded-xl border bg-[var(--muted-surface)] p-4"
              >
                <h3 className="font-bold">{editing ? `Edit ${editing.name}` : "Add Carrier"}</h3>
                <div className="mt-3 grid gap-3">
                  <label className="text-sm font-semibold">Carrier/Company Name *
                    <input name="name" required maxLength={200} defaultValue={editing?.name ?? ""} key={`name-${editing?.id ?? "new"}`} className="mt-1 block w-full rounded-xl border bg-[var(--surface)] px-3 py-2.5" />
                  </label>
                  <label className="text-sm font-semibold">Phone Number *
                    <input name="phone_number" required maxLength={60} defaultValue={editing?.phone_number ?? ""} key={`phone-${editing?.id ?? "new"}`} className="mt-1 block w-full rounded-xl border bg-[var(--surface)] px-3 py-2.5" />
                  </label>
                  <label className="text-sm font-semibold">Address *
                    <textarea name="address" required maxLength={500} rows={2} defaultValue={editing?.address ?? ""} key={`address-${editing?.id ?? "new"}`} className="mt-1 block w-full rounded-xl border bg-[var(--surface)] px-3 py-2.5" />
                  </label>
                  <label className="text-sm font-semibold">Description / Note
                    <textarea name="description" maxLength={1000} rows={2} defaultValue={editing?.description ?? ""} key={`description-${editing?.id ?? "new"}`} className="mt-1 block w-full rounded-xl border bg-[var(--surface)] px-3 py-2.5" />
                  </label>
                  <label className="text-sm font-semibold">Status
                    <select name="status" defaultValue={editing?.status ?? "active"} key={`status-${editing?.id ?? "new"}`} className="mt-1 block w-full rounded-xl border bg-[var(--surface)] px-3 py-2.5">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                </div>
                {result ? <p className={`mt-3 rounded-lg p-2 text-sm ${result.ok ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}>{result.message}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button disabled={pending} className="rounded-xl bg-cyan-700 px-4 py-2.5 font-bold text-white disabled:opacity-60">{pending ? "Saving…" : editing ? "Save changes" : "Save carrier"}</button>
                  {editing ? <button type="button" disabled={pending} onClick={() => { setEditing(null); setResult(null); formRef.current?.reset(); }} className="rounded-xl border px-4 py-2.5 font-bold">Cancel edit</button> : null}
                </div>
              </form>

              <section aria-label="Saved carriers" className="min-w-0">
                <h3 className="font-bold">Saved Carriers</h3>
                <div className="mt-3 grid max-h-[58vh] gap-2 overflow-y-auto pr-1">
                  {carriers.length ? carriers.map((carrier) => (
                    <article key={carrier.id} className="rounded-xl border bg-[var(--surface)] p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-bold">{carrier.name}</h4>
                          <p className="text-xs text-[var(--muted-text)]">{carrier.phone_number || "No phone"} · {carrier.status}</p>
                          <p className="mt-1 break-words text-xs">{carrier.address || "No address saved"}</p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${carrier.status === "active" ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800"}`}>{carrier.status}</span>
                      </div>
                      {carrier.description ? <p className="mt-2 text-xs text-[var(--muted-text)]">{carrier.description}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={pending} onClick={() => { setEditing(carrier); setResult(null); }} className="rounded-lg border px-3 py-1.5 text-xs font-bold">Edit</button>
                        <button type="button" disabled={pending} onClick={() => run(() => togglePurchaseCarrierStatusAction(purchaseId, carrier.id))} className="rounded-lg border px-3 py-1.5 text-xs font-bold">{carrier.status === "active" ? "Deactivate" : "Activate"}</button>
                        <button type="button" disabled={pending} onClick={() => { if (window.confirm(`Delete ${carrier.name}? Used carriers will be deactivated instead.`)) run(() => deletePurchaseCarrierAction(purchaseId, carrier.id)); }} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-700">Delete</button>
                      </div>
                    </article>
                  )) : <p className="rounded-xl border border-dashed p-4 text-sm text-[var(--muted-text)]">No carriers saved yet.</p>}
                </div>
              </section>
            </div>
          </dialog>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
