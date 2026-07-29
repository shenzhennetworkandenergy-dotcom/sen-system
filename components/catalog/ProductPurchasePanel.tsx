"use client";

import { useMemo, useState } from "react";

type Variation = {
  id: string;
  sku: string;
  combination_key: string;
  regular_price: number | null;
  sale_price: number | null;
  stock_status: string;
  available: number;
  incoming: number;
};

type PurchaseAction = (formData: FormData) => void | Promise<void>;

function money(amount: number | null, currency: string) {
  return amount === null
    ? "Price on request"
    : new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
}

export function ProductPurchasePanel({
  productName,
  productSlug,
  productType,
  currency,
  available,
  incoming,
  allowBackorders,
  variations,
  addAction,
  orderAction,
  conversationAction,
}: {
  productName: string;
  productSlug: string;
  productType: string;
  currency: string;
  available: number;
  incoming: number;
  allowBackorders: boolean;
  variations: Variation[];
  addAction: PurchaseAction;
  orderAction: PurchaseAction;
  conversationAction: PurchaseAction;
}) {
  const [variationId, setVariationId] = useState(variations[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const selected = useMemo(
    () => variations.find((variation) => variation.id === variationId) ?? null,
    [variationId, variations],
  );
  const selectedAvailable = selected ? Number(selected.available) : available;
  const selectedIncoming = selected ? Number(selected.incoming) : incoming;
  const canOrder = Boolean(
    (productType === "variable" ? selected : true) &&
      (selectedAvailable > 0 || allowBackorders),
  );
  const maxQuantity = allowBackorders ? 99 : Math.max(1, Math.floor(selectedAvailable));

  return (
    <div className="mt-7">
      {productType === "variable" ? (
        <label className="block text-sm font-semibold text-slate-800">
          Select configuration
          <select
            name="variation_selector"
            value={variationId}
            onChange={(event) => {
              setVariationId(event.target.value);
              setQuantity(1);
            }}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950"
          >
            {variations.map((variation) => {
              const price = variation.sale_price ?? variation.regular_price;
              const availability =
                variation.available > 0
                  ? `${variation.available} available`
                  : variation.incoming > 0
                    ? `${variation.incoming} incoming`
                    : "contact for availability";
              return (
                <option key={variation.id} value={variation.id}>
                  {variation.combination_key} — {money(price, currency)} — {availability}
                </option>
              );
            })}
          </select>
        </label>
      ) : null}

      {selected ? (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-800">
            SKU: {selected.sku}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">
            {money(selected.sale_price ?? selected.regular_price, currency)}
          </span>
        </div>
      ) : null}

      {canOrder ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-[7rem_1fr_1fr]">
          <label className="text-sm font-semibold">
            Quantity
            <input
              value={quantity}
              onChange={(event) =>
                setQuantity(Math.min(maxQuantity, Math.max(1, Number(event.target.value) || 1)))
              }
              type="number"
              min="1"
              max={maxQuantity}
              className="mt-1 w-full rounded-xl border p-3 text-slate-950"
            />
          </label>
          <form action={addAction} className="self-end">
            <input name="quantity" type="hidden" value={quantity} />
            {selected ? <input name="variation_id" type="hidden" value={selected.id} /> : null}
            <button className="min-h-12 w-full rounded-xl border-2 border-cyan-700 bg-white px-5 font-semibold text-cyan-900 transition hover:-translate-y-0.5 hover:bg-cyan-50">
              Add to cart
            </button>
          </form>
          <form action={orderAction} className="self-end">
            <input name="quantity" type="hidden" value={quantity} />
            {selected ? <input name="variation_id" type="hidden" value={selected.id} /> : null}
            <button className="sen-button-glow min-h-12 w-full rounded-xl px-5 font-semibold">
              Order now
            </button>
          </form>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <a
            href={`/request-quote?product=${encodeURIComponent(productSlug)}`}
            className="sen-button-glow inline-flex min-h-12 items-center justify-center rounded-xl px-5 font-semibold"
          >
            Request quotation
          </a>
          <form action={conversationAction}>
            <input
              type="hidden"
              name="message"
              value={`I would like to discuss availability and sourcing for ${productName}${selected ? ` (${selected.combination_key})` : ""}.`}
            />
            <button className="h-full min-h-12 w-full rounded-xl border border-slate-300 bg-white px-5 font-semibold text-[#10152f]">
              Talk to SEN
            </button>
          </form>
        </div>
      )}

      {productType === "variable" && !variations.length ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          Configurations are being prepared. Please request a quotation.
        </p>
      ) : null}
      {!canOrder && selectedIncoming > 0 ? (
        <p className="mt-3 text-sm text-slate-600">{selectedIncoming} unit(s) are incoming.</p>
      ) : null}
    </div>
  );
}
