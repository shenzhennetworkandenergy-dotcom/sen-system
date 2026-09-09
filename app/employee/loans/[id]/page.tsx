import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { employeeLoanStageLabel } from "@/lib/receivables/employee-loans";
import { getEmployeeLoanApplication } from "@/lib/receivables/employee-loans-data";
import { uploadSignedLoanAgreementAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EmployeeLoanDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const data = await getEmployeeLoanApplication(id);
  if (!data.application) notFound();
  const { account, detail, documents, disbursement } = data.application;
  const sent = Boolean(detail.agreement_sent_at);
  const signedDocuments = documents.filter((document) => document.document_type === "signed_agreement");
  const disbursementProofs = documents.filter((document) => document.document_type === "disbursement_proof");
  const showDisbursement = detail.workflow_stage === "disbursed" || Boolean(disbursement) || disbursementProofs.length > 0;
  return <DashboardShell employeePermissions={[]} title={account.receivable_number} subtitle={employeeLoanStageLabel({ accountStatus: account.status, workflowStage: detail.workflow_stage })}>
    <Link href="/employee/loans" className="font-semibold text-blue-800">← My Loan Applications</Link>
    {query.success ? <p className="mt-4 rounded-lg bg-green-50 p-3 text-green-800">{query.success}</p> : null}{query.error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">{query.error}</p> : null}
    <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[["Requested",`${account.currency} ${Number(account.requested_amount).toLocaleString("en-BD")}`],["Approved",account.approved_amount == null ? "Pending" : `${account.currency} ${Number(account.approved_amount).toLocaleString("en-BD")}`],["Purpose",detail.purpose],["Stage",employeeLoanStageLabel({accountStatus:account.status,workflowStage:detail.workflow_stage})]].map(([label,value])=><article key={label} className="rounded-xl border bg-white p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 font-bold">{value}</p></article>)}</section>
    <section className="mt-5 rounded-xl border bg-white p-5"><h2 className="font-bold">Application proposal</h2><dl className="mt-3 grid gap-3 text-sm md:grid-cols-2"><div><dt>Repayment period</dt><dd className="font-semibold">{detail.requested_repayment_period}</dd></div><div><dt>Proposed installment</dt><dd className="font-semibold">{account.currency} {Number(detail.proposed_monthly_installment).toLocaleString("en-BD")}</dd></div><div className="md:col-span-2"><dt>Detailed explanation</dt><dd className="whitespace-pre-wrap">{detail.detailed_explanation}</dd></div></dl></section>
    {sent ? <section className="mt-5 rounded-xl border border-blue-300 bg-blue-50 p-5"><h2 className="text-lg font-bold">Loan Agreement</h2><p className="mt-2">Admin has sent your agreement. Review it, print it, sign physically, and upload the signed copy.</p><Link href={`/employee/loans/${id}/agreement`} className="mt-3 inline-block rounded-lg bg-blue-800 px-4 py-2 font-semibold text-white">View / Print Agreement</Link>
      <form action={uploadSignedLoanAgreementAction} encType="multipart/form-data" className="mt-5 flex flex-wrap items-end gap-3"><input type="hidden" name="account_id" value={id} /><label className="grow font-semibold">Signed agreement (PDF/JPEG/PNG, max 10 MB)<input className="mt-1 w-full rounded-lg border bg-white px-3 py-2" type="file" name="signed_agreement" accept="application/pdf,image/jpeg,image/png" required /></label><button className="rounded-lg bg-green-700 px-4 py-2.5 font-semibold text-white">Upload Signed Agreement</button></form></section> : null}
    {showDisbursement ? <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
      <h2 className="text-lg font-bold text-emerald-950">Disbursement Details</h2>
      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
        <div><dt className="font-semibold text-slate-500">Disbursed amount</dt><dd className="mt-1 font-bold">{disbursement ? `${account.currency} ${Number(disbursement.amount).toLocaleString("en-BD")}` : "—"}</dd></div>
        <div><dt className="font-semibold text-slate-500">Date</dt><dd className="mt-1">{disbursement?.effective_date ?? account.disbursement_date ?? "—"}</dd></div>
        <div><dt className="font-semibold text-slate-500">Payment method</dt><dd className="mt-1 capitalize">{detail.payment_method || "—"}</dd></div>
        <div><dt className="font-semibold text-slate-500">Payment reference</dt><dd className="mt-1">{detail.payment_reference || "—"}</dd></div>
        <div><dt className="font-semibold text-slate-500">Bank/account/wallet reference</dt><dd className="mt-1">{detail.payment_account_reference || "—"}</dd></div>
        <div><dt className="font-semibold text-slate-500">Note</dt><dd className="mt-1">{detail.disbursement_admin_note || disbursement?.notes || "—"}</dd></div>
      </dl>
      <div className="mt-4"><h3 className="font-semibold">Payment proof</h3>{disbursementProofs.length ? <ul className="mt-2 space-y-2">{disbursementProofs.map((document) => <li key={document.id}><Link className="font-semibold text-blue-800 underline" href={`/employee/loans/${id}/documents/${document.id}`}>View / Download Payment Proof</Link><span className="ml-2 text-sm text-slate-600">Disbursement Payment Proof — {document.original_file_name}</span></li>)}</ul> : <p className="mt-1 text-sm text-slate-500">No payment proof was attached.</p>}</div>
    </section> : null}
    {signedDocuments.length ? <section className="mt-5 rounded-xl border bg-white p-5"><h2 className="font-bold">My private loan documents</h2><ul className="mt-3 space-y-2">{signedDocuments.map((document)=><li key={document.id}><Link className="text-blue-800 underline" href={`/employee/loans/${id}/documents/${document.id}`}>signed agreement — {document.original_file_name}</Link> <span className="text-xs text-slate-500">({document.document_status})</span></li>)}</ul></section> : null}
  </DashboardShell>;
}
