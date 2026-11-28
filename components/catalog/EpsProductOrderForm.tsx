"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { EpsProductCheckoutState } from "@/app/products/[slug]/eps-actions";
import { isValidCheckoutPhone } from "@/lib/orders/checkout-contact";
import type { EpsProductSelection, EpsShippingAddress } from "@/lib/orders/eps-product-checkout";

export type EpsProductOrderDetails = {
  operationId: string;
  signedIn: boolean;
  testMode: boolean;
  email: string;
  phone: string;
  addresses: EpsShippingAddress[];
};

export type EpsProductOrderAction = (
  state: EpsProductCheckoutState,
  form: FormData,
) => Promise<EpsProductCheckoutState>;

const fieldClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950";
export const epsProductFormId = "eps-product-checkout";

export function EpsProductOrderForm({ details, selection, total, action, express }: {
  details: EpsProductOrderDetails;
  selection: EpsProductSelection;
  total: string;
  action: EpsProductOrderAction;
  express?: "auto" | "review";
}) {
  const [operationId] = useState(details.operationId);
  const usableAddresses = details.addresses.filter((address) => address.city?.trim() && address.postal_code?.trim());
  const [addressId, setAddressId] = useState(usableAddresses[0]?.id ?? "new");
  const address = usableAddresses.find((row) => row.id === addressId);
  const [email, setEmail] = useState(details.email);
  const [phone, setPhone] = useState(() => (
    [address?.phone, details.phone].find((value) => value && isValidCheckoutPhone(value)) ?? ""
  ));
  const [recipient, setRecipient] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [country, setCountry] = useState("BD");
  const [state, submit, pending] = useActionState(action, {});
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(details.email.trim());
  const needsPhone = ![address?.phone, details.phone].some((value) => value && isValidCheckoutPhone(value));
  const needsDetails = details.signedIn && (!address || !hasEmail || needsPhone);
  const formRef = useRef<HTMLFormElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (express !== "auto" || !details.signedIn || needsDetails || started.current || !formRef.current) return;
    started.current = true;
    formRef.current.requestSubmit();
  }, [express, details.signedIn, needsDetails]);
  const button = pending ? "Opening EPS…" : express || needsDetails ? "Continue to EPS" : "Order Now · Pay with EPS";
  const displayTotal = new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(total));

  return (
    <form ref={formRef} id={epsProductFormId} action={submit} className="mt-3 space-y-4 rounded-2xl border border-slate-300 bg-white p-4 text-slate-900">
      <input type="hidden" name="operation_id" value={operationId} />
      <input type="hidden" name="expected_total" value={total} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm">Total for {selection.quantity} {selection.quantity === 1 ? "unit" : "units"}</span>
        <strong className="text-lg">BDT {displayTotal}</strong>
      </div>
      {details.signedIn ? (
        <fieldset className="space-y-3" disabled={pending}>
          {usableAddresses.length ? (
            <label className="block text-sm font-semibold">
              Delivery address
              <select name="address_id" value={addressId} className={fieldClass} onChange={(event) => {
                const id = event.target.value;
                const selected = usableAddresses.find((row) => row.id === id);
                setAddressId(id);
                setPhone([selected?.phone, details.phone].find((value) => value && isValidCheckoutPhone(value)) ?? "");
              }}>
                {usableAddresses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {[row.recipient_name, row.address_line_1, row.address_line_2, row.city, row.postal_code, row.country_code].filter(Boolean).join(", ")}
                  </option>
                ))}
                <option value="new">Enter a different address</option>
              </select>
            </label>
          ) : <input type="hidden" name="address_id" value="new" />}
          {address ? (
            <p className="break-words text-sm text-slate-700 sm:hidden">
              {[address.address_line_1, address.address_line_2, address.city, address.postal_code, address.country_code].filter(Boolean).join(", ")}
            </p>
          ) : null}
          {!address ? (
            <div className="grid gap-3 text-sm font-semibold sm:grid-cols-2">
              <label>Recipient name<input className={fieldClass} name="recipient_name" autoComplete="shipping name" required maxLength={160} value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label>
              <label>Street address<input className={fieldClass} name="address_line_1" autoComplete="shipping address-line1" required maxLength={240} value={street} onChange={(event) => setStreet(event.target.value)} /></label>
              <label>City<input className={fieldClass} name="city" autoComplete="shipping address-level2" required maxLength={120} value={city} onChange={(event) => setCity(event.target.value)} /></label>
              <label>Postcode<input className={fieldClass} name="postal_code" autoComplete="shipping postal-code" required maxLength={30} value={postcode} onChange={(event) => setPostcode(event.target.value)} /></label>
              <label>Country code<input className={fieldClass} name="country_code" autoComplete="shipping country" required pattern="[A-Za-z]{2}" maxLength={2} value={country} onChange={(event) => setCountry(event.target.value)} /></label>
            </div>
          ) : null}
          {!hasEmail ? (
            <label className="block text-sm font-semibold">Billing email<input className={fieldClass} name="billing_email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          ) : <input type="hidden" name="billing_email" value={email} />}
          {!address || needsPhone ? (
            <label className="block text-sm font-semibold">Contact phone<input className={fieldClass} name="billing_phone" type="tel" autoComplete="tel" required maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          ) : <input type="hidden" name="billing_phone" value={phone} />}
        </fieldset>
      ) : <p className="text-sm text-slate-700">Sign in to use your delivery details.</p>}
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {state.error}
          {state.error.includes("saved checkout") ? <> <a href="/cart" className="underline">View saved checkouts</a></> : null}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="sen-button-glow min-h-12 w-full rounded-xl px-5 font-semibold disabled:opacity-60">
        {button}{details.testMode ? " · Sandbox" : ""}
      </button>
    </form>
  );
}
