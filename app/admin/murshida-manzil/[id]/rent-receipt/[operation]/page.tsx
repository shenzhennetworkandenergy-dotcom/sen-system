import Link from "next/link";
import { notFound } from "next/navigation";
import { changeRentReceiptAction } from "@/app/admin/murshida-manzil/actions";
import { requireMurshidaManager } from "@/lib/murshida-manzil/accounts-session";
import { getRentTransaction } from "@/lib/murshida-manzil/repository";
import { rentPaymentMethods } from "@/lib/murshida-manzil/tenant-rent";

export const dynamic = "force-dynamic";

const history = "/admin/murshida-manzil/history/rent";
const input = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2";
const money = (amount: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT" }).format(amount);

export default async function ManageRentReceiptPage({ params, searchParams }: {
  params: Promise<{ id: string; operation: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireMurshidaManager();
  const { id, operation } = await params;
  if ((operation !== "edit" && operation !== "delete") || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) notFound();
  const [rent, notice] = await Promise.all([getRentTransaction(id), searchParams]);
  if (!rent) notFound();
  const deleting = operation === "delete";
  const submit = changeRentReceiptAction.bind(null, id, operation);

  return <main className="mx-auto max-w-3xl p-6 sm:p-8">
    <Link href={history} className="text-sm font-semibold underline">← Rent History</Link>
    <h1 className="mt-3 text-2xl font-bold">{deleting ? "Delete Rent Receipt" : "Edit Rent Receipt"}</h1>
    <p className="mt-1 break-all text-sm">{rent.rentReceiptNumber}</p>
    <dl className="mt-4 grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-3">
      <div><dt className="text-slate-600">Tenant</dt><dd className="font-semibold">{rent.tenantName}</dd></div>
      <div><dt className="text-slate-600">Unit</dt><dd className="font-semibold">{rent.unit_code_snapshot ?? "—"}</dd></div>
      <div><dt className="text-slate-600">Rent period</dt><dd className="font-semibold">{rent.rent_month}/{rent.rent_year}</dd></div>
    </dl>
    {notice.error ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">{notice.error}</p> : null}
    <form action={submit} className="mt-5 space-y-4">
      <input type="hidden" name="updated_at" value={rent.updated_at} />
      {deleting ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950">
        <p>Delete the {money(Number(rent.total_rent_settled))} rent receipt dated {rent.payment_date}?</p>
        <p className="mt-2">Its owner allocations will be removed. {money(Number(rent.advance_adjusted))} will be restored to the tenant’s advance balance.</p>
        {rent.auto_advance_expense && Number(rent.advance_adjusted) > 0 ? <p className="mt-2">The linked advance adjustment expense and its owner shares will also be removed.</p> : null}
        {!rent.auto_advance_expense && Number(rent.advance_adjusted) > 0 ? <p className="mt-2">Any manually recorded expense for this older receipt needs a separate review.</p> : null}
      </div> : <>
        <div className="grid gap-3 text-sm font-semibold sm:grid-cols-2">
          <label>Received Date<input className={input} type="date" name="payment_date" defaultValue={rent.payment_date} required /></label>
          <label>Payment Method<select className={input} name="payment_method" defaultValue={rent.payment_method} required>
            {rentPaymentMethods.map((method) => <option key={method} value={method}>{method === "mfs" ? "MFS" : method[0].toUpperCase() + method.slice(1)}</option>)}
          </select></label>
          <label>Rent Month<input className={input} type="number" name="rent_month" min="1" max="12" defaultValue={rent.rent_month} required /></label>
          <label>Rent Year<input className={input} type="number" name="rent_year" min="2000" max="2200" defaultValue={rent.rent_year} required /></label>
          <label>Monthly Rent (BDT)<input className={input} type="number" name="monthly_rent" min="0.01" step="0.01" defaultValue={rent.monthly_rent} required /></label>
          <label>Amount Received (BDT)<input className={input} type="number" name="actual_money_received" min="0" step="0.01" defaultValue={rent.actual_money_received} required /></label>
          <label>Advance Adjusted (BDT)<input className={input} type="number" name="advance_adjusted" min="0" max={rent.advance_balance_before} step="0.01" defaultValue={rent.advance_adjusted} required /></label>
          <label>Payment Reference<input className={input} name="reference_number" defaultValue={rent.reference_number ?? ""} maxLength={200} /></label>
          <label className="sm:col-span-2">Notes<textarea className={input} name="notes" defaultValue={rent.notes ?? ""} maxLength={2000} rows={2} /></label>
        </div>
        <p className="text-sm text-slate-700">Amount received plus advance adjusted must equal monthly rent.</p>
        {rent.auto_advance_expense ? <p className="text-sm text-slate-700">The linked expense follows the date and advance adjustment saved here.</p>
          : <p className="text-sm text-slate-700">For this older receipt, review any manually recorded expense separately.</p>}
      </>}
      <div className="flex gap-3">
        <button className={`rounded-lg px-4 py-2 font-semibold text-white ${deleting ? "bg-red-700" : "bg-slate-800"}`}>{deleting ? "Delete Receipt" : "Save Changes"}</button>
        <Link href={history} className="rounded-lg border px-4 py-2 font-semibold">Cancel</Link>
      </div>
    </form>
  </main>;
}
