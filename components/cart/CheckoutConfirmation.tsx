"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

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
const normalizePhone = (value: string) => value.replace(/[()\s.-]/g, "");
const validPhone = (value: string) => {
  const normalized = normalizePhone(value);
  if (/^\+8801[3-9]\d{8}$/.test(normalized)) return true;
  if (/^01[3-9]\d{8}$/.test(normalized)) return true;
  return /^\+[1-9]\d{6,14}$/.test(normalized);
};

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
}: {
  action: (formData: FormData) => void | Promise<void>;
  addresses: Address[];
  email: string;
  phone: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const defaultAddress = addresses.find((address) => address.is_default_shipping) ?? addresses[0];
  const [addressId, setAddressId] = useState(defaultAddress?.id ?? "");
  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === addressId) ?? null,
    [addressId, addresses],
  );
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone || selectedAddress?.phone || "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const validate = () => {
    if (!selectedAddress) return "Choose a saved shipping address.";
    if (!emailPattern.test(email.trim())) return "Enter a valid email address.";
    if (!validPhone(phone)) {
      return "Enter a valid Bangladesh phone number or an international number with country code.";
    }
    return "";
  };

  const openReview = () => {
    const message = validate();
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
            const nextAddress = addresses.find((address) => address.id === nextId);
            setAddressId(nextId);
            if (nextAddress?.phone) setPhone(nextAddress.phone);
            setError("");
          }}
          required
          className="mt-1 w-full rounded-xl border p-3"
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
        <Link href="/account/addresses" className="block text-sm font-bold text-blue-700">
          Add a shipping address first →
        </Link>
      ) : (
        <Link href="/account/addresses" className="block text-sm font-bold text-blue-700">
          Add or correct an address
        </Link>
      )}
      <label className="block text-sm font-semibold">
        Order notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value.slice(0, 4000))}
          rows={3}
          className="mt-1 w-full rounded-xl border p-3"
        />
      </label>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
        <b>Payment method:</b> Cash on delivery (COD)
      </div>
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!addresses.length}
        onClick={openReview}
        className="w-full rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-40"
      >
        Review billing information
      </button>

      <dialog
        ref={dialog}
        onClose={() => setError("")}
        className="m-auto w-[min(94vw,42rem)] rounded-3xl border-0 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/70"
      >
        <form noValidate action={action} className="p-6 sm:p-8" onSubmit={(event) => {
          const message = validate();
          if (message) {
            event.preventDefault();
            setError(message);
          }
        }}>
          <input type="hidden" name="address_id" value={addressId} />
          <input type="hidden" name="notes" value={notes} />
          <input type="hidden" name="payment_method" value="cash_on_delivery" />
          <input type="hidden" name="confirmed" value="yes" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-700">
                Final order confirmation
              </p>
              <h2 className="mt-2 text-2xl font-bold">Check your billing information</h2>
              <p className="mt-1 text-sm text-slate-600">
                We will use these details to confirm and deliver your COD order.
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

          <div className="mt-6 grid gap-4">
            <label className="text-sm font-semibold">
              Billing email
              <input
                name="billing_email"
                type="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                className="mt-1 w-full rounded-xl border p-3"
              />
            </label>
            <label className="text-sm font-semibold">
              Contact phone
              <input
                name="billing_phone"
                type="tel"
                required
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setError("");
                }}
                placeholder="+8801XXXXXXXXX"
                className="mt-1 w-full rounded-xl border p-3"
              />
            </label>
            <div className="rounded-2xl border bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Delivery location
              </p>
              <p className="mt-2 font-semibold">
                {selectedAddress ? addressLabel(selectedAddress) : "No address selected"}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-bold text-emerald-950">Cash on delivery</p>
              <p className="mt-1 text-sm text-emerald-900">
                Payment will be collected when the order is delivered. No online payment is required now.
              </p>
            </div>
            {error ? <p className="text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
          </div>
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-xl border px-5 py-3 font-bold"
            >
              Go back
            </button>
            <button className="rounded-xl bg-slate-950 px-6 py-3 font-bold text-white">
              Confirm COD order
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
