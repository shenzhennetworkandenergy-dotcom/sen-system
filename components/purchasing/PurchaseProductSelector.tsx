"use client";

import { useId, useState } from "react";
import { matchingPurchaseProducts, type SelectablePurchaseProduct } from "@/lib/purchasing/product-selector";

export function PurchaseProductSelector({ products, selectedProductId, onSelect }: {
  products: SelectablePurchaseProduct[];
  selectedProductId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const matches = matchingPurchaseProducts(products, query);
  const selected = products.find((product) => product.id === selectedProductId);

  function choose(product: SelectablePurchaseProduct) {
    onSelect(product.id);
    setQuery(`${product.name} · ${product.sku}`);
    setOpen(false);
    setActiveIndex(-1);
  }

  return <div className="relative min-w-64 flex-1 text-sm font-semibold">
    <label htmlFor={`${listId}-input`}>Add product</label>
    <input
      id={`${listId}-input`}
      value={query}
      onChange={(event) => {
        setQuery(event.target.value);
        onSelect("");
        setOpen(Boolean(event.target.value.trim()));
        setActiveIndex(-1);
      }}
      onFocus={() => { if (query.trim() && !selected) setOpen(true); }}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); return; }
        if (event.key === "ArrowDown" && matches.length) {
          event.preventDefault();
          setOpen(true);
          setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
        }
        if (event.key === "ArrowUp" && matches.length) {
          event.preventDefault();
          setOpen(true);
          setActiveIndex((index) => index <= 0 ? matches.length - 1 : index - 1);
        }
        if (event.key === "Enter" && open) {
          event.preventDefault();
          if (matches.length) choose(matches[activeIndex < 0 ? 0 : activeIndex]);
        }
      }}
      placeholder="Search product name or SKU"
      autoComplete="off"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listId}
      aria-activedescendant={open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
    />
    {selected ? <p className="mt-1 text-xs font-normal text-emerald-800" aria-live="polite">Selected: {selected.name} · {selected.sku}</p> : null}
    {open ? <div id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-slate-300 bg-white shadow-xl">
      {matches.length ? matches.map((product, index) => <button
        key={product.id}
        id={`${listId}-option-${index}`}
        type="button"
        role="option"
        aria-selected={index === activeIndex}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => choose(product)}
        className={`block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 ${index === activeIndex ? "bg-blue-50" : "hover:bg-blue-50"}`}
      ><span className="block text-slate-950">{product.name}</span><span className="block text-xs font-normal text-slate-700">SKU: {product.sku}</span></button>) : <p className="p-3 text-sm font-normal text-slate-700">No matching products.</p>}
    </div> : null}
  </div>;
}
