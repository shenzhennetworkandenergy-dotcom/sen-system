"use client";

import { useId, useMemo, useState } from "react";

import {
  customerOptionLabel,
  customerPrimaryName,
  customerSecondaryLabel,
  filterCustomerOptions,
  type CustomerSearchOption,
} from "@/lib/customers/search";

export function CustomerTypeahead({
  customers,
  selectedCustomerId,
  onSelectionChange,
  fieldClassName,
  labelClassName = "text-sm font-semibold",
  locked = false,
  filter = false,
}: {
  customers: CustomerSearchOption[];
  selectedCustomerId: string;
  onSelectionChange: (customer: CustomerSearchOption | null) => void;
  fieldClassName: string;
  labelClassName?: string;
  locked?: boolean;
  filter?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const inputId = useId();
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );
  const choices = useMemo(
    () => locked ? [] : filterCustomerOptions(customers, search),
    [customers, locked, search],
  );
  const open = Boolean(focused && search.trim() && !selectedCustomerId);
  const displayedValue = selectedCustomer
    ? (filter ? customerPrimaryName : customerOptionLabel)(selectedCustomer)
    : search;
  const selectCustomer = (customer: CustomerSearchOption) => {
    setSearch("");
    setActiveIndex(-1);
    onSelectionChange(customer);
  };

  if (locked) {
    return (
      <label className={`relative block ${labelClassName}`}>
        Customer
        <input type="hidden" name="customer_id" value={selectedCustomerId} />
        <input
          value={selectedCustomer ? customerOptionLabel(selectedCustomer) : selectedCustomerId}
          className={fieldClassName}
          readOnly
          aria-readonly="true"
        />
      </label>
    );
  }

  return (
    <div className={`relative ${labelClassName}`}>
      <label htmlFor={inputId} className={filter ? "sr-only" : undefined}>
        {filter ? "Search customers" : "Customer"}
      </label>
      <input type="hidden" name={filter ? "customer" : "customer_id"} value={selectedCustomerId} />
      <input
        id={inputId}
        value={displayedValue}
        onChange={(event) => {
          setSearch(event.target.value);
          setFocused(true);
          setActiveIndex(-1);
          onSelectionChange(null);
          if (filter) {
            event.target.setCustomValidity(event.target.value.trim() ? "Select a customer from the results." : "");
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setActiveIndex(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setFocused(false);
            setActiveIndex(-1);
          }
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && choices.length && !selectedCustomerId) {
            event.preventDefault();
            setFocused(true);
            const next = event.key === "ArrowDown" ? Math.min(activeIndex + 1, choices.length - 1) : Math.max(activeIndex - 1, 0);
            setActiveIndex(next);
            document.getElementById(`${listboxId}-${next}`)?.scrollIntoView({ block: "nearest" });
          }
          if (event.key === "Enter" && open && choices[activeIndex]) {
            event.preventDefault();
            event.currentTarget.setCustomValidity("");
            selectCustomer(choices[activeIndex]);
          }
        }}
        placeholder={filter ? "Search customer name" : "Type a name, email, phone or company"}
        className={fieldClassName}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        required={!filter}
      />
      {open ? (
        <div
          id={listboxId}
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border bg-white p-1 text-slate-950 shadow-xl"
          role="listbox"
        >
          {choices.map((customer, index) => (
            <button
              key={customer.id}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const input = document.getElementById(inputId) as HTMLInputElement | null;
                input?.setCustomValidity("");
                selectCustomer(customer);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50 aria-selected:bg-blue-50"
            >
              <b>{customerPrimaryName(customer)}</b>
              <span className="block text-xs text-slate-500">
                {customerSecondaryLabel(customer)}
              </span>
            </button>
          ))}
          {!choices.length ? (
            <span className="block px-3 py-2 text-slate-500">
              No matching customer
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
