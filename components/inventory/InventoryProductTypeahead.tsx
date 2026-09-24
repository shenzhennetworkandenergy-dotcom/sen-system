"use client";

import { useEffect, useId, useState } from "react";

import {
  INVENTORY_PRODUCT_SEARCH_MIN_LENGTH,
  type InventoryProductSearchResult,
  type InventoryVariationSearchResult,
} from "@/lib/inventory/product-search";

export type InventorySearchScope = "serial-generate" | "serial-list" | "adjust" | "transfer";

type ProductSelection = InventoryProductSearchResult | null;
type VariationSelection = InventoryVariationSearchResult | null;

function productLabel(product: InventoryProductSearchResult) {
  return `${product.name} · ${product.sku}${product.model_number ? ` · ${product.model_number}` : ""}`;
}

function variationLabel(variation: InventoryVariationSearchResult) {
  return `${variation.sku} · ${variation.combination_key}`;
}

function InventorySearchBox({
  kind,
  scope,
  name,
  label,
  productId,
  initialSelection = null,
  required = false,
  disabled = false,
  onSelectionChange,
}: {
  kind: "product" | "variation";
  scope: InventorySearchScope;
  name: string;
  label: string;
  productId?: string;
  initialSelection?: ProductSelection | VariationSelection;
  required?: boolean;
  disabled?: boolean;
  onSelectionChange?: (selection: ProductSelection | VariationSelection) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState(() => initialSelection ? (kind === "product" ? productLabel(initialSelection as InventoryProductSearchResult) : variationLabel(initialSelection as InventoryVariationSearchResult)) : "");
  const [selection, setSelection] = useState<ProductSelection | VariationSelection>(initialSelection);
  const [results, setResults] = useState<Array<InventoryProductSearchResult | InventoryVariationSearchResult>>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const value = query.trim();
    if (disabled || (kind === "variation" && !productId) || selection || value.length < INVENTORY_PRODUCT_SEARCH_MIN_LENGTH) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ scope, kind, q: value });
        if (kind === "variation" && productId) params.set("product_id", productId);
        const response = await fetch(`/api/admin/inventory/product-search?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json() as {
          products?: InventoryProductSearchResult[];
          variations?: InventoryVariationSearchResult[];
        };
        const next = kind === "product" ? body.products ?? [] : body.variations ?? [];
        setResults(next);
        setActiveIndex(next.length ? 0 : -1);
        setOpen(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResults([]);
          setActiveIndex(-1);
          setOpen(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, kind, productId, query, scope, selection]);

  const select = (item: InventoryProductSearchResult | InventoryVariationSearchResult) => {
    setSelection(item);
    setQuery(kind === "product" ? productLabel(item as InventoryProductSearchResult) : variationLabel(item as InventoryVariationSearchResult));
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    onSelectionChange?.(item);
  };

  const clear = () => {
    setSelection(null);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    onSelectionChange?.(null);
  };

  return (
    <div className="relative">
      <label className="block font-semibold" htmlFor={`${listId}-input`}>
        {label}
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-activedescendant={open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          value={query}
          disabled={disabled}
          required={required}
          autoComplete="off"
          placeholder={disabled ? "Select a product first" : `Search ${kind === "product" ? "name, SKU, model or code" : "SKU or variation"}`}
          onChange={(event) => {
            setSelection(null);
            setQuery(event.target.value);
            setResults([]);
            setLoading(false);
            setOpen(event.target.value.trim().length >= INVENTORY_PRODUCT_SEARCH_MIN_LENGTH);
            setActiveIndex(-1);
            onSelectionChange?.(null);
          }}
          onFocus={() => {
            if (query.trim().length >= INVENTORY_PRODUCT_SEARCH_MIN_LENGTH && !selection) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && results.length) {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.min(current + 1, results.length - 1));
            } else if (event.key === "ArrowUp" && results.length) {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter" && open && activeIndex >= 0 && results[activeIndex]) {
              event.preventDefault();
              select(results[activeIndex]);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setActiveIndex(-1);
            }
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          className="mt-1 w-full rounded-lg border bg-[var(--surface)] p-3 pr-24"
        />
        <input type="hidden" name={name} value={selection?.id ?? ""} />
      </label>
      {selection ? (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2 top-8 rounded px-2 py-1 text-xs font-semibold text-[var(--muted-text)] hover:bg-[var(--muted-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          Clear selection
        </button>
      ) : null}
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-white p-1 text-slate-950 shadow-xl"
        >
          {loading ? <p className="px-3 py-3 text-sm text-slate-500">Searching…</p> : null}
          {!loading && results.length ? results.map((item, index) => {
            const labelText = kind === "product" ? productLabel(item as InventoryProductSearchResult) : variationLabel(item as InventoryVariationSearchResult);
            const product = kind === "product" ? item as InventoryProductSearchResult : null;
            return (
              <button
                key={item.id}
                id={`${listId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={selection?.id === item.id}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(item)}
                className={`block w-full rounded-lg px-3 py-2 text-left focus:outline-none ${activeIndex === index ? "bg-blue-50" : "hover:bg-blue-50"}`}
              >
                <span className="block font-semibold">{kind === "product" ? product?.name : labelText}</span>
                <span className="mt-0.5 block text-xs font-normal text-slate-600">
                  {kind === "product" ? `SKU: ${product?.sku}${product?.model_number ? ` · Model: ${product.model_number}` : ""}${product?.serial_tracking_required ? " · Serialized" : ""}` : labelText}
                </span>
              </button>
            );
          }) : null}
          {!loading && !results.length ? <p className="px-3 py-3 text-sm text-slate-500">No matching products found.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function InventoryProductTypeahead({
  scope,
  name = "product_id",
  initialSelection,
  required = true,
  label = "Product",
  onSelectionChange,
}: {
  scope: InventorySearchScope;
  name?: string;
  initialSelection?: InventoryProductSearchResult | null;
  required?: boolean;
  label?: string;
  onSelectionChange?: (selection: ProductSelection) => void;
}) {
  return (
    <InventorySearchBox
      kind="product"
      scope={scope}
      name={name}
      label={label}
      initialSelection={initialSelection}
      required={required}
      onSelectionChange={(selection) => onSelectionChange?.(selection as ProductSelection)}
    />
  );
}

export function InventoryVariationTypeahead({
  scope,
  productId,
  name = "variation_id",
  label = "Variation (optional)",
  onSelectionChange,
}: {
  scope: Extract<InventorySearchScope, "adjust" | "transfer">;
  productId: string;
  name?: string;
  label?: string;
  onSelectionChange?: (selection: VariationSelection) => void;
}) {
  return (
    <InventorySearchBox
      kind="variation"
      scope={scope}
      name={name}
      label={label}
      productId={productId}
      disabled={!productId}
      onSelectionChange={(selection) => onSelectionChange?.(selection as VariationSelection)}
    />
  );
}

export function InventoryProductFields({
  scope,
  initialProduct = null,
}: {
  scope: Extract<InventorySearchScope, "adjust" | "transfer">;
  initialProduct?: InventoryProductSearchResult | null;
}) {
  const [product, setProduct] = useState<ProductSelection>(initialProduct);
  return (
    <div className="space-y-4">
      <InventoryProductTypeahead
        scope={scope}
        initialSelection={product}
        onSelectionChange={(selection) => setProduct(selection)}
      />
      <InventoryVariationTypeahead key={product?.id ?? "no-product"} scope={scope} productId={product?.id ?? ""} />
    </div>
  );
}
