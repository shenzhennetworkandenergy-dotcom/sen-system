import Link from "next/link";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getRmbCustomerRequestOptions } from "@/lib/rmb-payments/data";
import RmbCustomerRequestForm from "./RmbCustomerRequestForm";

export const dynamic = "force-dynamic";

export default async function NewCustomerRmbRequestPage() {
  await connection();
  await requireProfile(["customer"]);
  const options = await getRmbCustomerRequestOptions();
  const initialCurrency = options.currencies.find((currency) => currency.code === "RMB")?.code ?? options.currencies[0]?.code ?? "RMB";
  const initialRate = options.rates.find((rate) => rate.currency_code === initialCurrency) ?? null;
  return <DashboardShell title="Create RMB Request" subtitle="The current rate is read-only and is applied again on the server at submission.">
    <div className="mb-4"><Link href="/account/rmb-payments" className="font-semibold text-blue-700">← My RMB Requests</Link></div>
    <RmbCustomerRequestForm currencies={options.currencies} rates={options.rates} methods={options.methods} initialCurrency={initialCurrency} initialRate={initialRate} />
  </DashboardShell>;
}
