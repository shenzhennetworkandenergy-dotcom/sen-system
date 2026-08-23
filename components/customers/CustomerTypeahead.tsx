"use client";

import { useId, useMemo, useState } from "react";

import {
  customerOptionLabel,
  filterCustomerOptions,
  type CustomerSearchOption,
} from "@/lib/customers/search";

export function CustomerTypeahead({
  customers,
  selectedCustomerId,
  onSelectionChange,
  fieldClassName,
  labelClassName = "text-sm font-semibold",
}: {
  customers: CustomerSearchOption[];
  selectedCustomerId: string;
  onSelectionChange: (customer: CustomerSearchOption | null) => void;
  fieldClassName: string;
  labelClassName?: string;
}) {
  const [search, setSearch] = useState("");
  const listboxId = useId();
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );
  const choices = useMemo(
    () => filterCustomerOptions(customers, search),
    [customers, search],
  );
  const open = Boolean(search.trim() && !selectedCustomerId);
  const displayedValue = selectedCustomer
    ? customerOptionLabel(selectedCustomer)
    : search;

  return (
    <div className={`relative ${labelClassName}`}>
      Customer
      <input type="hidden" name="customer_id" value={selectedCustomerId} />
      <input
        value={displayedValue}
        onChange={(event) => {
          setSearch(event.target.value);
          onSelectionChange(null);
        }}
        placeholder="Type a name, email, phone or company"
        className={fieldClassName}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        required
      />
      {open ? (
        <div
          id={listboxId}
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border bg-white p-1 text-slate-950 shadow-xl"
          role="listbox"
        >
          {choices.map((customer) => (
            <button
              key={customer.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => {
                setSearch(customerOptionLabel(customer));
                onSelectionChange(customer);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50"
            >
              <b>{customer.full_name || customer.email}</b>
              <span className="block text-xs text-slate-500">
                {[customer.email, customer.phone, customer.company_name]
                  .filter(Boolean)
                  .join(" · ")}
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
