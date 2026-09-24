"use client";

import { useActionState, useEffect, useReducer, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";

import { BusinessCardOcrAssistant } from "@/components/customers/BusinessCardOcrAssistant";
import { applyReviewedBusinessCard, type CustomerFormValues } from "@/lib/customer-ocr/apply";
import type { ReviewedBusinessCard } from "@/lib/customer-ocr/types";
import {
  initialBasicCustomerActionState,
  type BasicCustomerActionState,
} from "@/lib/customers/basic";
import {
  createInitialCustomerFormState,
  customerFormReducer,
} from "@/lib/customers/form-state";
import type { CustomerSearchOption } from "@/lib/customers/search";

type CustomerWorkflow = "sales" | "quotations";

const fieldClass =
  "mt-1 w-full rounded-xl border bg-[var(--surface)] px-3 py-3";

const conflictLabels: Record<keyof CustomerFormValues, string> = {
  fullName: "full name",
  companyName: "company",
  email: "email",
  phone: "phone",
  alternatePhone: "alternate phone",
  addressLine1: "address",
  city: "city",
  country: "country",
  countryCode: "country code",
};

type CustomerAction = (
  previousState: BasicCustomerActionState,
  form: FormData,
) => Promise<BasicCustomerActionState>;

export function AddCustomerForm({
  workflow,
  action,
  onCustomerResolved,
}: {
  workflow: CustomerWorkflow;
  action: CustomerAction;
  onCustomerResolved?: (customer: CustomerSearchOption) => void;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(
    customerFormReducer,
    undefined,
    createInitialCustomerFormState,
  );
  const [actionState, formAction, pending] = useActionState(
    action,
    initialBasicCustomerActionState,
  );
  const [checkingDuplicates, startDuplicateCheck] = useTransition();
  const [duplicateCheckMessage, setDuplicateCheckMessage] = useState("");
  const [responseVisible, setResponseVisible] = useState(false);
  const handledResponse = useRef("");
  const resolvedCustomer = useRef(onCustomerResolved);

  useEffect(() => {
    resolvedCustomer.current = onCustomerResolved;
  }, [onCustomerResolved]);

  useEffect(() => {
    const responseKey = `${actionState.status}:${actionState.customer?.id ?? ""}:${actionState.message}`;
    if (actionState.status === "idle" || handledResponse.current === responseKey) {
      return;
    }
    handledResponse.current = responseKey;
    setResponseVisible(true);
    if (actionState.status === "duplicate") {
      dispatch({ type: "duplicates-found", duplicates: actionState.duplicates });
      return;
    }
    if (actionState.status === "success" && actionState.customer) {
      const customer = actionState.customer;
      dispatch({ type: "customer-saved" });
      resolvedCustomer.current?.(customer);
      router.refresh();
    }
  }, [actionState, router]);

  function change(field: keyof CustomerFormValues, value: string) {
    dispatch({ type: "field-changed", field, value });
    setResponseVisible(false);
    setDuplicateCheckMessage("");
  }

  function checkDuplicates(values: CustomerFormValues) {
    startDuplicateCheck(async () => {
      setDuplicateCheckMessage("");
      try {
        const response = await fetch("/api/admin/customers/duplicates", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflow,
            email: values.email,
            phone: values.phone,
            companyName: values.companyName,
          }),
        });
        if (!response.ok) throw new Error("Duplicate check failed.");
        const result = (await response.json()) as {
          duplicates?: BasicCustomerActionState["duplicates"];
        };
        const duplicates = result.duplicates ?? [];
        dispatch({ type: "duplicates-found", duplicates });
        setDuplicateCheckMessage(
          duplicates.length
            ? "Possible existing customer found. Review the matches before saving."
            : "No matching customer was found from company, mobile number, or email.",
        );
      } catch {
        setDuplicateCheckMessage(
          "The duplicate check could not be completed. Saving will check again before creating the customer.",
        );
      }
    });
  }

  function applyReviewedCard(reviewed: ReviewedBusinessCard) {
    let result = applyReviewedBusinessCard(state.values, reviewed);
    if (result.conflicts.length) {
      const fields = result.conflicts
        .map((conflict) => conflictLabels[conflict.field])
        .join(", ");
      const overwrite = window.confirm(
        `The OCR values differ from your current ${fields}. Replace those current values?`,
      );
      if (overwrite) {
        result = applyReviewedBusinessCard(state.values, reviewed, {
          overwriteConflicts: true,
        });
      }
    }
    flushSync(() => {
      dispatch({ type: "values-replaced", values: result.values });
    });
    setResponseVisible(false);
    checkDuplicates(result.values);
  }

  const hasBlockingDuplicate = state.duplicates.some(
    (duplicate) => duplicate.blocksCreation,
  );
  const needsOverride =
    state.duplicates.length > 0 && !hasBlockingDuplicate;

  return (
    <details className="mb-5 rounded-2xl border bg-[var(--surface)] p-4" open>
      <summary className="cursor-pointer font-bold">Add a new customer</summary>
      <BusinessCardOcrAssistant onApply={applyReviewedCard} />
      <form action={formAction} className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="font-semibold">
          Full name <span className="text-red-700">*</span>
          <input
            name="full_name"
            required
            autoComplete="name"
            value={state.values.fullName}
            onChange={(event) => change("fullName", event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="font-semibold">
          Company / organization
          <input
            name="company_name"
            autoComplete="organization"
            value={state.values.companyName}
            onChange={(event) => change("companyName", event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="font-semibold">
          Email address <span className="text-red-700">*</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            value={state.values.email}
            onChange={(event) => change("email", event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="font-semibold">
          Mobile number <span className="text-red-700">*</span>
          <input
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            value={state.values.phone}
            onChange={(event) => change("phone", event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="font-semibold">
          Alternate phone number
          <input
            name="alternate_phone"
            type="tel"
            value={state.values.alternatePhone}
            onChange={(event) => change("alternatePhone", event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="font-semibold">
          Full address <span className="text-red-700">*</span>
          <input
            name="address_line_1"
            required
            autoComplete="street-address"
            value={state.values.addressLine1}
            onChange={(event) => change("addressLine1", event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="font-semibold">
          City
          <input
            name="city"
            autoComplete="address-level2"
            value={state.values.city}
            onChange={(event) => change("city", event.target.value)}
            className={fieldClass}
          />
        </label>
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <label className="font-semibold">
            Country
            <input
              name="country"
              autoComplete="country-name"
              value={state.values.country}
              onChange={(event) => change("country", event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="font-semibold">
            Code
            <input
              name="country_code"
              required
              maxLength={2}
              value={state.values.countryCode}
              onChange={(event) =>
                change("countryCode", event.target.value.toUpperCase())
              }
              className={fieldClass}
            />
          </label>
        </div>

        <input
          type="hidden"
          name="duplicate_override"
          value={state.duplicateOverride ? "true" : "false"}
        />

        {checkingDuplicates ? (
          <p className="text-sm text-[var(--muted-text)] lg:col-span-full" aria-live="polite">
            Checking for existing customers…
          </p>
        ) : null}
        {duplicateCheckMessage ? (
          <p className="text-sm text-amber-900 lg:col-span-full" aria-live="polite">
            {duplicateCheckMessage}
          </p>
        ) : null}

        {state.duplicates.length ? (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 lg:col-span-full">
            <h3 className="font-bold">Possible existing customer found.</h3>
            <p className="mt-1 text-sm">
              Review the existing customer before deciding whether to create a new one.
            </p>
            <ul className="mt-3 space-y-2">
              {state.duplicates.map((duplicate) => (
                <li key={duplicate.customer.id} className="rounded-lg border border-amber-200 bg-white p-3">
                  <p className="font-semibold">
                    {duplicate.customer.full_name || duplicate.customer.email}
                    {duplicate.customer.company_name
                      ? ` · ${duplicate.customer.company_name}`
                      : ""}
                  </p>
                  <p className="text-sm">
                    {duplicate.customer.email}
                    {duplicate.customer.phone ? ` · ${duplicate.customer.phone}` : ""}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase">
                    Matched by {duplicate.reasons.join(", ")}
                  </p>
                  {onCustomerResolved ? (
                    <button
                      type="button"
                      onClick={() => onCustomerResolved(duplicate.customer)}
                      className="mt-2 rounded-lg border border-amber-500 px-3 py-2 text-sm font-semibold"
                    >
                      Use existing customer
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {needsOverride ? (
              <label className="mt-3 flex items-start gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={state.duplicateOverride}
                  onChange={(event) =>
                    dispatch({
                      type: "duplicate-override-changed",
                      value: event.target.checked,
                    })
                  }
                  className="mt-1"
                />
                I reviewed these matches and still want to create a separate customer.
              </label>
            ) : (
              <p className="mt-3 text-sm font-semibold">
                An exact email match cannot be overridden. Use the existing customer or change the email if it was recognized incorrectly.
              </p>
            )}
          </section>
        ) : null}

        {responseVisible && actionState.message ? (
          <p
            aria-live="polite"
            className={`lg:col-span-full ${
              actionState.status === "success"
                ? "text-emerald-700"
                : "text-red-700"
            }`}
          >
            {actionState.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 lg:col-span-full">
          <button
            disabled={
              pending ||
              checkingDuplicates ||
              hasBlockingDuplicate ||
              (needsOverride && !state.duplicateOverride)
            }
            className="rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
          >Save Customer</button>
          <p className="text-sm text-[var(--muted-text)]">
            OCR never saves automatically. Existing validation, permissions, and duplicate checks run when you save.
          </p>
        </div>
      </form>
    </details>
  );
}
