"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { searchEligibleQuotationsAction } from "@/app/admin/sales/from-quotation/actions";
import {
  quotationSaleDestination,
  quotationTypeaheadKeyResult,
  quotationTypeaheadStateTransition,
  type EligibleQuotationOption,
  type QuotationTypeaheadState,
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
  const requestId = useRef(0);
  const [search, setSearch] = useState("");
  const [typeahead, setTypeahead] = useState<QuotationTypeaheadState>({
    options: [],
    activeIndex: -1,
    loading: false,
    error: null,
    requestId: 0,
  });

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) return;

    const activeRequestId = requestId.current;
    let active = true;
    const timeout = window.setTimeout(async () => {
      setTypeahead((current) =>
        quotationTypeaheadStateTransition(current, {
          type: "loading",
          requestId: activeRequestId,
        }),
      );
      const result = await searchEligibleQuotationsAction(query).catch(() => ({
        options: [],
        error: "Unable to search quotations right now.",
      }));
      if (!active) return;
      setTypeahead((current) =>
        quotationTypeaheadStateTransition(current, {
          type: "response",
          requestId: activeRequestId,
          options: result.options,
          error: result.error,
        }),
      );
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [search]);

  const showResults = search.trim().length >= 2;
  const resetTypeahead = (type: "query" | "escape") => {
    const nextRequestId = requestId.current + 1;
    requestId.current = nextRequestId;
    setTypeahead((current) =>
      quotationTypeaheadStateTransition(current, {
        type,
        requestId: nextRequestId,
      }),
    );
  };
  const selectOption = (option: EligibleQuotationOption | undefined) => {
    if (!option) return;
    const destination = quotationSaleDestination(option.quotationId);
    if (destination) router.push(destination);
  };
  const statusMessage = typeahead.loading
    ? "Searching quotations."
    : typeahead.error ?? (showResults && !typeahead.options.length
      ? "No eligible quotations match this search."
      : `${typeahead.options.length} eligible quotation${typeahead.options.length === 1 ? "" : "s"} available.`);
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
          resetTypeahead("query");
          setSearch(nextSearch);
        }}
        onKeyDown={(event) => {
          const keyResult = quotationTypeaheadKeyResult(
            event.key,
            typeahead.activeIndex,
            typeahead.options.length,
          );
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
          } else {
            return;
          }
          if (keyResult.close) {
            resetTypeahead("escape");
            setSearch("");
            return;
          }
          setTypeahead((current) => ({
            ...current,
            activeIndex: keyResult.activeIndex,
          }));
          if (keyResult.select) {
            selectOption(typeahead.options[keyResult.activeIndex]);
          }
        }}
        placeholder="Reference, customer, company or email"
        className="mt-1 w-full rounded-lg border px-3 py-2"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showResults}
        aria-controls={showResults ? listboxId : undefined}
        aria-activedescendant={
          showResults && typeahead.activeIndex >= 0
            ? `${listboxId}-option-${typeahead.activeIndex}`
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
          {typeahead.options.map((option, index) => (
            <button
              key={option.quotationId}
              id={`${listboxId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={typeahead.activeIndex === index}
              onClick={() => selectOption(option)}
              className={`block w-full border-b px-3 py-3 text-left last:border-b-0 hover:bg-blue-50 ${typeahead.activeIndex === index ? "bg-blue-100" : ""}`}
            >
              <b>{option.reference}</b>
              <span className="block text-sm">
                {option.customerName}
                {option.customerCompany ? ` · ${option.customerCompany}` : ""}
              </span>
              <span className="block text-xs text-slate-500">
                {option.customerEmail ? `${option.customerEmail} · ` : ""}
                {money(option.totalAmount, option.currency)}
              </span>
            </button>
          ))}
          {typeahead.loading ? (
            <p className="px-3 py-3 text-sm text-slate-500">Searching quotations…</p>
          ) : null}
          {typeahead.error ? <p className="px-3 py-3 text-sm text-red-700">{typeahead.error}</p> : null}
          {!typeahead.loading && !typeahead.error && !typeahead.options.length ? (
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
