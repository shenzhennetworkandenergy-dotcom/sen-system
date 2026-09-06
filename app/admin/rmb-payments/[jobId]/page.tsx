import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  advanceRmbPaymentAction,
  saveChinaPaymentExecutionAction,
  saveCustomerPaymentProofAction,
} from "@/app/admin/rmb-payments/actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { getRmbPaymentJob, nextRmbStatus, rmbStatusLabels } from "@/lib/rmb-payments/data";

export const dynamic = "force-dynamic";

function shown(value: string | null | undefined) {
  return value || "—";
}

function money(value: number, digits = 2) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function ProofImage({ url, alt }: { url: string; alt: string }) {
  return <a href={url} target="_blank" rel="noreferrer" className="block rounded-lg border p-2">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt={alt} className="max-h-72 w-full rounded object-contain" />
    <span className="mt-2 block text-center text-sm font-semibold text-blue-700">Open full image</span>
  </a>;
}

export default async function RmbPaymentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await connection();
  await requireProfile(["admin"]);
  const { jobId } = await params;
  const query = await searchParams;
  const detail = await getRmbPaymentJob(jobId);
  if (!detail) notFound();
  const { job, customer, events, methods, customerProofUrl, chinaProofUrl, chinaDestinationQrUrl } = detail;
  const nextStatus = nextRmbStatus(job.current_status);
  const advanceAction = advanceRmbPaymentAction.bind(null, job.id);
  const customerProofAction = saveCustomerPaymentProofAction.bind(null, job.id);
  const chinaExecutionAction = saveChinaPaymentExecutionAction.bind(null, job.id);
  const customerMethods = methods.filter((method) => ["CUSTOMER_PAYMENT", "BOTH"].includes(method.context));

  return <DashboardShell admin title={job.job_reference} subtitle="RMB / China Payment Service job detail">
    <div className="mb-4 flex items-center justify-between gap-3">
      <Link href="/admin/rmb-payments" className="font-semibold text-blue-700">← RMB payment jobs</Link>
      <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">{rmbStatusLabels[job.current_status]}</span>
    </div>
    {query.error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{query.error}</p> : null}
    {query.success ? <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">{query.success}</p> : null}

    <div className="grid gap-4 md:grid-cols-3">
      <section className="rounded-xl border bg-[var(--surface)] p-4"><h2 className="font-bold">Customer</h2><p className="mt-2">{customer?.full_name || customer?.email || "—"}</p><p className="text-sm text-[var(--muted)]">{shown(customer?.company_name)} · {shown(customer?.phone)}</p></section>
      <section className="rounded-xl border bg-[var(--surface)] p-4"><h2 className="font-bold">Foreign amount</h2><p className="mt-2 text-xl font-bold">{job.foreign_currency} {money(job.foreign_amount, 4)}</p><p className="text-sm text-[var(--muted)]">Rate: {money(job.agreed_bdt_rate, 6)}</p></section>
      <section className="rounded-xl bg-slate-900 p-4 text-white"><h2 className="font-bold">BDT payable</h2><p className="mt-2 text-2xl font-bold">BDT {money(job.calculated_bdt_payable)}</p><p className="text-sm text-slate-300">Database calculated</p></section>
    </div>

    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <section className="rounded-xl border bg-[var(--surface)] p-4"><h2 className="mb-3 text-lg font-bold">Customer payment</h2><dl className="grid grid-cols-[130px_1fr] gap-2 text-sm"><dt>Date</dt><dd>{shown(job.customer_payment_date)}</dd><dt>Method</dt><dd>{shown(job.customer_payment_method)}</dd><dt>Reference</dt><dd>{shown(job.customer_payment_reference)}</dd><dt>Note</dt><dd>{shown(job.customer_payment_note)}</dd></dl><div className="mt-4">{customerProofUrl ? <ProofImage url={customerProofUrl} alt="Customer payment evidence" /> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Customer payment evidence has not been uploaded.</p>}</div></section>
      <section className="rounded-xl border bg-[var(--surface)] p-4"><h2 className="mb-3 text-lg font-bold">China payment execution</h2><dl className="grid grid-cols-[130px_1fr] gap-2 text-sm"><dt>Date</dt><dd>{shown(job.china_payment_date)}</dd><dt>Method</dt><dd>{shown(job.china_payment_method)}</dd><dt>Reference</dt><dd>{shown(job.china_payment_reference)}</dd><dt>Note</dt><dd>{shown(job.china_payment_note)}</dd></dl><div className="mt-4">{chinaProofUrl ? <ProofImage url={chinaProofUrl} alt="China payment evidence" /> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">China payment evidence has not been uploaded.</p>}</div></section>

      <section className="rounded-xl border bg-[var(--surface)] p-4 md:col-span-2">
        <h2 className="mb-3 text-lg font-bold">China payee and payment destination</h2>
        <dl className="grid gap-2 text-sm md:grid-cols-[160px_1fr_160px_1fr]"><dt>Organization</dt><dd>{shown(job.payee_organization)}</dd><dt>Payee</dt><dd>{shown(job.payee_name)}</dd><dt>Phone</dt><dd>{shown(job.payee_phone)}</dd><dt>Address</dt><dd>{shown(job.payee_address)}</dd><dt>Payment method</dt><dd>{shown(job.china_payment_method)}</dd><dt>Destination type</dt><dd>{shown(job.china_destination_type)}</dd><dt>General details</dt><dd className="md:col-span-3 whitespace-pre-wrap">{shown(job.payee_account_details)}</dd></dl>
        {job.china_destination_type === "BANK" ? <dl className="mt-4 grid gap-2 border-t pt-4 text-sm md:grid-cols-[160px_1fr_160px_1fr]"><dt>Bank</dt><dd>{shown(job.china_bank_name)}</dd><dt>Account name</dt><dd>{shown(job.china_account_name)}</dd><dt>Account number</dt><dd>{shown(job.china_account_number)}</dd><dt>Branch</dt><dd>{shown(job.china_bank_branch)}</dd><dt>SWIFT / bank code</dt><dd>{shown(job.china_bank_code)}</dd></dl> : null}
        {job.china_destination_type && ["WECHAT", "ALIPAY"].includes(job.china_destination_type) ? <div className="mt-4 grid gap-4 border-t pt-4 md:grid-cols-[1fr_320px]"><div><h3 className="font-bold">Wallet destination</h3><p className="mt-2 text-sm">ID / phone: {shown(job.china_wallet_id)}</p></div>{chinaDestinationQrUrl ? <ProofImage url={chinaDestinationQrUrl} alt={`${job.china_destination_type} destination QR`} /> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Destination QR is unavailable.</p>}</div> : null}
        {job.china_destination_type === "CASH" ? <dl className="mt-4 grid gap-2 border-t pt-4 text-sm md:grid-cols-[160px_1fr]"><dt>Recipient</dt><dd>{shown(job.china_cash_recipient_name)}</dd><dt>Contact</dt><dd>{shown(job.china_cash_recipient_contact)}</dd><dt>Instruction</dt><dd>{shown(job.china_cash_instruction_note)}</dd></dl> : null}
        {job.note ? <p className="mt-4 border-t pt-3 text-sm"><strong>Internal note:</strong> {job.note}</p> : null}
      </section>
    </div>

    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <form action={customerProofAction} className="rounded-xl border bg-[var(--surface)] p-4">
        <h2 className="text-lg font-bold">Upload customer payment evidence</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="font-semibold">Bangladesh method<select name="customer_payment_method_id" defaultValue={job.customer_payment_method_id || ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"><option value="">Select when known</option>{customerMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
          <label className="font-semibold">Payment date<input name="customer_payment_date" type="date" defaultValue={job.customer_payment_date || ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
          <label className="font-semibold">Reference<input name="customer_payment_reference" defaultValue={job.customer_payment_reference || ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
          <label className="font-semibold">Evidence image<input name="payment_evidence" type="file" accept="image/*" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
          <label className="font-semibold sm:col-span-2">Note<textarea name="customer_payment_note" defaultValue={job.customer_payment_note || ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
        </div>
        <button className="mt-3 rounded-lg border px-4 py-2 font-semibold">Save Customer Evidence</button>
      </form>

      <section className="rounded-xl border bg-[var(--surface)] p-4">
        <h2 className="text-lg font-bold">China payment execution</h2>
        {job.current_status === "CHINA_PAYMENT_PENDING" ? <form action={chinaExecutionAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="font-semibold">Payment date<input name="china_payment_date" type="date" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
          <label className="font-semibold">Payment reference<input name="china_payment_reference" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
          <label className="font-semibold">Payment evidence<input name="payment_evidence" type="file" accept="image/*" required className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
          <label className="font-semibold">Payment note<textarea name="china_payment_note" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
          <button className="rounded-lg border px-4 py-2 font-semibold sm:col-span-2">Save China Payment Evidence</button>
        </form> : <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm">Available when the job reaches China Payment Pending.</p>}
      </section>
    </div>

    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="rounded-xl border bg-[var(--surface)] p-4"><h2 className="mb-3 text-lg font-bold">Status history</h2><div className="space-y-3">{events.map((event) => <article key={event.id} className="rounded-lg border p-3"><div className="flex justify-between gap-3"><strong>{rmbStatusLabels[event.status]}</strong><time className="text-sm text-[var(--muted)]">{new Date(event.event_at).toLocaleString("en-GB")}</time></div><p className="mt-1 text-sm">{shown(event.note)}</p><p className="mt-1 text-xs text-[var(--muted)]">{event.actor_name}</p></article>)}</div></section>
      <section className="rounded-xl border bg-[var(--surface)] p-4"><h2 className="text-lg font-bold">Operational update</h2>{nextStatus ? <form action={advanceAction} className="mt-3 space-y-3"><p>Next status: <strong>{rmbStatusLabels[nextStatus]}</strong></p>{nextStatus === "CUSTOMER_PAID" && !job.customer_payment_proof_path ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Upload customer payment evidence first.</p> : null}{nextStatus === "PAYEE_PAID" && (!job.china_payment_proof_path || !job.china_payment_date || !job.china_payment_reference) ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Save China payment date, reference and evidence first.</p> : null}<input type="hidden" name="status" value={nextStatus} /><label className="block font-semibold">Event note<textarea name="event_note" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" maxLength={1000} /></label><button className="w-full rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-white">Mark {rmbStatusLabels[nextStatus]}</button></form> : <p className="mt-3 rounded-lg bg-slate-100 p-3 font-semibold">Closed — no further status updates.</p>}</section>
    </div>
  </DashboardShell>;
}
