import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getDonationExpenseDetail } from "@/lib/donation-expenses/data";
import { advanceDonationExpenseStatusAction, uploadDonationProofAction } from "../actions";

export const dynamic = "force-dynamic";
const money = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT" }).format(value);
const date = (value: string | null, withTime = false) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Asia/Dhaka" }).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value)) : "—";

export default async function DonationExpensePage({ params, searchParams }: { params: Promise<{ expenseId: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection(); await requireProfile(["admin"]);
  const [{ expenseId }, query] = await Promise.all([params, searchParams]);
  const detail = await getDonationExpenseDetail(expenseId);
  if (!detail) notFound();
  const { expense, events, proofUrl } = detail;
  const next = expense.status === "DRAFT" ? "COMPLETED" : expense.status === "COMPLETED" ? "CLOSED" : null;
  const beneficiary = expense.beneficiary!;
  return <DashboardShell admin title={expense.expense_reference} subtitle="Donation module voucher and immutable status history.">
    {query.success ? <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{query.success}</p> : null}
    {query.error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{query.error}</p> : null}
    <div className="mb-5 flex flex-wrap gap-2"><Link href="/admin/donation-expenses" className="rounded-lg border px-4 py-2 font-semibold">Back</Link><Link href={`/admin/donation-expenses/${expense.id}/print`} className="rounded-lg border px-4 py-2 font-semibold">Print Voucher</Link><Link href={`/admin/donation-expenses/beneficiaries/${beneficiary.id}`} className="rounded-lg border px-4 py-2 font-semibold">Beneficiary Profile</Link></div>
    <section className="mb-5 grid gap-5 xl:grid-cols-2">
      <div className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-xl font-semibold">Donation Summary</h2><dl className="mt-4 grid grid-cols-[150px_1fr] gap-2 text-sm"><dt className="text-[var(--muted-text)]">Beneficiary</dt><dd className="font-medium">{beneficiary.name} ({beneficiary.beneficiary_reference})</dd><dt className="text-[var(--muted-text)]">Contact</dt><dd>{beneficiary.phone || "—"}</dd><dt className="text-[var(--muted-text)]">Relationship</dt><dd>{[beneficiary.relationship_group, beneficiary.relationship_type?.name, beneficiary.relationship_note].filter(Boolean).join(" · ") || "—"}</dd><dt className="text-[var(--muted-text)]">Date</dt><dd>{date(expense.donation_date)}</dd><dt className="text-[var(--muted-text)]">Category</dt><dd>{expense.category?.name}</dd><dt className="text-[var(--muted-text)]">Amount</dt><dd className="text-lg font-semibold">{money(Number(expense.amount))}</dd><dt className="text-[var(--muted-text)]">Payment Method</dt><dd>{expense.payment_method?.name}</dd><dt className="text-[var(--muted-text)]">Payment Reference</dt><dd>{expense.payment_reference || "—"}</dd><dt className="text-[var(--muted-text)]">Purpose</dt><dd>{expense.purpose}</dd><dt className="text-[var(--muted-text)]">Note</dt><dd>{expense.note || "—"}</dd><dt className="text-[var(--muted-text)]">Status</dt><dd className="font-semibold">{expense.status}</dd></dl></div>
      <div className="space-y-5">
        <div className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-xl font-semibold">Payment Proof / Voucher</h2>{proofUrl ? <div className="mt-3">{expense.proof_mime_type?.startsWith("image/") ? <img src={proofUrl} alt="Donation payment proof" className="max-h-72 rounded-lg border object-contain" /> : <p className="text-sm">{expense.proof_file_name || "Payment proof document"}</p>}<a href={proofUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg border px-3 py-2 font-semibold text-[var(--primary)]">Open Full Proof / View Proof</a><p className="mt-2 text-xs text-[var(--muted-text)]">Authenticated private signed access expires shortly.</p></div> : <p className="mt-2 text-sm text-[var(--muted-text)]">No proof uploaded.</p>}<form action={uploadDonationProofAction.bind(null, expense.id)} className="mt-4 flex flex-wrap gap-2"><input name="proof" type="file" accept="image/*,application/pdf" required className="rounded-lg border p-2" /><button className="rounded-lg border px-3 py-2 font-semibold">Upload Proof</button></form></div>
        <div className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-xl font-semibold">Status</h2>{next ? <form action={advanceDonationExpenseStatusAction.bind(null, expense.id, next)} className="mt-3 grid gap-3"><label className="grid gap-1 text-sm">Status note<input name="note" className="rounded-lg border bg-background px-3 py-2" /></label><button className="w-fit rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">Mark {next === "COMPLETED" ? "Completed" : "Closed"}</button></form> : <p className="mt-2 font-medium">Closed is terminal.</p>}</div>
      </div>
    </section>
    <section className="rounded-xl border bg-[var(--surface)] p-5"><h2 className="mb-4 text-xl font-semibold">Status History</h2><div className="space-y-3">{events.map((event) => <article key={event.id} className="rounded-lg border p-3"><div className="flex justify-between gap-3"><strong>{event.status}</strong><time className="text-xs text-[var(--muted-text)]">{date(event.event_at, true)}</time></div>{event.note ? <p className="mt-1 text-sm">{event.note}</p> : null}</article>)}</div></section>
  </DashboardShell>;
}
