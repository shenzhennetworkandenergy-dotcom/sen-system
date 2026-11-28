"use client";

import { useFormStatus } from "react-dom";

export function CheckEpsPaymentButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="w-full rounded-xl border px-5 py-3 font-bold disabled:opacity-50">
      {pending ? "Checking EPS…" : "Check payment status"}
    </button>
  );
}
