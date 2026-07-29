import Link from "next/link";

import {
  approveQuotationAction,
  assignQuotationAction,
  convertQuotationToInvoiceAction,
  rejectQuotationAction,
  requestQuotationInformationAction,
  updateQuotationDetailsAction,
} from "@/app/admin/quotations/workflow-actions";

type Quotation = {
  id: string;
  reference: string;
  status: string;
  subject: string;
  company_name: string | null;
  customer_tax_identification_number: string | null;
  required_by: string | null;
  expiration_date: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  terms_and_conditions: string | null;
  payment_terms: string | null;
  delivery_information: string | null;
  customer_notes: string | null;
  internal_notes: string | null;
  assigned_to: string | null;
  approved_at: string | null;
  converted_at: string | null;
  converted_order_id: string | null;
  converted_invoice_id: string | null;
};

type Person = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
};

type Warehouse = { id: string; code: string; name: string };
type Capabilities = {
  edit: boolean;
  assign: boolean;
  requestInformation: boolean;
  approve: boolean;
  reject: boolean;
  print: boolean;
  convert: boolean;
  createCustomer: boolean;
  viewHistory: boolean;
};
type Audit = {
  id: number;
  action: string;
  description: string | null;
  created_at: string;
  actor: { full_name: string | null; email: string | null } | null;
};

const statusLabel = (status: string) =>
  status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (value: number, currency = "BDT") =>
  `${currency} ${Number(value ?? 0).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function QuotationOperations({
  quotation,
  customer,
  staff,
  warehouses,
  audits,
  customerExists,
  customerCreationRequired,
  capabilities,
  success,
  error,
}: {
  quotation: Quotation;
  customer: Person;
  staff: Person[];
  warehouses: Warehouse[];
  audits: Audit[];
  customerExists: boolean;
  customerCreationRequired: boolean;
  capabilities: Capabilities;
  success?: string;
  error?: string;
}) {
  const converted = quotation.status === "converted_to_invoice";
  const approved = ["approved", "accepted"].includes(quotation.status);
  const convertAction = convertQuotationToInvoiceAction.bind(null, quotation.id);

  return (
    <section className="mx-auto mb-6 max-w-6xl space-y-5 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">
            Quotation workspace
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">
            {quotation.reference}
          </h1>
          <p className="text-sm text-slate-600">
            {customer.full_name || customer.email} · {customer.email}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-800">
            {statusLabel(quotation.status)}
          </span>
          {capabilities.print ? (
            <Link
              href={`/admin/quotations/${quotation.id}`}
              className="rounded-xl border px-4 py-2 text-sm font-bold"
            >
              Print / download
            </Link>
          ) : null}
          <Link
            href="/admin/quotations"
            className="rounded-xl border px-4 py-2 text-sm font-bold"
          >
            All quotations
          </Link>
        </div>
      </div>

      {success ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{success}</p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-red-50 p-4 text-red-900">{error}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Subtotal", money(quotation.subtotal, quotation.currency)],
          ["Discount", money(quotation.discount_amount, quotation.currency)],
          ["Tax", money(quotation.tax_amount, quotation.currency)],
          ["Quotation total", money(quotation.total_amount, quotation.currency)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      {!converted &&
      (capabilities.edit ||
        capabilities.assign ||
        capabilities.requestInformation ||
        capabilities.approve ||
        capabilities.reject) ? (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          {capabilities.edit ? (
            <form
              action={updateQuotationDetailsAction.bind(null, quotation.id)}
              className="grid gap-4 rounded-2xl border bg-white p-5 shadow-sm"
            >
            <h2 className="text-lg font-black">Commercial information</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold">
                Subject
                <input
                  name="subject"
                  defaultValue={quotation.subject}
                  required
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Company
                <input
                  name="company_name"
                  defaultValue={quotation.company_name ?? ""}
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Tax identification number
                <input
                  name="customer_tax_identification_number"
                  defaultValue={
                    quotation.customer_tax_identification_number ?? ""
                  }
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Required by
                <input
                  type="date"
                  name="required_by"
                  defaultValue={quotation.required_by ?? ""}
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Expiration date
                <input
                  type="date"
                  name="expiration_date"
                  defaultValue={quotation.expiration_date ?? ""}
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Discount (BDT)
                <input
                  type="number"
                  name="discount_amount"
                  min="0"
                  step="0.01"
                  defaultValue={quotation.discount_amount}
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
              <label className="text-sm font-bold">
                Tax (BDT)
                <input
                  type="number"
                  name="tax_amount"
                  min="0"
                  step="0.01"
                  defaultValue={quotation.tax_amount}
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
            </div>
            {[
              ["payment_terms", "Payment terms", quotation.payment_terms],
              [
                "delivery_information",
                "Delivery information",
                quotation.delivery_information,
              ],
              [
                "terms_and_conditions",
                "Terms and conditions",
                quotation.terms_and_conditions,
              ],
              ["customer_notes", "Customer notes", quotation.customer_notes],
              ["internal_notes", "Internal notes", quotation.internal_notes],
            ].map(([name, label, value]) => (
              <label key={String(name)} className="text-sm font-bold">
                {label}
                <textarea
                  name={String(name)}
                  defaultValue={String(value ?? "")}
                  rows={String(name) === "terms_and_conditions" ? 4 : 2}
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 font-normal"
                />
              </label>
            ))}
            <button className="justify-self-end rounded-xl bg-slate-900 px-5 py-3 font-bold text-white">
              Save quotation details
            </button>
            </form>
          ) : null}

          <div className="space-y-5">
            {capabilities.assign ? (
              <form
                action={assignQuotationAction.bind(null, quotation.id)}
                className="rounded-2xl border bg-white p-5 shadow-sm"
              >
              <h2 className="text-lg font-black">Assignment</h2>
              <select
                name="assigned_to"
                defaultValue={quotation.assigned_to ?? ""}
                className="mt-3 w-full rounded-xl border px-3 py-2.5"
              >
                <option value="">Unassigned</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name || person.email} · {person.role}
                  </option>
                ))}
              </select>
              <button className="mt-3 w-full rounded-xl border px-4 py-2.5 font-bold">
                Save assignment
              </button>
              </form>
            ) : null}

            {capabilities.requestInformation ||
            capabilities.approve ||
            capabilities.reject ? (
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black">Review decision</h2>
              <p className="mt-1 text-sm text-slate-600">
                Request clarification, approve, or reject with an internal note.
              </p>
              {capabilities.requestInformation ? (
                <form
                  action={requestQuotationInformationAction.bind(
                    null,
                    quotation.id,
                  )}
                  className="mt-3"
                >
                <textarea
                  name="note"
                  required
                  rows={2}
                  placeholder="Information needed from customer"
                  className="w-full rounded-xl border px-3 py-2.5"
                />
                <button className="mt-2 w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 font-bold text-amber-900">
                  Request additional information
                </button>
                </form>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {capabilities.approve ? (
                  <form
                    action={approveQuotationAction.bind(null, quotation.id)}
                    className="min-w-32 flex-1"
                  >
                  <input type="hidden" name="note" value="Approved for conversion." />
                  <button className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white">
                    Approve
                  </button>
                  </form>
                ) : null}
                {capabilities.reject ? (
                  <form
                    action={rejectQuotationAction.bind(null, quotation.id)}
                    className="min-w-32 flex-1"
                  >
                  <input type="hidden" name="note" value="Quotation rejected." />
                  <button className="w-full rounded-xl bg-red-600 px-4 py-2.5 font-bold text-white">
                    Reject
                  </button>
                  </form>
                ) : null}
              </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {approved &&
      capabilities.convert &&
      (customerExists || capabilities.createCustomer) ? (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <h2 className="text-xl font-black text-indigo-950">
            Convert to Sales Invoice
          </h2>
          <p className="mt-1 text-sm text-indigo-900">
            The invoice, sales order, products, prices, discounts, tax, notes,
            and address snapshots are created together in one database
            transaction.
          </p>
          {!customerExists || customerCreationRequired ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <b>This customer does not currently exist in the CRM customer database.</b>
              <p className="mt-1 text-sm">
                Create a linked customer from the website profile and quotation
                information, then convert the quotation.
              </p>
            </div>
          ) : null}
          <form action={convertAction} className="mt-4 flex flex-wrap gap-3">
            <select
              name="warehouse_id"
              required
              className="min-w-72 flex-1 rounded-xl border px-4 py-3"
            >
              <option value="">Choose fulfilment warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} · {warehouse.name}
                </option>
              ))}
            </select>
            <input
              type="hidden"
              name="create_customer"
              value={!customerExists || customerCreationRequired ? "true" : "false"}
            />
            <button className="rounded-xl bg-indigo-700 px-5 py-3 font-black text-white">
              {!customerExists || customerCreationRequired
                ? "Create Customer and Convert"
                : "Convert to Sales Invoice"}
            </button>
          </form>
        </div>
      ) : null}

      {converted ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="text-xl font-black text-emerald-950">
            Converted to Invoice
          </h2>
          <p className="mt-1 text-emerald-900">
            This quotation is locked and linked to its sales records.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {quotation.converted_order_id ? (
              <Link
                href={`/admin/sales/${quotation.converted_order_id}`}
                className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 font-bold"
              >
                Open sales order
              </Link>
            ) : null}
            {quotation.converted_order_id && quotation.converted_invoice_id ? (
              <Link
                href={`/admin/sales/${quotation.converted_order_id}/documents/${quotation.converted_invoice_id}`}
                className="rounded-xl bg-emerald-700 px-4 py-2.5 font-bold text-white"
              >
                Open sales invoice
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {capabilities.viewHistory ? (
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Quotation history</h2>
        <div className="mt-3 divide-y">
          {audits.map((audit) => (
            <div key={audit.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto]">
              <div>
                <b>{statusLabel(audit.action.replace("quotation.", ""))}</b>
                <p className="text-sm text-slate-600">
                  {audit.description || "Quotation activity recorded."}
                </p>
              </div>
              <p className="text-xs text-slate-500 sm:text-right">
                {audit.actor?.full_name || audit.actor?.email || "System"}
                <br />
                {new Date(audit.created_at).toLocaleString("en-BD")}
              </p>
            </div>
          ))}
          {!audits.length ? (
            <p className="py-5 text-sm text-slate-500">
              No quotation history recorded yet.
            </p>
          ) : null}
        </div>
        </div>
      ) : null}
    </section>
  );
}
