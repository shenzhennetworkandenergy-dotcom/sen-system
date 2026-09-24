import { connection } from "next/server";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getWarrantyCoverage } from "@/lib/rma/data";
import { submitRmaClaimAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewRmaClaimPage({ searchParams }: { searchParams: Promise<{ coverage?: string; error?: string }> }) {
  await connection();
  const { profile } = await requireProfile(["customer", "admin"]);
  const params = await searchParams;
  if (!params.coverage) notFound();
  const coverage = await getWarrantyCoverage(profile.id, params.coverage);
  if (!coverage) notFound();
  const remaining = Math.max(0, coverage.covered_quantity - coverage.claimed_quantity);

  return <DashboardShell title="Submit warranty claim" subtitle="Tell SEN what happened and attach supporting evidence if available.">
    {params.error ? <p className="mb-4 rounded-xl bg-red-50 p-4 text-red-900">{params.error}</p> : null}
    <section className="rounded-2xl border bg-[var(--surface)] p-5">
      <h2 className="text-xl font-bold">{coverage.product_name}</h2>
      <p className="text-sm text-[var(--muted-text)]">Order {coverage.order_number} · {coverage.product_sku}{coverage.sen_serial ? ` · ${coverage.sen_serial}` : ""}</p>
      <p className="mt-2 text-sm">Coverage ends {new Date(`${coverage.ends_at}T00:00:00`).toLocaleDateString("en-BD")} · {remaining} unit(s) available</p>
      <form action={submitRmaClaimAction} className="mt-5 grid gap-4" encType="multipart/form-data">
        <input type="hidden" name="coverage_id" value={coverage.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 font-semibold">Claim type<select name="claim_type" required className="rounded-xl border px-4 py-3 font-normal"><option value="warranty">Warranty service</option><option value="defective">Defective product</option><option value="damaged">Damaged product</option><option value="return">Return request</option></select></label>
          <label className="grid gap-1 font-semibold">Quantity<input name="quantity" type="number" min="1" max={remaining} step="1" defaultValue="1" required className="rounded-xl border px-4 py-3 font-normal" /></label>
        </div>
        <label className="grid gap-1 font-semibold">Describe the issue<textarea name="description" minLength={10} maxLength={4000} required rows={6} className="rounded-xl border px-4 py-3 font-normal" placeholder="Describe the problem, when it started, and any troubleshooting already completed." /></label>
        <label className="grid gap-1 font-semibold">Photo or PDF evidence (optional)<input name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="rounded-xl border px-4 py-3 font-normal" /><span className="text-xs font-normal text-[var(--muted-text)]">JPG, PNG, WebP or PDF; maximum 10 MB.</span></label>
        <button className="w-fit rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]">Submit claim</button>
      </form>
    </section>
  </DashboardShell>;
}
