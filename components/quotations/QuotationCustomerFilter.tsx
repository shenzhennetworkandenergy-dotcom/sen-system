"use client";

import { useEffect, useId, useRef, useState } from "react";

import { customerOptionLabel, type CustomerSearchOption } from "@/lib/customers/search";

export function QuotationCustomerFilter({ initialCustomer }: { initialCustomer: CustomerSearchOption | null }) {
  const [selected, setSelected] = useState(initialCustomer);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ query: string; customers: CustomerSearchOption[]; failed: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const search = query.trim();
  const choices = result?.query === search ? result.customers : [];
  const expanded = open && !selected && Boolean(search);

  useEffect(() => {
    if (!search || selected) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/quotations/customers?q=${encodeURIComponent(search)}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("SEARCH_UNAVAILABLE");
        const data = await response.json();
        if (!Array.isArray(data.customers)) throw new Error("SEARCH_UNAVAILABLE");
        if (!controller.signal.aborted) setResult({ query: search, customers: data.customers, failed: false });
      } catch {
        if (!controller.signal.aborted) setResult({ query: search, customers: [], failed: true });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, selected]);

  function choose(customer: CustomerSearchOption) {
    setSelected(customer); setQuery(""); setOpen(false); setActive(-1);
    input.current?.setCustomValidity("");
  }

  return <div className="relative min-w-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={listId + "-input"} className="mb-1 block text-sm font-semibold">Customer</label>
    <input type="hidden" name="customer" value={selected?.id ?? ""} />
    <div className="flex gap-1">
      <input id={listId + "-input"} ref={input} role="combobox" aria-autocomplete="list"
        aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && choices[active] ? `${listId}-${choices[active].id}` : undefined}
        autoComplete="off" maxLength={80} placeholder="All customers — type a name"
        className="w-full min-w-0 rounded-xl border px-3 py-2.5 text-sm"
        value={selected ? customerOptionLabel(selected) : query}
        onFocus={() => setOpen(true)}
        onChange={event => {
          const value = event.target.value;
          setSelected(null); setQuery(value); setOpen(true); setActive(-1);
          event.target.setCustomValidity(value.trim() ? "Select a matching customer, or clear this field for all customers." : "");
        }}
        onKeyDown={event => {
          if (event.key === "Escape") { setOpen(false); setActive(-1); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            setActive(index => !choices.length ? -1 : index < 0 ? (event.key === "ArrowDown" ? 0 : choices.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length);
          }
          if (event.key === "Enter" && expanded) {
            event.preventDefault();
            if (choices[active]) choose(choices[active]);
          }
        }} />
      {selected || query ? <button type="button" aria-label="Clear customer" className="rounded-xl border px-3"
        onClick={() => { setSelected(null); setQuery(""); setOpen(false); setActive(-1); input.current?.setCustomValidity(""); input.current?.focus(); }}>×</button> : null}
    </div>
    {expanded ? <div id={listId} role="listbox" aria-label="Matching customers"
      className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border bg-white p-1 text-slate-950 shadow-xl">
      {choices.map((customer, index) => <button key={customer.id} id={`${listId}-${customer.id}`} type="button" role="option"
        aria-selected={active === index} onMouseDown={event => event.preventDefault()} onClick={() => choose(customer)}
        className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50 ${active === index ? "bg-blue-50" : ""}`}>
        {customerOptionLabel(customer)}
      </button>)}
      {!choices.length ? <p className="px-3 py-2 text-sm" role="status">{result?.query !== search ? "Searching…" : result.failed ? "Customer search unavailable. Try again later." : "No matching customer"}</p> : null}
    </div> : null}
  </div>;
}
