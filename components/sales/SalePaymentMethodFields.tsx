"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import {
  SALE_PAYMENT_METHODS,
  requiresExplicitReceiptChannel,
  type SalePaymentMethod,
} from "@/lib/sales/payment-accounting";

const methodLabels: Record<SalePaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  mobile_banking: "Mobile Banking",
  card: "Card",
  advance_payment: "Advance Payment",
  cash_on_delivery: "Cash on Delivery",
  other: "Other",
};

const receiptChannels = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "mfs", label: "MFS" },
] as const;

function RecordPaymentButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Recording payment…" : "Record payment"}
    </button>
  );
}

export function SalePaymentMethodFields({ fieldClass }: { fieldClass: string }) {
  const [method, setMethod] = useState<SalePaymentMethod>("cash");
  const needsReceiptChannel = requiresExplicitReceiptChannel(method);

  return (
    <>
      <select
        name="method"
        value={method}
        onChange={(event) => setMethod(event.target.value as SalePaymentMethod)}
        aria-label="Payment method"
        className={fieldClass}
        required
      >
        {SALE_PAYMENT_METHODS.map((option) => (
          <option key={option} value={option}>{methodLabels[option]}</option>
        ))}
      </select>
      {needsReceiptChannel ? (
        <select
          name="receipt_channel"
          defaultValue=""
          aria-label="Actual receiving channel"
          className={fieldClass}
          required
        >
          <option value="" disabled>Select Cash, Bank, or MFS</option>
          {receiptChannels.map((channel) => (
            <option key={channel.value} value={channel.value}>{channel.label}</option>
          ))}
        </select>
      ) : null}
      <RecordPaymentButton />
    </>
  );
}
