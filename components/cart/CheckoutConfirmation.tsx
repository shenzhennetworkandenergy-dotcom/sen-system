"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { checkoutPhoneOptions, isValidCheckoutPhone, normalizeCheckoutPhone } from "@/lib/orders/checkout-contact";

type Address = {
  id: string;
  recipient_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string | null;
  area: string | null;
  city: string;
  region: string | null;
  postal_code: string | null;
  country_code: string;
  is_default_shipping: boolean;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function addressLabel(address: Address) {
  return [
    address.recipient_name,
    address.address_line_1,
    address.address_line_2,
    address.area,
    address.city,
    address.region,
    address.postal_code,
    address.country_code,
  ]
    .filter(Boolean)
    .join(", ");
}

export function CheckoutConfirmation({
  action,
  addresses,
  email: initialEmail,
  phone: initialPhone,
  eps = null,
  operationId,
  total,
}: {
  action: (formData: FormData) => void | Promise<void>;
  addresses: Address[];
  email: string;
  phone: string;
  eps?: { testMode: boolean } | null;
  operationId: string;
  total: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const phoneHintId = useId();
  const errorId = useId();
  const defaultAddress =
    addresses.find((address) => address.is_default_shipping) ?? addresses[0];
  const [addressId, setAddressId] = useState(defaultAddress?.id ?? "");
  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === addressId) ?? null,
    [addressId, addresses],
  );
  const [email, setEmail] = useState(initialEmail);
  // Use the selected delivery contact initially, just as when the address changes.
  const [phone, setPhone] = useState(
    selectedAddress?.phone || initialPhone || "",
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery");
  const online = paymentMethod === "eps";
  const phoneOptions = useMemo(
    () => checkoutPhoneOptions([initialPhone, selectedAddress?.phone ?? ""]),
    [initialPhone, selectedAddress?.phone],
  );

  const validateAddress = () => {
    if (!selectedAddress) return "Choose a saved shipping address.";
    if (
      online &&
      (!selectedAddress.postal_code?.trim() || !selectedAddress.city?.trim())
    )
      return "Add a postcode and city to your shipping address for online payment.";
    return "";
  };

  const validate = () => {
    const addressError = validateAddress();
    if (addressError) return addressError;
    if (!emailPattern.test(email.trim())) return "Enter a valid email address.";
    if (!isValidCheckoutPhone(phone)) {
      return "Enter one valid contact phone number. For international numbers, include + and the country code.";
    }
    return "";
  };

  const openReview = () => {
    // Contact inputs live in this dialog, so let the customer review and correct them first.
    const message = validateAddress();
    setError(message);
    if (!message) dialog.current?.showModal();
  };

  return (
    <div className="mt-5 space-y-4">
      <label className="block text-sm font-semibold">
        Shipping address
        <select
          value={addressId}
          onChange={(event) => {
            const nextId = event.target.value;
            const nextAddress = addresses.find(
              (address) => address.id === nextId,
            );
            setAddressId(nextId);
            if (nextAddress?.phone) setPhone(nextAddress.phone);
            setError("");
          }}
          required
          className="mt-1 w-full rounded-xl border bg-white p-3 text-base text-slate-950"
        >
          <option value="">Choose saved address</option>
          {addresses.map((address) => (
            <option key={address.id} value={address.id}>
              {addressLabel(address)}
            </option>
          ))}
        </select>
      </label>
      {!addresses.length ? (
        <Link
          href="/account/addresses"
          className="block text-sm font-bold text-blue-700"
        >
          Add a shipping address first →
        </Link>
      ) : (
        <Link
          href="/account/addresses"
          className="block text-sm font-bold text-blue-700"
        >
          Add or correct an address
        </Link>
      )}
      <label className="block text-sm font-semibold">
        Order notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value.slice(0, 4000))}
          rows={3}
          className="mt-1 w-full rounded-xl border bg-white p-3 text-base text-slate-950"
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-bold">Payment method</legend>
        {eps ? (
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${online ? "border-blue-600 bg-blue-50" : "bg-white"}`}
          >
            <input
              className="mt-1"
              type="radio"
              name="payment_choice"
              value="eps"
              checked={online}
              onChange={() => {
                setPaymentMethod("eps");
                setError("");
              }}
            />
            <span>
              <b className="block">
                Pay online with EPS {eps.testMode ? "· Sandbox test" : ""}
              </b>
              <span className="mt-1 block text-sm text-slate-600">
                Choose an available card, mobile banking or internet banking
                method at secure checkout.
              </span>
            </span>
          </label>
        ) : null}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${!online ? "border-blue-600 bg-blue-50" : "bg-white"}`}
        >
          <input
            className="mt-1"
            type="radio"
            name="payment_choice"
            value="cash_on_delivery"
            checked={!online}
            onChange={() => {
              setPaymentMethod("cash_on_delivery");
              setError("");
            }}
          />
          <span>
            <b className="block">Cash on delivery</b>
            <span className="mt-1 block text-sm text-slate-600">
              Pay when your order is delivered.
            </span>
          </span>
        </label>
      </fieldset>
      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!addresses.length}
        onClick={openReview}
        className="w-full rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-40"
      >
        {online ? "Review & pay online" : "Confirm Cash On Delivery Order"}
      </button>

      <dialog
        ref={dialog}
        onClose={() => setError("")}
        className="m-auto max-h-[90dvh] w-[min(94vw,42rem)] overflow-hidden rounded-3xl border-0 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/70"
      >
        <form
          noValidate
          data-checkout-review
          action={action}
          className="flex max-h-[90dvh] flex-col p-6 sm:p-8"
          onSubmit={(event) => {
            const message = validate();
            if (message) {
              event.preventDefault();
              setError(message);
              const input = !emailPattern.test(email.trim())
                ? emailInput.current
                : !isValidCheckoutPhone(phone) ? phoneInput.current : null;
              input?.focus({ preventScroll: true });
              input?.scrollIntoView({ block: "nearest" });
            }
          }}
        >
          <input type="hidden" name="address_id" value={addressId} />
          <input type="hidden" name="notes" value={notes} />
          <input type="hidden" name="payment_method" value={paymentMethod} />
          <input type="hidden" name="operation_id" value={operationId} />
          <input type="hidden" name="expected_total" value={total.toFixed(2)} />
          <input type="hidden" name="confirmed" value="yes" />
          <div className="flex shrink-0 items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-700">
                Final order confirmation
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                Check your billing information
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {online
                  ? "Review your order before continuing to EPS secure checkout."
                  : "We will use these details to confirm and deliver your COD order."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close confirmation"
              className="rounded-full border px-3 py-1.5 font-bold"
            >
              ×
            </button>
          </div>

          <div className="mt-6 grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain pr-1">
            <p className="flex flex-wrap justify-between gap-2 rounded-xl border bg-slate-50 p-4 font-bold">
              <span>Order total</span>
              <span>
                {new Intl.NumberFormat("en-BD", {
                  style: "currency",
                  currency: "BDT",
                  maximumFractionDigits: 2,
                }).format(total)}
              </span>
            </p>
            <label className="text-sm font-semibold">
              Billing email
              <input
                ref={emailInput}
                name="billing_email"
                type="email"
                required
                value={email}
                autoComplete="email"
                aria-invalid={Boolean(error && !emailPattern.test(email.trim()))}
                aria-describedby={error && !emailPattern.test(email.trim()) ? errorId : undefined}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                className="mt-1 w-full rounded-xl border bg-white p-3 text-base text-slate-950"
              />
            </label>
            <label className="text-sm font-semibold">
              Contact phone
              <input
                ref={phoneInput}
                name="billing_phone"
                type="tel"
                required
                value={phone}
                autoComplete="tel"
                maxLength={40}
                aria-invalid={Boolean(error && !isValidCheckoutPhone(phone))}
                aria-describedby={`${phoneHintId}${error && !isValidCheckoutPhone(phone) ? ` ${errorId}` : ""}`}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setError("");
                }}
                placeholder="+8801XXXXXXXXX"
                className="mt-1 w-full rounded-xl border bg-white p-3 text-base text-slate-950"
              />
              <span id={phoneHintId} className="mt-1 block text-xs font-normal leading-5 text-slate-600">
                Use one number only. Bangladesh: 017XXXXXXXX. International: include + and the country code.
              </span>
            </label>
            {phoneOptions.length > 1 ? (
              <fieldset className="rounded-xl border bg-slate-50 p-3">
                <legend className="px-1 text-sm font-semibold">Choose a contact number for this order</legend>
                <div className="flex flex-wrap gap-2">
                  {phoneOptions.map((number) => (
                    <button
                      key={number}
                      type="button"
                      aria-pressed={normalizeCheckoutPhone(phone) === number}
                      onClick={() => { setPhone(number); setError(""); }}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold ${normalizeCheckoutPhone(phone) === number ? "border-blue-600 bg-blue-50 text-blue-900" : "bg-white text-slate-950"}`}
                    >
                      {number}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <div className="rounded-2xl border bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Delivery location
              </p>
              <p className="mt-2 font-semibold">
                {selectedAddress
                  ? addressLabel(selectedAddress)
                  : "No address selected"}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-bold text-emerald-950">
                {online
                  ? `EPS secure online payment${eps?.testMode ? " · Sandbox" : ""}`
                  : "Cash on delivery"}
              </p>
              <p className="mt-1 text-sm text-emerald-900">
                {online
                  ? eps?.testMode
                    ? "This is a test payment. No real money is collected and your order will not be marked paid."
                    : "You will leave SEN to complete payment securely on EPS. Your order is marked paid only after verification."
                  : "Payment will be collected when the order is delivered. No online payment is required now."}
              </p>
            </div>
            {error ? (
              <p id={errorId} className="text-sm font-semibold text-red-700" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="mt-5 flex shrink-0 flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-xl border px-5 py-3 font-bold"
            >
              Go back
            </button>
            <CheckoutSubmit online={online} />
          </div>
        </form>
      </dialog>
    </div>
  );
}

function CheckoutSubmit({ online }: { online: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-xl bg-slate-950 px-6 py-3 font-bold text-white disabled:opacity-50"
    >
      {pending
        ? "Processing…"
        : online
          ? "Confirm & continue to EPS"
          : "Confirm"}
    </button>
  );
}
