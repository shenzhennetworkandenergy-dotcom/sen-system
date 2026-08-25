"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createQuotationAction,
  createQuotationCustomerAction,
  updateDraftQuotationAction,
  type QuotationCustomerActionState,
} from "@/app/admin/quotations/actions";
import { CustomerTypeahead } from "@/components/customers/CustomerTypeahead";
import {
  SaleProductPicker,
  type SalePickerProduct,
} from "@/components/sales/SaleProductPicker";
import type { CustomerSearchOption } from "@/lib/customers/search";
import {
  calculateDraftQuotationLine,
  calculateDraftQuotationTotals,
  catalogueForDraftEditRow,
  type DraftQuotationValues,
} from "@/lib/quotations/draft-editing";
import { roundMoney } from "@/lib/validation/numbers";

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
  retained: boolean;
  product_id: string;
  variation_id: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  tax_amount: string;
};
export type { DraftQuotationValues } from "@/lib/quotations/draft-editing";

const field =
  "mt-1 w-full rounded-xl border bg-[var(--surface)] px-3 py-3";
const emptyRow = (): Row => ({
  key: crypto.randomUUID(),
  retained: false,
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
  retainedProducts = [],
  retainedVariations = [],
  defaultExpiration,
  mode = "create",
  fixedCustomer,
  initialDraft,
}: {
  customers: CustomerSearchOption[];
  products: SalePickerProduct[];
  variations: Variation[];
  retainedProducts?: SalePickerProduct[];
  retainedVariations?: Variation[];
  defaultExpiration: string;
  mode?: "create" | "edit";
  fixedCustomer?: CustomerSearchOption;
  initialDraft?: DraftQuotationValues;
}) {
  const [customerId, setCustomerId] = useState(fixedCustomer?.id ?? "");
  const [customerOptions, setCustomerOptions] =
    useState<CustomerSearchOption[]>(customers);
  const createAndSelectCustomer = async (
    previousState: QuotationCustomerActionState,
    form: FormData,
  ) => {
    const nextState = await createQuotationCustomerAction(previousState, form);
    if (nextState.customer) {
      setCustomerOptions((current) => [
        nextState.customer!,
        ...current.filter((item) => item.id !== nextState.customer!.id),
      ]);
      setCustomerId(nextState.customer.id);
    }
    return nextState;
  };
  const [customerState, customerFormAction, customerPending] = useActionState(
    createAndSelectCustomer,
    {
      status: "idle",
      message: "",
      customer: null,
    } satisfies QuotationCustomerActionState,
  );
  const [rows, setRows] = useState<Row[]>(() =>
    initialDraft?.items.length
      ? initialDraft.items.map((item) => ({
          key: crypto.randomUUID(),
          retained: true,
          product_id: item.productId,
          variation_id: item.variationId ?? "",
          quantity: String(item.quantity),
          unit_price: String(item.unitPrice),
          discount_amount: String(item.discountAmount),
          tax_amount: String(item.taxAmount),
        }))
      : [emptyRow()],
  );
  const [headerDiscount, setHeaderDiscount] = useState(
    String(initialDraft?.discountAmount ?? 0),
  );
  const [headerTax, setHeaderTax] = useState(
    String(initialDraft?.taxAmount ?? 0),
  );
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
        const product = catalogueForDraftEditRow(
          products,
          retainedProducts.find((item) => item.id === row.product_id),
          row.retained,
        ).find((item) => item.id === row.product_id);
        const variation = catalogueForDraftEditRow(
          variations,
          retainedVariations.find((item) => item.id === row.variation_id),
          row.retained,
        ).find(
          (item) => item.id === row.variation_id,
        );
        const quantity = Math.max(1, Math.trunc(Number(row.quantity) || 1));
        const unitPrice = Math.max(0, Number(row.unit_price) || 0);
        const discountAmount = Math.min(
          roundMoney(quantity * unitPrice),
          Math.max(0, Number(row.discount_amount) || 0),
        );
        const taxAmount = Math.max(0, Number(row.tax_amount) || 0);
        const calculated = calculateDraftQuotationLine({
          quantity,
          unitPrice,
          discountAmount,
          taxAmount,
        });
        return {
          ...row,
          product,
          variation,
          quantity,
          unitPrice,
          discountAmount,
          taxAmount,
          lineSubtotal: calculated.subtotal,
          lineTotal: calculated.total,
        };
      }),
    [products, retainedProducts, retainedVariations, rows, variations],
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
  const editing = mode === "edit";
  const totals = calculateDraftQuotationTotals(
    selected.map((row) => ({
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      discountAmount: row.discountAmount,
      taxAmount: row.taxAmount,
    })),
    editing ? Math.max(0, Number(headerDiscount) || 0) : 0,
    editing ? Math.max(0, Number(headerTax) || 0) : 0,
  );
  const hasIncompleteRow = selected.some((row) => !row.product);
  const quotationAction =
    editing && initialDraft
      ? updateDraftQuotationAction.bind(null, initialDraft.id)
      : createQuotationAction;

  return (
    <>
      {mode === "create" ? <details className="mb-5 rounded-2xl border bg-[var(--surface)] p-4" open>
        <summary className="cursor-pointer font-bold">Add a new customer</summary>
        <form
          key={customerState.customer?.id ?? "new-customer"}
          action={customerFormAction}
          className="mt-4 grid gap-3 lg:grid-cols-5"
        >
          <input
            name="full_name"
            required
            placeholder="Full name"
            className={field}
          />
          <input
            name="company_name"
            placeholder="Company (optional)"
            className={field}
          />
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className={field}
          />
          <input
            name="phone"
            required
            placeholder="Phone"
            className={field}
          />
          <input
            name="address_line_1"
            required
            placeholder="Full address"
            className={field}
          />
          <button
            disabled={customerPending}
            className="rounded-xl bg-[var(--primary)] px-4 py-3 font-bold text-[var(--primary-foreground)] disabled:opacity-50 lg:col-start-5"
          >
            {customerPending ? "Adding customer…" : "Add customer"}
          </button>
        </form>
        {customerState.message ? (
          <p
            aria-live="polite"
            className={`mt-3 text-sm ${
              customerState.status === "error"
                ? "text-red-700"
                : "text-emerald-700"
            }`}
          >
            {customerState.message}
          </p>
        ) : null}
      </details>
      : null}

      <form action={quotationAction} className="space-y-5">
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      {mode === "edit" && initialDraft ? (
        <input type="hidden" name="updated_at" value={initialDraft.updatedAt} />
      ) : null}
      <section className="grid gap-4 rounded-2xl border bg-[var(--surface)] p-5 md:grid-cols-2">
        {mode === "create" ? <CustomerTypeahead
          customers={customerOptions}
          selectedCustomerId={customerId}
          onSelectionChange={(customer) => setCustomerId(customer?.id ?? "")}
          fieldClassName={field}
          labelClassName="font-semibold"
        /> : (
          <div className="rounded-xl border bg-[var(--muted-surface)] px-3 py-3">
            <p className="font-semibold">Customer</p>
            <p className="text-sm">{fixedCustomer?.full_name ?? "Customer"} · {fixedCustomer?.email ?? ""}</p>
          </div>
        )}
        <label className="font-semibold">
          Quotation subject
          <input
            name="subject"
            placeholder="Quotation subject"
            defaultValue={initialDraft?.subject ?? ""}
            className={field}
          />
        </label>
        {mode === "edit" ? <>
          <label className="font-semibold">
            Company
            <input name="company_name" defaultValue={initialDraft?.companyName ?? ""} className={field} />
          </label>
          <label className="font-semibold">
            Tax identification number
            <input name="customer_tax_identification_number" defaultValue={initialDraft?.customerTaxIdentificationNumber ?? ""} className={field} />
          </label>
        </> : null}
        <label className="font-semibold">
          Required by
          <input name="required_by" type="date" defaultValue={initialDraft?.requiredBy ?? ""} className={field} />
        </label>
        <label className="font-semibold">
          Quotation expires
          <input
            name="expiration_date"
            type="date"
            defaultValue={initialDraft?.expirationDate ?? defaultExpiration}
            className={field}
          />
        </label>
      </section>

      {mode === "edit" ? <section className="grid gap-4 rounded-2xl border bg-[var(--surface)] p-5 md:grid-cols-2">
        <label className="font-semibold">
          Quotation discount (BDT)
          <input
            name="discount_amount"
            type="number"
            min="0"
            step=".01"
            value={headerDiscount}
            onChange={(event) => setHeaderDiscount(event.target.value)}
            className={field}
          />
        </label>
        <label className="font-semibold">
          Quotation tax (BDT)
          <input
            name="tax_amount"
            type="number"
            min="0"
            step=".01"
            value={headerTax}
            onChange={(event) => setHeaderTax(event.target.value)}
            className={field}
          />
        </label>
      </section> : null}

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
                    retained: false,
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
                    retained: false,
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
                      retained: false,
                      variation_id: event.target.value,
                      unit_price: String(price),
                    });
                  }}
                  disabled={!row.product}
                  className={field}
                >
                  <option value="">None</option>
                  {catalogueForDraftEditRow(
                    variations.filter(
                      (item) => item.product_id === row.product_id,
                    ),
                    retainedVariations.find(
                      (item) =>
                        item.id === row.variation_id &&
                        item.product_id === row.product_id,
                    ),
                    row.retained,
                  )
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
            defaultValue={initialDraft?.paymentTerms ?? ""}
            placeholder="For example: Cash on delivery or payment within 15 days"
            className={field}
          />
        </label>
        <label className="font-semibold">
          Delivery information
          <textarea
            name="delivery_information"
            rows={3}
            defaultValue={initialDraft?.deliveryInformation ?? ""}
            placeholder="Estimated delivery, transport or installation details"
            className={field}
          />
        </label>
        <label className="font-semibold md:col-span-2">
          Terms and conditions
          <textarea
            name="terms_and_conditions"
            rows={4}
            defaultValue={initialDraft?.termsAndConditions ?? ""}
            placeholder="Validity, warranty, exclusions and commercial conditions"
            className={field}
          />
        </label>
        <label className="font-semibold md:col-span-2">
          Customer notes
          <textarea
            name="message"
            rows={3}
            defaultValue={initialDraft?.customerNotes ?? ""}
            placeholder="Information shown to the customer"
            className={field}
          />
        </label>
        <label className="font-semibold md:col-span-2">
          Internal notes
          <textarea
            name="internal_notes"
            rows={3}
            defaultValue={initialDraft?.internalNotes ?? ""}
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
          {editing ? "Save Draft quotation" : "Generate quotation"}
        </button>
      </div>
      </form>
    </>
  );
}
