import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getCustomerRmaClaims, getCustomerWarrantyCoverages } from "@/lib/rma/data";

export const dynamic = "force-dynamic";

const pretty = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function AccountRmaPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const { profile } = await requireProfile(["customer", "admin"]);
  const notice = await searchParams;
  const [coverages, claims] = await Promise.all([
    getCustomerWarrantyCoverages(profile.id),
    getCustomerRmaClaims(profile.id),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const eligible = coverages.filter((coverage) => coverage.status === "active" && coverage.ends_at >= today && coverage.claimed_quantity < coverage.covered_quantity);

  return (
    <DashboardShell title="Warranty & Returns" subtitle="Review product warranty coverage and track every claim with SEN.">
      {notice.success ? <p className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice.success}</p> : null}
      {notice.error ? <p className="rounded-xl bg-red-50 p-4 text-red-900">{notice.error}</p> : null}

      <section className="mt-5 rounded-2xl border bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-bold">Eligible products</h2><p className="text-sm text-[var(--muted-text)]">Coverage begins after delivery is recorded.</p></div>
          <span className="rounded-full bg-blue-50 px-3 py-1 font-bold text-blue-800">{eligible.length} eligible</span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {coverages.map((coverage) => {
            const canClaim = coverage.status === "active" && coverage.ends_at >= today && coverage.claimed_quantity < coverage.covered_quantity;
            return <article key={coverage.id} className="rounded-xl border p-4">
              <div className="flex justify-between gap-3"><div><b>{coverage.product_name}</b><p className="text-sm">{coverage.product_sku}{coverage.sen_serial ? ` · ${coverage.sen_serial}` : ""}</p></div><span className="text-sm font-semibold">{pretty(coverage.status)}</span></div>
              <p className="mt-3 text-sm">Order {coverage.order_number} · Warranty until {new Date(`${coverage.ends_at}T00:00:00`).toLocaleDateString("en-BD")}</p>
              <p className="mt-1 text-sm text-[var(--muted-text)]">Available to claim: {Math.max(0, coverage.covered_quantity - coverage.claimed_quantity)} of {coverage.covered_quantity}</p>
              {coverage.warranty_terms ? <p className="mt-2 text-sm">{coverage.warranty_terms}</p> : null}
              {canClaim ? <Link href={`/account/rma/new?coverage=${coverage.id}`} className="mt-3 inline-block rounded-xl bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">Claim warranty</Link> : null}
            </article>;
          })}
        </div>
        {!coverages.length ? <p className="mt-4 rounded-xl bg-[var(--muted-surface)] p-6 text-center">No delivered products with warranty coverage yet.</p> : null}
      </section>

      <section className="mt-5">
        <h2 className="text-xl font-bold">My claims</h2>
        <div className="mt-3 grid gap-3">
          {claims.map((claim) => <Link key={claim.id} href={`/account/rma/${claim.id}`} className="rounded-2xl border bg-[var(--surface)] p-4 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex flex-wrap justify-between gap-2"><b>{claim.rma_number} · {claim.product_name}</b><span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-800">{pretty(claim.status)}</span></div>
            <p className="mt-2 text-sm text-[var(--muted-text)]">Submitted {new Date(claim.submitted_at).toLocaleString("en-BD")} · {pretty(claim.claim_type)}</p>
          </Link>)}
          {!claims.length ? <p className="rounded-2xl border p-8 text-center">No warranty claims submitted.</p> : null}
        </div>
      </section>
    </DashboardShell>
  );
}
