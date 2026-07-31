"use client";

import { useId, useState } from "react";

import { currencyOptions } from "@/lib/currency/currencies";

export function CurrencyCombobox({
  name,
  defaultValue = "BDT",
  required = false,
  className = "",
  ariaLabel = "Currency",
  onValueChange,
}: {
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  className?: string;
  ariaLabel?: string;
  onValueChange?: (value: string) => void;
}) {
  const listId = useId();
  const [value, setValue] = useState(
    String(defaultValue || "BDT").toUpperCase(),
  );
  return (
    <>
      <input
        name={name}
        value={value}
        onChange={(event) => {
          const next = event.target.value.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase();
          setValue(next);
          onValueChange?.(next);
        }}
        list={listId}
        minLength={3}
        maxLength={3}
        pattern="[A-Za-z]{3}"
        autoComplete="off"
        required={required}
        aria-label={ariaLabel}
        className={className}
      />
      <datalist id={listId}>
        {currencyOptions.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.name}
          </option>
        ))}
      </datalist>
    </>
  );
}
