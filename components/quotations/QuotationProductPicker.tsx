"use client";

import { useEffect, useId, useRef, useState } from "react";

type ProductSuggestion = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  category: string;
};

export function QuotationProductPicker({
  defaultProduct = null,
  required = false,
}: {
  defaultProduct?: ProductSuggestion | null;
  required?: boolean;
}) {
  const [query, setQuery] = useState(defaultProduct?.name ?? "");
  const [selected, setSelected] = useState(defaultProduct);
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const listId = useId();

  useEffect(() => {
    const value = query.trim();
    if (!value || selected?.name === value) {
      request.current?.abort();
      return;
    }

    const timer = window.setTimeout(async () => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      try {
        const response = await fetch(
          `/api/products/search?q=${encodeURIComponent(value)}`,
          { signal: controller.signal },
        );
        const body = (await response.json()) as {
          products?: ProductSuggestion[];
        };
        setSuggestions(response.ok ? body.products ?? [] : []);
        setOpen(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestions([]);
          setOpen(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [query, selected]);

  return (
    <div className="relative">
      <input type="hidden" name="product_id" value={selected?.id ?? ""} />
      <input type="hidden" name="slug" value={selected?.slug ?? ""} />
      <label htmlFor={`${listId}-input`} className="font-semibold">
        Product {required ? "*" : "(optional for custom sourcing)"}
      </label>
      <div className="relative mt-1">
        <input
          id={`${listId}-input`}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
          }}
          onFocus={() => query.trim() && !selected && setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          required={required}
          placeholder="Search by product name, SKU, or model"
          className="w-full rounded-xl border border-slate-300 bg-white p-3 pr-24 text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
        {selected ? (
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-900"
          >
            Selected ×
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-slate-600" aria-live="polite">
        {selected
          ? `${selected.sku} · ${selected.category}`
          : "Choose a result so the correct product is attached to your quotation."}
      </p>
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-2xl"
        >
          {loading ? (
            <p className="p-4 text-sm text-slate-600">Finding products…</p>
          ) : suggestions.length ? (
            <ul>
              {suggestions.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected?.id === product.id}
                    onClick={() => {
                      setSelected(product);
                      setQuery(product.name);
                      setOpen(false);
                    }}
                    className="block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-0 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                  >
                    <strong className="block text-sm">{product.name}</strong>
                    <span className="mt-1 block text-xs text-slate-600">
                      {product.sku} · {product.category}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-slate-600">
              No matching product. Try another name, SKU, or model.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
