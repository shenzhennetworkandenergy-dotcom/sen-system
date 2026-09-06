import type { DonationBeneficiary, DonationOption, MonthlySupportReminder } from "@/lib/donation-expenses/data";
import { createDonationExpenseAction } from "./actions";

export function DonationExpenseForm({ beneficiaries, categories, paymentMethods, selectedBeneficiaryId, reminder }: {
  beneficiaries: DonationBeneficiary[]; categories: DonationOption[]; paymentMethods: DonationOption[];
  selectedBeneficiaryId?: string; reminder?: MonthlySupportReminder;
}) {
  const beneficiaryId = reminder?.beneficiary_id ?? selectedBeneficiaryId ?? "";
  return <form action={createDonationExpenseAction} className="grid gap-4 md:grid-cols-2">
    {reminder ? <input type="hidden" name="monthly_support_id" value={reminder.id} /> : null}
    <label className="grid gap-1 text-sm font-medium md:col-span-2">Beneficiary
      <select name="beneficiary_id" required defaultValue={beneficiaryId} className="rounded-lg border bg-background px-3 py-2">
        <option value="">Select beneficiary</option>
        {beneficiaries.map((item) => <option key={item.id} value={item.id}>{item.beneficiary_reference} · {item.name}</option>)}
      </select>
    </label>
    <label className="grid gap-1 text-sm font-medium">Category
      <select name="category_id" required defaultValue={reminder?.category_id ?? ""} className="rounded-lg border bg-background px-3 py-2">
        <option value="">Select category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <label className="grid gap-1 text-sm font-medium">Payment Method
      <select name="payment_method_id" required defaultValue={reminder?.payment_method_id ?? ""} className="rounded-lg border bg-background px-3 py-2">
        <option value="">Select payment method</option>{paymentMethods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <label className="grid gap-1 text-sm font-medium">Amount (BDT)
      <input name="amount" type="number" min="0.01" step="0.01" required defaultValue={reminder?.amount ?? ""} className="rounded-lg border bg-background px-3 py-2" />
    </label>
    <label className="grid gap-1 text-sm font-medium">Donation Date
      <input name="donation_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="rounded-lg border bg-background px-3 py-2" />
    </label>
    <label className="grid gap-1 text-sm font-medium md:col-span-2">Purpose
      <input name="purpose" required defaultValue={reminder?.purpose ?? ""} className="rounded-lg border bg-background px-3 py-2" />
    </label>
    <label className="grid gap-1 text-sm font-medium">Payment Reference
      <input name="payment_reference" className="rounded-lg border bg-background px-3 py-2" />
    </label>
    <label className="grid gap-1 text-sm font-medium">Note
      <input name="note" className="rounded-lg border bg-background px-3 py-2" />
    </label>
    <div className="md:col-span-2"><button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">Create Donation Expense</button></div>
  </form>;
}
