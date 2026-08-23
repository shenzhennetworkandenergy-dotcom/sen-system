"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";

import { searchEligibleQuotationsAction } from "@/app/admin/sales/from-quotation/actions";
import {
  quotationSaleDestination,
  quotationTypeaheadKeyResult,
  type EligibleQuotationOption,
} from "@/lib/quotations/sale-conversion-types";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: currency || "BDT",
    maximumFractionDigits: 2,
  }).format(amount);

export function QuotationTypeahead() {
  const router = useRouter();
  const listboxId = useId();
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<EligibleQuotationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) return;

    let active = true;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      const result = await searchEligibleQuotationsAction(query).catch(() => ({
        options: [],
        error: "Unable to search quotations right now.",
      }));
      if (!active) return;
      setOptions(result.options);
      setError(result.error);
      setLoading(false);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [search]);

  const showResults = search.trim().length >= 2;
  const selectOption = (option: EligibleQuotationOption | undefined) => {
    if (!option) return;
    const destination = quotationSaleDestination(option.quotationId);
    if (destination) router.push(destination);
  };
  const statusMessage = loading
    ? "Searching quotations."
    : error ?? (showResults && !options.length
      ? "No eligible quotations match this search."
      : `${options.length} eligible quotation${options.length === 1 ? "" : "s"} available.`);
  return (
    <div className="relative max-w-2xl">
      <label className="block text-sm font-semibold" htmlFor="quotation-search">
        Find an accepted quotation
      </label>
      <input
        id="quotation-search"
        value={search}
        onChange={(event) => {
          const nextSearch = event.target.value;
          if (nextSearch.trim().length < 2) {
            setOptions([]);
            setLoading(false);
            setError(null);
          }
          setActiveIndex(-1);
          setSearch(nextSearch);
        }}
        onKeyDown={(event) => {
          const keyResult = quotationTypeaheadKeyResult(
            event.key,
            activeIndex,
            options.length,
          );
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
          } else {
            return;
          }
          if (keyResult.close) {
            setActiveIndex(-1);
            setSearch("");
            return;
          }
          setActiveIndex(keyResult.activeIndex);
          if (keyResult.select) selectOption(options[keyResult.activeIndex]);
        }}
        placeholder="Reference, customer, company or email"
        className="mt-1 w-full rounded-lg border px-3 py-2"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showResults}
        aria-controls={showResults ? listboxId : undefined}
        aria-activedescendant={
          showResults && activeIndex >= 0
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
      />
      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>
      {showResults ? (
        <div
          id={listboxId}
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border bg-white text-slate-950 shadow-xl"
          role="listbox"
        >
          {options.map((option, index) => (
            <button
              key={option.quotationId}
              id={`${listboxId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              onClick={() => selectOption(option)}
              className="block w-full border-b px-3 py-3 text-left last:border-b-0 hover:bg-blue-50"
            >
              <b>{option.reference}</b>
              <span className="block text-sm">
                {option.customerName}
                {option.customerCompany ? ` · ${option.customerCompany}` : ""}
              </span>
              <span className="block text-xs text-slate-500">
                {option.customerEmail} · {money(option.totalAmount, option.currency)}
              </span>
            </button>
          ))}
          {loading ? (
            <p className="px-3 py-3 text-sm text-slate-500">Searching quotations…</p>
          ) : null}
          {error ? <p className="px-3 py-3 text-sm text-red-700">{error}</p> : null}
          {!loading && !error && !options.length ? (
            <p className="px-3 py-3 text-sm text-slate-500">
              No eligible quotations match this search.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--muted-text)]">
          Type at least two characters to search accepted quotations.
        </p>
      )}
    </div>
  );
}
