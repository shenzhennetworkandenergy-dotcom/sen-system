"use client";

import { useFormStatus } from "react-dom";

type MoneyReceiptActionProps = {
  action: (form: FormData) => void | Promise<void>;
  label: string;
};

function MoneyReceiptSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--primary-foreground)] disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Generating…" : label}
    </button>
  );
}

export function MoneyReceiptAction({ action, label }: MoneyReceiptActionProps) {
  return (
    <form action={action}>
      <MoneyReceiptSubmitButton label={label} />
    </form>
  );
}
