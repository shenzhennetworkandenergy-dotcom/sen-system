import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { listExpenseHistory } from "@/lib/murshida-manzil/repository";

export const dynamic = "force-dynamic";

const modulePath = "/admin/murshida-manzil";
const columns = ["Voucher", "Date", "Description", "Category", "Paid To", "Amount", "Payment Method", "Action"];

export default async function ExpenseHistoryPage() {
  await requireProfile(["admin"]);
  const rows = await listExpenseHistory();
  return <main className="mx-auto max-w-6xl p-8">
    <Link href={modulePath} className="text-sm font-semibold underline">← Murshida Manzil</Link>
    <h1 className="mt-2 text-2xl font-bold">MURSHIDA MANZIL · Expense History</h1>
    <div className="mt-6 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b">{columns.map((column) => <th key={column} scope="col" className="p-2">{column}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} className="border-b">
          <td className="max-w-36 break-all p-2">{row.voucher_number ?? `Expense-${row.id.slice(0, 8)}`}</td>
          <td className="whitespace-nowrap p-2">{row.expense_date}</td>
          <td className="p-2">{row.description}
            {row.rent_advance_receipt_id ? <span className="mt-1 block text-xs font-semibold text-emerald-800">From rent · Distributed to owners</span> : null}
          </td>
          <td className="p-2">{row.category ?? "—"}</td>
          <td className="p-2">{row.paid_to ?? "—"}</td>
          <td className="p-2">{row.amount}</td>
          <td className="p-2">{row.payment_method ?? "—"}</td>
          <td className="p-2">
            <Link className="underline" href={`${modulePath}/${row.id}/expense-voucher`}>View / Print Voucher</Link>
            {row.rent_advance_receipt_id ? <Link className="mt-1 block underline" href={`${modulePath}/${row.rent_advance_receipt_id}/rent-receipt`}>View Rent Receipt</Link> : null}
          </td>
        </tr>)}</tbody>
      </table>
      {!rows.length ? <p className="py-6 text-sm">No expenses recorded.</p> : null}
    </div>
  </main>;
}
