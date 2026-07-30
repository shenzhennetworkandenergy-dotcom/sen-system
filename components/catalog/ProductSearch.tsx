"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

type Suggestion = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  category: string;
};

export function ProductSearch({
  compact = false,
  className = "",
  defaultValue = "",
}: {
  compact?: boolean;
  className?: string;
  defaultValue?: string;
}) {
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const listId = useId();

  useEffect(() => {
    const value = query.trim();
    if (!value) {
      request.current?.abort();
      return;
    }

    const timer = window.setTimeout(async () => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      try {
        const response = await fetch(`/api/products/search?q=${encodeURIComponent(value)}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as { products?: Suggestion[] };
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
    }, 140);

    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className={`relative ${className}`}>
      <form action="/products" role="search" className="sen-search-form flex gap-2">
        <label className="sr-only" htmlFor={`${listId}-input`}>
          Search products
        </label>
        <input
          id={`${listId}-input`}
          name="q"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (!value.trim()) {
              request.current?.abort();
              setSuggestions([]);
              setOpen(false);
              setLoading(false);
            }
          }}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          placeholder="Search products, SKU or model"
          className={`sen-search-input min-w-0 flex-1 rounded-xl border border-slate-300 bg-white text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 ${
            compact ? "h-9 px-3 text-xs" : "h-12 px-4"
          }`}
        />
        <button
          className={`sen-search-button rounded-xl bg-cyan-600 font-bold text-white transition hover:bg-cyan-500 ${
            compact ? "h-9 px-3 text-xs" : "h-12 px-5"
          }`}
        >
          Search
        </button>
      </form>
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-2xl"
        >
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Finding matching products…</p>
          ) : suggestions.length ? (
            <ul>
              {suggestions.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/products/${product.slug}`}
                    role="option"
                    className="block border-b border-slate-100 px-4 py-3 transition last:border-0 hover:bg-cyan-50 focus:bg-cyan-50"
                    onClick={() => setOpen(false)}
                  >
                    <strong className="block text-sm">{product.name}</strong>
                    <span className="mt-1 block text-xs text-slate-500">
                      {product.sku} · {product.category}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-slate-500">
              No matching products. Try another name, SKU or model.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
