import { requireProfile } from "@/lib/auth/session";
import { listRentHistory } from "@/lib/murshida-manzil/repository";

export const dynamic = "force-dynamic";

export default async function RentHistoryPage() {
  await requireProfile(["admin"]);
  const rows = await listRentHistory();
  return <main className="mx-auto max-w-6xl p-8"><h1 className="text-2xl font-bold">MURSHIDA MANZIL · Rent History</h1><div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Receipt</th><th className="p-2">Received Date</th><th className="p-2">Period</th><th className="p-2">Tenant</th><th className="p-2">Unit</th><th className="p-2">Monthly Rent</th><th className="p-2">Received</th><th className="p-2">Advance Adjusted</th><th className="p-2">Balance After</th><th className="p-2">Action</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)} className="border-b"><td className="p-2">{String(row.rent_receipt_number ?? `Rent-${String(row.id).slice(0, 8)}`)}</td><td className="p-2">{String(row.payment_date)}</td><td className="p-2">{String(row.rent_month)}/{String(row.rent_year)}</td><td className="p-2">{String(row.tenant_name)}</td><td className="p-2">{String(row.unit_code_snapshot)}</td><td className="p-2">{String(row.monthly_rent ?? "—")}</td><td className="p-2">{String(row.actual_money_received ?? "—")}</td><td className="p-2">{String(row.advance_adjusted ?? "0")}</td><td className="p-2">{String(row.advance_balance_after ?? "0")}</td><td className="p-2"><a className="underline" href={`/admin/murshida-manzil/${row.id}/rent-receipt`}>View / Print Receipt</a></td></tr>)}</tbody></table></div></main>;
}
