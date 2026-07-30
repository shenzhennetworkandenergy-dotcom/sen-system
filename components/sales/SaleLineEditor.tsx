"use client";

import { useMemo, useState } from "react";

import { updateSaleLinesAction } from "@/app/admin/sales/actions";
import {
  calculateEditedLine,
  calculateEditedSaleTotal,
  type SaleDiscountType,
} from "@/lib/sales/line-editing";

type EditableLine = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discountType: SaleDiscountType;
  discountValue: number;
  lineTax: number;
  fulfilledFloor: number;
};

const field =
  "mt-1 w-full rounded-lg border bg-[var(--surface)] px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60";

export function SaleLineEditor({
  saleId,
  initialLines,
  currency,
  orderDiscount,
  shipping,
  service,
  tax,
  paid,
  canChangePrice,
  canApplyDiscount,
}: {
  saleId: string;
  initialLines: EditableLine[];
  currency: string;
  orderDiscount: number;
  shipping: number;
  service: number;
  tax: number;
  paid: number;
  canChangePrice: boolean;
  canApplyDiscount: boolean;
}) {
  const [lines, setLines] = useState(initialLines);
  const update = (id: string, patch: Partial<EditableLine>) =>
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );

  const calculation = useMemo(() => {
    try {
      const lineTotals = lines.map((line) =>
        calculateEditedLine({
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountType: line.discountType,
          discountValue: line.discountValue,
        }),
      );
      const totals = calculateEditedSaleTotal({
        lineTotals: lineTotals.map((line, index) => line.total + lines[index].lineTax),
        orderDiscount,
        shipping,
        service,
        tax,
      });
      return { lineTotals, ...totals, error: totals.total < paid ? "Total cannot be lower than the amount already paid." : null };
    } catch (error) {
      return {
        lineTotals: [],
        subtotal: 0,
        total: 0,
        error: error instanceof Error ? error.message : "The edited values are invalid.",
      };
    }
  }, [lines, orderDiscount, paid, service, shipping, tax]);

  const payload = lines.map((line) => ({
    id: line.id,
    quantity: line.quantity,
    unit_price: line.unitPrice,
    discount_type: line.discountType,
    discount_value: line.discountValue,
  }));

  return (
    <details className="mt-4 rounded-xl border border-blue-200 bg-blue-50/50 p-3">
      <summary className="cursor-pointer font-bold text-blue-950">
        Edit quantity, unit price or discount
      </summary>
      <form action={updateSaleLinesAction.bind(null, saleId)} className="mt-4 space-y-3">
        <input type="hidden" name="items" value={JSON.stringify(payload)} />
        {lines.map((line, index) => {
          const result = calculation.lineTotals[index];
          return (
            <article key={line.id} className="rounded-xl border bg-white p-3">
              <div>
                <strong>{line.name}</strong>
                <span className="ml-2 text-xs text-slate-500">SKU {line.sku}</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <label className="text-xs font-semibold">
                  Quantity
                  <input
                    type="number"
                    min={Math.max(1, line.fulfilledFloor)}
                    step="1"
                    value={line.quantity}
                    onChange={(event) =>
                      update(line.id, {
                        quantity: Math.max(
                          line.fulfilledFloor,
                          Math.trunc(Number(event.target.value) || 1),
                        ),
                      })
                    }
                    className={field}
                  />
                  <span className="text-slate-500">Minimum {Math.max(1, line.fulfilledFloor)}</span>
                </label>
                <label className="text-xs font-semibold">
                  Unit price ({currency})
                  <input
                    type="number"
                    min="0"
                    step=".01"
                    value={line.unitPrice}
                    disabled={!canChangePrice}
                    onChange={(event) => update(line.id, { unitPrice: Number(event.target.value) || 0 })}
                    className={field}
                  />
                </label>
                <label className="text-xs font-semibold">
                  Discount type
                  <select
                    value={line.discountType}
                    disabled={!canApplyDiscount}
                    onChange={(event) =>
                      update(line.id, {
                        discountType: event.target.value as SaleDiscountType,
                        discountValue: 0,
                      })
                    }
                    className={field}
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed amount</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  {line.discountType === "percentage" ? "Discount %" : `Discount (${currency})`}
                  <input
                    type="number"
                    min="0"
                    max={line.discountType === "percentage" ? 100 : undefined}
                    step=".01"
                    value={line.discountValue}
                    disabled={!canApplyDiscount}
                    onChange={(event) => update(line.id, { discountValue: Number(event.target.value) || 0 })}
                    className={field}
                  />
                </label>
                <div className="self-end rounded-lg bg-slate-100 p-3 text-right text-sm">
                  <span className="block text-slate-500">New line total</span>
                  <strong>{currency} {(result ? result.total + line.lineTax : 0).toFixed(2)}</strong>
                </div>
              </div>
            </article>
          );
        })}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="text-sm font-semibold">
            Required edit reason
            <input
              name="reason"
              required
              maxLength={500}
              placeholder="Why are these sale values being changed?"
              className={field}
            />
          </label>
          <div className="text-right">
            <p className="text-sm">New final total</p>
            <strong className="text-xl">{currency} {calculation.total.toFixed(2)}</strong>
          </div>
        </div>
        {calculation.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
            {calculation.error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-600">
            Saving updates stock reservations, records an audit history, and supersedes old invoice snapshots.
          </p>
          <button
            disabled={Boolean(calculation.error)}
            className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save sale changes
          </button>
        </div>
      </form>
    </details>
  );
}
