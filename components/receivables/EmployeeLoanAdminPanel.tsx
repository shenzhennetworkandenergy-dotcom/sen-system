import Link from "next/link";

import {
  disburseEmployeeLoanAction,
  finalApproveEmployeeLoanAction,
  finalizeEmployeeLoanTermsAction,
  rejectEmployeeLoanApplicationAction,
  sendEmployeeLoanAgreementAction,
} from "@/app/admin/receivables/employee-loan-actions";

const input = "mt-1 w-full rounded-lg border px-3 py-2";
const relation = (value: unknown) => (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;

export function EmployeeLoanAdminPanel({ account, extension, permissions }: {
  account: Record<string, unknown>;
  extension: { detail: Record<string, unknown>; employee: Record<string, unknown> | null; documents: Record<string, unknown>[]; representatives: Record<string, unknown>[]; disbursement: Record<string, unknown> | null };
  permissions: { canApprove: boolean; canDisburse: boolean };
}) {
  const { detail, employee, documents, representatives, disbursement } = extension;
  const profile = relation(employee?.profiles);
  const consent = relation(detail.receivable_employee_loan_consents);
  const witnesses = Array.isArray(detail.witnesses)
    ? detail.witnesses.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  const canPrepare = permissions.canApprove && ["requested", "under_review"].includes(String(account.status));
  const signed = documents.some((item) => item.document_type === "signed_agreement");
  const signedDocuments = documents.filter((item) => item.document_type === "signed_agreement");
  const disbursementProofs = documents.filter((item) => item.document_type === "disbursement_proof");
  const showDisbursement = detail.workflow_stage === "disbursed" || Boolean(disbursement) || disbursementProofs.length > 0;
  return <section className="mt-6 space-y-5 rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-5">
    <div><h2 className="text-xl font-bold text-blue-950">Employee Loan Application &amp; Agreement</h2><p className="text-sm text-blue-900">This workflow extends the existing Receivables account; no second loan master is used.</p></div>
    <dl className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
      {[
        ["Employee", profile?.full_name || employee?.employee_number], ["Employee ID", employee?.employee_number],
        ["Designation", relation(employee?.hr_designations)?.name || employee?.job_title], ["Department", relation(employee?.hr_departments)?.name],
        ["Purpose", detail.purpose], ["Requested period", detail.requested_repayment_period],
        ["Proposed months", detail.proposed_months], ["Proposed days", detail.proposed_days],
        ["Installment frequency", String(detail.installment_frequency || "").replaceAll("_", " ")],
        ["Proposed installment", detail.proposed_monthly_installment],
        ["Preferred start", detail.preferred_start_date], ["Stage", String(detail.workflow_stage).replaceAll("_", " ")],
      ].map(([term, description]) => <div key={String(term)} className="rounded-lg bg-white p-3"><dt className="font-semibold text-slate-500">{String(term)}</dt><dd className="mt-1">{description == null || description === "" ? "—" : String(description)}</dd></div>)}
    </dl>
    <div className="rounded-xl bg-white p-4">
      <h3 className="font-bold">Witness details</h3>
      {witnesses.length ? <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{witnesses.map((witness, index) => <article key={`${String(witness.name)}-${index}`} className="rounded-lg border p-3 text-sm">
        <p className="font-bold">Witness {index + 1}</p>
        <p className="mt-2"><span className="font-semibold">Name:</span> {String(witness.name || "—")}</p>
        <p><span className="font-semibold">Address:</span> {String(witness.address || "—")}</p>
        <p><span className="font-semibold">Phone:</span> {String(witness.phone || "—")}</p>
      </article>)}</div> : <p className="mt-2 text-sm text-slate-500">No witness information was submitted.</p>}
    </div>
    <div className="rounded-lg bg-white p-4 text-sm"><strong>Detailed explanation</strong><p className="mt-2 whitespace-pre-wrap">{String(detail.detailed_explanation)}</p><strong className="mt-4 block">Employee note</strong><p>{String(detail.employee_note || "—")}</p><p className="mt-4 text-slate-600">Consent accepted {String(consent?.accepted_at || "—")} · Version {String(consent?.consent_version || "—")}</p><p className="text-slate-600">Acknowledgements: {Array.isArray(consent?.consent_items) ? consent.consent_items.join(", ") : "—"}</p></div>

    {canPrepare ? <form action={finalizeEmployeeLoanTermsAction} className="space-y-4 rounded-xl border bg-white p-5">
      <input type="hidden" name="account_id" value={String(account.id)} />
      <h3 className="text-lg font-bold">Preliminary approval and authoritative agreement terms</h3>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label>Approved amount<input className={input} name="approved_amount" type="number" min="0.0001" step="0.0001" required defaultValue={String(account.requestedAmount ?? "")} /></label>
        <label>Approved repayment period<input className={input} name="approved_period" required defaultValue={String(detail.requested_repayment_period)} /></label>
        <label>Approved installments<input className={input} name="approved_installments" type="number" min="1" max="120" required defaultValue={String(detail.proposed_months)} /></label>
        <label>Approved monthly installment<input className={input} name="approved_monthly_installment" type="number" min="0.0001" step="0.0001" required defaultValue={String(detail.proposed_monthly_installment)} /></label>
        <label>Repayment start date<input className={input} name="repayment_start_date" type="date" required defaultValue={String(detail.preferred_start_date)} /></label>
        <label>Agreement date<input className={input} name="agreement_date" type="date" required /></label>
        <label>SEN-এর পক্ষে চুক্তিতে প্রতিনিধিত্বকারী Admin নির্বাচন করুন<select className={input} name="representative_profile_id" required defaultValue={String(detail.selected_sen_representative_user_id ?? "")} disabled={Boolean(detail.agreement_sent_at)}><option value="" disabled>Select an active administrator…</option>{representatives.map((representative) => <option key={String(representative.id)} value={String(representative.id)}>{String(representative.full_name || representative.email || representative.id)}</option>)}</select>{detail.agreement_sent_at ? <span className="mt-1 block text-xs text-slate-500">Locked after agreement sent.</span> : null}</label>
        <label className="md:col-span-2">Agreement reference<input className={input} name="agreement_reference" required defaultValue={`SEN-ELA-${String(account.receivableNumber ?? account.id)}`} /></label>
      </div>
      <label className="block">Approved purpose<textarea className={input} name="approved_purpose" required rows={2} defaultValue={String(detail.purpose)} /></label>
      <label className="block">Special terms / conditions<textarea className={input} name="special_terms" required rows={4} defaultValue="Repayment is governed by the signed agreement and authorized Receivables records." /></label>
      <label className="block">Admin note<textarea className={input} name="admin_note" rows={2} /></label>
      <div className="flex flex-wrap gap-3"><button className="rounded-lg bg-blue-800 px-4 py-2 font-semibold text-white">Preliminarily Approve &amp; Generate Agreement</button></div>
    </form> : null}

    {permissions.canApprove && ["requested", "under_review"].includes(String(account.status)) ? <form action={rejectEmployeeLoanApplicationAction} className="flex flex-wrap items-end gap-3 rounded-xl border border-red-200 bg-white p-4">
      <input type="hidden" name="account_id" value={String(account.id)} />
      <label className="grow">Rejection reason<input className={input} name="reason" required minLength={2} /></label><button className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white">Reject Application</button>
    </form> : null}

    {detail.agreement_generated_at ? <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4"><Link className="font-semibold text-blue-800 underline" href={`/admin/receivables/loans/${account.id}/agreement`}>View / Print Generated Agreement</Link>{detail.workflow_stage === "agreement_ready" && permissions.canApprove ? <form action={sendEmployeeLoanAgreementAction}><input type="hidden" name="account_id" value={String(account.id)} /><button className="rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white">Send Agreement to Employee</button></form> : null}</div> : null}

    {showDisbursement ? <div className="rounded-xl border border-emerald-200 bg-white p-4">
      <h3 className="text-lg font-bold text-emerald-950">Disbursement / Payment Proof</h3>
      <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
        <div><dt className="font-semibold text-slate-500">Disbursed amount</dt><dd className="mt-1 font-bold">{disbursement ? `${String(account.currency)} ${Number(disbursement.amount).toLocaleString("en-BD")}` : "—"}</dd></div>
        <div><dt className="font-semibold text-slate-500">Disbursement date</dt><dd className="mt-1">{String(disbursement?.effective_date || account.disbursementDate || "—")}</dd></div>
        <div><dt className="font-semibold text-slate-500">Payment method</dt><dd className="mt-1 capitalize">{String(detail.payment_method || "—")}</dd></div>
        <div><dt className="font-semibold text-slate-500">Payment reference</dt><dd className="mt-1">{String(detail.payment_reference || "—")}</dd></div>
        <div><dt className="font-semibold text-slate-500">Bank/account/wallet reference</dt><dd className="mt-1">{String(detail.payment_account_reference || "—")}</dd></div>
        <div><dt className="font-semibold text-slate-500">Admin note</dt><dd className="mt-1">{String(detail.disbursement_admin_note || disbursement?.notes || "—")}</dd></div>
      </dl>
      <div className="mt-4"><h4 className="font-semibold">Uploaded payment proof</h4>{disbursementProofs.length ? <ul className="mt-2 space-y-2">{disbursementProofs.map((document) => <li key={String(document.id)}><Link className="font-semibold text-blue-800 underline" href={`/admin/receivables/loans/${account.id}/documents/${document.id}`}>View / Download Payment Proof</Link><span className="ml-2 text-sm text-slate-600">Disbursement Payment Proof — {String(document.original_file_name)}</span></li>)}</ul> : <p className="mt-1 text-sm text-slate-500">No payment proof was attached.</p>}</div>
    </div> : null}

    {signedDocuments.length ? <div className="rounded-xl bg-white p-4"><h3 className="font-bold">Private loan documents</h3><ul className="mt-2 space-y-2">{signedDocuments.map((document) => <li key={String(document.id)}><Link className="text-blue-800 underline" href={`/admin/receivables/loans/${account.id}/documents/${document.id}`}>signed agreement — {String(document.original_file_name)}</Link> <span className="text-xs text-slate-500">({String(document.document_status)})</span></li>)}</ul></div> : null}

    {permissions.canApprove && signed && detail.workflow_stage === "signed_submitted" ? <form action={finalApproveEmployeeLoanAction} className="rounded-xl border border-green-300 bg-white p-4"><input type="hidden" name="account_id" value={String(account.id)} /><p className="mb-3 text-sm">Verify the uploaded signed agreement before final approval.</p><button className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white">Final Approve Signed Loan</button></form> : null}

    {permissions.canDisburse && detail.workflow_stage === "final_approved" ? <form action={disburseEmployeeLoanAction} className="space-y-4 rounded-xl border border-violet-300 bg-white p-5" encType="multipart/form-data">
      <input type="hidden" name="account_id" value={String(account.id)} /><h3 className="text-lg font-bold">Record final loan disbursement</h3>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label>Disbursed amount<input className={input} name="disbursed_amount" type="number" min="0.0001" step="0.0001" required defaultValue={String(account.approvedAmount ?? "")} /></label>
        <label>Disbursement date<input className={input} name="disbursement_date" type="date" required /></label>
        <label>Payment method<select className={input} name="payment_method" required><option value="bank">Bank</option><option value="cash">Cash</option><option value="mfs">MFS</option><option value="other">Other</option></select></label>
        <label>Payment / transaction reference<input className={input} name="payment_reference" required maxLength={200} /></label>
        <label>Bank/account/wallet reference<input className={input} name="payment_account_reference" maxLength={200} /></label>
        <label>Private disbursement proof<input className={input} name="disbursement_proof" type="file" accept="application/pdf,image/jpeg,image/png" /></label>
      </div>
      <label className="block">Admin note<textarea className={input} name="admin_note" rows={2} /></label>
      <p className="text-xs text-slate-600">This records loan-owned evidence only. It does not post Accounting or Cash Book.</p>
      <button className="rounded-lg bg-violet-800 px-4 py-2 font-semibold text-white">Record Disbursement</button>
    </form> : null}
  </section>;
}
