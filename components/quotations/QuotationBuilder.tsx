"use client";

import { useMemo, useState } from "react";

import { createQuotationAction } from "@/app/admin/quotations/actions";
import {
  SaleProductPicker,
  type SalePickerProduct,
} from "@/components/sales/SaleProductPicker";
import { roundMoney } from "@/lib/validation/numbers";

type Customer = {
  id: string;
  full_name: string | null;
  email: string;
  company_name: string | null;
};
type Variation = {
  id: string;
  product_id: string;
  name: string | null;
  sku: string;
  regular_price: number | null;
  sale_price: number | null;
};
type Row = {
  key: string;
  product_id: string;
  variation_id: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  tax_amount: string;
};

const field =
  "mt-1 w-full rounded-xl border bg-[var(--surface)] px-3 py-3";
const emptyRow = (): Row => ({
  key: crypto.randomUUID(),
  product_id: "",
  variation_id: "",
  quantity: "1",
  unit_price: "0",
  discount_amount: "0",
  tax_amount: "0",
});

export function QuotationBuilder({
  customers,
  products,
  variations,
  defaultExpiration,
}: {
  customers: Customer[];
  products: SalePickerProduct[];
  variations: Variation[];
  defaultExpiration: string;
}) {
  const [customerId, setCustomerId] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const searchableProducts = useMemo(
    () =>
      products.map((product) => ({
        ...product,
        search_terms: variations
          .filter((variation) => variation.product_id === product.id)
          .flatMap((variation) => [variation.name ?? "", variation.sku ?? ""])
          .join(" "),
      })),
    [products, variations],
  );
  const selected = useMemo(
    () =>
      rows.map((row) => {
        const product = products.find((item) => item.id === row.product_id);
        const variation = variations.find(
          (item) => item.id === row.variation_id,
        );
        const quantity = Math.max(1, Math.trunc(Number(row.quantity) || 1));
        const unitPrice = Math.max(0, Number(row.unit_price) || 0);
        const lineSubtotal = roundMoney(quantity * unitPrice);
        const discountAmount = Math.min(
          lineSubtotal,
          Math.max(0, Number(row.discount_amount) || 0),
        );
        const taxAmount = Math.max(0, Number(row.tax_amount) || 0);
        return {
          ...row,
          product,
          variation,
          quantity,
          unitPrice,
          discountAmount,
          taxAmount,
          lineSubtotal,
          lineTotal: roundMoney(lineSubtotal - discountAmount + taxAmount),
        };
      }),
    [products, rows, variations],
  );
  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  const payload = selected
    .filter((row) => row.product)
    .map((row) => ({
      product_id: row.product_id,
      variation_id: row.variation_id || null,
      quantity: row.quantity,
      unit_price: row.unitPrice,
      discount_amount: row.discountAmount,
      tax_amount: row.taxAmount,
    }));
  const totals = selected.reduce(
    (result, row) => ({
      subtotal: result.subtotal + row.lineSubtotal,
      discount: result.discount + row.discountAmount,
      tax: result.tax + row.taxAmount,
      total: result.total + row.lineTotal,
    }),
    { subtotal: 0, discount: 0, tax: 0, total: 0 },
  );
  const hasIncompleteRow = selected.some((row) => !row.product);

  return (
    <form action={createQuotationAction} className="space-y-5">
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <section className="grid gap-4 rounded-2xl border bg-[var(--surface)] p-5 md:grid-cols-2">
        <label className="font-semibold">
          Customer
          <select
            name="customer_id"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            required
            className={field}
          >
            <option value="">Choose customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.full_name || customer.email} · {customer.email}
              </option>
            ))}
          </select>
        </label>
        <label className="font-semibold">
          Quotation subject
          <input
            name="subject"
            placeholder="Quotation subject"
            className={field}
          />
        </label>
        <label className="font-semibold">
          Required by
          <input name="required_by" type="date" className={field} />
        </label>
        <label className="font-semibold">
          Quotation expires
          <input
            name="expiration_date"
            type="date"
            defaultValue={defaultExpiration}
            className={field}
          />
        </label>
      </section>

      <section className="rounded-2xl border bg-[var(--surface)] p-5">
        <div>
          <h2 className="text-lg font-bold">Products and pricing</h2>
          <p className="text-sm text-[var(--muted-text)]">
            Search and add multiple products. Pricing and totals can be adjusted
            before the quotation is generated.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {selected.map((row) => (
            <article
              key={row.key}
              className="grid gap-3 rounded-xl border p-4 xl:grid-cols-[2fr_1fr_.55fr_.8fr_.8fr_.8fr_.9fr_auto]"
            >
              <SaleProductPicker
                products={searchableProducts}
                selectedProduct={row.product}
                onClear={() =>
                  update(row.key, {
                    product_id: "",
                    variation_id: "",
                    unit_price: "0",
                  })
                }
                onSelect={(product) => {
                  const price = roundMoney(
                    Number(product.sale_price ?? product.regular_price ?? 0),
                  );
                  update(row.key, {
                    product_id: product.id,
                    variation_id: "",
                    unit_price: String(price),
                  });
                }}
              />
              <label className="text-xs font-semibold">
                Variation
                <select
                  value={row.variation_id}
                  onChange={(event) => {
                    const variation = variations.find(
                      (item) => item.id === event.target.value,
                    );
                    const parentPrice = roundMoney(
                      Number(
                        row.product?.sale_price ??
                          row.product?.regular_price ??
                          0,
                      ),
                    );
                    const price = roundMoney(
                      Number(
                        variation?.sale_price ??
                          variation?.regular_price ??
                          parentPrice,
                      ),
                    );
                    update(row.key, {
                      variation_id: event.target.value,
                      unit_price: String(price),
                    });
                  }}
                  disabled={!row.product}
                  className={field}
                >
                  <option value="">None</option>
                  {variations
                    .filter((item) => item.product_id === row.product_id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || item.sku}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Qty
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={row.quantity}
                  onChange={(event) =>
                    update(row.key, { quantity: event.target.value })
                  }
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold">
                Unit BDT
                <input
                  type="number"
                  min="0"
                  step=".01"
                  value={row.unit_price}
                  onChange={(event) =>
                    update(row.key, { unit_price: event.target.value })
                  }
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold">
                Discount
                <input
                  type="number"
                  min="0"
                  max={row.lineSubtotal}
                  step=".01"
                  value={row.discount_amount}
                  onChange={(event) =>
                    update(row.key, { discount_amount: event.target.value })
                  }
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold">
                Tax
                <input
                  type="number"
                  min="0"
                  step=".01"
                  value={row.tax_amount}
                  onChange={(event) =>
                    update(row.key, { tax_amount: event.target.value })
                  }
                  className={field}
                />
              </label>
              <div className="text-xs font-semibold">
                Line total
                <p className={`${field} min-h-[46px]`}>
                  BDT {row.lineTotal.toFixed(2)}
                </p>
              </div>
              <button
                type="button"
                disabled={rows.length === 1}
                onClick={() =>
                  setRows((current) =>
                    current.filter((item) => item.key !== row.key),
                  )
                }
                className="self-end rounded-xl border px-3 py-3 font-semibold disabled:opacity-40"
              >
                Remove
              </button>
            </article>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRows((current) => [...current, emptyRow()])}
          className="mt-4 rounded-xl border px-4 py-2.5 font-semibold"
        >
          + Add product
        </button>
        <div className="mt-5 grid gap-2 rounded-xl bg-[var(--muted-surface)] p-4 text-sm sm:grid-cols-4">
          <p>Subtotal <b className="block">BDT {totals.subtotal.toFixed(2)}</b></p>
          <p>Discount <b className="block">BDT {totals.discount.toFixed(2)}</b></p>
          <p>Tax <b className="block">BDT {totals.tax.toFixed(2)}</b></p>
          <p>Total <b className="block text-lg">BDT {totals.total.toFixed(2)}</b></p>
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border bg-[var(--surface)] p-5 md:grid-cols-2">
        <label className="font-semibold">
          Payment terms
          <textarea
            name="payment_terms"
            rows={3}
            placeholder="For example: Cash on delivery or payment within 15 days"
            className={field}
          />
        </label>
        <label className="font-semibold">
          Delivery information
          <textarea
            name="delivery_information"
            rows={3}
            placeholder="Estimated delivery, transport or installation details"
            className={field}
          />
        </label>
        <label className="font-semibold md:col-span-2">
          Terms and conditions
          <textarea
            name="terms_and_conditions"
            rows={4}
            placeholder="Validity, warranty, exclusions and commercial conditions"
            className={field}
          />
        </label>
        <label className="font-semibold md:col-span-2">
          Customer notes
          <textarea
            name="message"
            rows={3}
            placeholder="Information shown to the customer"
            className={field}
          />
        </label>
        <label className="font-semibold md:col-span-2">
          Internal notes
          <textarea
            name="internal_notes"
            rows={3}
            placeholder="Private staff notes; not shown on the quotation document"
            className={field}
          />
        </label>
      </section>
      <div className="flex justify-end">
        <button
          disabled={!customerId || !payload.length || hasIncompleteRow}
          className="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Generate quotation
        </button>
      </div>
    </form>
  );
}
