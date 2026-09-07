import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getRmbCustomerJob, rmbStatusLabels } from "@/lib/rmb-payments/data";

export const dynamic = "force-dynamic";
const shown = (value: string | null | undefined) => value || "—";
const money = (value: number, digits = 2) => Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default async function CustomerRmbPaymentDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  await connection();
  const { profile } = await requireProfile(["customer"]);
  const { jobId } = await params;
  const detail = await getRmbCustomerJob(jobId, profile.id);
  if (!detail) notFound();
  const { job, events, customerProofUrl, chinaProofUrl, destinationQrUrl } = detail;
  return <DashboardShell title={job.job_reference} subtitle="Your RMB request and customer-safe progress information.">
    <div className="mb-4"><Link href="/account/rmb-payments" className="font-semibold text-blue-700">← My RMB Requests</Link></div>
    <div className="grid gap-4 md:grid-cols-3"><section className="rounded-xl border bg-[var(--surface)] p-4"><h2 className="font-bold">Request</h2><p className="mt-2">{job.foreign_currency} {money(job.foreign_amount, 4)}</p><p className="text-sm text-[var(--muted-text)]">{new Date(job.created_at).toLocaleString("en-GB")}</p></section><section className="rounded-xl border bg-[var(--surface)] p-4"><h2 className="font-bold">Applied rate</h2><p className="mt-2 text-xl font-bold">{money(job.agreed_bdt_rate, 6)} BDT / {job.foreign_currency}</p></section><section className="rounded-xl bg-slate-900 p-4 text-white"><h2 className="font-bold">BDT payable</h2><p className="mt-2 text-2xl font-bold">BDT {money(job.calculated_bdt_payable)}</p></section></div>
    <div className="mt-4 grid gap-4 md:grid-cols-2"><section className="rounded-xl border bg-[var(--surface)] p-4"><h2 className="font-bold">China payee</h2><dl className="mt-3 grid gap-2 text-sm"><dt>Organization</dt><dd>{shown(job.payee_organization)}</dd><dt>Name</dt><dd>{shown(job.payee_name)}</dd><dt>Phone</dt><dd>{shown(job.payee_phone)}</dd><dt>Address</dt><dd>{shown(job.payee_address)}</dd><dt>Destination details</dt><dd className="whitespace-pre-wrap">{shown(job.payee_account_details)}</dd><dt>Instruction</dt><dd>{shown(job.customer_instruction)}</dd></dl>{destinationQrUrl ? <a href={`/account/rmb-payments/${job.id}/proof/destination`} target="_blank" rel="noreferrer" className="mt-4 block font-semibold text-blue-700">Open destination QR →</a> : null}</section><section className="rounded-xl border bg-[var(--surface)] p-4"><h2 className="font-bold">Status</h2><p className="mt-3 rounded-full bg-slate-900 px-3 py-2 text-center font-semibold text-white">{rmbStatusLabels[job.current_status]}</p><p className="mt-3 text-sm">China payment completion will appear here when SEN updates the operational status.</p></section></div>
    <div className="mt-4 grid gap-4 md:grid-cols-2"><section className="rounded-xl border bg-[var(--surface)] p-4"><h2 className="font-bold">Customer payment</h2><dl className="mt-3 grid gap-2 text-sm"><dt>Method</dt><dd>{shown(job.customer_payment_method)}</dd><dt>Reference</dt><dd>{shown(job.customer_payment_reference)}</dd><dt>Date</dt><dd>{shown(job.customer_payment_date)}</dd><dt>Note</dt><dd>{shown(job.customer_payment_note)}</dd></dl>{customerProofUrl ? <a href={`/account/rmb-payments/${job.id}/proof/customer`} target="_blank" rel="noreferrer" className="mt-4 block font-semibold text-blue-700">Open customer payment proof →</a> : null}</section><section className="rounded-xl border bg-[var(--surface)] p-4"><h2 className="font-bold">China payment proof</h2>{chinaProofUrl ? <a href={`/account/rmb-payments/${job.id}/proof/china`} target="_blank" rel="noreferrer" className="mt-4 block font-semibold text-blue-700">Open China payment proof →</a> : <p className="mt-3 text-sm text-[var(--muted-text)]">Available after the payment is completed by SEN.</p>}</section></div>
    <section className="mt-4 rounded-xl border bg-[var(--surface)] p-4"><h2 className="mb-3 font-bold">Status timeline</h2><div className="space-y-2">{events.map((event) => <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><strong>{rmbStatusLabels[event.status]}</strong><time>{new Date(event.event_at).toLocaleString("en-GB")}</time></div>)}</div></section>
  </DashboardShell>;
}
