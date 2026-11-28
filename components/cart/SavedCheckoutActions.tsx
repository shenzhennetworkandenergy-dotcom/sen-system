"use client";

import { useFormStatus } from "react-dom";

import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";

export function SavedCheckoutActions({ orderNumber }: { orderNumber: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button name="mode" value="edit" disabled={pending} className="min-h-11 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
        Edit items in cart
      </button>
      <ConfirmSubmitButton
        name="mode"
        value="remove"
        disabled={pending}
        confirmation={`Delete pending checkout ${orderNumber}? Its items will be removed and any reserved stock released once the payment is confirmed unpaid.`}
        className="min-h-11 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
      >
        Delete checkout
      </ConfirmSubmitButton>
    </>
  );
}
