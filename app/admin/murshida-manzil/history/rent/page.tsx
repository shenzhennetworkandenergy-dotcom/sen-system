import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { listRentHistory } from "@/lib/murshida-manzil/repository";

export const dynamic = "force-dynamic";

const modulePath = "/admin/murshida-manzil";
const columns = ["Receipt", "Received Date", "Period", "Tenant", "Unit", "Monthly Rent", "Received", "Advance Adjusted", "Balance After", "Action"];

export default async function RentHistoryPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  await requireProfile(["admin"]);
  const [rows, notices] = await Promise.all([listRentHistory(), searchParams]);
  return <main className="mx-auto max-w-6xl p-8">
    <Link href={modulePath} className="text-sm font-semibold underline">← Murshida Manzil</Link>
    <h1 className="mt-2 text-2xl font-bold">MURSHIDA MANZIL · Rent History</h1>
    {notices.message ? <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">{notices.message}</p> : null}
    {notices.error ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">{notices.error}</p> : null}
    <div className="mt-6 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b">{columns.map((column) => <th key={column} scope="col" className="p-2">{column}</th>)}</tr></thead>
        <tbody>{rows.map((row) => {
          const receipt = `${modulePath}/${row.id}/rent-receipt`;
          return <tr key={row.id} className="border-b">
            <td className="max-w-44 break-all p-2">{row.rent_receipt_number ?? `Rent-${row.id.slice(0, 8)}`}</td>
            <td className="whitespace-nowrap p-2">{row.payment_date}</td>
            <td className="p-2">{row.rent_month}/{row.rent_year}</td>
            <td className="p-2">{row.tenant_name}</td>
            <td className="p-2">{row.unit_code_snapshot ?? "—"}</td>
            <td className="p-2">{row.monthly_rent ?? "—"}</td>
            <td className="p-2">{row.actual_money_received ?? "—"}</td>
            <td className="p-2">{row.advance_adjusted ?? 0}</td>
            <td className="p-2">{row.advance_balance_after ?? 0}</td>
            <td className="p-2">
              <Link className="underline" href={receipt}>View / Print Receipt</Link>
              <div className="mt-1 flex gap-2 print:hidden">
                <Link className="font-semibold underline" href={`${receipt}/edit`}>Edit</Link>
                <Link className="font-semibold text-red-800 underline" href={`${receipt}/delete`}>Delete</Link>
              </div>
            </td>
          </tr>;
        })}</tbody>
      </table>
      {!rows.length ? <p className="py-6 text-sm">No rent receipts recorded.</p> : null}
    </div>
  </main>;
}
