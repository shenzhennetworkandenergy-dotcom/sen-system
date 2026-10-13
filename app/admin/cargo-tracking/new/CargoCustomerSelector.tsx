"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  customerPrimaryName,
  customerSecondaryLabel,
  filterCustomerOptions,
  type CustomerSearchOption,
} from "@/lib/customers/search";

type Props = {
  customers: CustomerSearchOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  inputClassName: string;
};

export function CargoCustomerSelector({ customers, selectedId, onSelect, inputClassName }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedCustomer = customers.find((customer) => customer.id === selectedId);
  const [query, setQuery] = useState(() => selectedCustomer ? customerPrimaryName(selectedCustomer) : "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = filterCustomerOptions(customers, query, 12);

  useEffect(() => {
    if (selectedCustomer) setQuery(customerPrimaryName(selectedCustomer));
  }, [selectedCustomer]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(query.trim() && !selectedCustomer ? "Choose a customer from the suggestions." : "");
  }, [query, selectedCustomer]);

  function choose(customer: CustomerSearchOption) {
    onSelect(customer.id);
    setQuery(customerPrimaryName(customer));
    setOpen(false);
  }

  function clear() {
    onSelect("");
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  return <div className="relative font-semibold">
    <label htmlFor={`${listId}-input`}>Customer</label>
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="search"
        required
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && Boolean(query.trim())}
        aria-controls={listId}
        aria-activedescendant={open && matches.length ? `${listId}-${activeIndex}` : undefined}
        placeholder="Search name, company, phone or email"
        className={inputClassName}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          if (selectedId) onSelect("");
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            if (matches.length) setActiveIndex((index) => (index + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
          }
          if (event.key === "Enter" && open && query.trim()) {
            event.preventDefault();
            if (matches[activeIndex]) choose(matches[activeIndex]);
          }
        }}
      />
      {query || selectedId ? <button type="button" onClick={clear} className="mt-1 rounded-lg border px-3 py-2 text-sm">Clear</button> : null}
    </div>
    <input type="hidden" name="customer_id" value={selectedCustomer ? selectedId : ""} />
    {open && query.trim() ? <div id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-white p-1 shadow-lg">
      {matches.length ? matches.map((customer, index) => <button
        key={customer.id}
        id={`${listId}-${index}`}
        type="button"
        role="option"
        aria-selected={index === activeIndex}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => choose(customer)}
        className={`block w-full rounded px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-blue-50 text-blue-950" : "hover:bg-slate-50"}`}
      >
        <span className="block font-semibold">{customerPrimaryName(customer)}</span>
        {customerSecondaryLabel(customer) ? <span className="block font-normal text-slate-600">{customerSecondaryLabel(customer)}</span> : null}
      </button>) : <p className="px-3 py-2 text-sm font-normal text-slate-600">No matching customers</p>}
    </div> : null}
  </div>;
}
