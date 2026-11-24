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
  mobileFriendly = false,
}: {
  compact?: boolean;
  className?: string;
  defaultValue?: string;
  mobileFriendly?: boolean;
}) {
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const dismissed = useRef(false);
  const listId = useId();

  useEffect(() => {
    if (!mobileFriendly) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        dismissed.current = true;
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [mobileFriendly]);

  useEffect(() => {
    if (!mobileFriendly || !open) return;
    const resize = () => {
      const node = root.current;
      if (!node) return;
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      node.style.setProperty("--search-results-height", `${Math.max(64, bottom - node.getBoundingClientRect().bottom - 12)}px`);
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", resize, true);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", resize, true);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
    };
  }, [mobileFriendly, open]);

  useEffect(() => {
    if (mobileFriendly) request.current?.abort();
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
        if (mobileFriendly && controller.signal.aborted) return;
        setSuggestions(response.ok ? body.products ?? [] : []);
        setOpen(!mobileFriendly || (!dismissed.current && Boolean(root.current?.contains(document.activeElement))));
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestions([]);
          setOpen(!mobileFriendly || (!dismissed.current && Boolean(root.current?.contains(document.activeElement))));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 140);

    return () => {
      window.clearTimeout(timer);
      if (mobileFriendly) request.current?.abort();
    };
  }, [query, mobileFriendly]);

  return (
    <div ref={root} className={`relative ${className}`} onBlur={(event) => {
      if (mobileFriendly && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
        dismissed.current = true;
        setOpen(false);
      }
    }}>
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
            dismissed.current = false;
            setQuery(value);
            if (!value.trim()) {
              request.current?.abort();
              setSuggestions([]);
              setOpen(false);
              setLoading(false);
            }
          }}
          onFocus={() => {
            dismissed.current = false;
            if (query.trim()) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              dismissed.current = true;
              setOpen(false);
            }
          }}
          autoComplete="off"
          enterKeyHint={mobileFriendly ? "search" : undefined}
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
          style={mobileFriendly ? { maxHeight: "min(24rem, var(--search-results-height, 40dvh))" } : undefined}
          className={`absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-2xl ${mobileFriendly ? "overflow-y-auto overscroll-contain" : "overflow-hidden"}`}
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
                    className={`block border-b border-slate-100 px-4 py-3 transition last:border-0 hover:bg-cyan-50 focus:bg-cyan-50 ${mobileFriendly ? "break-words" : ""}`}
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
