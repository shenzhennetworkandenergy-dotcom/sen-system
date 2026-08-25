"use client";

import { useActionState, useState } from "react";

import {
  createOpeningReceivableAction,
  createRequestedReceivableAction,
  initialReceivableActionState,
} from "@/app/admin/receivables/actions";
import {
  RECEIVABLE_BORROWER_TYPES,
  RECEIVABLE_CATEGORIES,
  RECEIVABLE_REPAYMENT_METHODS,
  type BorrowerType,
} from "@/lib/receivables/domain";

type NamedOption = { id: string; label: string };

export type ReceivablePartyOptions = {
  employees: NamedOption[];
  customers: NamedOption[];
  suppliers: NamedOption[];
  crmCompanies: NamedOption[];
  crmContacts: NamedOption[];
  externalParties: NamedOption[];
};

const fieldClass =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelClass = "text-sm font-medium text-slate-800";

const categoryLabels: Record<(typeof RECEIVABLE_CATEGORIES)[number], string> = {
  employee_loan: "Employee loan",
  salary_advance: "Salary advance",
  customer_loan: "Customer loan",
  company_loan: "Company loan",
  individual_loan: "Individual loan",
  supplier_refundable_advance: "Supplier refundable advance",
  security_deposit: "Security deposit",
  rent_advance: "Rent advance",
  recoverable_advance: "Other recoverable advance",
  other: "Other receivable",
};

const borrowerLabels: Record<BorrowerType, string> = {
  employee: "Employee",
  customer: "Customer",
  supplier: "Supplier",
  crm_company: "CRM company",
  crm_contact: "CRM contact",
  external_party: "External individual / company",
};

function optionsForType(type: BorrowerType, options: ReceivablePartyOptions) {
  switch (type) {
    case "employee":
      return options.employees;
    case "customer":
      return options.customers;
    case "supplier":
      return options.suppliers;
    case "crm_company":
      return options.crmCompanies;
    case "crm_contact":
      return options.crmContacts;
    case "external_party":
      return options.externalParties;
  }
}

function Feedback({ status, message }: { status: string; message: string }) {
  if (!message) return null;
  const tone =
    status === "success"
      ? "border-green-200 bg-green-50 text-green-900"
      : "border-red-200 bg-red-50 text-red-900";
  return (
    <p aria-live="polite" className={`rounded-xl border p-3 text-sm ${tone}`}>
      {message}
    </p>
  );
}

function AccountFields({
  operationId,
  options,
  opening,
}: {
  operationId: string;
  options: ReceivablePartyOptions;
  opening: boolean;
}) {
  const [borrowerType, setBorrowerType] = useState<BorrowerType>("employee");
  const [existingExternalId, setExistingExternalId] = useState("");
  const borrowerOptions = optionsForType(borrowerType, options);
  return (
    <>
      <input type="hidden" name="operation_id" value={operationId} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Receivable type
          <select name="category" required className={fieldClass} defaultValue="employee_loan">
            {RECEIVABLE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {categoryLabels[category]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Borrower type
          <select
            name="borrower_type"
            required
            className={fieldClass}
            value={borrowerType}
            onChange={(event) => {
              setBorrowerType(event.target.value as BorrowerType);
              setExistingExternalId("");
            }}
          >
            {RECEIVABLE_BORROWER_TYPES.map((type) => (
              <option key={type} value={type}>
                {borrowerLabels[type]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={labelClass}>
        {borrowerType === "external_party" ? "Existing external party (optional)" : "Borrower"}
        <select
          name="borrower_id"
          required={borrowerType !== "external_party"}
          className={fieldClass}
          value={borrowerType === "external_party" ? existingExternalId : undefined}
          defaultValue={borrowerType === "external_party" ? undefined : ""}
          onChange={
            borrowerType === "external_party"
              ? (event) => setExistingExternalId(event.target.value)
              : undefined
          }
        >
          <option value="">{borrowerType === "external_party" ? "Create a new external party" : "Select borrower"}</option>
          {borrowerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {borrowerType === "external_party" && !existingExternalId ? (
        <fieldset className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
          <legend className="px-1 text-sm font-semibold text-blue-950">New external party</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Party type
              <select name="external_party_type" className={fieldClass} defaultValue="company">
                <option value="company">Company</option>
                <option value="individual">Individual</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className={labelClass}>
              Display name
              <input name="external_party_display_name" required className={fieldClass} maxLength={180} />
            </label>
            <label className={labelClass}>
              Company name
              <input name="external_party_company_name" className={fieldClass} maxLength={180} />
            </label>
            <label className={labelClass}>
              Phone
              <input name="external_party_phone" className={fieldClass} maxLength={80} />
            </label>
            <label className={labelClass}>
              Email
              <input name="external_party_email" type="email" className={fieldClass} maxLength={320} />
            </label>
            <label className={labelClass}>
              External reference
              <input name="external_party_reference" className={fieldClass} maxLength={180} />
            </label>
          </div>
        </fieldset>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <label className={labelClass}>
          Original amount
          <input name="original_amount" type="number" min="0.0001" step="0.0001" required className={fieldClass} />
        </label>
        <label className={labelClass}>
          Currency
          <input name="currency" defaultValue="BDT" minLength={3} maxLength={3} required className={fieldClass} />
        </label>
        <label className={labelClass}>
          Repayment method
          <select name="default_repayment_method" className={fieldClass} defaultValue="">
            <option value="">Not set</option>
            {RECEIVABLE_REPAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      {opening ? (
        <div className="grid gap-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 md:grid-cols-3">
          <label className={labelClass}>
            Previously repaid
            <input name="previously_repaid_amount" type="number" min="0" step="0.0001" required className={fieldClass} />
          </label>
          <label className={labelClass}>
            Opening outstanding
            <input name="opening_outstanding_amount" type="number" min="0.0001" step="0.0001" required className={fieldClass} />
          </label>
          <label className={labelClass}>
            Balance as of
            <input name="as_of_date" type="date" required className={fieldClass} />
          </label>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className={labelClass}>
          Installment count
          <input name="installment_count" type="number" min="1" step="1" className={fieldClass} />
        </label>
        <label className={labelClass}>
          Installment amount
          <input name="installment_amount" type="number" min="0.0001" step="0.0001" className={fieldClass} />
        </label>
        <label className={labelClass}>
          First due date
          <input name="first_due_date" type="date" className={fieldClass} />
        </label>
        <label className={labelClass}>
          Final due date
          <input name="final_due_date" type="date" className={fieldClass} />
        </label>
      </div>
      <label className={labelClass}>
        Notes
        <textarea name="notes" rows={3} maxLength={4000} className={fieldClass} />
      </label>
    </>
  );
}

export function RequestedReceivableForm({
  operationId,
  options,
}: {
  operationId: string;
  options: ReceivablePartyOptions;
}) {
  const [state, action, pending] = useActionState(
    createRequestedReceivableAction,
    initialReceivableActionState,
  );
  return (
    <form action={action} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-[var(--primary)]">Create Loan / Advance Request</h2>
        <p className="mt-1 text-sm text-[var(--muted-text)]">Creates an operational request only. No balance or financial posting is created in Phase 1.</p>
      </div>
      <AccountFields operationId={operationId} options={options} opening={false} />
      <Feedback status={state.status} message={state.message} />
      <button disabled={pending} className="rounded-xl bg-[var(--primary)] px-5 py-3 font-semibold text-white disabled:opacity-60">
        {pending ? "Creating…" : "Create Receivable Request"}
      </button>
    </form>
  );
}

export function OpeningReceivableForm({
  operationId,
  options,
}: {
  operationId: string;
  options: ReceivablePartyOptions;
}) {
  const [state, action, pending] = useActionState(
    createOpeningReceivableAction,
    initialReceivableActionState,
  );
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-[var(--primary)]">Opening / Existing Receivable</h2>
        <p className="mt-1 text-sm text-[var(--muted-text)]">Records the operational balance as of a historical date. It does not create historical cashbook or journal entries.</p>
      </div>
      <AccountFields operationId={operationId} options={options} opening />
      <Feedback status={state.status} message={state.message} />
      <button disabled={pending} className="rounded-xl bg-amber-600 px-5 py-3 font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
        {pending ? "Creating…" : "Create Opening Receivable"}
      </button>
    </form>
  );
}
