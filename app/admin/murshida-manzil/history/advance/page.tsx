import { requireProfile } from "@/lib/auth/session";
import { listAdvanceHistory } from "@/lib/murshida-manzil/repository";

export const dynamic = "force-dynamic";

export default async function AdvanceHistoryPage() {
  await requireProfile(["admin"]);
  const rows = await listAdvanceHistory();
  return <main className="mx-auto max-w-6xl p-8"><h1 className="text-2xl font-bold">MURSHIDA MANZIL · Advance History</h1><div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Voucher</th><th className="p-2">Date</th><th className="p-2">Tenant</th><th className="p-2">Mobile</th><th className="p-2">Unit</th><th className="p-2">Advance Amount</th><th className="p-2">Default Monthly Deduction</th><th className="p-2">Action</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)} className="border-b"><td className="p-2">Advance-{String(row.id).slice(0, 8)}</td><td className="p-2">{String(row.payment_date)}</td><td className="p-2">{String(row.tenant_name)}</td><td className="p-2">{String(row.tenant_phone ?? "—")}</td><td className="p-2">{String(row.unit_code_snapshot)}</td><td className="p-2">{String(row.amount)}</td><td className="p-2">{String(row.default_monthly_advance_adjustment ?? "0")}</td><td className="p-2"><a className="underline" href={`/admin/murshida-manzil/${row.id}/advance-receipt`}>View / Print Receipt</a></td></tr>)}</tbody></table></div></main>;
}
