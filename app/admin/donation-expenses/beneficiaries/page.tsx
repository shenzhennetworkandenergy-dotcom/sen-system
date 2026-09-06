import Link from "next/link";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getDonationBeneficiaries, getDonationOptions } from "@/lib/donation-expenses/data";
import { addDonationRelationshipTypeAction } from "../actions";
import { BeneficiaryForm } from "./BeneficiaryForm";

export const dynamic = "force-dynamic";

export default async function DonationBeneficiariesPage({ searchParams }: { searchParams: Promise<{ search?: string; success?: string; error?: string }> }) {
  await connection(); await requireProfile(["admin"]);
  const params = await searchParams;
  const [beneficiaries, options] = await Promise.all([getDonationBeneficiaries(params.search), getDonationOptions()]);
  const input = "rounded-lg border bg-background px-3 py-2";
  return <DashboardShell admin title="Donation Beneficiaries" subtitle="Reusable Donation-owned beneficiary profiles and monthly support settings.">
    {params.success ? <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p> : null}
    {params.error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p> : null}
    <div className="mb-5 flex flex-wrap gap-2"><Link href="/admin/donation-expenses" className="rounded-lg border px-4 py-2 font-semibold">Back to Donations</Link><form className="flex gap-2"><input name="search" defaultValue={params.search} placeholder="Find beneficiary" className={input} /><button className="rounded-lg border px-3 py-2 font-semibold">Search</button></form></div>
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <BeneficiaryForm relationshipTypes={options.relationshipTypes} categories={options.categories} paymentMethods={options.paymentMethods} />
      <aside className="space-y-5">
        <div className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="font-semibold">Add Relationship Type</h2><form action={addDonationRelationshipTypeAction} className="mt-3 flex gap-2"><input name="name" required className={`${input} min-w-0 flex-1`} /><button className="rounded-lg border px-3 py-2 font-semibold">Add</button></form></div>
        <div className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="mb-3 font-semibold">Beneficiaries</h2>{beneficiaries.map((item) => <Link key={item.id} href={`/admin/donation-expenses/beneficiaries/${item.id}`} className="mb-2 block rounded-lg border p-3"><strong>{item.name}</strong><span className="block text-xs text-[var(--muted-text)]">{item.beneficiary_reference} · {item.phone || "No phone"}</span></Link>)}{!beneficiaries.length ? <p className="text-sm text-[var(--muted-text)]">No beneficiaries found.</p> : null}</div>
      </aside>
    </section>
  </DashboardShell>;
}
