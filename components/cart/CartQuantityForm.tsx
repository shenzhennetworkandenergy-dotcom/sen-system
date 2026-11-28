"use client";

import { useFormStatus } from "react-dom";

function CartItemActions() {
  const { pending } = useFormStatus();
  return (
    <>
      <button disabled={pending} className="min-h-11 rounded-lg border px-3 py-2 font-semibold disabled:opacity-50">
        Update
      </button>
      <button name="cart_action" value="remove" formNoValidate disabled={pending}
        className="min-h-11 rounded-lg border border-red-200 px-3 py-2 font-semibold text-red-800 disabled:opacity-50">
        Remove
      </button>
    </>
  );
}

export function CartQuantityForm({ action, itemId, quantity, productName }: {
  action: (formData: FormData) => void | Promise<void>;
  itemId: string;
  quantity: number;
  productName: string;
}) {
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="item_id" value={itemId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-semibold">
          Quantity <span className="sr-only">for {productName}</span>
          <input name="quantity" type="number" inputMode="numeric" min="0" max="99" step="1" required defaultValue={quantity}
            className="mt-1 block min-h-11 w-20 rounded-lg border bg-white p-2 text-base text-slate-950" />
        </label>
        <CartItemActions />
      </div>
    </form>
  );
}
