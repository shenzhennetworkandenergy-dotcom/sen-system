"use client";

import { useId, useMemo, useState } from "react";

import { filterSaleProducts } from "@/lib/sales/product-search";

export type SalePickerProduct = {
  id: string;
  name: string;
  sku: string;
  model_number: string | null;
  brand_id: string | null;
  product_type: string;
  regular_price: number | null;
  sale_price: number | null;
  serial_tracking_required: boolean;
  search_terms?: string | null;
};

export function SaleProductPicker({
  products,
  selectedProduct,
  onClear,
  onSelect,
}: {
  products: SalePickerProduct[];
  selectedProduct?: SalePickerProduct;
  onClear: () => void;
  onSelect: (product: SalePickerProduct) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState(selectedProduct?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const matches = useMemo(
    () => filterSaleProducts(products, query),
    [products, query],
  );
  const hasSearch = query.trim().length > 0;

  return (
    <div className="relative text-xs font-semibold">
      <label htmlFor={`${listId}-input`}>Product</label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={isOpen && hasSearch}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(event.target.value.trim().length > 0);
          onClear();
        }}
        onFocus={() => {
          if (hasSearch) {
            setIsOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 120);
        }}
        placeholder="Search by product name, SKU, or model"
        autoComplete="off"
        className="mt-1 w-full rounded-lg border bg-[var(--surface)] px-3 py-2"
        required
      />

      {isOpen && hasSearch ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-72 w-full min-w-72 overflow-auto rounded-xl border bg-white p-1 text-slate-950 shadow-xl"
        >
          {matches.map((product) => (
            <button
              key={product.id}
              type="button"
              role="option"
              aria-selected={selectedProduct?.id === product.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery(product.name);
                setIsOpen(false);
                onSelect(product);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
            >
              <span className="block font-semibold">{product.name}</span>
              <span className="mt-0.5 block text-xs font-normal text-slate-600">
                SKU: {product.sku}
                {product.model_number ? ` · Model: ${product.model_number}` : ""}
                {product.serial_tracking_required ? " · Serialized" : ""}
              </span>
            </button>
          ))}

          {!matches.length ? (
            <span className="block px-3 py-2 font-normal text-slate-500">
              No matching products found.
            </span>
          ) : null}
        </div>
      ) : null}

      {selectedProduct ? (
        <span className="mt-1 block font-normal text-[var(--muted-text)]">
          SKU {selectedProduct.sku}
          {selectedProduct.model_number ? ` · Model ${selectedProduct.model_number}` : ""}
        </span>
      ) : null}
    </div>
  );
}
